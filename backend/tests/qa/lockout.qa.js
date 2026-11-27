/**
 * Guessing at somebody's password must not lock the owner out. Addresses are simulated with X-Forwarded-For, which
 * the server trusts from this machine only. Run against a disposable server (QA_BASE_URL) in production mode.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, uid, PASSWORD, newMeeting } from './helpers.js';

const from = (n, extra = {}) => ({ 'X-Forwarded-For': `203.0.113.${n}`, ...extra });
const login = (email, password, headers) => api('POST', '/api/auth/login', { headers, body: { email, password } });
const attack = async (email, sources) => { for (const n of sources) for (let i = 0; i < 10; i++) await login(email, 'wrong-password', from(n)); };

test('TC-LOCK-001 a phone that has signed in before still gets in while strangers are locked out', async () => {
  const u = await newUser('lock');
  const first = await login(u.email, PASSWORD, from(1));
  const mark = first.body.data.deviceToken;
  assert.ok(mark);
  await attack(u.email, [11, 12, 13]);
  assert.equal((await login(u.email, PASSWORD, from(2))).status, 429, 'an unknown device is refused during the attack');
  assert.equal((await login(u.email, PASSWORD, from(11, { 'X-Device-Token': mark }))).status, 200, 'the known device is not');
  assert.equal((await login(u.email, PASSWORD, from(2, { 'X-Device-Token': `${mark}x` }))).status, 429, 'a forged mark counts for nothing');
});

test('TC-LOCK-002 the web app gets the mark as a protected cookie', async () => {
  const u = await newUser('lockweb');
  const r = await login(u.email, PASSWORD, from(3, { 'X-Client': 'web' }));
  assert.equal(r.body.data.deviceToken, undefined);
  const set = r.headers.getSetCookie().find((c) => c.startsWith('mc_device='));
  for (const part of ['HttpOnly', 'SameSite=Strict']) assert.match(set, new RegExp(part));
  await attack(u.email, [21, 22, 23]);
  assert.equal((await login(u.email, PASSWORD, from(3, { 'X-Client': 'web', Cookie: set.split(';')[0] }))).status, 200);
});

test('TC-LOCK-003 the mark only affects throttling: it opens nothing, and not another account', async () => {
  const a = await newUser('marka'); const b = await newUser('markb');
  const mark = (await login(a.email, PASSWORD, from(4))).body.data.deviceToken;
  assert.equal((await api('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${mark}` } })).status, 401);
  await attack(b.email, [31, 32, 33]);
  assert.equal((await login(b.email, PASSWORD, from(5, { 'X-Device-Token': mark }))).status, 429);
});

test('TC-LOCK-004 a known device has its own limit too', async () => {
  const u = await newUser('markc');
  const mark = (await login(u.email, PASSWORD, from(6))).body.data.deviceToken;
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await login(u.email, 'wrong-password', from(40 + i, { 'X-Device-Token': mark }))).status);
  assert.deepEqual([statuses.slice(0, 10).every((s) => s === 401), statuses.slice(10)], [true, [429, 429]]);
});

test('TC-LOCK-005 a reply must belong to the conversation it is sent in', async () => {
  const a = await newUser('ra'); const b = await newUser('rb');
  const c = (await api('POST', '/api/conversations', { token: a.token, body: { type: 'direct', userId: b.id } })).body.data.conversation.id;
  const sent = (await api('POST', `/api/conversations/${c}/messages`, { token: a.token, body: { content: 'one' } })).body.data.message;
  assert.equal((await api('POST', `/api/conversations/${c}/messages`, { token: b.token, body: { content: 'two', replyToId: sent.id } })).status, 201);
  assert.equal((await api('POST', `/api/conversations/${c}/messages`, { token: b.token, body: { content: 'x', replyToId: uid() } })).status, 400);
});
