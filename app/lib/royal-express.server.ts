import data from "./royal-express-data.server";
import { CheckoutError, decimal, money, type Snapshot } from "./mock-checkout-domain.server";

export function shippingQuote(snapshot: Snapshot, value: unknown): Snapshot {
  const subtotal = snapshot.items.reduce((sum, item) => sum + money(item.total), 0n);
  if (value === undefined) return { ...snapshot, subtotal: decimal(subtotal) };
  if (!value || typeof value !== "object") throw new CheckoutError("invalid_shipping");
  const input = value as Record<string, unknown>;
  if (typeof input.state !== "string" || typeof input.city !== "string") throw new CheckoutError("invalid_shipping");
  const state = data.states.find(state => state.id === input.state);
  const city = state?.cities.find(city => city.id === input.city && city.available);
  if (!state || !city) throw new CheckoutError("invalid_shipping");
  const prices: Record<string, number> = data.prices;
  const shipping = BigInt(prices[city.zone]) * 100n;
  const amount = subtotal + shipping + money(snapshot.tax);
  if (amount <= 0n || amount > 99999999999999n) throw new CheckoutError("invalid_amount");
  return {
    ...snapshot, subtotal: decimal(subtotal), shipping: decimal(shipping), amount: decimal(amount),
    shippingSelection: { company: data.company, state: state.id, city: city.id, zone: city.zone },
  };
}
