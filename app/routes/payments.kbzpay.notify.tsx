import type { ActionFunctionArgs } from "react-router";
import { paymentNotification } from "../lib/mock-checkout.server";
import { enabled, errorResponse, json, parseBody, readBody } from "../lib/mock-checkout-http.server";

export const loader = () => json({ error: "method_not_allowed" }, 405);
export async function action({ request }: ActionFunctionArgs) {
  try {
    enabled();
    if (request.method !== "POST") return loader();
    // KBZPay posts a JSON Request envelope directly, without a Shopify proxy signature.
    await paymentNotification(parseBody(await readBody(request)));
    return new Response("success", { headers: { "Content-Type": "text/plain", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
