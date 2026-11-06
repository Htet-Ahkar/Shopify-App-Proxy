import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const directory = path.resolve('app');
function loader(mocks = {}, extra = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = fs.readFileSync(file, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(compiled, { exports, require(name) {
      if (name in mocks) return mocks[name];
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts');
      return require(name);
    }, Response, Request, URL, AbortSignal, TextDecoder, TextEncoder, Date, Buffer, process: { env: {} }, ...extra }, { filename: file });
    return exports;
  }
  return file => load(path.resolve(directory, file));
}
const capability = 'a'.repeat(64);
const context = {
  shop: 'coco.myshopify.com', customerId: null,
  graphql: async (_query, { variables }) => Response.json({ data: { shop: { currencyCode: 'MMK' }, nodes: variables.ids.map(id => ({ id, title: 'M', price: '12345.67', product: { title: 'COCO Tee', status: 'ACTIVE' } })) } }),
};
const shipping = { name: 'Demo Person', email: 'demo@example.test', phone: '+95912345678', address: 'Demo Street', city: 'Yangon', country: 'Myanmar' };
function harness({ sampleCatalog = false } = {}) {
  let now = Date.now(), queue = Promise.resolve();
  const tables = { quotes: new Map(), checkouts: new Map(), attempts: new Map(), events: new Map() };
  class Clock extends Date {
    constructor(value) { super(arguments.length ? value : now); }
    static now() { return now; }
  }
  const copy = row => row ? structuredClone(row) : null;
  const find = (table, where) => [...table.values()].find(row => Object.entries(where).every(([key, value]) => value && typeof value === 'object' && 'gt' in value ? row[key] > value.gt : row[key] === value));
  function checkout(where, include) {
    const row = copy(find(tables.checkouts, where));
    if (row && include?.attempts) row.attempts = [...tables.attempts.values()].filter(a => a.checkoutId === row.id).sort((a,b) => b.sequence - a.sequence).map(copy);
    return row;
  }
  function attempt(where, include) {
    const row = copy(find(tables.attempts, where));
    if (row && include?.checkout) row.checkout = checkout({ id: row.checkoutId });
    return row;
  }
  const create = (table, defaults = {}) => async ({ data }) => {
    const row = { id: randomUUID(), createdAt: new Date(now), ...defaults, ...copy(data) };
    table.set(row.id, row); return copy(row);
  };
  const db = {
    mockQuote: { create: create(tables.quotes), findUnique: async ({ where }) => copy(find(tables.quotes, where)), deleteMany: async () => ({ count: 0 }) },
    mockCheckout: { create: create(tables.checkouts, { status: 'pending' }), findUnique: async ({ where, include }) => checkout(where, include), update: async ({ where, data }) => { Object.assign(find(tables.checkouts, where), data); } },
    mockPaymentAttempt: {
      create: create(tables.attempts, { status: 'pending', environment: 'simulation', initializationStatus: 'initializing', providerId: null, instructions: null }),
      findUnique: async ({ where, include }) => attempt(where, include),
      findUniqueOrThrow: async ({ where }) => { const row = attempt(where); if (!row) throw new Error('missing'); return row; },
      findFirst: async ({ where }) => [...tables.attempts.values()].filter(a => a.checkoutId === where.checkoutId).sort((a,b) => b.sequence - a.sequence).map(copy)[0] ?? null,
      findMany: async () => [...tables.attempts.values()].filter(a => a.status === 'pending').map(copy),
      update: async ({ where, data }) => { const row = find(tables.attempts, where); Object.assign(row, copy(data)); return copy(row); },
      updateMany: async ({ where, data }) => { const row = find(tables.attempts, where); if (row) Object.assign(row, copy(data)); },
    },
    mockPaymentEvent: { findUnique: async ({ where }) => copy(find(tables.events, where)), create: create(tables.events) },
    $transaction: work => {
      const result = queue.then(async () => {
        const saved = structuredClone(tables);
        try { return await work(db); }
        catch (error) {
          Object.keys(tables).forEach(key => {
            tables[key].clear();
            for (const [id, row] of saved[key]) tables[key].set(id, row);
          });
          throw error;
        }
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  const load = loader({ '../db.server': { __esModule: true, default: db } }, { Date: Clock, process: { env: { MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED: String(sampleCatalog) } }, fetch: () => { throw new Error('No external payment calls allowed'); } });
  const service = load('lib/mock-checkout.server.ts');
  const op = (operation, input = {}, owner = context) => service.checkoutOperation({ capability, operation, ...input }, owner);
  return { ...service, op, tables, advance: ms => { now += ms; } };
}
async function begin(h, method = 'kbzpay', owner = context) {
  const quote = await h.op('quote', { lines: [{ variantId: '123', quantity: 2 }], amount: '1.00' }, owner);
  const input = { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method, delivery: shipping };
  return { quote, input, result: await h.op('create', input, owner) };
}
for (const method of ['kbzpay', 'mmqr']) {
  test(`${method}: sample instructions, authoritative totals, status and reload`, async () => {
    const h = harness(), { result, quote, input } = await begin(h, method);
    assert.equal(quote.snapshot.amount, '24691.34');
    assert.equal(result.status, 'pending');
    assert.equal(result.attempt.initializationStatus, 'ready');
    assert.equal(result.attempt.providerId, `SAMPLE-${result.attempt.id}`);
    assert.equal(result.attempt.instructions.qrImage, undefined);
    if (method === 'kbzpay') assert.equal(result.attempt.instructions.pwaUrl, 'https://www.kbzpay.com/en');
    else assert.equal(result.attempt.instructions.qrPayload, `COCO-SAMPLE-MMQR:NOT-PAYABLE:${result.attempt.id}`);
    for (const lookup of [{ checkoutId: result.checkoutId }, { idempotencyKey: input.idempotencyKey }]) {
      const resumed = await h.op('status', lookup);
      assert.equal(resumed.attempt.id, result.attempt.id);
      assert.equal(JSON.stringify(resumed.attempt.instructions), JSON.stringify(result.attempt.instructions));
      assert.equal(resumed.expiresAt, result.expiresAt);
      assert.equal(resumed.status, 'pending');
    }
    h.advance(31000);
    assert.equal((await h.op('status', { checkoutId: result.checkoutId, status: 'succeeded', outcome: 'succeeded' })).status, 'pending');
    assert.equal(h.tables.events.size, 0);
  });
  test(`${method}: cancel and concurrent retry preserve history and deadline`, async () => {
    const h = harness(), { result } = await begin(h, method);
    const input = { checkoutId: result.checkoutId, attemptId: result.attempt.id };
    const cancelled = await h.op('cancel', input);
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.canRetry, true);
    assert.equal((await h.op('cancel', input)).status, 'cancelled');
    const retry = { checkoutId: result.checkoutId, idempotencyKey: randomUUID(), method };
    const results = await Promise.all([h.op('retry', retry), h.op('retry', retry)]);
    assert.equal(results[0].attempt.id, results[1].attempt.id);
    assert.equal(h.tables.attempts.size, 2);
    assert.equal(h.tables.attempts.get(result.attempt.id).status, 'cancelled');
    assert.equal(results[0].expiresAt, result.expiresAt);
    await assert.rejects(h.op('cancel', input), { code: 'attempt_unavailable' });
  });
  test(`${method}: server expires attempts; late cancel cannot reopen them`, async () => {
    const h = harness(), { result, input } = await begin(h, method); h.advance(900001);
    const expired = await h.op('status', { checkoutId: result.checkoutId });
    assert.equal(expired.status, 'expired'); assert.equal(expired.attempt.instructions, null);
    assert.equal((await h.op('cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id })).status, 'expired');
    assert.equal((await h.op('create', input)).status, 'expired');
    await assert.rejects(h.op('retry', { checkoutId: result.checkoutId, method, idempotencyKey: randomUUID() }), { code: 'retry_unavailable' });
  });
}
test('simultaneous submissions persist one initialized attempt and reject changed idempotency inputs', async () => {
  const h = harness();
  const quote = await h.op('quote', { lines: [{ variantId: '123', quantity: 1 }] });
  const input = { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method: 'kbzpay', delivery: shipping };
  const results = await Promise.all([h.op('create', input), h.op('create', input)]);
  assert.equal(results[0].attempt.id, results[1].attempt.id);
  assert.equal(h.tables.checkouts.size, 1); assert.equal(h.tables.attempts.size, 1);
  await assert.rejects(h.op('create', { ...input, method: 'mmqr' }), { code: 'idempotency_conflict' });
  await assert.rejects(h.op('create', { ...input, idempotencyKey: randomUUID() }), { code: 'quote_used' });
});
test('capability, shop and bound customer ownership protect status, cancel, retry and recovery', async () => {
  const h = harness(), owner = { ...context, customerId: '42' }, { result, input } = await begin(h, 'kbzpay', owner);
  for (const [changes, who] of [[{ capability: 'b'.repeat(64) }, owner], [{}, { ...owner, shop: 'other.myshopify.com' }], [{}, context], [{}, { ...owner, customerId: '43' }]]) {
    for (const [operation, fields] of [['status', { checkoutId: result.checkoutId }], ['status', { idempotencyKey: input.idempotencyKey }], ['cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id }], ['retry', { checkoutId: result.checkoutId, idempotencyKey: randomUUID(), method: 'kbzpay' }], ['create', input]]) {
      await assert.rejects(h.op(operation, { ...fields, ...changes }, who), { code: 'not_found' });
    }
  }
  assert.equal((await h.op('status', { checkoutId: result.checkoutId }, owner)).status, 'pending');
});
test('removed simulation operations cannot approve, fail or delay an attempt', async () => {
  const h = harness(), { result } = await begin(h);
  for (const outcome of ['succeeded', 'failed', 'delayed', 'cancelled', 'expired']) {
    await assert.rejects(h.op('simulate', { checkoutId: result.checkoutId, attemptId: result.attempt.id, outcome }), { code: 'invalid_operation' });
  }
  assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'pending');
});
test('retired pending attempts never expose hosted links or provider QR images', async () => {
  const h = harness(), { result } = await begin(h);
  const row = h.tables.attempts.get(result.attempt.id);
  Object.assign(row, { providerId: 'MOCK-OLD', instructions: { pwaUrl: 'https://old.test/mock-payments/hosted?token=old' } });
  const saved = JSON.stringify(row.instructions);
  const resumed = await h.op('status', { checkoutId: result.checkoutId });
  assert.equal(resumed.status, 'cancelled'); assert.equal(resumed.attempt.instructions, null); assert.equal(resumed.canRetry, true);
  assert.equal(JSON.stringify(row.instructions), saved);
  const next = await h.op('retry', { checkoutId: result.checkoutId, idempotencyKey: randomUUID(), method: 'mmqr' });
  assert.match(next.attempt.instructions.qrPayload, /^COCO-SAMPLE-MMQR:NOT-PAYABLE:/);
});
test('historical terminal records remain unchanged and local sweep never deletes records', async () => {
  const h = harness(), { result } = await begin(h);
  const row = h.tables.attempts.get(result.attempt.id);
  Object.assign(row, { status: 'succeeded', providerId: 'MOCK-HISTORICAL' });
  h.tables.checkouts.get(result.checkoutId).status = 'succeeded';
  const history = JSON.stringify([...h.tables.attempts]);
  const fresh = await begin(h, 'mmqr'); h.advance(900001); await h.sweep();
  assert.equal(h.tables.attempts.get(fresh.result.attempt.id).status, 'expired');
  assert.equal(JSON.stringify([[row.id, row]]), history);
  assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'succeeded');
  assert.equal(h.tables.quotes.size, 2);
});
test('expired quote requires refreshed review', async () => {
  const h = harness(), quote = await h.op('quote', { lines: [{ variantId: '123', quantity: 1 }] }); h.advance(300001);
  await assert.rejects(h.op('create', { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method: 'kbzpay', delivery: shipping }), { code: 'quote_expired' });
});
test('cart validation rejects invalid quantities and uses exact decimal arithmetic', () => {
  const { lines, money, decimal } = loader()('lib/mock-checkout-domain.server.ts');
  for (const value of [[], [{ variantId: '1', quantity: 0 }], [{ variantId: '1', quantity: 1.2 }], [{ variantId: 'abc', quantity: 1 }], [{ variantId: '1', quantity: 99 }, { variantId: '1', quantity: 1 }]]) assert.throws(() => lines(value));
  assert.equal(decimal(money('123456789012.34') * 2n), '246913578024.68');
});

test('checkout route rejects invalid signatures, wrong shops and disabled mode before checkout work', async () => {
  for (const scenario of ['signature', 'shop', 'disabled']) {
    let calls = 0;
    const action = loader({
      '../shopify.server': { authenticate: { public: { appProxy: async () => {
        if (scenario === 'signature') throw new Response(null, { status: 401 });
        return { session: { shop: 'wrong.myshopify.com' }, admin: { graphql() {} } };
      } } } },
      '../lib/mock-checkout.server': { checkoutOperation: () => { calls++; } },
    }, { process: { env: { MOCK_CHECKOUT_ENABLED: scenario === 'disabled' ? 'false' : 'true', MOCK_CHECKOUT_SHOP: context.shop } } })('routes/external-api.mock-checkout.tsx').action;
    const result = await action({ request: new Request('https://app.test/external-api/mock-checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }) });
    assert.equal(result.status, scenario === 'disabled' ? 503 : 401); assert.equal(calls, 0);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
  }
});
test('checkout route rejects oversized requests and forwards only verified identity', async () => {
  let received;
  const action = loader({
    '../shopify.server': { authenticate: { public: { appProxy: async () => ({ session: { shop: context.shop }, admin: { graphql() {} } }) } } },
    '../lib/mock-checkout.server': { checkoutOperation: (_input, owner) => { received = owner; return { mock: true }; } },
  }, { process: { env: { MOCK_CHECKOUT_ENABLED: 'true', MOCK_CHECKOUT_SHOP: context.shop } } })('routes/external-api.mock-checkout.tsx').action;
  const request = body => new Request('https://app.test/external-api/mock-checkout?logged_in_customer_id=42', { method: 'POST', headers: { 'content-type': 'application/json', 'X-GG-Customer-Id': '99' }, body });
  assert.equal((await action({ request: request('x'.repeat(17000)) })).status, 413);
  assert.equal((await action({ request: request('{"customerId":"99"}') })).status, 200);
  assert.equal(received.customerId, '42'); assert.equal(received.shop, context.shop);
});
test('sample catalog is gated and server-owned; it does not query Shopify inventory', async () => {
 const disabled = harness();
 await assert.rejects(disabled.op('quote', { source: 'sample' }), { code: 'sample_catalog_disabled' });
 const h = harness({ sampleCatalog: true });
 const quote = await h.op('quote', { source: 'sample', amount: '1.00', lines: [{ variantId: 'bad', quantity: 99 }] }, { ...context, graphql: () => { throw new Error('Sample must not query catalog'); } });
 assert.equal(quote.snapshot.amount, '35000.00');
 assert.equal(quote.snapshot.items[0].quantity, 1);
 const result = await h.op('create', { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method: 'mmqr', delivery: shipping });
 assert.equal(result.attempt.initializationStatus, 'ready');
 assert.equal(result.snapshot.amount, '35000.00');
});
