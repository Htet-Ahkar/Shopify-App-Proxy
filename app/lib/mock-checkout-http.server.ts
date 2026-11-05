import { CheckoutError } from "./mock-checkout-domain.server";

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export function enabled() {
  if (process.env.MOCK_CHECKOUT_ENABLED !== "true") throw new CheckoutError("mock_checkout_disabled", 503);
}
export async function readBody(request: Request, limit = 16384) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new CheckoutError("json_required", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new CheckoutError("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new CheckoutError("request_too_large", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
export function parseBody(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new CheckoutError("invalid_request"); }
}
export function errorResponse(error: unknown) {
  if (error instanceof CheckoutError) return json({ mock: true, error: error.code }, error.status);
  if (error instanceof Response && error.status >= 400 && error.status < 500) return json({ mock: true, error: "unauthorized" }, error.status);
  return json({ mock: true, error: "service_unavailable" }, 503);
}
