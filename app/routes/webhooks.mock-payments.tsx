import type { ActionFunctionArgs } from "react-router";
import { CheckoutError, verifyCallback, type Evidence } from "../lib/mock-checkout-domain.server";
import { applyEvidence } from "../lib/mock-checkout.server";
import { enabled, errorResponse, json, parseBody, readBody } from "../lib/mock-checkout-http.server";

export const loader = () => json({ error: "method_not_allowed" }, 405);
export async function action({ request }: ActionFunctionArgs) {
  try {
    enabled();
    if (request.method !== "POST") throw new CheckoutError("method_not_allowed", 405);
    const raw = await readBody(request);
    if (!verifyCallback(raw, request.headers.get("x-mock-timestamp") ?? "", request.headers.get("x-mock-signature") ?? "", process.env.MOCK_PAYMENT_CALLBACK_SECRET ?? "")) throw new CheckoutError("unauthorized", 401);
    await applyEvidence(parseBody(raw) as unknown as Evidence);
    return json({ mock: true, ok: true });
  } catch (error) { return errorResponse(error); }
}
