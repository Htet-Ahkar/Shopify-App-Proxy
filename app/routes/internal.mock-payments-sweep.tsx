import type { ActionFunctionArgs } from "react-router";
import { CheckoutError, equalSecret } from "../lib/mock-checkout-domain.server";
import { sweep } from "../lib/mock-checkout.server";
import { enabled, errorResponse, json } from "../lib/mock-checkout-http.server";

export const loader = () => json({ error: "method_not_allowed" }, 405);
export async function action({ request }: ActionFunctionArgs) {
  try {
    enabled();
    const secret = process.env.MOCK_PAYMENT_SWEEP_SECRET;
    if (request.method !== "POST" || !secret || !equalSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) throw new CheckoutError("unauthorized", 401);
    return json(await sweep());
  } catch (error) { return errorResponse(error); }
}
