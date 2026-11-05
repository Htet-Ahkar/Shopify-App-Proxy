import { CheckoutError, type Evidence } from "./mock-checkout-domain.server";

export type Instructions = { pwaPath?: string; qrPayload?: string; qrImage?: string };
export type ProviderPayment = Evidence & { instructions: Instructions };
export async function provider(operation: string, input: Record<string, unknown> = {}): Promise<ProviderPayment> {
  const target = process.env.MOCK_PAYMENT_PROVIDER_URL;
  const secret = process.env.MOCK_PAYMENT_PROVIDER_KEY;
  if (!target || !secret || new URL(target).protocol !== "https:") throw new CheckoutError("provider_unavailable", 503);
  try {
    const response = await fetch(target, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", "x-api-key": secret },
      body: JSON.stringify({ operation, ...input }),
    });
    if (response.status === 404) throw new CheckoutError("provider_not_found", 404);
    if (!response.ok) throw new CheckoutError("provider_unavailable", 502);
    const raw = await response.text();
    if (raw.length > 50000) throw new CheckoutError("provider_unavailable", 502);
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError("provider_unavailable", 502);
  }
}

export function validInstructions(method: string, attemptId: string, value: Instructions): boolean {
  if (!value || typeof value !== "object") return false;
  if (method === "kbzpay") return value.pwaPath === `/pages/checkout?step=pwa&attempt=${attemptId}`;
  return value.qrPayload === `COCO-MOCK-MMQR:${attemptId}` && typeof value.qrImage === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.qrImage) && value.qrImage.length < 40000;
}
