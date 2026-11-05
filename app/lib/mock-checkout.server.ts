import { randomUUID } from "node:crypto";
import { Prisma, type MockPaymentAttempt } from "@prisma/client";
import prisma from "../db.server";
import { capabilityHash, CheckoutError, decimal, delivery, hash, identifier, lines, method, money, owned, TERMINAL, validateEvidence, type Evidence, type Snapshot } from "./mock-checkout-domain.server";
import { provider, validInstructions, type ProviderPayment } from "./mock-payment-provider.server";

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

export async function applyEvidence(evidence: Evidence) {
  return atomic(async tx => {
    const attempt = await tx.mockPaymentAttempt.findUnique({ where: { id: evidence?.attemptId } });
    if (!attempt) throw new CheckoutError("not_found", 404);
    validateEvidence(attempt, evidence);
    const event = await tx.mockPaymentEvent.findUnique({ where: { id: evidence.eventId } });
    if (event) {
      if (event.attemptId !== attempt.id || event.status !== evidence.status) throw new CheckoutError("invalid_evidence", 409);
      return;
    }
    await tx.mockPaymentEvent.create({ data: { id: evidence.eventId, attemptId: attempt.id, status: evidence.status } });
    if (terminal(attempt.status) || evidence.status === "pending") return;
    await tx.mockPaymentAttempt.update({ where: { id: attempt.id }, data: { status: evidence.status } });
    if (evidence.status === "succeeded") await tx.mockCheckout.update({ where: { id: attempt.checkoutId }, data: { status: "succeeded" } });
  });
}

async function saveProviderPayment(attempt: MockPaymentAttempt, payment: ProviderPayment) {
  if (typeof payment?.providerId !== "string" || !payment.providerId.startsWith("MOCK-") || !validInstructions(attempt.method, attempt.id, payment.instructions)) throw new CheckoutError("invalid_evidence", 409);
  validateEvidence({ ...attempt, providerId: payment.providerId }, payment);
  await atomic(async tx => {
    const saved = await tx.mockPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    if (saved.providerId && saved.providerId !== payment.providerId) throw new CheckoutError("invalid_evidence", 409);
    await tx.mockPaymentAttempt.update({ where: { id: attempt.id }, data: { providerId: payment.providerId, initializationStatus: "ready", instructions: jsonInput(payment.instructions) } });
  });
  await applyEvidence(payment);
}

async function initialize(attempt: MockPaymentAttempt) {
  try {
    const payment = await provider("initialize", { attemptId: attempt.id, method: attempt.method, environment: "simulation", amount: attempt.amount, currency: attempt.currency, expiresAt: attempt.expiresAt.toISOString() });
    await saveProviderPayment(attempt, payment);
  } catch {
    await prisma.mockPaymentAttempt.updateMany({ where: { id: attempt.id, initializationStatus: "initializing" }, data: { initializationStatus: "reconciliation_required" } });
  }
}

export async function reconcileAttempt(attempt: MockPaymentAttempt) {
  if (terminal(attempt.status)) return;
  try {
    const payment = await provider("status", { attemptId: attempt.id });
    await saveProviderPayment(attempt, payment);
  } catch (error) {
    if (error instanceof CheckoutError && error.code === "provider_not_found" && attempt.createdAt.getTime() + 15000 < Date.now()) {
      // The provider durably confirms no initialization; preserve the original ID/deadline.
      await initialize(attempt);
    } else throw error;
  }
}

async function present(id: string, owner: Owner) {
  const record = await findCheckout(id, owner);
  const attempt = record.attempts[0];
  const expired = record.expiresAt.getTime() <= Date.now();
  const status = record.status === "succeeded" ? "succeeded" : attempt?.status ?? "pending";
  return {
    mock: true, checkoutId: record.id, reference: record.reference,
    snapshot: record.snapshot, delivery: record.delivery, status,
    expiresAt: record.expiresAt.toISOString(), serverTime: new Date().toISOString(),
    canRetry: !expired && ["failed", "cancelled"].includes(attempt?.status),
    attempt: attempt ? { id: attempt.id, method: attempt.method, status: attempt.status, initializationStatus: attempt.initializationStatus, providerId: attempt.providerId,
      instructions: !expired && attempt.status === "pending" && attempt.initializationStatus === "ready" ? attempt.instructions : null } : null,
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
    const attempt = await tx.mockPaymentAttempt.create({ data: { checkoutId: checkout.id, idempotencyKey, requestHash, sequence: (previous?.sequence ?? 0) + 1, method: selectedMethod, amount: snapshot.amount, currency: snapshot.currency, expiresAt: checkout.expiresAt } });
    return { attempt, fresh: true };
  });
}

export async function checkoutOperation(input: Record<string, unknown>, context: { shop: string; customerId: string | null; graphql: Graphql }) {
  const owner: Owner = { shop: context.shop, customerId: context.customerId, capabilityHash: capabilityHash(input.capability) };
  const operation = input.operation;
  if (operation === "quote") {
    const snapshot = await catalogQuote(input.lines, context.graphql);
    const quote = await prisma.mockQuote.create({ data: { ...owner, snapshot: jsonInput(snapshot), expiresAt: new Date(Date.now() + 5 * 60000) } });
    return { mock: true, quoteId: quote.id, snapshot, expiresAt: quote.expiresAt.toISOString() };
  }
  if (operation === "create" || operation === "retry") {
    const result = await claim(input, owner, operation === "retry");
    if (result.fresh) await initialize(result.attempt);
    else { try { await reconcileAttempt(result.attempt); } catch { /* Keep the persisted unresolved attempt. */ } }
    return present(result.attempt.checkoutId, owner);
  }
  if (!["status", "cancel", "simulate"].includes(String(operation))) throw new CheckoutError("invalid_operation");
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
  if (operation === "status") {
    try { await reconcileAttempt(attempt); }
    catch { return { ...await present(id, owner), reconnecting: true }; }
  } else {
    if (identifier(input.attemptId) !== attempt.id || terminal(attempt.status)) throw new CheckoutError("attempt_unavailable", 409);
    const outcome = operation === "cancel" ? "cancelled" : input.outcome;
    if (!["succeeded", "failed", "cancelled", "expired", "delayed"].includes(String(outcome))) throw new CheckoutError("invalid_outcome");
    await reconcileAttempt(attempt);
    const payment = await provider(String(operation), { attemptId: attempt.id, outcome });
    await saveProviderPayment(attempt, payment);
  }
  return present(id, owner);
}

export async function sweep() {
  const deadline = Date.now() + 20000;
  try { await provider("dispatch"); } catch { /* Provider callbacks do not block independent status reconciliation. */ }
  const pending = await prisma.mockPaymentAttempt.findMany({ where: { status: "pending", nextReconcileAt: { lte: new Date() } }, orderBy: { nextReconcileAt: "asc" }, take: 50 });
  let recovered = 0;
  for (const attempt of pending) {
    if (Date.now() >= deadline) break;
    try { await reconcileAttempt(attempt); recovered++; } catch { /* Retry on the next scheduled invocation. */ }
    await prisma.mockPaymentAttempt.update({ where: { id: attempt.id }, data: { nextReconcileAt: new Date(Date.now() + 60000) } });
  }
  const cutoff = new Date(Date.now() - 7 * 86400000);
  await prisma.mockQuote.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { mock: true, checked: pending.length, recovered };
}
