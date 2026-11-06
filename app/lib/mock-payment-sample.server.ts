import type { PaymentMethod } from "./mock-checkout-domain.server";

export type Instructions = { pwaUrl: string; qrPayload?: never } | { qrPayload: string; pwaUrl?: never };
export function sampleInstructions(method: PaymentMethod, attemptId: string): Instructions {
  return method === "kbzpay"
    ? { pwaUrl: "https://www.kbzpay.com/en" }
    : { qrPayload: `COCO-SAMPLE-MMQR:NOT-PAYABLE:${attemptId}` };
}

export function isSampleAttempt(attempt: { id: string; providerId: string | null; method: string; initializationStatus: string; instructions: unknown }): boolean {
  if (attempt.providerId !== `SAMPLE-${attempt.id}` || attempt.initializationStatus !== "ready" || (attempt.method !== "kbzpay" && attempt.method !== "mmqr")) return false;
  const value = attempt.instructions as Record<string, unknown> | null;
  const expected = sampleInstructions(attempt.method, attempt.id);
  return Boolean(value && Object.keys(value).length === 1 && Object.entries(expected).every(([key, entry]) => value[key] === entry));
}
