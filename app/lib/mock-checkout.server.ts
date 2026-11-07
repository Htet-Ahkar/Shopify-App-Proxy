import { logDemoSubmission } from "./demo-activity.server";
import { shippingQuote } from "./royal-express.server";
import { randomUUID } from "node:crypto";
import { Prisma, type MockPaymentAttempt } from "@prisma/client";
import prisma from "../db.server";
import { capabilityHash, CheckoutError, decimal, delivery, hash, identifier, lines, method, money, owned, TERMINAL, type PaymentStatus, type Snapshot } from "./mock-checkout-domain.server";
import { configuration, gatewayOf, initialize, query, close, notification, flatten, type Evidence } from "./kbzpay.server";

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
    nodes(ids: $ids) { ... on ProductVariant { id title price media(first: 1) { nodes { preview { image { url } } } } product { title status featuredMedia { preview { image { url } } } } } }
  }`, { variables: { ids: items.map(item => `gid://shopify/ProductVariant/${item.variantId}`) } });
  const result = await response.json();
  if (!response.ok || result.errors || !result.data?.shop?.currencyCode || !Array.isArray(result.data.nodes)) throw new CheckoutError("catalog_unavailable", 503);
  const currency = result.data.shop.currencyCode;
  if (currency !== "MMK") throw new CheckoutError("currency_unsupported", 422);
  const products = items.map((item, index) => {
    const variant = result.data.nodes[index];
    if (!variant || variant.id !== `gid://shopify/ProductVariant/${item.variantId}` || variant.product?.status !== "ACTIVE" || typeof variant.price !== "string") throw new CheckoutError("item_unavailable", 409);
    const price = money(variant.price);
    return { ...item, image: variant.media?.nodes?.[0]?.preview?.image?.url || variant.product.featuredMedia?.preview?.image?.url || undefined, productTitle: variant.product.title, variantTitle: variant.title === "Default Title" ? "" : variant.title, title: `${variant.product.title}${variant.title === "Default Title" ? "" : ` / ${variant.title}`}`, price: decimal(price), total: decimal(price * BigInt(item.quantity)) };
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

async function transition(id: string, evidence: PaymentStatus | Evidence) {
  const { status, transactionId } = typeof evidence === "string" ? { status: evidence, transactionId: undefined } : evidence;
  if (status === "pending") return;
  await atomic(async tx => {
    const attempt = await tx.mockPaymentAttempt.findUniqueOrThrow({ where: { id } });
    if (transactionId && attempt.gatewayTransactionId && transactionId !== attempt.gatewayTransactionId) throw new CheckoutError("payment_evidence_mismatch", 422);
    if (attempt.status === status || (terminal(attempt.status) && status !== "succeeded")) return;
    // Success is authoritative even if a signed notification arrives after closure/expiry.
    await tx.mockPaymentAttempt.update({ where: { id }, data: { status, ...(transactionId ? { gatewayTransactionId: transactionId } : {}) } });
    const eventId = `${id}:${status}`;
    if (!await tx.mockPaymentEvent.findUnique({ where: { id: eventId } })) await tx.mockPaymentEvent.create({ data: { id: eventId, attemptId: id, status } });
    if (status === "succeeded") await tx.mockCheckout.update({ where: { id: attempt.checkoutId }, data: { status: "succeeded" } });
  });
}

async function refreshAttempt(attempt: MockPaymentAttempt) {
  if (terminal(attempt.status)) return;
  const gateway = gatewayOf(attempt.gateway);
  if (!gateway) {
    await transition(attempt.id, attempt.expiresAt.getTime() <= Date.now() ? "expired" : "cancelled");
    return;
  }
  if (attempt.nextReconcileAt && attempt.nextReconcileAt.getTime() > Date.now()) return;
  // Persist backoff before network I/O. A failed query leaves a recoverable pending attempt.
  await prisma.mockPaymentAttempt.update({ where: { id: attempt.id }, data: { nextReconcileAt: new Date(Date.now() + 10000) } });
  try {
    const checkout = await prisma.mockCheckout.findUnique({ where: { id: attempt.checkoutId } });
    await transition(attempt.id, checkout?.status === "succeeded" ? await close(gateway, attempt) : await query(gateway, attempt));
  }
  catch { /* Provider uncertainty never becomes success, failure, or retry permission. */ }
}

async function present(id: string, owner: Owner) {
  let record = await findCheckout(id, owner);
  if (record.attempts[0]) { await refreshAttempt(record.attempts[0]); record = await findCheckout(id, owner); }
  const attempt = (record.status === "succeeded" ? record.attempts.find(item => item.status === "succeeded") : null) ?? record.attempts[0];
  const expired = record.expiresAt.getTime() <= Date.now();
  const status = record.status === "succeeded" ? "succeeded" : attempt?.status ?? "pending";
  return {
    mock: true, paymentEnvironment: attempt?.environment ?? "simulation", checkoutId: record.id, reference: record.reference,
    snapshot: record.snapshot, delivery: record.delivery, status,
    expiresAt: record.expiresAt.toISOString(), serverTime: new Date().toISOString(),
    canRetry: status !== "succeeded" && !expired && ["failed", "cancelled"].includes(attempt?.status),
    attempt: attempt ? { id: attempt.id, method: attempt.method, status: attempt.status, initializationStatus: attempt.initializationStatus, providerId: attempt.providerId, transactionId: attempt.gatewayTransactionId,
      instructions: !expired && status === "pending" && attempt.initializationStatus === "ready" && attempt.gateway ? attempt.instructions : null } : null,
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
      return { attempt: existing, fresh: false, activity: null };
    }
    if (process.env.KBZPAY_ACCEPT_NEW_PAYMENTS === "false") throw new CheckoutError("payment_unavailable", 503);
    const gateway = configuration();
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
      const frozen = quote.snapshot as unknown as Snapshot;
      if (!frozen.shippingSelection) throw new CheckoutError("shipping_required");
      if (normalizedDelivery!.region !== frozen.shippingSelection.state || normalizedDelivery!.city !== frozen.shippingSelection.city
        || normalizedDelivery!.country !== "Myanmar") throw new CheckoutError("shipping_changed", 409);
      checkout = await tx.mockCheckout.create({ data: { ...owner, quoteId: quote.id, reference: `COCO-MOCK-${randomUUID().slice(0, 8).toUpperCase()}`, snapshot: jsonInput(quote.snapshot), delivery: jsonInput(normalizedDelivery), expiresAt: new Date(Date.now() + 15 * 60000) } });
    }
    const snapshot = checkout.snapshot as unknown as Snapshot;
    // KBZPay accepts whole-minute payment windows only. Do not claim an unsendable retry.
    if (gateway.mode === "uat" && checkout.expiresAt.getTime() - Date.now() < 60000) throw new CheckoutError("retry_unavailable", 409);
    const previous = await tx.mockPaymentAttempt.findFirst({ where: { checkoutId: checkout.id }, orderBy: { sequence: "desc" } });
    const attemptId = randomUUID();
    const attempt = await tx.mockPaymentAttempt.create({ data: { id: attemptId, environment: gateway.mode, gateway: jsonInput(gateway), merchantOrderId: `COCO_${attemptId.replaceAll("-", "")}`, initializationStatus: "reconciliation_required", nextReconcileAt: new Date(Date.now() + 10000), checkoutId: checkout.id, idempotencyKey, requestHash, sequence: (previous?.sequence ?? 0) + 1, method: selectedMethod, amount: snapshot.amount, currency: snapshot.currency, expiresAt: checkout.expiresAt } });
    return { attempt, fresh: true, activity: { snapshot, reference: checkout.reference } };
  });
}

