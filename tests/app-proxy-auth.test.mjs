import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function loadProxy(authenticateProxy, fetchUpstream, environment = {}) {
  const source = fs.readFileSync(new URL('../app/routes/apps.proxy.external-api.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({ authenticate: { public: { appProxy: authenticateProxy } } }),
    Response, URL, AbortController, DOMException, setTimeout, clearTimeout,
    process: { env: { EXTERNAL_API_URL: 'https://example.test/todo', EXTERNAL_API_SECRET: 'test-only-secret', ...environment } },
    console: { log() {}, error() {} },
    fetch: fetchUpstream,
  });
  return exports.loader;
}

const request = new Request('https://example.test/external-api?shop=example.myshopify.com');

test('invalid signatures remain rejected before contacting the upstream', async () => {
  let calls = 0;
  const loader = loadProxy(async () => { throw new Response(null, { status: 400 }); }, () => { calls++; });
  const result = await loader({ request });
  assert.equal(result.status, 400);
  assert.deepEqual(await result.json(), { ok: false, error: 'App proxy request could not be verified by Shopify.' });
  assert.equal(calls, 0);
});

test('session failures return safe 500 errors instead of claiming a bad signature', async () => {
  let calls = 0;
  const loader = loadProxy(async () => { throw new Error('database unavailable: private details'); }, () => { calls++; });
  const result = await loader({ request });
  assert.equal(result.status, 500);
  assert.deepEqual(await result.json(), { ok: false, error: 'App proxy session storage is unavailable.' });
  assert.equal(calls, 0);
});

test('verified requests return only the demo fields', async () => {
  const loader = loadProxy(async () => ({}), async (url, options) => {
    assert.equal(url, 'https://example.test/todo');
    assert.equal(options.headers['x-api-key'], 'test-only-secret');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({
    id: 1, userId: 2, title: 'Demo', completed: false, authenticated: true, secret: 'must not escape',
    }));
  });
  const result = await loader({ request });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), { ok: true, id: 1, userId: 2, title: 'Demo', completed: false, apiAuthenticated: true });
});

test('missing upstream secret fails closed without making an API call', async () => {
  let calls = 0;
  const loader = loadProxy(async () => ({}), () => { calls++; }, { EXTERNAL_API_SECRET: '' });
  const result = await loader({ request });
  assert.equal(result.status, 500);
  assert.equal(calls, 0);
});

test('an HTTP upstream is rejected before sending a credential', async () => {
  let calls = 0;
  const loader = loadProxy(async () => ({}), () => { calls++; }, { EXTERNAL_API_URL: 'http://example.test' });
  const result = await loader({ request });
  assert.equal(result.status, 500);
  assert.equal(calls, 0);
});

test('provider authentication failures do not disclose its response or key', async () => {
  const loader = loadProxy(async () => ({}), async () => new Response('test-only-secret', { status: 401 }));
  const result = await loader({ request });
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { ok: false, error: 'External API request failed.' });
});
