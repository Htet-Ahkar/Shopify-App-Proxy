import { createHash, randomBytes } from "node:crypto";
import { CheckoutError, equalSecret, money, type PaymentMethod, type PaymentStatus } from "./mock-checkout-domain.server";
import { sampleInstructions, type Instructions } from "./mock-payment-sample.server";

export type Gateway = { mode: "simulation" | "uat"; baseUrl?: string; pwaUrl?: string; appId?: string; merchCode?: string; notifyUrl?: string; keyHash?: string };
export type Payment = { id: string; merchantOrderId: string | null; providerId: string | null; method: string; amount: string; currency: string; createdAt: Date; expiresAt: Date };
export type Evidence = { status: PaymentStatus; transactionId?: string };
type Fields = Record<string, unknown>;
const unavailable = () => new CheckoutError("payment_unavailable", 503);

// Flatten common and biz_content parameters. Arrays are excluded by KBZPay's spec.
export function flatten(value: unknown): Record<string, string> {
  const fields: Record<string, string> = Object.create(null);
  function visit(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw unavailable();
    for (const [key, val] of Object.entries(input)) {
      if (Array.isArray(val) || val === null) continue;
      if (typeof val === "object") { visit(val); continue; }
      if (typeof val !== "string" && !(typeof val === "number" && Number.isSafeInteger(val))) throw unavailable();
      if (Object.hasOwn(fields, key)) throw unavailable();
      fields[key] = String(val);
    }
  }
  visit(value);
  return fields;
}
export function signature(value: unknown, secret: string): string {
  const fields = flatten(value);
  const content = Object.keys(fields).filter(key => key !== "sign" && key !== "sign_type" && fields[key] !== "").sort().map(key => `${key}=${fields[key]}`).join("&");
  return createHash("sha256").update(`${content}&key=${secret}`).digest("hex").toUpperCase();
}
export function verify(value: unknown, secret: string) {
  const fields = flatten(value);
  if (!secret || fields.sign_type !== "SHA256" || !/^[a-f0-9]{64}$/i.test(fields.sign ?? "") || !equalSecret(signature(value, secret), fields.sign.toUpperCase())) throw new CheckoutError("invalid_payment_signature", 401);
  return fields;
}
function endpoint(value: string, kind: "base" | "pwa" | "notify") {
  let url: URL;
  try { url = new URL(value); } catch { throw unavailable(); }
  if (url.username || url.password || url.search || (kind !== "pwa" && url.hash)) throw unavailable();
  // KBZPay publishes HTTP UAT precreate/query URLs; permit only that exact host/path.
  const legacyUat = kind === "base" && url.protocol === "http:" && url.hostname === "api-uat.kbzpay.com" && !url.port && url.pathname.replace(/\/$/, "") === "/payment/gateway/uat";
  if (url.protocol !== "https:" && !legacyUat) throw unavailable();
  if (kind === "base" && (url.hostname !== "api-uat.kbzpay.com" || url.port || url.pathname.replace(/\/$/, "") !== "/payment/gateway/uat")) throw unavailable();
  if (kind === "pwa" && (url.hostname !== "static.kbzpay.com" || url.port || url.pathname !== "/pgw/uat/pwa/" || url.hash !== "#/")) throw unavailable();
  return value;
}
export function configuration(): Gateway {
  const mode = process.env.KBZPAY_MODE ?? "simulation";
  if (mode === "simulation") return { mode };
  if (mode !== "uat") throw unavailable();
  const appId = process.env.KBZPAY_APP_ID, merchCode = process.env.KBZPAY_MERCH_CODE, key = process.env.KBZPAY_APP_KEY;
  if (!appId || !/^[a-zA-Z0-9]{1,40}$/.test(appId) || !merchCode || !/^[a-zA-Z0-9]{1,32}$/.test(merchCode) || !key) throw unavailable();
  return { mode, appId, merchCode, keyHash: createHash("sha256").update(key).digest("hex"),
    baseUrl: endpoint(process.env.KBZPAY_GATEWAY_BASE_URL ?? "https://api-uat.kbzpay.com/payment/gateway/uat", "base").replace(/\/$/, ""),
    pwaUrl: endpoint(process.env.KBZPAY_PWA_URL ?? "https://static.kbzpay.com/pgw/uat/pwa/#/", "pwa"),
    notifyUrl: endpoint(process.env.KBZPAY_NOTIFY_URL ?? "", "notify") };
}
export function gatewayOf(value: unknown): Gateway | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const gateway = value as Gateway;
  if (gateway.mode === "simulation") return { mode: "simulation" };
  if (gateway.mode !== "uat" || !gateway.appId || !gateway.merchCode || !gateway.keyHash || !gateway.baseUrl || !gateway.pwaUrl || !gateway.notifyUrl) throw unavailable();
  endpoint(gateway.baseUrl, "base"); endpoint(gateway.pwaUrl, "pwa"); endpoint(gateway.notifyUrl, "notify");
  return gateway;
}
function secret(gateway: Gateway) {
  const key = process.env.KBZPAY_APP_KEY;
  if (!key || createHash("sha256").update(key).digest("hex") !== gateway.keyHash) throw unavailable();
  return key;
}
const nonce = () => randomBytes(16).toString("hex");
async function request(gateway: Gateway, operation: "precreate" | "queryorder" | "closeorder", business: Fields) {
  const key = secret(gateway);
  const body: Fields = { timestamp: String(Math.floor(Date.now() / 1000)), nonce_str: nonce(), method: `kbz.payment.${operation}`, version: operation === "precreate" ? "1.0" : "3.0", sign_type: "SHA256",
    ...(operation === "precreate" ? { notify_url: gateway.notifyUrl } : {}), biz_content: { appid: gateway.appId, merch_code: gateway.merchCode, ...business } };
  body.sign = signature(body, key);
  const base = operation === "closeorder" ? gateway.baseUrl!.replace(/^http:/, "https:") : gateway.baseUrl;
  const response = await fetch(`${base}/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Request: body }), redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw unavailable();
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 32768) { await reader.cancel(); throw unavailable(); } chunks.push(next.value); }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const fields = verify(parsed.Response, key);
  if (fields.result !== "SUCCESS" || fields.code !== "0") throw unavailable();
  return fields;
}
function identity(fields: Record<string, string>, gateway: Gateway, payment: Payment, callback = false) {
  for (const [key, expected] of Object.entries({ appid: gateway.appId, merch_code: gateway.merchCode, merch_order_id: payment.merchantOrderId, trans_currency: payment.currency })) {
    if ((callback || key === "merch_order_id" || key === "trans_currency" || fields[key] !== undefined) && fields[key] !== expected) throw new CheckoutError("payment_evidence_mismatch", 422);
  }
  if (money(fields.total_amount ?? "") !== money(payment.amount)) throw new CheckoutError("payment_evidence_mismatch", 422);
}
export async function initialize(gateway: Gateway, payment: Payment): Promise<{ providerId: string; instructions: Instructions }> {
  if (gateway.mode === "simulation") return { providerId: `SIM-${payment.id}`, instructions: sampleInstructions(payment.method as PaymentMethod, payment.id) };
  const remaining = Math.floor((payment.expiresAt.getTime() - Date.now()) / 60000);
  if (remaining < 1) throw unavailable();
  const fields = await request(gateway, "precreate", { merch_order_id: payment.merchantOrderId, trade_type: payment.method === "mmqr" ? "PAY_BY_QRCODE" : "PWAAPP", total_amount: payment.amount, trans_currency: payment.currency, title: "COCO UAT checkout", timeout_express: `${remaining}m` });
  if (!fields.prepay_id || fields.prepay_id.length > 200 || fields.merch_order_id !== payment.merchantOrderId) throw unavailable();
  for (const [key, expected] of Object.entries({ appid: gateway.appId, merch_code: gateway.merchCode, trans_currency: payment.currency })) if (fields[key] !== undefined && fields[key] !== expected) throw unavailable();
  if (fields.total_amount !== undefined && money(fields.total_amount) !== money(payment.amount)) throw unavailable();
  if (payment.method === "mmqr") {
    if (!fields.qrCode || fields.qrCode.length > 2000) throw unavailable();
    return { providerId: fields.prepay_id, instructions: { qrPayload: fields.qrCode } };
  }
  const params = { appid: gateway.appId!, merch_code: gateway.merchCode!, nonce_str: nonce(), prepay_id: fields.prepay_id, timestamp: String(Math.floor(Date.now() / 1000)) };
  return { providerId: fields.prepay_id, instructions: { pwaUrl: `${gateway.pwaUrl}?${new URLSearchParams({ ...params, sign: signature(params, secret(gateway)) })}` } };
}
export async function query(gateway: Gateway, payment: Payment): Promise<Evidence> {
  if (gateway.mode === "simulation") {
    return { status: Date.now() >= payment.expiresAt.getTime() ? "expired" : "pending" };
  }
  const fields = await request(gateway, "queryorder", { merch_order_id: payment.merchantOrderId });
  identity(fields, gateway, payment);
  const states: Record<string, PaymentStatus> = { PAY_SUCCESS: "succeeded", PAY_FAILED: "failed", WAIT_PAY: "pending", PAYING: "pending", ORDER_EXPIRED: "expired", ORDER_CLOSED: "cancelled" };
  const status = states[fields.trade_status];
  if (!status || (status === "succeeded" && !fields.mm_order_id && !fields.trade_no)) throw unavailable();
  return { status, ...(status === "succeeded" ? { transactionId: fields.mm_order_id || fields.trade_no } : {}) };
}
export async function close(gateway: Gateway, payment: Payment): Promise<Evidence> {
  const before = await query(gateway, payment);
  if (before.status !== "pending") return before;
  if (gateway.mode === "simulation") return { status: "cancelled" };
  await request(gateway, "closeorder", { merch_order_id: payment.merchantOrderId });
  // A lost close response or a concurrent payment must never unlock a retry.
  return query(gateway, payment);
}
export function notification(value: unknown, gateway: Gateway, payment: Payment): Evidence {
  if (gateway.mode !== "uat") throw new CheckoutError("invalid_payment_signature", 401);
  const fields = verify(value, secret(gateway));
  identity(fields, gateway, payment, true);
  if (fields.trade_status !== "PAY_SUCCESS" || !fields.mm_order_id || !fields.trans_end_time) throw new CheckoutError("invalid_payment_notification", 422);
  return { status: "succeeded", transactionId: fields.mm_order_id };
}