export async function checkoutOperation(input: Record<string, unknown>, context: { shop: string; customerId: string | null; graphql: Graphql }) {
  const owner: Owner = { shop: context.shop, customerId: context.customerId, capabilityHash: capabilityHash(input.capability) };
  const operation = input.operation;
  if (operation === "quote") {
    if (input.source !== undefined && !["sample", "catalog"].includes(String(input.source))) throw new CheckoutError("invalid_source");
    if (input.source === "sample" && process.env.MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED !== "true") throw new CheckoutError("sample_catalog_disabled", 403);
    const catalog: Snapshot = input.source === "sample" ? {
      items: [{ variantId: "sample-jersey-black-m", title: "No.36 Mesh Jersey / Black / M (sample)", quantity: 1, price: "35000.00", total: "35000.00" }],
      amount: "35000.00", currency: "MMK", shipping: "0.00", tax: "0.00",
    } : await catalogQuote(input.lines, context.graphql);
    const snapshot = shippingQuote(catalog, input.shipping);
    const quote = await prisma.mockQuote.create({ data: { ...owner, snapshot: jsonInput(snapshot), expiresAt: new Date(Date.now() + 5 * 60000) } });
    return { mock: true, quoteId: quote.id, snapshot, expiresAt: quote.expiresAt.toISOString() };
  }
  if (operation === "create" || operation === "retry") {
    const result = await claim(input, owner, operation === "retry");
    if (result.fresh) {
      if (result.activity) logDemoSubmission({
        ...result.activity, method: result.attempt.method as "kbzpay" | "mmqr",
        createdAt: result.attempt.createdAt, retry: operation === "retry",
      });
      try {
        const initialized = await initialize(gatewayOf(result.attempt.gateway)!, result.attempt);
        await prisma.mockPaymentAttempt.updateMany({ where: { id: result.attempt.id }, data: { providerId: initialized.providerId, instructions: jsonInput(initialized.instructions), initializationStatus: "ready" } });
      } catch { /* Keep the durable merchant reference; never repeat uncertain precreate. */ }
    }
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
  if (operation === "cancel") {
    if (!terminal(attempt.status)) {
      const gateway = gatewayOf(attempt.gateway);
      if (!gateway) await refreshAttempt(attempt);
      else {
        // Initialization can still be in flight. Do not close/retry ahead of precreate.
        if (attempt.initializationStatus !== "ready" && attempt.createdAt.getTime() + 10000 > Date.now()) throw new CheckoutError("payment_reconciling", 409);
        try { await transition(attempt.id, await close(gateway, attempt)); }
        catch { throw new CheckoutError("payment_reconciling", 409); }
      }
    }
  }
  return present(id, owner);
}

// Bounded protected recovery. Never deletes payment history.
export async function sweep() {
  const pending = await prisma.mockPaymentAttempt.findMany({ where: { status: "pending", nextReconcileAt: { lte: new Date() } }, orderBy: { nextReconcileAt: "asc" }, take: 5 });
  await Promise.all(pending.map(attempt => refreshAttempt(attempt)));
  return { mock: true, checked: pending.length };
}

export async function paymentNotification(input: unknown) {
  const fields = flatten(input);
  if (!fields.merch_order_id) throw new CheckoutError("invalid_payment_notification", 400);
  const attempt = await prisma.mockPaymentAttempt.findUnique({ where: { merchantOrderId: fields.merch_order_id } });
  if (!attempt) throw new CheckoutError("not_found", 404);
  const gateway = gatewayOf(attempt.gateway);
  if (!gateway || gateway.mode !== "uat") throw new CheckoutError("invalid_payment_signature", 401);
  await transition(attempt.id, notification(input, gateway, attempt));
}
