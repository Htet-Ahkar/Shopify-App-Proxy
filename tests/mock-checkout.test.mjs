import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
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
    }, Response, Request, URL, AbortSignal, TextDecoder, TextEncoder, Date, process: { env: {} }, ...extra }, { filename: file });
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
function harness() {
  let now = Date.now(), queue = Promise.resolve(), initializing = 0, initializeFailure = false, unavailable = false;
  const tables = { quotes: new Map(), checkouts: new Map(), attempts: new Map(), events: new Map() };
  const providerRows = new Map();
  class Clock extends Date {
    constructor(value) { super(arguments.length ? value : now); }
    static now() { return now; }
  }
  const copy = row => row ? structuredClone(row) : null;
  const find = (table, where) => [...table.values()].find(row => Object.entries(where).every(([key, value]) => row[key] === value));
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
  async function provider(operation, input) {
    if (unavailable) throw new Error('network unavailable');
    if (operation === 'dispatch') return { mock: true };
    let row = providerRows.get(input.attemptId);
    if (operation === 'initialize') {
      initializing++;
      row ||= { ...input, providerId: `MOCK-${input.attemptId}`, status: 'pending', instructions: input.method === 'kbzpay' ? { pwaPath: `/pages/checkout?step=pwa&attempt=${input.attemptId}` } : { qrPayload: `COCO-MOCK-MMQR:${input.attemptId}`, qrImage: 'data:image/png;base64,AA==' } };
      providerRows.set(input.attemptId, row);
      if (initializeFailure) throw new Error('response lost after provider save');
    }
    if (!row) { const error = new Error(); error.code = 'provider_not_found'; throw error; }
    if (row.status === 'pending') {
      if (row.scheduled && row.scheduled <= now) row.status = 'succeeded';
      else if (Date.parse(row.expiresAt) <= now) row.status = 'expired';
      else if (operation === 'simulate' || operation === 'cancel') {
        const outcome = operation === 'cancel' ? 'cancelled' : input.outcome;
        if (outcome === 'delayed') row.scheduled = now + 30000;
        else row.status = outcome;
      }
    }
    return { ...copy(row), eventId: `${input.attemptId}:${row.status}` };
  }
  const load = loader({ '../db.server': { __esModule: true, default: db }, './mock-payment-provider.server': { provider, validInstructions: (_method, _id, value) => Boolean(value) } }, { Date: Clock });
  const service = load('lib/mock-checkout.server.ts');
  const domain = load('lib/mock-checkout-domain.server.ts');
  const op = (operation, input = {}, owner = context) => service.checkoutOperation({ capability, operation, ...input }, owner);
  return { ...service, domain, op, tables, providerRows, advance: ms => { now += ms; }, failInitialization: value => { initializeFailure = value; }, unavailable: value => { unavailable = value; }, calls: () => initializing };
}
async function begin(h, method = 'kbzpay', owner = context) {
  const quote = await h.op('quote', { lines: [{ variantId: '123', quantity: 2 }], amount: '1.00' }, owner);
  const input = { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method, delivery: shipping };
  return { quote, input, result: await h.op('create', input, owner) };
}
for (const method of ['kbzpay', 'mmqr']) {
  test(`${method}: authoritative totals, reload and success receipt`, async () => {
    const h = harness();
    const { result, quote } = await begin(h, method);
    assert.equal(quote.snapshot.amount, '24691.34');
    assert.equal(result.status, 'pending');
    assert.equal(result.attempt.initializationStatus, 'ready');
    assert.equal(result.attempt.method, method);
    assert.equal((await h.op('status', { checkoutId: result.checkoutId })).attempt.id, result.attempt.id);
    assert.equal(h.calls(), 1);
    const paid = await h.op('simulate', { checkoutId: result.checkoutId, attemptId: result.attempt.id, outcome: 'succeeded' });
    assert.equal(paid.status, 'succeeded');
    assert.equal(paid.attempt.instructions, null);
    assert.equal(paid.delivery.name, 'Demo Person');
    assert.equal(paid.canRetry, false);
  });
  for (const outcome of ['failed', 'cancelled']) {
    test(`${method}: ${outcome} supports one concurrent retry with preserved history`, async () => {
      const h = harness();
      const { result } = await begin(h, method);
      const failed = await h.op('simulate', { checkoutId: result.checkoutId, attemptId: result.attempt.id, outcome });
      assert.equal(failed.status, outcome); assert.equal(failed.canRetry, true);
      const retry = { checkoutId: result.checkoutId, idempotencyKey: randomUUID(), method };
      const results = await Promise.all([h.op('retry', retry), h.op('retry', retry)]);
      assert.equal(results[0].attempt.id, results[1].attempt.id);
      assert.equal(h.tables.attempts.size, 2);
      assert.equal(h.calls(), 2);
      assert.equal(results[0].expiresAt, result.expiresAt);
    });
  }
  test(`${method}: delayed success is recovered without a callback`, async () => {
    const h = harness(); const { result } = await begin(h, method);
    assert.equal((await h.op('simulate', { checkoutId: result.checkoutId, attemptId: result.attempt.id, outcome: 'delayed' })).status, 'pending');
    h.advance(31000);
    assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'succeeded');
  });
  test(`${method}: expired attempt cannot retry or expose instructions`, async () => {
    const h = harness(); const { result } = await begin(h, method); h.advance(16 * 60000);
    const expired = await h.op('status', { checkoutId: result.checkoutId });
    assert.equal(expired.status, 'expired'); assert.equal(expired.attempt.instructions, null);
    await assert.rejects(h.op('retry', { checkoutId: result.checkoutId, method, idempotencyKey: randomUUID() }), e => e.code === 'retry_unavailable');
  });
}
test('concurrent create claims once and conflicting idempotency is rejected', async () => {
  const h = harness(); const { input, result } = await begin(h);
  const results = await Promise.all([h.op('create', input), h.op('create', input)]);
  assert.equal(results[0].checkoutId, result.checkoutId); assert.equal(results[1].attempt.id, result.attempt.id);
  assert.equal(h.tables.checkouts.size, 1); assert.equal(h.tables.attempts.size, 1); assert.equal(h.calls(), 1);
  await assert.rejects(h.op('create', { ...input, method: 'mmqr' }), e => e.code === 'idempotency_conflict');
  await assert.rejects(h.op('create', { ...input, idempotencyKey: randomUUID() }), e => e.code === 'quote_used');
});
test('initialization response loss remains unresolved until status recovers the original attempt', async () => {
  const h = harness(); h.failInitialization(true); const { result, input } = await begin(h);
  assert.equal(result.attempt.initializationStatus, 'reconciliation_required');
  assert.equal(result.attempt.instructions, null);
  const resumed = await h.op('status', { idempotencyKey: input.idempotencyKey });
  assert.equal(resumed.attempt.id, result.attempt.id); assert.equal(resumed.attempt.initializationStatus, 'ready');
  assert.equal(h.calls(), 1);
});
test('capability, shop and bound customer ownership are enforced', async () => {
  const h = harness(); const owner = { ...context, customerId: '42' }; const { result } = await begin(h, 'kbzpay', owner);
  for (const [input, who] of [[{ capability: 'b'.repeat(64) }, owner], [{}, { ...owner, shop: 'other.myshopify.com' }], [{}, context], [{}, { ...owner, customerId: '43' }]]) {
    await assert.rejects(h.op('status', { checkoutId: result.checkoutId, ...input }, who), e => e.code === 'not_found');
  }
});
test('expired quote requires refreshed review', async () => {
  const h = harness(); const quote = await h.op('quote', { lines: [{ variantId: '123', quantity: 1 }] }); h.advance(6 * 60000);
  await assert.rejects(h.op('create', { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method: 'kbzpay', delivery: shipping }), e => e.code === 'quote_expired');
  assert.equal(h.calls(), 0);
});
test('network interruption at expiry stays pending until the provider confirms', async () => {
  const h = harness(); const { result } = await begin(h); h.advance(16 * 60000); h.unavailable(true);
  const status = await h.op('status', { checkoutId: result.checkoutId });
  assert.equal(status.status, 'pending'); assert.equal(status.reconnecting, true); assert.equal(status.attempt.instructions, null);
});
test('mismatched callback evidence is rejected; duplicate and out-of-order events cannot regress', async () => {
  const h = harness(); const { result } = await begin(h);
  const row = h.providerRows.get(result.attempt.id);
  const evidence = { ...row, eventId: 'callback-1', status: 'succeeded' };
  for (const changes of [{ amount: '1.00' }, { currency: 'USD' }, { providerId: 'MOCK-other' }, { environment: 'prod' }, { method: 'mmqr' }, { expiresAt: new Date().toISOString() }]) {
    await assert.rejects(h.applyEvidence({ ...evidence, ...changes }), e => e.code === 'invalid_evidence');
  }
  await h.applyEvidence(evidence); await h.applyEvidence(evidence);
  assert.equal(h.tables.events.size, 2);
  await h.applyEvidence({ ...evidence, eventId: 'callback-2', status: 'failed' });
  assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'succeeded');
});
test('callback HMAC fails closed on missing secrets, tampering and stale timestamps', () => {
  const load = loader(); const { verifyCallback } = load('lib/mock-checkout-domain.server.ts');
  const timestamp = String(Date.now()), raw = '{"status":"succeeded"}', secret = 'callback-secret';
  const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  assert.equal(verifyCallback(raw, timestamp, signature, secret), true);
  assert.equal(verifyCallback(raw + ' ', timestamp, signature, secret), false);
  assert.equal(verifyCallback(raw, timestamp, signature, ''), false);
  assert.equal(verifyCallback(raw, timestamp, signature, secret, Number(timestamp) + 300001), false);
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
test('provider rejects missing or incorrect keys before touching the database', async () => {
  for (const supplied of [null, 'wrong-key', 'provider-key']) {
    let handler, queries = 0;
    const noopSql = () => { queries++; throw new Error('not expected'); };
    const exports = {};
    const source = fs.readFileSync('supabase/functions/mock-payments/index.ts', 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(compiled, { exports, require(name) {
      if (name.startsWith('npm:postgres')) return () => noopSql;
      if (name.startsWith('npm:qrcode')) return {};
      return require(name);
    }, Response, Date, Deno: { env: { get: name => ({ MOCK_PAYMENT_PROVIDER_KEY: 'provider-key', MOCK_PROVIDER_DATABASE_URL: 'postgres://unused' })[name] }, serve: callback => { handler = callback; } } });
    const response = await handler(new Request('https://provider.test', { method: 'POST', headers: supplied ? { 'x-api-key': supplied, 'content-type': 'application/json' } : {}, body: '{"operation":"status","attemptId":"invalid"}' }));
    assert.equal(response.status, supplied === 'provider-key' ? 400 : 401); assert.equal(queries, 0);
  }
});
test('provider client keeps keys server-side and rejects plaintext targets and redirects', async () => {
  let calls = 0;
  const environment = { MOCK_PAYMENT_PROVIDER_URL: 'http://provider.test', MOCK_PAYMENT_PROVIDER_KEY: 'private-provider-key' };
  const load = loader({}, { process: { env: environment }, fetch: async (_url, options) => {
    calls++; assert.equal(options.redirect, 'error'); assert.equal(options.headers['x-api-key'], 'private-provider-key');
    return new Response('private-provider-key', { status: 401 });
  } });
  const { provider } = load('lib/mock-payment-provider.server.ts');
  await assert.rejects(provider('status'), e => e.code === 'provider_unavailable'); assert.equal(calls, 0);
  environment.MOCK_PAYMENT_PROVIDER_URL = 'https://provider.test';
  await assert.rejects(provider('status'), e => e.code === 'provider_unavailable' && !e.message.includes('private-provider-key')); assert.equal(calls, 1);
});

test('simultaneous first submissions claim one checkout and initialize one provider payment', async () => {
  const h = harness();
  const quote = await h.op('quote', { lines: [{ variantId: '123', quantity: 1 }] });
  const input = { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method: 'mmqr', delivery: shipping };
  const results = await Promise.all([h.op('create', input), h.op('create', input)]);
  assert.equal(results[0].checkoutId, results[1].checkoutId);
  assert.equal(results[0].attempt.id, results[1].attempt.id);
  assert.equal(h.tables.checkouts.size, 1);
  assert.equal(h.tables.attempts.size, 1);
  assert.equal(h.calls(), 1);
});
