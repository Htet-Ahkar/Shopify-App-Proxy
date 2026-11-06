import { createHash, timingSafeEqual } from "node:crypto";

export const METHODS = ["kbzpay", "mmqr"] as const;
export type PaymentMethod = typeof METHODS[number];
export const TERMINAL = ["succeeded", "failed", "cancelled", "expired"] as const;
export type PaymentStatus = "pending" | typeof TERMINAL[number];
export type Snapshot = {
  items: { variantId: string; title: string; quantity: number; price: string; total: string }[];
  amount: string; currency: string; shipping: "0.00"; tax: "0.00";
};
export type Delivery = {
  name: string; email: string; phone: string; address: string;
  city: string; region: string; postalCode: string; country: string; note: string;
};
export class CheckoutError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function equalSecret(left: string, right: string) {
  return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
}
export function capabilityHash(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new CheckoutError("invalid_capability");
  return hash(value);
}
export function identifier(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new CheckoutError("invalid_identifier");
  return value;
}
export function method(value: unknown): PaymentMethod {
  if (value !== "kbzpay" && value !== "mmqr") throw new CheckoutError("invalid_method");
  return value;
}
export function money(value: string) {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw new CheckoutError("invalid_amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function decimal(value: bigint) {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}
export function delivery(value: unknown): Delivery {
  if (!value || typeof value !== "object") throw new CheckoutError("invalid_delivery");
  const input = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const field of ["name", "email", "phone", "address", "city", "region", "postalCode", "country", "note"]) {
    const text = input[field] ?? "";
    if (typeof text !== "string" || text.length > (field === "note" ? 500 : 200)) throw new CheckoutError("invalid_delivery");
    result[field] = text.trim();
  }
  if (["name", "email", "phone", "address", "city", "country"].some(key => !result[key])) throw new CheckoutError("invalid_delivery");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email) || !/^[+\d ()-]{6,25}$/.test(result.phone)) throw new CheckoutError("invalid_delivery");
  return result as Delivery;
}
export function lines(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new CheckoutError("invalid_cart");
  const merged = new Map<string, number>();
  for (const line of value) {
    if (!line || typeof line !== "object" || typeof line.variantId !== "string" || !/^\d{1,20}$/.test(line.variantId) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw new CheckoutError("invalid_cart");
    const count = (merged.get(line.variantId) ?? 0) + line.quantity;
    if (count > 99) throw new CheckoutError("invalid_cart");
    merged.set(line.variantId, count);
  }
  return [...merged].sort(([a], [b]) => a.localeCompare(b)).map(([variantId, quantity]) => ({ variantId, quantity }));
}
export function owned(record: { shop: string; capabilityHash: string; customerId: string | null }, owner: { shop: string; capabilityHash: string; customerId: string | null }) {
  return record.shop === owner.shop && equalSecret(record.capabilityHash, owner.capabilityHash) && (!record.customerId || record.customerId === owner.customerId);
}
