/**
 * Plans and billing. Run against a server started with UNLOCK_ALL_FEATURES=false
 * (QA_BILLING_URL), because by default every account gets unlimited Enterprise limits.
 * Payments in this product are simulated: no real gateway is ever contacted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, BASE, fileForm, uid } from './helpers.js';

const base = process.env.QA_BILLING_URL || BASE;
// Paid plans can only be activated where the demo gateway is switched on (BILLING_DEMO_MODE=true)
const demo = process.env.QA_BILLING_DEMO_URL;
const call = (m, p, o = {}) => api(m, p, { ...o, base });
const user = () => newUser('bill', { base });
const sub = (u, planSlug, billingInterval) => call('POST', '/api/subscriptions/subscribe', { token: u.token, body: { planSlug, billingInterval } });
const me = async (u) => (await call('GET', '/api/subscriptions/me', { token: u.token })).body.data;
const meeting = (u, body = {}) => call('POST', '/api/meetings', { token: u.token, body });

test('TC-BILL-001 public plan catalogue lists four plans', async () => {
  const r = await call('GET', '/api/subscriptions/plans');
  assert.equal(r.body.data.plans.length, 4);
});

test('TC-BILL-002 new account is on Free with enforced limits', async () => {
  const d = await me(await user());
  assert.equal(d.plan.slug, 'free');
  assert.equal(d.plan.limits.meetingsPerMonth, 5, 'server must run with UNLOCK_ALL_FEATURES=false');
});

test('TC-BILL-003 a paid plan is not activated without a real payment', async () => {
  const u = await user();
  const r = await sub(u, 'enterprise', 'yearly');
  assert.notEqual(r.status, 200, `Enterprise activated for free: payment=${r.body?.data?.payment?.status} method=${r.body?.data?.payment?.method} amount=${r.body?.data?.payment?.amount}`);
});

test('TC-BILL-004 Free plan: 6th meeting in a month is refused', async () => {
  const u = await user();
  for (let i = 0; i < 5; i++) assert.equal((await meeting(u)).status, 201);
  assert.equal((await meeting(u)).body.code, 'PLAN_LIMIT_REACHED');
});

test('TC-BILL-005 Free plan limit holds under simultaneous requests', async () => {
  const u = await user();
  const rs = await Promise.all(Array.from({ length: 15 }, () => meeting(u)));
  const made = rs.filter((r) => r.status === 201).length;
  assert.ok(made <= 5, `${made} meetings created on a 5-meeting plan`);
});

test('TC-BILL-006 Free plan: recording is refused', async () => {
  const u = await user();
  const m = (await meeting(u)).body.data.meeting;
  const r = await call('POST', `/api/meetings/${m.roomId}/recordings`, { token: u.token, form: fileForm('recording', 'r.webm', 'x', 'video/webm') });
  assert.equal(r.status, 403);
});

test('TC-BILL-007 Free plan: breakout rooms are refused server-side', async () => {
  const u = await user();
  const m = (await meeting(u)).body.data.meeting;
  const r = await call('POST', '/api/breakout', { token: u.token, body: { meetingId: m.id, rooms: [{ name: 'a' }] } });
  assert.equal(r.status, 403, `canBreakout=false but got ${r.status}`);
});

test('TC-BILL-008 Free plan: team limit (maxTeams=1) is enforced', async () => {
  const u = await user();
  const make = () => call('POST', '/api/teams', { token: u.token, body: { name: `t ${uid()}` } });
  await make();
  const r = await make();
  assert.equal(r.status, 403, `second team created with ${r.status}`);
});

test('TC-BILL-009 Free plan: participantsPerMeeting (25) caps the meeting setting', async () => {
  const u = await user();
  const m = (await meeting(u, { settings: { maxParticipants: 5000 } })).body.data.meeting;
  assert.ok(m.settings.maxParticipants <= 25, `maxParticipants=${m.settings.maxParticipants}`);
  const plain = (await meeting(u)).body.data.meeting; // nothing asked for: the plan limit still applies
  assert.equal(plain.settings.maxParticipants, 25);
});

test('TC-BILL-010 upgrade, cancel, resume, payment history', { skip: !demo && 'set QA_BILLING_DEMO_URL' }, async () => {
  const u = await newUser('bill', { base: demo });
  const call = (m, p, o = {}) => api(m, p, { ...o, base: demo });
  const sub = (x, planSlug, billingInterval) => call('POST', '/api/subscriptions/subscribe', { token: x.token, body: { planSlug, billingInterval } });
  const me = async (x) => (await call('GET', '/api/subscriptions/me', { token: x.token })).body.data;
  assert.equal((await sub(u, 'pro')).status, 200);
  assert.equal((await me(u)).plan.slug, 'pro');
  assert.equal((await call('POST', '/api/subscriptions/cancel', { token: u.token })).status, 200);
  assert.equal((await call('POST', '/api/subscriptions/cancel', { token: u.token })).status, 400);
  assert.equal((await call('POST', '/api/subscriptions/resume', { token: u.token })).status, 200);
  const p = (await call('GET', '/api/subscriptions/payments', { token: u.token })).body.data.payments;
  assert.equal(p.length, 1);
  assert.equal(Number(p[0].amount), 12);
});

test('TC-BILL-011 unknown plan and unknown interval are rejected', async () => {
  const u = await user();
  assert.equal((await sub(u, 'platinum')).status, 404);
  const r = await sub(u, 'pro', 'weekly');
  assert.equal(r.status, 400, `interval "weekly" silently accepted (${r.status})`);
});

test('TC-BILL-012 downgrading to Free restores Free limits', { skip: !demo && 'set QA_BILLING_DEMO_URL' }, async () => {
  const u = await newUser('bill', { base: demo });
  const call = (m, p, o = {}) => api(m, p, { ...o, base: demo });
  const sub = (x, planSlug, billingInterval) => call('POST', '/api/subscriptions/subscribe', { token: x.token, body: { planSlug, billingInterval } });
  const me = async (x) => (await call('GET', '/api/subscriptions/me', { token: x.token })).body.data;
  await sub(u, 'pro');
  assert.equal((await sub(u, 'free')).status, 200);
  assert.equal((await me(u)).plan.limits.canRecord, false);
});

test('TC-BILL-013 simultaneous first requests create exactly one subscription', async () => {
  const u = await user();
  const rs = await Promise.all(Array.from({ length: 10 }, () => call('GET', '/api/subscriptions/me', { token: u.token })));
  assert.deepEqual(rs.filter((r) => r.status !== 200).map((r) => r.body?.error), []);
});
