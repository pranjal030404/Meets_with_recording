/**
 * Two app servers sharing one database and Redis. QA_BASE_URL is node A, QA_NODE_B_URL node B.
 * Skipped when QA_NODE_B_URL is not set. The browser half (a call and its failover) is tests/e2e/two-node.mjs.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, newDm, sendDm, socket, adminToken, sleep, closeSockets, PASSWORD } from './helpers.js';

const B = process.env.QA_NODE_B_URL || '';
const skip = !B;
if (B && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(B)) throw new Error('Only a local second server may be used');
after(closeSockets);

test('TC-CL-001 a message sent through one node arrives on a socket connected to the other', { skip }, async () => {
  const a = await newUser('cla'); const b = await newUser('clb');
  const onB = await socket(b, B);
  const dm = await newDm(a, b);
  await sleep(300);
  await sendDm(a, dm, 'across nodes');
  await sleep(1000);
  assert.ok(onB.log.some((e) => JSON.stringify(e).includes('across nodes')));
});

test('TC-CL-002 signing out on one node ends that session on the other', { skip }, async () => {
  const a = await newUser('clout');
  const token = (await api('POST', '/api/auth/login', { body: { email: a.email, password: PASSWORD } })).body.data.token;
  const onB = await socket({ token }, B);
  await api('POST', '/api/auth/logout', { token });
  await sleep(1500);
  assert.equal(onB.connected, false);
  assert.equal((await api('GET', '/api/auth/me', { token, base: B })).status, 401);
});

test('TC-CL-003 a user suspended on one node is dropped by the other and cannot come back', { skip }, async () => {
  const u = await newUser('clsus');
  const onB = await socket(u, B); // node B now remembers this user as allowed
  const admin = await adminToken();
  assert.equal((await api('PUT', `/api/admin/users/${u.id}/status`, { token: admin, body: { isActive: false } })).status, 200);
  await sleep(1000);
  assert.equal(onB.connected, false);
  await assert.rejects(socket(u, B), 'node B let the suspended user reconnect');
});
