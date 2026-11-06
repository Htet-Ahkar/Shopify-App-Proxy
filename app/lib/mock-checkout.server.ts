import { randomUUID } from "node:crypto";
import { Prisma, type MockPaymentAttempt } from "@prisma/client";
import prisma from "../db.server";
import { capabilityHash, CheckoutError, decimal, delivery, hash, identifier, lines, method, money, owned, TERMINAL, type Snapshot } from "./mock-checkout-domain.server";
import { sampleInstructions, isSampleAttempt } from "./mock-payment-sample.server";

type Owner = { shop: string; customerId: string | null; capabilityHash: string };
type Graphql = (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
const jsonInput = (value: unknown) => value as Prisma.InputJsonValue;
const terminal = (status: string) => (TERMINAL as readonly string[]).includes(status);

async function atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let n = 0; ; n++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5000 }); }
    catch (error) {
      if (n >= 3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2034", "P2002"].includes(error.code)) throw error;
    }
  }
}

async function catalogQuote(input: unknown, graphql: Graphql): Promise<Snapshot> {
  const items = lines(input);
  const response = await graphql(`query MockCheckoutCatalog($ids: [ID!]!) {
    shop { currencyCode }
    nodes(ids: $ids) { ... on ProductVariant { id title price product { title status } } }
  }`, { variables: { ids: items.map(item => `gid://shopify/ProductVariant/${item.variantId}`) } });
  const result = await response.json();
  if (!response.ok || result.errors || !result.data?.shop?.currencyCode || !Array.isArray(result.data.nodes)) throw new CheckoutError("catalog_unavailable", 503);
  const currency = result.data.shop.currencyCode;
  if (currency !== "MMK") throw new CheckoutError("currency_unsupported", 422);
  const products = items.map((item, index) => {
    const variant = result.data.nodes[index];
    if (!variant || variant.id !== `gid://shopify/ProductVariant/${item.variantId}` || variant.product?.status !== "ACTIVE" || typeof variant.price !== "string") throw new CheckoutError("item_unavailable", 409);
    const price = money(variant.price);
    return { ...item, title: `${variant.product.title}${variant.title === "Default Title" ? "" : ` / ${variant.title}`}`, price: decimal(price), total: decimal(price * BigInt(item.quantity)) };
  });
  const total = products.reduce((sum, item) => sum + money(item.total), 0n);
  if (total <= 0n || total > 99999999999999n) throw new CheckoutError("invalid_amount");
  return { items: products, amount: decimal(total), currency, shipping: "0.00", tax: "0.00" };
}

async function findCheckout(id: string, owner: Owner) {
  const record = await prisma.mockCheckout.findUnique({ where: { id }, include: { attempts: { orderBy: { sequence: "desc" } } } });
  if (!record || !owned(record, owner) || record.createdAt.getTime() + 86400000 < Date.now()) throw new CheckoutError("not_found", 404);
  return record;
}

async function refreshAttempt(attempt: MockPaymentAttempt) {
  if (terminal(attempt.status)) return false;
  const status = attempt.expiresAt.getTime() <= Date.now() ? "expired" : !isSampleAttempt(attempt) ? "cancelled" : null;
  if (!status) return false;
  await prisma.mockPaymentAttempt.updateMany({ where: { id: attempt.id, status: "pending" }, data: { status } });
  return true;
}

async function present(id: string, owner: Owner) {
  let record = await findCheckout(id, owner);
  if (record.attempts[0] && await refreshAttempt(record.attempts[0])) record = await findCheckout(id, owner);
  const attempt = record.attempts[0];
  const expired = record.expiresAt.getTime() <= Date.now();
  const status = record.status === "succeeded" ? "succeeded" : attempt?.status ?? "pending";
  return {
    mock: true, checkoutId: record.id, reference: record.reference,
    snapshot: record.snapshot, delivery: record.delivery, status,
    expiresAt: record.expiresAt.toISOString(), serverTime: new Date().toISOString(),
    canRetry: !expired && ["failed", "cancelled"].includes(attempt?.status),
    attempt: attempt ? { id: attempt.id, method: attempt.method, status: attempt.status, initializationStatus: attempt.initializationStatus, providerId: attempt.providerId,
      instructions: !expired && attempt.status === "pending" && attempt.initializationStatus === "ready" && isSampleAttempt(attempt) ? attempt.instructions : null } : null,
  };
}

