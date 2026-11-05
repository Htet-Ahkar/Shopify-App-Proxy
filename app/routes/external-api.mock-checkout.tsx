import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { CheckoutError } from "../lib/mock-checkout-domain.server";
import { checkoutOperation } from "../lib/mock-checkout.server";
import { enabled, errorResponse, json, parseBody, readBody } from "../lib/mock-checkout-http.server";

export const loader = () => json({ error: "method_not_allowed" }, 405);
export async function action({ request }: ActionFunctionArgs) {
  try {
    enabled();
    if (request.method !== "POST") throw new CheckoutError("method_not_allowed", 405);
    const context = await authenticate.public.appProxy(request);
    const shop = context.session?.shop;
    if (!shop || !context.admin || shop !== process.env.MOCK_CHECKOUT_SHOP) throw new CheckoutError("unauthorized", 401);
    const customerId = new URL(request.url).searchParams.get("logged_in_customer_id") || null;
    const input = parseBody(await readBody(request));
    return json(await checkoutOperation(input, { shop, customerId, graphql: (query, options) => context.admin!.graphql(query, options) }));
  } catch (error) { return errorResponse(error); }
}
