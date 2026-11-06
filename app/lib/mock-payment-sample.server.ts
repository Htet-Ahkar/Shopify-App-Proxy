import type { PaymentMethod } from "./mock-checkout-domain.server";

export type Instructions = { pwaUrl: string; qrPayload?: never } | { qrPayload: string; pwaUrl?: never };
export function sampleInstructions(method: PaymentMethod, attemptId: string): Instructions {
  return method === "kbzpay"
    ? { pwaUrl: "https://www.kbzpay.com/en" }
    : { qrPayload: `COCO-SAMPLE-MMQR:NOT-PAYABLE:${attemptId}` };
}
