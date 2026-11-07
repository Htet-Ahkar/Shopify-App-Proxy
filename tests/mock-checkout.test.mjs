import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
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
    }, Response, Request, URL, URLSearchParams, AbortSignal, TextDecoder, TextEncoder, Date, Buffer, process: { env: {} }, ...extra }, { filename: file });
    return exports;
  }
  return file => load(path.resolve(directory, file));
}
const capability = 'a'.repeat(64);
const context = {
  shop: 'coco.myshopify.com', customerId: null,
  graphql: async (_query, { variables }) => Response.json({ data: { shop: { currencyCode: 'MMK' }, nodes: variables.ids.map(id => ({ id, title: 'M', price: '12345.67', media: { nodes: [{ preview: { image: { url: 'https://cdn.shopify.com/test-variant.png' } } }] }, product: { title: 'COCO Tee', status: 'ACTIVE' } })) } }),
};
const shipping = { name: 'Demo Person', email: 'demo@example.test', phone: '+95912345678', address: 'Demo Street', region: 'ရန်ကုန်တိုင်းဒေသကြီး', city: 'ရန်ကုန်မြို့တွင်း', country: 'Myanmar' };
function harness({ sampleCatalog = false, env = {}, transport, logFailure = false } = {}) {
  let now = Date.now(), queue = Promise.resolve(), committedSubmissions = 0;
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
        try {
          const result = await work(db);
          if (result?.fresh) committedSubmissions++;
          return result;
        }
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
  const logs = [], logCommits = [];
  const runtimeConsole = { info: message => {
    if (logFailure) throw new Error("log output unavailable");
    logs.push(message);
    logCommits.push(committedSubmissions);
  } };
  const runtimeEnv = { MOCK_CHECKOUT_SAMPLE_CATALOG_ENABLED: String(sampleCatalog), ...env };
  const load = loader({ '../db.server': { __esModule: true, default: db } }, { Date: Clock, console: runtimeConsole, process: { env: runtimeEnv }, fetch: transport ?? (() => { throw new Error('No external payment calls allowed'); }) });
  const service = load('lib/mock-checkout.server.ts');
  const op = (operation, input = {}, owner = context) => service.checkoutOperation({ capability, operation, ...(operation === 'quote' ? { shipping: { state: shipping.region, city: shipping.city } } : {}), ...input }, owner);
  return { ...service, op, tables, logs, logCommits, setEnv: changes => Object.assign(runtimeEnv, changes), advance: ms => { now += ms; } };
}
async function begin(h, method = 'kbzpay', owner = context) {
  const quote = await h.op('quote', { lines: [{ variantId: '123', quantity: 2 }], amount: '1.00' }, owner);
  const input = { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method, delivery: shipping };
  return { quote, input, result: await h.op('create', input, owner) };
}
for (const method of ['kbzpay', 'mmqr']) {
  test(`${method}: sample instructions, authoritative totals, status and reload`, async () => {
    const h = harness(), { result, quote, input } = await begin(h, method);
    assert.equal(quote.snapshot.amount, '27691.34');
    assert.equal(quote.snapshot.items[0].image, 'https://cdn.shopify.com/test-variant.png');
    assert.equal(result.snapshot.items[0].image, quote.snapshot.items[0].image);
    assert.equal(result.status, 'pending');
    assert.equal(result.attempt.initializationStatus, 'ready');
    assert.equal(result.attempt.providerId, `SIM-${result.attempt.id}`);
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
    h.advance(10000);
    assert.equal((await h.op('status', { checkoutId: result.checkoutId, status: 'succeeded' })).status, 'pending');
    h.advance(21000);
    assert.equal((await h.op('status', { checkoutId: result.checkoutId, status: 'failed' })).status, 'pending');
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
  test(`${method}: delayed polling expires pending demos; late cancel cannot reopen them`, async () => {
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
  Object.assign(row, { gateway: null, merchantOrderId: null, providerId: 'MOCK-OLD', instructions: { pwaUrl: 'https://old.test/mock-payments/hosted?token=old' } });
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
 assert.equal(quote.snapshot.amount, '38000.00');
 assert.equal(quote.snapshot.items[0].quantity, 1);
 const result = await h.op('create', { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method: 'mmqr', delivery: shipping });
 assert.equal(result.attempt.initializationStatus, 'ready');
 assert.equal(result.snapshot.amount, '38000.00');
});

const uatEnv = { KBZPAY_MODE: 'uat', KBZPAY_APP_ID: 'kpTest', KBZPAY_MERCH_CODE: '100001', KBZPAY_APP_KEY: 'test-only-key', KBZPAY_NOTIFY_URL: 'https://coco.test/payments/kbzpay/notify' };
const protocol = loader()('lib/kbzpay.server.ts');
function signed(fields) { return { ...fields, sign_type: 'SHA256', sign: protocol.signature(fields, uatEnv.KBZPAY_APP_KEY) }; }
function gatewayTransport({ loseCreate = false, badSignature = false, malformed = false, loseClose = false } = {}) {
  let state = 'WAIT_PAY', closeState = 'ORDER_CLOSED';
  let overrides = {};
  const calls = [];
  const transport = async (url, options) => {
    const body = JSON.parse(options.body).Request;
    assert.equal(body.sign, protocol.signature(body, uatEnv.KBZPAY_APP_KEY));
    assert.equal(body.biz_content.appid, uatEnv.KBZPAY_APP_ID);
    assert.equal(body.biz_content.merch_code, uatEnv.KBZPAY_MERCH_CODE);
    assert.equal(options.redirect, 'error');
    calls.push({ url, body });
    const operation = url.split('/').at(-1);
    const reference = body.biz_content.merch_order_id;
    let fields = { result: 'SUCCESS', code: '0', nonce_str: 'testNonce', merch_order_id: reference };
    if (operation === 'precreate') {
      if (loseCreate) throw new TypeError('lost response after provider accepted order');
      assert.match(body.biz_content.timeout_express, /^1[45]m$/);
      assert.match(reference, /^COCO_[a-f0-9]{32}$/);
      fields = { ...fields, prepay_id: `PREPAY_${reference}`, qrCode: '000201TEST_UAT_QR' };
    } else if (operation === 'closeorder') { state = closeState; if (loseClose) throw new TypeError('lost close response'); }
    else fields = { ...fields, trade_status: state, total_amount: '27691.34', trans_currency: 'MMK', mm_order_id: state === 'PAY_SUCCESS' ? 'transaction-1' : '' };
    if (malformed) return Response.json({ Response: null });
    const response = signed({ ...fields, ...overrides });
    if (badSignature) response.sign = '0'.repeat(64);
    return Response.json({ Response: response });
  };
  return { transport, calls, setState: value => { state = value; }, setCloseState: value => { closeState = value; }, setOverrides: value => { overrides = value; } };
}
function callbackFor(attempt, changes = {}) {
  return { Request: signed({ appid: uatEnv.KBZPAY_APP_ID, merch_code: uatEnv.KBZPAY_MERCH_CODE, merch_order_id: attempt.merchantOrderId, total_amount: attempt.amount, trans_currency: 'MMK', trade_status: 'PAY_SUCCESS', mm_order_id: 'transaction-1', trans_end_time: '1793960000', notify_time: '1793960001', nonce_str: 'notifyNonce', ...changes }) };
}
test('signature matches the official canonical field example with an explicit test key', () => {
  const fields = { timestamp: '1536637503', method: 'kbz.payment.precreate', notify_url: 'http://test.com/payment/notify', nonce_str: '845255910308564481', version: '1.0', sign_type: 'SHA256', sign: 'ignored', biz_content: { appid: 'kp123456789987654321abcdefghijkl', merch_code: '100001', merch_order_id: '201811212009001', trade_type: 'APPH5', total_amount: '1000', trans_currency: 'MMK', title: '' } };
  const canonical = 'appid=kp123456789987654321abcdefghijkl&merch_code=100001&merch_order_id=201811212009001&method=kbz.payment.precreate&nonce_str=845255910308564481&notify_url=http://test.com/payment/notify&timestamp=1536637503&total_amount=1000&trade_type=APPH5&trans_currency=MMK&version=1.0&key=testAppKey123';
  assert.equal(protocol.signature(fields, 'testAppKey123'), createHash('sha256').update(canonical).digest('hex').toUpperCase());
  assert.equal(protocol.signature({ ...fields, refund_list: [{ amount: '1' }] }, 'testAppKey123'), protocol.signature(fields, 'testAppKey123'));
  assert.throws(() => protocol.flatten({ appid: 'a', biz_content: { appid: 'b' } }));
});
for (const method of ['kbzpay', 'mmqr']) {
  test(`UAT ${method}: signed precreate and missed-callback query recovery, never automatic success`, async () => {
    const gateway = gatewayTransport(), h = harness({ env: uatEnv, transport: gateway.transport });
    const { result, input } = await begin(h, method);
    assert.equal(result.paymentEnvironment, 'uat');
    assert.equal(result.attempt.initializationStatus, 'ready');
    assert.equal(gateway.calls[0].body.biz_content.trade_type, method === 'mmqr' ? 'PAY_BY_QRCODE' : 'PWAAPP');
    if (method === 'mmqr') assert.equal(result.attempt.instructions.qrPayload, '000201TEST_UAT_QR');
    else {
      const link = new URL(result.attempt.instructions.pwaUrl);
      assert.equal(link.origin, 'https://static.kbzpay.com');
      const params = Object.fromEntries(new URLSearchParams(link.hash.split('?')[1]));
      assert.equal(params.sign, protocol.signature(params, uatEnv.KBZPAY_APP_KEY));
      assert.equal(params.prepay_id, result.attempt.providerId);
    }
    h.advance(31000);
    assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'pending');
    gateway.setState('PAY_SUCCESS'); h.advance(11000);
    assert.equal((await h.op('status', { idempotencyKey: input.idempotencyKey })).status, 'succeeded');
    assert.equal(h.tables.checkouts.get(result.checkoutId).status, 'succeeded');
    assert.equal(gateway.calls.filter(c => c.url.endsWith('/precreate')).length, 1);
  });
}
test('simulation remains pending at ten seconds and supports cancellation before or after', async () => {
  const h = harness(), first = await begin(h), second = await begin(h, 'mmqr');
  h.advance(9999);
  assert.equal((await h.op('status', { checkoutId: first.result.checkoutId })).status, 'pending');
  await h.op('cancel', { checkoutId: second.result.checkoutId, attemptId: second.result.attempt.id });
  h.advance(1);
  assert.equal((await h.op('status', { checkoutId: first.result.checkoutId })).status, 'pending');
  h.advance(10000);
  assert.equal((await h.op('status', { checkoutId: second.result.checkoutId })).status, 'cancelled');
  assert.equal((await h.op('cancel', { checkoutId: first.result.checkoutId, attemptId: first.result.attempt.id })).status, 'cancelled');
});
test('lost precreate response remains recoverable and repeated create never dispatches again', async () => {
  const gateway = gatewayTransport({ loseCreate: true }), h = harness({ env: uatEnv, transport: gateway.transport });
  const { result, input } = await begin(h);
  assert.equal(result.attempt.initializationStatus, 'reconciliation_required');
  assert.equal(result.attempt.instructions, null);
  await h.op('create', input);
  await assert.rejects(h.op('cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id }), { code: 'payment_reconciling' });
  await assert.rejects(h.op('retry', { checkoutId: result.checkoutId, method: 'kbzpay', idempotencyKey: randomUUID() }), { code: 'retry_unavailable' });
  h.advance(11000); gateway.setState('PAY_SUCCESS');
  assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'succeeded');
  assert.equal(gateway.calls.filter(c => c.url.endsWith('/precreate')).length, 1);
});
test('UAT closure must be confirmed, and payment during closure wins over cancellation', async () => {
  const gateway = gatewayTransport(), h = harness({ env: uatEnv, transport: gateway.transport });
  const { result } = await begin(h);
  gateway.setCloseState('WAIT_PAY');
  assert.equal((await h.op('cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id })).canRetry, false);
  gateway.setCloseState('PAY_SUCCESS');
  assert.equal((await h.op('cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id })).status, 'succeeded');
  assert.equal(gateway.calls.filter(c => c.url.endsWith('/closeorder')).length, 2);
});
test('signed notifications reject mismatches, handle duplicates and retain late success after retry', async () => {
  const gateway = gatewayTransport(), h = harness({ env: uatEnv, transport: gateway.transport });
  const { result } = await begin(h);
  const attempt = h.tables.attempts.get(result.attempt.id);
  for (const changes of [{ appid: 'other' }, { merch_code: 'other' }, { total_amount: '1' }, { trans_currency: 'USD' }, { trade_status: 'WAIT_PAY' }]) await assert.rejects(h.paymentNotification(callbackFor(attempt, changes)));
  const invalid = callbackFor(attempt); invalid.Request.sign = '0'.repeat(64);
  await assert.rejects(h.paymentNotification(invalid), { code: 'invalid_payment_signature' });
  await h.op('cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id });
  const next = await h.op('retry', { checkoutId: result.checkoutId, method: 'mmqr', idempotencyKey: randomUUID() });
  await Promise.all([h.paymentNotification(callbackFor(attempt)), h.paymentNotification(callbackFor(attempt))]);
  const recovered = await h.op('status', { checkoutId: result.checkoutId });
  assert.equal(recovered.status, 'succeeded'); assert.equal(recovered.canRetry, false); assert.equal(recovered.attempt.instructions, null);
  assert.equal(recovered.attempt.id, attempt.id); assert.equal(recovered.attempt.transactionId, 'transaction-1');
  await assert.rejects(h.paymentNotification(callbackFor(attempt, { mm_order_id: 'different-transaction' })), { code: 'payment_evidence_mismatch' });
  assert.equal([...h.tables.events.values()].filter(e => e.status === 'succeeded').length, 1);
  assert.equal(h.tables.attempts.get(next.attempt.id).status, 'pending');
});
test('query evidence mismatches stay pending; failed and expired gateway results are authoritative', async () => {
  for (const override of [{ total_amount: '1' }, { trans_currency: 'USD' }, { merch_order_id: 'wrong' }, { merch_code: 'wrong' }, { trade_status: 'UNKNOWN' }]) {
    const gateway = gatewayTransport(), h = harness({ env: uatEnv, transport: gateway.transport }), { result } = await begin(h);
    gateway.setState('PAY_SUCCESS'); gateway.setOverrides(override); h.advance(11000);
    assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'pending');
    assert.equal(h.tables.events.size, 0);
  }
  for (const [remote, expected] of [['PAY_FAILED', 'failed'], ['ORDER_EXPIRED', 'expired']]) {
    const gateway = gatewayTransport(), h = harness({ env: uatEnv, transport: gateway.transport }), { result } = await begin(h);
    gateway.setState(remote); h.advance(11000);
    assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, expected);
  }
});
test('lost closure acknowledgement blocks retry until status confirms closure', async () => {
  const gateway = gatewayTransport({ loseClose: true }), h = harness({ env: uatEnv, transport: gateway.transport }), { result } = await begin(h);
  await assert.rejects(h.op('cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id }), { code: 'payment_reconciling' });
  await assert.rejects(h.op('retry', { checkoutId: result.checkoutId, method: 'mmqr', idempotencyKey: randomUUID() }), { code: 'retry_unavailable' });
  h.advance(11000);
  assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'cancelled');
  const input = { checkoutId: result.checkoutId, method: 'mmqr', idempotencyKey: randomUUID() };
  const next = await Promise.all([h.op('retry', input), h.op('retry', input)]);
  assert.equal(next[0].attempt.id, next[1].attempt.id);
  assert.equal(gateway.calls.filter(c => c.url.endsWith('/precreate')).length, 2);
});
test('retry near checkout deadline expires without extending the simulation success window', async () => {
  const h = harness(), { result } = await begin(h);
  await h.op('cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id });
  h.advance(895000);
  const retry = await h.op('retry', { checkoutId: result.checkoutId, method: 'mmqr', idempotencyKey: randomUUID() });
  assert.equal(retry.expiresAt, result.expiresAt); h.advance(11000);
  assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'expired');
});
test('UAT refuses a retry with less than one gateway minute left before creating another attempt', async () => {
  const gateway = gatewayTransport(), h = harness({ env: uatEnv, transport: gateway.transport }), { result } = await begin(h);
  await h.op('cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id });
  h.advance(850000);
  await assert.rejects(h.op('retry', { checkoutId: result.checkoutId, method: 'mmqr', idempotencyKey: randomUUID() }), { code: 'retry_unavailable' });
  assert.equal(h.tables.attempts.size, 1);
  assert.equal(gateway.calls.filter(c => c.url.endsWith('/precreate')).length, 1);
});
test('release pause stops new payments while idempotency recovery and callbacks remain available', async () => {
  const gateway = gatewayTransport(), h = harness({ env: uatEnv, transport: gateway.transport }), { result, input } = await begin(h);
  h.setEnv({ KBZPAY_ACCEPT_NEW_PAYMENTS: 'false' });
  await assert.rejects(begin(h), { code: 'payment_unavailable' });
  assert.equal((await h.op('create', input)).attempt.id, result.attempt.id);
  await h.paymentNotification(callbackFor(h.tables.attempts.get(result.attempt.id)));
  assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'succeeded');
});
test('invalid UAT configuration fails before claiming; bad provider responses never fall back', async () => {
  for (const env of [{ KBZPAY_MODE: 'prod' }, { ...uatEnv, KBZPAY_APP_KEY: '' }, { ...uatEnv, KBZPAY_GATEWAY_BASE_URL: 'https://api.kbzpay.com/payment/gateway' }]) {
    const h = harness({ env }); await assert.rejects(begin(h), { code: 'payment_unavailable' }); assert.equal(h.tables.attempts.size, 0);
  }
  for (const options of [{ badSignature: true }, { malformed: true }]) {
    const gateway = gatewayTransport(options), h = harness({ env: uatEnv, transport: gateway.transport });
    const { result } = await begin(h); h.advance(20000);
    const status = await h.op('status', { checkoutId: result.checkoutId });
    assert.equal(status.paymentEnvironment, 'uat'); assert.equal(status.status, 'pending'); assert.equal(status.canRetry, false); assert.equal(status.attempt.instructions, null);
  }
});
test('stored mode survives configuration switch and old sample attempts cannot auto-succeed', async () => {
  const env = { ...uatEnv, KBZPAY_MODE: 'simulation' }, h = harness({ env });
  const { result } = await begin(h);
  await assert.rejects(h.paymentNotification(callbackFor(h.tables.attempts.get(result.attempt.id))), { code: 'invalid_payment_signature' });
  h.setEnv({ KBZPAY_MODE: 'uat' }); h.advance(10000);
  assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'pending');
  const old = harness(), legacy = await begin(old);
  Object.assign(old.tables.attempts.get(legacy.result.attempt.id), { gateway: null, merchantOrderId: null });
  old.advance(20000);
  assert.equal((await old.op('status', { checkoutId: legacy.result.checkoutId })).status, 'cancelled');
  const gateway = gatewayTransport(), uat = harness({ env: uatEnv, transport: gateway.transport }), payment = await begin(uat);
  uat.setEnv({ KBZPAY_MODE: 'simulation' }); uat.advance(20000);
  assert.equal((await uat.op('status', { checkoutId: payment.result.checkoutId })).status, 'pending');
  assert.equal(uat.tables.attempts.get(payment.result.attempt.id).environment, 'uat');
});
test('a callback racing cancellation preserves one durable checkout success', async () => {
  const gateway = gatewayTransport(), h = harness({ env: uatEnv, transport: gateway.transport }), { result } = await begin(h);
  const attempt = h.tables.attempts.get(result.attempt.id);
  await Promise.all([h.op('cancel', { checkoutId: result.checkoutId, attemptId: attempt.id }), h.paymentNotification(callbackFor(attempt))]);
  assert.equal((await h.op('status', { checkoutId: result.checkoutId })).status, 'succeeded');
  assert.equal(h.tables.checkouts.size, 1);
  assert.equal([...h.tables.events.values()].filter(e => e.status === 'succeeded').length, 1);
});
test('notification route acknowledges only after persistence, with the documented plain success body', async () => {
  for (const fails of [false, true]) {
    let called = false;
    const action = loader({ '../lib/mock-checkout.server': { paymentNotification: async () => { called = true; if (fails) throw new Error('storage unavailable'); } } }, { process: { env: { MOCK_CHECKOUT_ENABLED: 'true' } } })('routes/payments.kbzpay.notify.tsx').action;
    const result = await action({ request: new Request('https://coco.test/payments/kbzpay/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"Request":{}}' }) });
    assert.equal(called, true); assert.equal(result.status, fails ? 503 : 200);
    if (!fails) assert.equal(await result.text(), 'success');
  }
});


test('Royal Express validates every destination and uses canonical zone prices', async () => {
  const { default: data } = loader()('lib/royal-express-data.server.ts');
  const { shippingQuote } = loader()('lib/royal-express.server.ts');
  const base = { items: [{ total: '100.25' }], amount: '100.25', currency: 'MMK', shipping: '0.00', tax: '0.00' };
  for (const state of data.states) for (const city of state.cities) {
    const input = { state: state.id, city: city.id, price: '0.01', zone: 'fake' };
    if (!city.available) { assert.throws(() => shippingQuote(base, input), { code: 'invalid_shipping' }); continue; }
    const result = shippingQuote(base, input);
    assert.equal(result.shipping, `${data.prices[city.zone]}.00`);
    assert.equal(result.subtotal, '100.25');
    assert.equal(result.amount, `${data.prices[city.zone] + 100}.25`);
    assert.equal(result.shippingSelection.zone, city.zone);
  }
  for (const input of [null, {}, { state: 'unknown', city: 'unknown' }, { state: data.states[0].id, city: data.states[1].cities[0].id }]) {
    assert.throws(() => shippingQuote(base, input), { code: 'invalid_shipping' });
  }
});
test('checkout binds delivery to the quoted city and requires shipping for preview quotes', async () => {
  const h = harness();
  const quote = await h.op('quote', { lines: [{ variantId: '123', quantity: 2 }] });
  const input = { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method: 'mmqr', delivery: shipping };
  for (const change of [{ city: 'other' }, { region: 'other' }, { country: 'other' }]) {
    await assert.rejects(h.op('create', { ...input, delivery: { ...shipping, ...change } }), { code: 'shipping_changed' });
  }
  const preview = await h.op('quote', { lines: [{ variantId: '123', quantity: 2 }], shipping: undefined });
  await assert.rejects(h.op('create', { ...input, quoteId: preview.quoteId }), { code: 'shipping_required' });
  const result = await h.op('create', input);
  assert.equal(result.snapshot.subtotal, '24691.34');
  assert.equal(result.snapshot.shipping, '3000.00');
  assert.equal(result.snapshot.amount, '27691.34');
  assert.equal(h.tables.attempts.get(result.attempt.id).amount, '27691.34');
});
test('historical checkout retries preserve original totals without shipping metadata', async () => {
  const h = harness(), { result } = await begin(h);
  const checkout = h.tables.checkouts.get(result.checkoutId);
  delete checkout.snapshot.shippingSelection;
  delete checkout.snapshot.subtotal;
  checkout.snapshot.amount = '24691.34';
  checkout.snapshot.shipping = '0.00';
  await h.op('cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id });
  const next = await h.op('retry', { checkoutId: result.checkoutId, idempotencyKey: randomUUID(), method: 'mmqr' });
  assert.equal(next.snapshot.amount, '24691.34');
  assert.equal(next.snapshot.shipping, '0.00');
  assert.equal(h.tables.attempts.get(next.attempt.id).amount, '24691.34');
});


test('demo activity logs a readable line once per committed attempt, without customer or payment data', async () => {
  const h = harness();
  const quote = await h.op('quote', { lines: [{ variantId: '123', quantity: 2 }, { variantId: '456', quantity: 1 }] });
  assert.equal(h.logs.length, 0);
  const frozen = h.tables.quotes.get(quote.quoteId).snapshot;
  frozen.items[0].title = 'Waffle Henley Shirt / Gray / M';
  frozen.items[1].title = 'COCO\r\nTee\t/ Black / L\u2028Limited';
  const input = { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method: 'mmqr', delivery: shipping };
  const [result, duplicate] = await Promise.all([h.op('create', input), h.op('create', input)]);
  assert.equal(result.attempt.id, duplicate.attempt.id);
  assert.equal(h.logs.length, 1);
  assert.equal(h.logCommits[0], 1, "The new attempt must be committed before logging");
  const row = h.tables.attempts.get(result.attempt.id);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(row.createdAt);
  assert.equal(h.logs[0], `[COCO DEMO] Checkout submitted | ${time} UTC+07:00 | Waffle Henley Shirt / Gray / M × 2; COCO Tee / Black / L Limited × 1 | 40,037.01 MMK | MMQR | ${result.reference}`);
  assert.doesNotMatch(h.logs[0], /[\r\n\t\u2028\u2029]/);
  for (const sensitive of [shipping.name, shipping.email, shipping.phone, shipping.address, shipping.city, capability, input.idempotencyKey, result.attempt.instructions.qrPayload, result.attempt.providerId]) assert.equal(h.logs[0].includes(sensitive), false);
  await h.op('create', input);
  await h.op('status', { checkoutId: result.checkoutId });
  await h.op('status', { idempotencyKey: input.idempotencyKey });
  await h.op('cancel', { checkoutId: result.checkoutId, attemptId: result.attempt.id });
  assert.equal(h.logs.length, 1);
  const retry = { checkoutId: result.checkoutId, idempotencyKey: randomUUID(), method: 'kbzpay' };
  h.advance(15000);
  const attempts = await Promise.all([h.op('retry', retry), h.op('retry', retry)]);
  assert.equal(attempts[0].attempt.id, attempts[1].attempt.id);
  assert.equal(h.logs.length, 2);
  assert.equal(h.logCommits[1], 2, "The retry must be committed before logging");
  assert.match(h.logs[1], /^\[COCO DEMO\] Payment retry submitted \| /);
  assert.ok(h.logs[1].endsWith(`| 40,037.01 MMK | KBZPay PWA | ${result.reference}`));
  assert.equal(h.logs[1].includes(attempts[0].attempt.instructions.pwaUrl), false);
});

test('demo activity uses saved timestamps in Bangkok even across the UTC date boundary', () => {
  const logs = [];
  const { logDemoSubmission } = loader({}, { console: { info: line => logs.push(line) } })('lib/demo-activity.server.ts');
  logDemoSubmission({ snapshot: { items: [{ title: 'Item / M', quantity: 1 }], amount: '68000.00', currency: 'MMK' }, reference: 'COCO-MOCK-TEST', method: 'kbzpay', createdAt: new Date('2026-11-07T18:30:00Z'), retry: false });
  assert.equal(logs[0], '[COCO DEMO] Checkout submitted | 8 Nov 2026, 01:30:00 UTC+07:00 | Item / M × 1 | 68,000 MMK | KBZPay PWA | COCO-MOCK-TEST');
});

test('rejected requests and quotes emit no demo activity; unavailable logging cannot break checkout', async () => {
  const h = harness();
  await assert.rejects(h.op('quote', { shipping: { state: 'invalid', city: 'invalid' }, lines: [{ variantId: '123', quantity: 1 }] }), { code: 'invalid_shipping' });
  const quote = await h.op('quote', { lines: [{ variantId: '123', quantity: 1 }] });
  await assert.rejects(h.op('create', { quoteId: quote.quoteId, idempotencyKey: randomUUID(), method: 'mmqr', delivery: { ...shipping, city: 'invalid' } }), { code: 'shipping_changed' });
  assert.equal(h.logs.length, 0);
  assert.equal(h.tables.attempts.size, 0);
  const failing = harness({ logFailure: true });
  const { result } = await begin(failing);
  assert.equal(result.status, 'pending');
  assert.equal(result.attempt.initializationStatus, 'ready');
  assert.equal(failing.tables.attempts.size, 1);
});