async function claim(input: Record<string, unknown>, owner: Owner, retry: boolean) {
  const idempotencyKey = identifier(input.idempotencyKey);
  const selectedMethod = method(input.method);
  const normalizedDelivery = retry ? null : delivery(input.delivery);
  const sourceId = identifier(retry ? input.checkoutId : input.quoteId);
  const requestHash = hash(JSON.stringify({ sourceId, method: selectedMethod, delivery: normalizedDelivery }));
  return atomic(async tx => {
    const existing = await tx.mockPaymentAttempt.findUnique({ where: { idempotencyKey }, include: { checkout: true } });
    if (existing) {
      if (!owned(existing.checkout, owner)) throw new CheckoutError("not_found", 404);
      if (existing.requestHash !== requestHash) throw new CheckoutError("idempotency_conflict", 409);
      return { attempt: existing, fresh: false };
    }
    let checkout;
    if (retry) {
      checkout = await tx.mockCheckout.findUnique({ where: { id: sourceId }, include: { attempts: { orderBy: { sequence: "desc" }, take: 1 } } });
      if (!checkout || !owned(checkout, owner)) throw new CheckoutError("not_found", 404);
      if (checkout.status === "succeeded" || checkout.expiresAt.getTime() <= Date.now() || !["failed", "cancelled"].includes(checkout.attempts[0]?.status)) throw new CheckoutError("retry_unavailable", 409);
    } else {
      const quote = await tx.mockQuote.findUnique({ where: { id: sourceId } });
      if (!quote || !owned(quote, owner)) throw new CheckoutError("not_found", 404);
      if (quote.expiresAt.getTime() <= Date.now()) throw new CheckoutError("quote_expired", 409);
      if (await tx.mockCheckout.findUnique({ where: { quoteId: quote.id } })) throw new CheckoutError("quote_used", 409);
      checkout = await tx.mockCheckout.create({ data: { ...owner, quoteId: quote.id, reference: `COCO-MOCK-${randomUUID().slice(0, 8).toUpperCase()}`, snapshot: jsonInput(quote.snapshot), delivery: jsonInput(normalizedDelivery), expiresAt: new Date(Date.now() + 15 * 60000) } });
    }
    const snapshot = checkout.snapshot as unknown as Snapshot;
    const previous = await tx.mockPaymentAttempt.findFirst({ where: { checkoutId: checkout.id }, orderBy: { sequence: "desc" } });
    const attemptId = randomUUID();
    const attempt = await tx.mockPaymentAttempt.create({ data: { id: attemptId, providerId: `SAMPLE-${attemptId}`, initializationStatus: "ready", instructions: sampleInstructions(selectedMethod, attemptId), checkoutId: checkout.id, idempotencyKey, requestHash, sequence: (previous?.sequence ?? 0) + 1, method: selectedMethod, amount: snapshot.amount, currency: snapshot.currency, expiresAt: checkout.expiresAt } });
    return { attempt, fresh: true };
  });
}

export async function checkoutOperation(input: Record<string, unknown>, context: { shop: string; customerId: string | null; graphql: Graphql }) {
  const owner: Owner = { shop: context.shop, customerId: context.customerId, capabilityHash: capabilityHash(input.capability) };
  const operation = input.operation;
  if (operation === "quote") {
    if (input.source !== undefined && !["sample", "catalog"].includes(String(input.source))) throw new CheckoutError("invalid_source");
    if (input.source === "sample" && process.env.MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED !== "true") throw new CheckoutError("sample_catalog_disabled", 403);
    const snapshot: Snapshot = input.source === "sample" ? {
      items: [{ variantId: "sample-jersey-black-m", title: "No.36 Mesh Jersey / Black / M (sample)", quantity: 1, price: "35000.00", total: "35000.00" }],
      amount: "35000.00", currency: "MMK", shipping: "0.00", tax: "0.00",
    } : await catalogQuote(input.lines, context.graphql);
    const quote = await prisma.mockQuote.create({ data: { ...owner, snapshot: jsonInput(snapshot), expiresAt: new Date(Date.now() + 5 * 60000) } });
    return { mock: true, quoteId: quote.id, snapshot, expiresAt: quote.expiresAt.toISOString() };
  }
  if (operation === "create" || operation === "retry") {
    const result = await claim(input, owner, operation === "retry");
    return present(result.attempt.checkoutId, owner);
  }
  if (!["status", "cancel"].includes(String(operation))) throw new CheckoutError("invalid_operation");
  let checkoutId = input.checkoutId;
  if (operation === "status" && !checkoutId) {
    const pending = await prisma.mockPaymentAttempt.findUnique({ where: { idempotencyKey: identifier(input.idempotencyKey) } });
    if (!pending) throw new CheckoutError("not_found", 404);
    checkoutId = pending.checkoutId;
  }
  const id = identifier(checkoutId);
  const checkout = await findCheckout(id, owner);
  const attempt = checkout.attempts[0];
  if (!attempt) throw new CheckoutError("not_found", 404);
  if (operation === "cancel" && identifier(input.attemptId) !== attempt.id) throw new CheckoutError("attempt_unavailable", 409);
  await refreshAttempt(attempt);
  if (operation === "cancel") {
    await prisma.mockPaymentAttempt.updateMany({ where: { id: attempt.id, status: "pending", expiresAt: { gt: new Date() } }, data: { status: "cancelled" } });
    await refreshAttempt(await prisma.mockPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } }));
  }
  return present(id, owner);
}

// Retain the protected scheduler endpoint for local expiry; no provider calls or deletion.
export async function sweep() {
  const pending = await prisma.mockPaymentAttempt.findMany({ where: { status: "pending", nextReconcileAt: { lte: new Date() } }, orderBy: { nextReconcileAt: "asc" }, take: 50 });
  for (const attempt of pending) {
    await refreshAttempt(attempt);
    await prisma.mockPaymentAttempt.update({ where: { id: attempt.id }, data: { nextReconcileAt: new Date(Date.now() + 60000) } });
  }
  return { mock: true, checked: pending.length };
}
