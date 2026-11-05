// eslint-disable-next-line import/no-unresolved -- Pinned Deno npm specifier.
import postgres from "npm:postgres@3.4.7";
// eslint-disable-next-line import/no-unresolved -- Pinned Deno npm specifier.
import QRCode from "npm:qrcode@1.5.4";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const env = (name: string) => Deno.env.get(name) ?? "";
const key = env("MOCK_PAYMENT_PROVIDER_KEY");
const databaseUrl = env("MOCK_PROVIDER_DATABASE_URL");
const sql = databaseUrl ? postgres(databaseUrl, { prepare: false, max: 1, connect_timeout: 5, idle_timeout: 20 }) : null;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const outcomeNames = ["succeeded", "failed", "cancelled", "expired", "delayed"];

type Payment = {
  attempt_id: string; provider_id: string; method: string; amount: string; currency: string;
  expires_at: Date; status: string; instructions: Record<string, string>; scheduled_at: Date | null;
};
function evidence(payment: Payment) {
  return { mock: true, eventId: `${payment.attempt_id}:${payment.status}`, attemptId: payment.attempt_id,
    providerId: payment.provider_id, environment: "simulation", method: payment.method,
    amount: payment.amount, currency: payment.currency, expiresAt: payment.expires_at.toISOString(),
    status: payment.status, instructions: payment.instructions };
}

async function resolve(attemptId: string, outcome?: string): Promise<Payment | null> {
  return sql!.begin(async tx => {
    const [row] = await tx<Payment[]>`SELECT * FROM coco_mock_provider.payments WHERE attempt_id = ${attemptId} FOR UPDATE`;
    if (!row) return null;
    let status = row.status;
    if (status === "pending") {
      const now = Date.now();
      if (row.scheduled_at && row.scheduled_at.getTime() <= now && row.scheduled_at <= row.expires_at) status = "succeeded";
      else if (row.expires_at.getTime() <= now) status = "expired";
      else if (outcome && outcome !== "delayed") status = outcome;
      else if (outcome === "delayed" && !row.scheduled_at) {
        const scheduled = new Date(now + 30000);
        await tx`UPDATE coco_mock_provider.payments SET scheduled_at = ${scheduled} WHERE attempt_id = ${attemptId}`;
      }
    }
    if (status !== row.status) {
      await tx`UPDATE coco_mock_provider.payments SET status = ${status} WHERE attempt_id = ${attemptId}`;
      row.status = status;
      const payload = evidence(row);
      delete (payload as Partial<typeof payload>).instructions;
      await tx`INSERT INTO coco_mock_provider.outbox (id, payload) VALUES (${payload.eventId}, ${tx.json(payload)}) ON CONFLICT (id) DO NOTHING`;
    }
    return row;
  });
}

async function dispatch() {
  const due = await sql!<{ attempt_id: string }[]>`SELECT attempt_id FROM coco_mock_provider.payments WHERE status = 'pending' AND (scheduled_at <= now() OR expires_at <= now()) ORDER BY expires_at LIMIT 50`;
  for (const row of due) await resolve(row.attempt_id);
  const callback = env("MOCK_PAYMENT_CALLBACK_URL");
  const secret = env("MOCK_PAYMENT_CALLBACK_SECRET");
  if (!callback || !secret || new URL(callback).protocol !== "https:") throw new Error("callback_unconfigured");
  const events = await sql!.begin(async tx => tx<{ id: string; payload: unknown; attempts: number }[]>`
    UPDATE coco_mock_provider.outbox SET next_at = now() + interval '2 minutes', attempts = attempts + 1
    WHERE id IN (SELECT id FROM coco_mock_provider.outbox WHERE delivered_at IS NULL AND attempts < 8 AND next_at <= now() ORDER BY next_at LIMIT 3 FOR UPDATE SKIP LOCKED)
    RETURNING id, payload, attempts`);
  for (const event of events) {
    const raw = JSON.stringify(event.payload);
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
    try {
      const response = await fetch(callback, { method: "POST", redirect: "error", signal: AbortSignal.timeout(1500),
        headers: { "Content-Type": "application/json", "x-mock-timestamp": timestamp, "x-mock-signature": signature }, body: raw });
      if (response.ok) await sql!`UPDATE coco_mock_provider.outbox SET delivered_at = now() WHERE id = ${event.id}`;
      else await sql!`UPDATE coco_mock_provider.outbox SET next_at = now() + ${Math.min(3600, 30 * 2 ** event.attempts)} * interval '1 second' WHERE id = ${event.id}`;
    } catch {
      await sql!`UPDATE coco_mock_provider.outbox SET next_at = now() + ${Math.min(3600, 30 * 2 ** event.attempts)} * interval '1 second' WHERE id = ${event.id}`;
    }
  }
  await sql!`DELETE FROM coco_mock_provider.outbox WHERE created_at < now() - interval '7 days'`;
  await sql!`DELETE FROM coco_mock_provider.payments WHERE created_at < now() - interval '7 days'`;
  return { mock: true, dispatched: events.length };
}

