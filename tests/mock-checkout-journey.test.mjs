import assert from 'node:assert/strict';
import { webcrypto, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
const themePath = process.env.COCO_THEME_PATH || path.resolve('../../coco-original');
const themeRequire = createRequire(path.join(themePath, 'package.json'));
const QRCode = themeRequire('qrcode');
const hasTheme = fs.existsSync(path.join(themePath, 'snippets/custom-checkout.liquid'));
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(check) { for (let n = 0; n < 100; n++) { if (check()) return; await pause(); } assert.fail('Journey did not reach the expected state'); }
const snapshot = { items: [{ title: 'COCO Tee / M', quantity: 2, total: '20000.00' }], amount: '20000.00', currency: 'MMK', shipping: '0.00', tax: '0.00' };
function storefront({ empty = false, loseCreateResponse = false, storage, resumedRecord = null, disabled = false, sample = false, quoteFailure = false, qrRenderer } = {}) {
  const raw = fs.readFileSync(path.join(themePath, 'locales/en.default.json'), 'utf8');
  const translations = ts.parseConfigFileTextToJson('en.default.json', raw).config.mock_checkout;
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  let markup = fs.readFileSync(path.join(themePath, 'snippets/custom-checkout.liquid'), 'utf8');
  markup = markup.replace(/{% doc %}[\s\S]*?{% enddoc %}/g, '').replace(/{{\s*'mock_checkout\.([^']+)'\s*\|\s*t\s*\|\s*json\s*}}/g, (_, key) => JSON.stringify(translations[key]));
  markup = markup.replace(/{{\s*'mock_checkout\.([^']+)'\s*\|\s*t\s*}}/g, (_, key) => escape(translations[key]));
  markup = markup.replace(/{{\s*settings.mock_checkout_enabled\s*}}/g, disabled ? 'false' : 'true').replace(/{{\s*routes\.[^}]+}}/g, '/').replace(/{{[^}]+}}/g, '');
  const dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`, { url: sample ? 'http://127.0.0.1:9292/pages/checkout?view=checkout' : 'https://coco.test/pages/checkout', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  Object.defineProperty(window, 'crypto', { value: webcrypto });
  window.AbortSignal.timeout = () => new window.AbortController().signal;
  if (storage) window.sessionStorage.setItem('coco:mock-checkout:v1', storage);
  const intervals = [];
  window.setInterval = (callback, delay) => { intervals.push({ callback, delay }); return intervals.length; };
  window.clearInterval = () => {};
  let record = resumedRecord, creates = 0, calls = [], qrCalls = [];
  window.CocoCheckoutQR = { toDataURL: (payload, options) => { qrCalls.push({ payload, options: structuredClone(options) }); return qrRenderer ? qrRenderer(payload, options) : QRCode.toDataURL(payload, options); } };
  window.HTMLImageElement.prototype.decode = async () => {};
  const fetch = async (url, options = {}) => {
    if (String(url).endsWith('cart.js')) { assert.equal(sample, false, 'Sample must never read Shopify cart'); return Response.json({ items: empty ? [] : [{ variant_id: 123, product_title: 'COCO Tee', variant_title: 'M', quantity: 2, original_line_price: 2000000 }], original_total_price: 2000000, currency: 'MMK' }); }
    assert.equal(String(url), '/apps/proxy/mock-checkout');
    const input = JSON.parse(options.body); calls.push(input);
    assert.match(input.capability, /^[a-f0-9]{64}$/);
    if (input.operation === 'quote' && quoteFailure) { quoteFailure = false; return Response.json({ mock: true, error: 'service_unavailable' }, { status: 503 }); }
    if (input.operation === 'quote') return Response.json({ mock: true, quoteId: randomUUID(), snapshot, expiresAt: new Date(Date.now() + 300000).toISOString() });
    if (input.operation === 'create' || input.operation === 'retry') {
      creates++;
      record = { mock: true, checkoutId: record?.checkoutId || randomUUID(), reference: 'COCO-MOCK-TEST', snapshot, delivery: input.delivery || record.delivery, status: 'pending', canRetry: false, expiresAt: new Date(Date.now() + 900000).toISOString(), serverTime: new Date().toISOString(), attempt: { id: randomUUID(), providerId: 'MOCK-REFERENCE', method: input.method, status: 'pending', initializationStatus: 'ready' } };
      record.attempt.instructions = input.method === 'mmqr' ? { qrPayload: `COCO-SAMPLE-MMQR:NOT-PAYABLE:${record.attempt.id}` } : { pwaUrl: 'https://www.kbzpay.com/en' };
      if (loseCreateResponse) { loseCreateResponse = false; throw new TypeError('connection lost'); }
    } else if (input.operation === 'status') {
      if (!record) return Response.json({ mock: true, error: 'not_found' }, { status: 404 });
    } else if (input.operation === 'cancel') {
      record.status = 'cancelled';
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
  return { dom, window, $, click, details, intervals, calls: () => calls, creates: () => creates, record: () => record, setRecord: value => { record = value; }, translations, qrCalls };
}
for (const method of ['kbzpay', 'mmqr']) {
  test(`DOM ${method}: sample instructions, status, cancellation and storage privacy`, { skip: !hasTheme }, async () => {
    const h = storefront();
    try {
      await h.details(); h.$(`[name="mock_method"][value="${method}"]`).checked = true;
      h.click('[data-action="create"]');
      await until(() => !h.$('[data-payment]').hidden && !h.$('[data-action="check"]').disabled);
      assert.equal(h.creates(), 1);
      const stored = h.window.sessionStorage.getItem('coco:mock-checkout:v1');
      assert.equal(stored.includes('demo@example.test'), false); assert.equal(stored.includes('Demo Street'), false);
      assert.equal(h.$('[data-demo]'), null); assert.equal(h.$('[data-pwa-hosted]'), null);
      if (method === 'kbzpay') assert.equal(h.$('[data-pwa-intro]').hidden, false);
      else {
        await until(() => !!h.$('[data-qr-image]').getAttribute('src'));
        assert.equal(h.qrCalls[0].payload, h.record().attempt.instructions.qrPayload);
        assert.equal(JSON.stringify(h.qrCalls[0].options), JSON.stringify({ type: 'image/png', width: 420, margin: 4, errorCorrectionLevel: 'M' }));
        h.click('[data-action="check"]'); await until(() => !h.$('[data-action="check"]').disabled);
        assert.equal(h.qrCalls.length, 1, 'polling reuses cached image');
      }
      h.click('[data-action="cancel"]');
      await until(() => !h.$('[data-result]').hidden && !h.$('[data-action="restart"]').disabled);
      assert.equal(h.$('[data-result-title]').textContent, h.translations.cancelled);
      assert.equal(h.$('[data-receipt]').hidden, true);
      assert.equal(h.calls().some(call => /simulate|clear|order/.test(call.operation)), false);
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
    h.click('[data-action="cancel"]');
    await until(() => !h.$('[data-result]').hidden && !h.$('[data-action="retry"]').disabled);
    assert.equal(h.$('[data-action="retry"]').hidden, false);
    h.click('[data-action="retry"]');
    await until(() => !h.$('[data-payment]').hidden && !h.$('[data-action="retry"]').disabled);
    assert.equal(h.creates(), 2);
    h.record().status = 'expired';
    h.click('[data-action="check"]');
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
test('DOM polling pauses in background, resumes on visibility and stops after expiry', { skip: !hasTheme }, async () => {
  const h = storefront();
  try {
    await h.details(); h.click('[data-action="create"]');
    await until(() => !h.$('[data-payment]').hidden && !h.$('[data-action="create"]').disabled);
    const before = h.calls().length;
    Object.defineProperty(h.window.document, 'hidden', { value: true, configurable: true });
    h.intervals.find(timer => timer.delay === 3000).callback(); await pause();
    assert.equal(h.calls().length, before);
    Object.defineProperty(h.window.document, 'hidden', { value: false, configurable: true });
    h.record().status = 'expired';
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
    await until(() => !!h.$('[data-qr-image]').getAttribute('src') && !h.$('[data-action="download"]').disabled);
    const labels = []; let downloaded;
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

for (const method of ['kbzpay', 'mmqr']) {
 test(`Connected sample ${method}: backend quote, payment and reload without inventory`, async () => {
  const h = storefront({ sample: true }); let restored;
  try {
   await until(() => !h.$('[data-details]').hidden);
   assert.equal(h.$('[name="email"]').value,'demo@example.com');
   assert.equal(h.calls()[0].source,'sample');
   await h.details(); h.$(`[name="mock_method"][value="${method}"]`).checked = true;
   h.click('[data-action="create"]');
   await until(() => !h.$('[data-payment]').hidden && !h.$('[data-action="check"]').disabled);
   assert.equal(h.creates(),1);
   restored = storefront({ sample: true, storage: h.window.sessionStorage.getItem('coco:mock-checkout:v1'), resumedRecord: h.record() });
   await until(() => !restored.$('[data-payment]').hidden);
   assert.equal(restored.calls()[0].operation,'status');
   assert.equal(restored.creates(),0);
   restored.click('[data-action="check"]');
   await until(() => !restored.$('[data-action="check"]').disabled);
   assert.equal(restored.record().status, 'pending');
   assert.equal(restored.calls().at(-1).operation, 'status');
  } finally { h.dom.window.close(); restored?.dom.window.close(); }
 });
}
test('Connected sample initialization failure offers retry without frontend fallback', async () => {
 const h=storefront({ sample: true, quoteFailure: true });
 try {
  await until(() => !h.$('[data-action="load"]').hidden);
  assert.equal(h.$('[data-details]').hidden,true);
  h.click('[data-action="load"]');
  await until(() => !h.$('[data-details]').hidden);
  assert.equal(h.calls().length,2);
 } finally { h.dom.window.close(); }
});

test('DOM QR failure is visible, disables download and recovers on check', async () => {
  let fail = true;
  const h = storefront({ qrRenderer: async () => { if (fail) throw new Error('canvas unavailable'); return 'data:image/png;base64,AA=='; } });
  try {
    await h.details(); h.$('[name="mock_method"][value="mmqr"]').checked = true; h.click('[data-action="create"]');
    await until(() => !h.$('[data-qr-error]').hidden);
    assert.equal(h.$('[data-qr-image]').hasAttribute('src'), false);
    assert.equal(h.$('[data-action="download"]').disabled, true);
    fail = false; h.click('[data-action="check"]');
    await until(() => !h.$('[data-qr-image]').hidden);
    assert.equal(h.$('[data-qr-error]').hidden, true);
    assert.equal(h.$('[data-action="download"]').disabled, false);
  } finally { h.dom.window.close(); }
});
test('DOM stale QR generation cannot replace a newer attempt image', async () => {
  const renders = [];
  const h = storefront({ qrRenderer: payload => new Promise(resolve => renders.push({ payload, resolve })) });
  try {
    await h.details(); h.$('[name="mock_method"][value="mmqr"]').checked = true; h.click('[data-action="create"]');
    await until(() => renders.length === 1 && !h.$('[data-action="cancel"]').disabled);
    h.click('[data-action="cancel"]'); await until(() => !h.$('[data-action="retry"]').disabled && !h.$('[data-result]').hidden);
    h.click('[data-action="retry"]'); await until(() => renders.length === 2);
    renders[1].resolve('data:image/png;base64,NEW=');
    await until(() => h.$('[data-qr-image]').src.includes('NEW='));
    renders[0].resolve('data:image/png;base64,OLD='); await pause();
    assert.equal(h.$('[data-qr-image]').src.includes('NEW='), true);
    assert.equal(h.$('[data-qr-image]').dataset.payload, renders[1].payload);
  } finally { h.dom.window.close(); }
});
for (const url of ['http://www.kbzpay.com/en', 'https://evil.test/en', 'https://www.kbzpay.com/other', 'https://www.kbzpay.com/en?return_to=evil', 'https://user:pass@www.kbzpay.com/en', 'javascript:alert(1)']) {
  test(`DOM rejects unsafe PWA URL ${url}`, async () => {
    const h = storefront();
    try {
      await h.details(); h.click('[data-action="create"]');
      await until(() => !h.$('[data-payment]').hidden && !h.$('[data-action="create"]').disabled);
      h.record().attempt.instructions.pwaUrl = url;
      h.click('[data-action="check"]'); await pause();
      h.click('[data-action="pwa"]');
      assert.equal(h.$('[data-error]').textContent, h.translations.service_unavailable);
      assert.equal(h.window.location.origin, 'https://coco.test');
    } finally { h.dom.window.close(); }
  });
}
