import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function loadApi(secret = 'test-only-secret') {
  const source = fs.readFileSync(new URL('../supabase/functions/mock-external-api/index.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let handler;
  vm.runInNewContext(compiled, {
    exports: {}, require, Response, Request, TextEncoder,
    Deno: { env: { get: () => secret }, serve: (callback) => { handler = callback; } },
  });
  return handler;
}

for (const key of [null, 'incorrect-secret', 'test-only-secrex']) {
  test(`mock API rejects ${key === null ? 'missing' : 'incorrect'} credentials`, async () => {
    const headers = key === null ? {} : { 'x-api-key': key };
    const result = await loadApi()(new Request('https://example.test', { headers }));
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await result.json(), { ok: false, error: 'Invalid API key.' });
  });
}

test('correct credentials return simulated data without returning the secret', async () => {
  const result = await loadApi()(new Request('https://example.test', { headers: { 'x-api-key': 'test-only-secret' } }));
  assert.equal(result.status, 200);
  const body = await result.text();
  assert.equal(JSON.parse(body).authenticated, true);
  assert.equal(JSON.parse(body).mock, true);
  assert.equal(body.includes('test-only-secret'), false);
});

test('unconfigured mock API fails closed', async () => {
  const result = await loadApi('')(new Request('https://example.test'));
  assert.equal(result.status, 503);
});

test('mock API does not accept payment-like POST operations', async () => {
  const result = await loadApi()(new Request('https://example.test', { method: 'POST' }));
  assert.equal(result.status, 405);
});