Deno.serve(async request => {
  if (!key || !sql) return reply({ error: "provider_unconfigured" }, 503);
  if (!same(request.headers.get("x-api-key") ?? "", key)) return reply({ error: "unauthorized" }, 401);
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "json_required" }, 415);
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "invalid_request" }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); return reply({ error: "request_too_large" }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let input;
    try { input = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { return reply({ error: "invalid_request" }, 400); }
    if (!input || typeof input !== "object") return reply({ error: "invalid_request" }, 400);
    if (input.operation === "dispatch") return reply(await dispatch());
    if (!uuid(input.attemptId)) return reply({ error: "invalid_attempt" }, 400);
    if (input.operation === "initialize") {
      if (!["kbzpay", "mmqr"].includes(input.method) || input.environment !== "simulation" || input.currency !== "MMK" || typeof input.amount !== "string" || !/^\d{1,12}\.\d{2}$/.test(input.amount) || Number(input.amount) <= 0) return reply({ error: "invalid_payment" }, 400);
      const expires = new Date(input.expiresAt);
      if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now() || expires.getTime() > Date.now() + 16 * 60000) return reply({ error: "invalid_expiry" }, 400);
      const qrPayload = `COCO-MOCK-MMQR:${input.attemptId}`;
      const instructions = input.method === "mmqr"
        ? { qrPayload, qrImage: await QRCode.toDataURL(qrPayload, { width: 420, margin: 4, errorCorrectionLevel: "M" }) }
        : { pwaPath: `/pages/checkout?step=pwa&attempt=${input.attemptId}` };
      await sql`INSERT INTO coco_mock_provider.payments (attempt_id, provider_id, method, amount, currency, expires_at, instructions)
        VALUES (${input.attemptId}, ${`MOCK-${input.attemptId}`}, ${input.method}, ${input.amount}, ${input.currency}, ${expires}, ${sql.json(instructions)})
        ON CONFLICT (attempt_id) DO NOTHING`;
      const payment = await resolve(input.attemptId);
      if (!payment || payment.method !== input.method || payment.amount !== input.amount || payment.currency !== input.currency || payment.expires_at.toISOString() !== expires.toISOString()) return reply({ error: "initialization_conflict" }, 409);
      return reply(evidence(payment));
    }
    if (!["status", "cancel", "simulate"].includes(input.operation)) return reply({ error: "invalid_operation" }, 400);
    const outcome = input.operation === "cancel" ? "cancelled" : input.operation === "simulate" ? input.outcome : undefined;
    if (outcome !== undefined && !outcomeNames.includes(outcome)) return reply({ error: "invalid_outcome" }, 400);
    const payment = await resolve(input.attemptId, outcome);
    if (!payment) return reply({ error: "not_found" }, 404);
    // The outbox is durable. The dispatcher retries failed/lost callbacks; status also reconciles.
    if (outcome) { try { await dispatch(); } catch { /* Reconciliation and the scheduled dispatcher remain available. */ } }
    return reply(evidence(payment));
  } catch { return reply({ error: "provider_unavailable" }, 503); }
});
