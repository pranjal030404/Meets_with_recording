import test from 'node:test';
import assert from 'node:assert/strict';
import { issueCode, consumeCode } from '../src/services/otpService.js';

test('a code works exactly once and cannot be re-requested within a minute', async () => {
  const code = await issueCode('t1');
  assert.match(code, /^\d{6}$/);
  assert.equal(await issueCode('t1'), null);
  assert.equal(await consumeCode('t1', code), true);
  assert.equal(await consumeCode('t1', code), false);
});

test('five wrong guesses kill the code', async () => {
  const code = await issueCode('t2');
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal(await consumeCode('t2', wrong), false);
  assert.equal(await consumeCode('t2', code), false);
});
