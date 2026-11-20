import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET ||= 'x';
process.env.TRANSLATE_PROVIDER = 'libretranslate';
process.env.LIBRETRANSLATE_URL = 'http://libre.test';
process.env.TRANSLATE_CONCURRENCY = '1';
process.env.TRANSLATE_MAX_QUEUE = '2';
const { translate, libreCode, _reset, providerStatus } = await import('../src/services/translator.js');

const realFetch = globalThis.fetch;
let calls = 0, delay = 0, fail = false;
const install = () => { globalThis.fetch = async (url, opts) => {
  calls++; await new Promise((r) => setTimeout(r, delay));
  if (fail) return { ok: false, status: 500, json: async () => ({}) };
  const body = JSON.parse(opts.body);
  return { ok: true, json: async () => ({ translatedText: `[${body.target}] ${body.q}` }) };
}; };
test.beforeEach(() => { _reset(); calls = 0; delay = 0; fail = false; install(); });
test.after(() => { globalThis.fetch = realFetch; });

test('maps language names to codes', () => {
  assert.equal(libreCode('Chinese (Simplified)'), 'zh');
  assert.equal(libreCode('Hindi'), 'hi');
});

test('caches repeated lines', async () => {
  assert.equal(await translate('hello', 'Hindi'), '[hi] hello');
  await translate('hello', 'Hindi');
  assert.equal(calls, 1);
});

test('identical in-flight requests share one provider call', async () => {
  delay = 30;
  const r = await Promise.all([1, 2, 3, 4].map(() => translate('same line', 'Spanish')));
  assert.deepEqual(new Set(r).size, 1);
  assert.equal(calls, 1);
});

test('sheds load beyond the queue limit instead of piling up', async () => {
  delay = 40;
  const results = await Promise.allSettled(['a', 'b', 'c', 'd', 'e'].map((t) => translate(t, 'French')));
  assert.ok(results.some((x) => x.status === 'rejected' && x.reason.status === 429));
  assert.ok(results.filter((x) => x.status === 'fulfilled').length >= 3);
});

test('provider failure rejects and a retry is not poisoned by the failure', async () => {
  fail = true;
  await assert.rejects(() => translate('x y', 'German'));
  fail = false;
  assert.equal(await translate('x y', 'German'), '[de] x y');
});

test('status reports the configured provider', async () => {
  assert.deepEqual(await providerStatus(), { available: true, provider: 'libretranslate' });
});
