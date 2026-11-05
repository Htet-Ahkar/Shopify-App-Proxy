import assert from 'node:assert/strict';
import { webcrypto, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
const themePath = process.env.COCO_THEME_PATH || path.resolve('../../coco-original');
const hasTheme = fs.existsSync(path.join(themePath, 'snippets/custom-checkout.liquid'));
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(check) { for (let n = 0; n < 100; n++) { if (check()) return; await pause(); } assert.fail('Journey did not reach the expected state'); }
const snapshot = { items: [{ title: 'COCO Tee / M', quantity: 2, total: '20000.00' }], amount: '20000.00', currency: 'MMK', shipping: '0.00', tax: '0.00' };
function storefront({ empty = false, loseCreateResponse = false, storage, resumedRecord = null, disabled = false } = {}) {
  const raw = fs.readFileSync(path.join(themePath, 'locales/en.default.json'), 'utf8');
  const translations = ts.parseConfigFileTextToJson('en.default.json', raw).config.mock_checkout;
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  let markup = fs.readFileSync(path.join(themePath, 'snippets/custom-checkout.liquid'), 'utf8');
  markup = markup.replace(/{% doc %}[\s\S]*?{% enddoc %}/g, '').replace(/{{\s*'mock_checkout\.([^']+)'\s*\|\s*t\s*\|\s*json\s*}}/g, (_, key) => JSON.stringify(translations[key]));
  markup = markup.replace(/{{\s*'mock_checkout\.([^']+)'\s*\|\s*t\s*}}/g, (_, key) => escape(translations[key]));
  markup = markup.replace(/{{\s*settings.mock_checkout_enabled\s*}}/g, disabled ? 'false' : 'true').replace(/{{\s*routes\.[^}]+}}/g, '/').replace(/{{[^}]+}}/g, '');
  const dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`, { url: 'https://coco.test/pages/checkout', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  Object.defineProperty(window, 'crypto', { value: webcrypto });
  window.AbortSignal.timeout = () => new window.AbortController().signal;
  if (storage) window.sessionStorage.setItem('coco:mock-checkout:v1', storage);
  const intervals = [];
  window.setInterval = (callback, delay) => { intervals.push({ callback, delay }); return intervals.length; };
  window.clearInterval = () => {};
  let record = resumedRecord, creates = 0, calls = [];
  const fetch = async (url, options = {}) => {
    if (String(url).endsWith('cart.js')) return Response.json({ items: empty ? [] : [{ variant_id: 123, product_title: 'COCO Tee', variant_title: 'M', quantity: 2, original_line_price: 2000000 }], original_total_price: 2000000, currency: 'MMK' });
    assert.equal(String(url), '/apps/proxy/mock-checkout');
    const input = JSON.parse(options.body); calls.push(input);
    assert.match(input.capability, /^[a-f0-9]{64}$/);
    if (input.operation === 'quote') return Response.json({ mock: true, quoteId: randomUUID(), snapshot, expiresAt: new Date(Date.now() + 300000).toISOString() });
    if (input.operation === 'create' || input.operation === 'retry') {
      creates++;
      record = { mock: true, checkoutId: record?.checkoutId || randomUUID(), reference: 'COCO-MOCK-TEST', snapshot, delivery: input.delivery || record.delivery, status: 'pending', canRetry: false, expiresAt: new Date(Date.now() + 900000).toISOString(), serverTime: new Date().toISOString(), attempt: { id: randomUUID(), providerId: 'MOCK-REFERENCE', method: input.method, status: 'pending', initializationStatus: 'ready' } };
      record.attempt.instructions = input.method === 'mmqr' ? { qrImage: 'data:image/png;base64,AA==' } : { pwaPath: '/pages/checkout?step=pwa' };
      if (loseCreateResponse) { loseCreateResponse = false; throw new TypeError('connection lost'); }
    } else if (input.operation === 'status') {
      if (!record) return Response.json({ mock: true, error: 'not_found' }, { status: 404 });
    } else if (input.operation === 'simulate' || input.operation === 'cancel') {
      record.status = input.operation === 'cancel' ? 'cancelled' : input.outcome === 'delayed' ? 'pending' : input.outcome;
      record.attempt.status = record.status;
      record.canRetry = ['failed', 'cancelled'].includes(record.status);
    }
    return Response.json(record);
  };
  window.fetch = fetch;
  window.eval(fs.readFileSync(path.join(themePath, 'assets/custom-checkout.js'), 'utf8'));
  const $ = selector => window.document.querySelector(selector);
  const click = selector => $(selector).click();
  async function details() {
    await until(() => !$('[data-details]').hidden);
    const values = { name: 'Demo Person', email: 'demo@example.test', phone: '+95912345678', address: 'Demo Street', city: 'Yangon', country: 'Myanmar' };
    for (const [key, value] of Object.entries(values)) $(`[name="${key}"]`).value = value;
    assert.equal($('[data-details]').checkValidity(), true);
    $('[data-details]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => !$('[data-review]').hidden && !$('[data-action="create"]').disabled);
  }
  return { dom, window, $, click, details, intervals, calls: () => calls, creates: () => creates, record: () => record, setRecord: value => { record = value; }, translations };
}
for (const method of ['kbzpay', 'mmqr']) {
  test(`DOM journey: ${method} details, review, pending and receipt`, { skip: !hasTheme }, async () => {
    const h = storefront();
    try {
      await h.details();
      h.$(`[name="mock_method"][value="${method}"]`).checked = true;
      h.click('[data-action="create"]');
      await until(() => !h.$('[data-payment]').hidden && !h.$('[data-action="check"]').disabled);
      assert.equal(h.creates(), 1);
      const stored = h.window.sessionStorage.getItem('coco:mock-checkout:v1');
      assert.equal(stored.includes('demo@example.test'), false); assert.equal(stored.includes('Demo Street'), false);
      if (method === 'kbzpay') {
        h.click('[data-action="pwa"]');
        assert.equal(h.$('[data-pwa-hosted]').hidden, false);
        assert.match(h.window.location.search, /step=pwa/);
        h.click('[data-pwa-hosted] [data-outcome="succeeded"]');
      } else {
        assert.equal(h.$('[data-mmqr]').hidden, false);
        assert.match(h.$('[data-qr-image]').src, /^data:image\/png;base64,/);
        h.click('[data-demo] [data-outcome="succeeded"]');
      }
      await until(() => !h.$('[data-result]').hidden && !h.$('[data-action="restart"]').disabled);
      assert.equal(h.$('[data-result-title]').textContent, h.translations.succeeded);
      assert.equal(h.$('[data-receipt]').hidden, false);
      assert.match(h.$('[data-receipt-delivery]').textContent, /Demo Street/);
      assert.equal(h.calls().some(call => /clear|order/.test(call.operation)), false);
    } finally { h.dom.window.close(); }
  });
}
test('DOM recovery: lost creation response resumes by idempotency key without another creation', { skip: !hasTheme }, async () => {
  const h = storefront({ loseCreateResponse: true });
  try {
    await h.details(); h.click('[data-action="create"]');
    await until(() => !h.$('[data-result]').hidden && !h.$('[data-action="create"]').disabled);
    assert.equal(h.$('[data-action="restart"]').hidden, true);
    assert.ok(JSON.parse(h.window.sessionStorage.getItem('coco:mock-checkout:v1')).pendingKey);
    h.intervals.find(timer => timer.delay === 3000).callback();
    await until(() => !h.$('[data-payment]').hidden);
    assert.equal(h.creates(), 1);
    assert.equal(h.calls().at(-1).operation, 'status');
    assert.ok(h.calls().at(-1).idempotencyKey);
  } finally { h.dom.window.close(); }
});
test('DOM retry and expiry show the correct recovery actions', { skip: !hasTheme }, async () => {
  const h = storefront();
  try {
    await h.details(); h.click('[data-action="create"]');
    await until(() => !h.$('[data-payment]').hidden && !h.$('[data-action="create"]').disabled);
    h.click('[data-outcome="failed"]');
    await until(() => !h.$('[data-result]').hidden && !h.$('[data-action="retry"]').disabled);
    assert.equal(h.$('[data-action="retry"]').hidden, false);
    h.click('[data-action="retry"]');
    await until(() => !h.$('[data-payment]').hidden && !h.$('[data-action="retry"]').disabled);
    assert.equal(h.creates(), 2);
    h.click('[data-outcome="expired"]');
    await until(() => !h.$('[data-result]').hidden && !h.$('[data-action="restart"]').disabled);
    assert.equal(h.$('[data-result-title]').textContent, h.translations.expired);
    assert.equal(h.$('[data-action="retry"]').hidden, true);
  } finally { h.dom.window.close(); }
});
test('DOM empty cart, disabled feature and required fields are explicit', { skip: !hasTheme }, async () => {
  const empty = storefront({ empty: true }), disabled = storefront({ disabled: true }), form = storefront();
  try {
    await until(() => !empty.$('[data-empty]').hidden);
    assert.equal(empty.$('[data-layout]').hidden, true);
    assert.equal(disabled.$('[data-status]').textContent, disabled.translations.disabled);
    assert.equal(disabled.calls().length, 0);
    await until(() => !form.$('[data-details]').hidden);
    assert.equal(form.$('[data-details]').checkValidity(), false);
  } finally { empty.dom.window.close(); disabled.dom.window.close(); form.dom.window.close(); }
});

test('DOM reload restores the saved attempt and original deadline without creation', { skip: !hasTheme }, async () => {
  const first = storefront(); let restored;
  try {
    await first.details(); first.click('[data-action="create"]');
    await until(() => !first.$('[data-payment]').hidden && !first.$('[data-action="create"]').disabled);
    restored = storefront({ storage: first.window.sessionStorage.getItem('coco:mock-checkout:v1'), resumedRecord: first.record() });
    await until(() => !restored.$('[data-payment]').hidden);
    assert.equal(restored.creates(), 0);
    assert.equal(restored.record().attempt.id, first.record().attempt.id);
    assert.equal(restored.record().expiresAt, first.record().expiresAt);
  } finally { first.dom.window.close(); restored?.dom.window.close(); }
});
test('DOM polling pauses in background, resumes on visibility and stops after success', { skip: !hasTheme }, async () => {
  const h = storefront();
  try {
    await h.details(); h.click('[data-action="create"]');
    await until(() => !h.$('[data-payment]').hidden && !h.$('[data-action="create"]').disabled);
    const before = h.calls().length;
    Object.defineProperty(h.window.document, 'hidden', { value: true, configurable: true });
    h.intervals.find(timer => timer.delay === 3000).callback(); await pause();
    assert.equal(h.calls().length, before);
    Object.defineProperty(h.window.document, 'hidden', { value: false, configurable: true });
    h.record().status = 'succeeded';
    h.window.document.dispatchEvent(new h.window.Event('visibilitychange'));
    await until(() => !h.$('[data-result]').hidden);
    const after = h.calls().length;
    h.intervals.find(timer => timer.delay === 3000).callback(); await pause();
    assert.equal(h.calls().length, after);
  } finally { h.dom.window.close(); }
});
test('DOM MMQR download exports a branded card with a non-payable warning', { skip: !hasTheme }, async () => {
  const h = storefront();
  try {
    await h.details(); h.$('[name="mock_method"][value="mmqr"]').checked = true; h.click('[data-action="create"]');
    await until(() => !h.$('[data-mmqr]').hidden && !h.$('[data-action="create"]').disabled);
    const labels = []; let downloaded;
    h.$('[data-qr-image]').decode = async () => {};
    h.window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {}, fillText: text => labels.push(text) });
    h.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
    h.window.HTMLAnchorElement.prototype.click = function () { downloaded = this.download; };
    h.click('[data-action="download"]');
    await until(() => Boolean(downloaded));
    assert.equal(downloaded, 'COCO-MOCK-TEST-DEMO-MMQR.png');
    assert.ok(labels.includes(h.translations.non_payable));
    assert.equal(h.calls().at(-1).operation, 'status');
  } finally { h.dom.window.close(); }
});
