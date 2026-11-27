import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, adminToken, uid, PASSWORD, sleep, socket, closeSockets } from './helpers.js';

test.after(closeSockets);
const signup = (body) => api('POST', '/api/auth/signup', { body });
const login = (email, password) => api('POST', '/api/auth/login', { body: { email, password } });

test('TC-AUTH-001 signup returns a session and never returns the password hash', async () => {
  const email = `a.${uid()}@example.test`;
  const r = await signup({ name: 'Auth One', email, password: PASSWORD });
  assert.equal(r.status, 201);
  assert.ok(r.body.data.token);
  assert.ok(!('password' in r.body.data.user));
  assert.ok(!r.text.includes('$2a$') && !r.text.includes('$2b$'));
});

test('TC-AUTH-002 signup with missing fields is rejected with 400', async () => {
  for (const body of [{}, { email: 'x@example.test' }, { name: 'xx', password: PASSWORD }]) {
    assert.equal((await signup(body)).status, 400, JSON.stringify(body));
  }
});

test('TC-AUTH-003 duplicate email (any case) is rejected', async () => {
  const u = await newUser('dup');
  const r = await signup({ name: 'Again', email: u.email.toUpperCase(), password: PASSWORD });
  assert.equal(r.status, 400);
});

test('TC-AUTH-004 invalid email format is a client error (4xx), not a server error', async () => {
  const r = await signup({ name: 'Bad Email', email: `not-an-email-${uid()}`, password: PASSWORD });
  assert.ok(r.status >= 400 && r.status < 500, `got ${r.status} ${r.text}`);
});

test('TC-AUTH-005 non-string email is a client error (4xx), not a server error', async () => {
  const r = await signup({ name: 'Obj Email', email: { a: 1 }, password: PASSWORD });
  assert.ok(r.status >= 400 && r.status < 500, `got ${r.status} ${r.text}`);
});

test('TC-AUTH-006 signup enforces the same minimum password length as change-password (6)', async () => {
  const r = await signup({ name: 'Weak Pw', email: `w.${uid()}@example.test`, password: '1' });
  assert.equal(r.status, 400, `a 1-character password was accepted (${r.status})`);
});

test('TC-AUTH-007 signup cannot set privileged fields (mass assignment)', async () => {
  const r = await signup({ name: 'Mass', email: `m.${uid()}@example.test`, password: PASSWORD, role: 'superadmin', roleId: 'x', isActive: false });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.user.role, 'user');
  assert.notEqual(r.body.data.user.isActive, false);
});

test('TC-AUTH-008 login: correct, wrong password, unknown account', async () => {
  const u = await newUser('login');
  assert.equal((await login(u.email, PASSWORD)).status, 200);
  const wrong = await login(u.email, 'nope-nope');
  const unknown = await login(`ghost.${uid()}@example.test`, 'nope-nope');
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.message, unknown.body.message, 'messages must not reveal which accounts exist');
});

test('TC-AUTH-009 protected route rejects missing, garbage and forged tokens', async () => {
  assert.equal((await api('GET', '/api/auth/me')).status, 401);
  assert.equal((await api('GET', '/api/auth/me', { token: 'garbage' })).status, 401);
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"id":"x"}').toString('base64url')}.`;
  assert.equal((await api('GET', '/api/auth/me', { token: none })).status, 401);
});

test('TC-AUTH-010 logout revokes the REST session', async () => {
  const u = await newUser('logout');
  assert.equal((await api('POST', '/api/auth/logout', { token: u.token })).status, 200);
  assert.equal((await api('GET', '/api/auth/me', { token: u.token })).status, 401);
});

test('TC-AUTH-011 logout also ends already-open realtime connections', async () => {
  const u = await newUser('logoutsock');
  const s = await socket(u);
  await api('POST', '/api/auth/logout', { token: u.token });
  await sleep(1000);
  assert.equal(s.connected, false, 'socket stayed connected after logout');
});

test('TC-AUTH-012 suspending a user blocks REST immediately', async () => {
  const admin = await adminToken();
  const u = await newUser('suspend');
  assert.equal((await api('PUT', `/api/admin/users/${u.id}/status`, { token: admin, body: { isActive: false } })).status, 200);
  assert.equal((await api('GET', '/api/auth/me', { token: u.token })).status, 403);
  assert.equal((await login(u.email, PASSWORD)).status, 403);
});

test('TC-AUTH-013 suspending a user disconnects their open realtime connection', async () => {
  const admin = await adminToken();
  const u = await newUser('suspendsock');
  const s = await socket(u);
  await api('PUT', `/api/admin/users/${u.id}/status`, { token: admin, body: { isActive: false } });
  await sleep(1000);
  assert.equal(s.connected, false, 'suspended user kept a live socket');
});

test('TC-AUTH-014 a password reset (forgot password) flow exists', async () => {
  const found = [];
  for (const p of ['/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/password/forgot']) {
    const r = await api('POST', p, { body: { email: 'x@example.test' } });
    if (r.status !== 404) found.push(p);
  }
  assert.ok(found.length, 'no forgot/reset password endpoint: locked-out users cannot recover');
});

test('TC-AUTH-015 repeated wrong passwords on one account are throttled', async () => {
  // Needs a server started with a realistic limit to be meaningful for IP limits; this probes PER-ACCOUNT lockout.
  const u = await newUser('brute');
  let throttled = false;
  for (let i = 0; i < 25 && !throttled; i++) throttled = (await login(u.email, `wrong-${i}`)).status === 429;
  assert.ok(throttled, '25 consecutive wrong passwords were all processed');
});

test('TC-AUTH-016 change password requires the current password', async () => {
  const u = await newUser('chpw');
  const r = await api('POST', '/api/auth/change-password', { token: u.token, body: { currentPassword: 'wrong', newPassword: 'another-pass-1', code: '000000' } });
  assert.equal(r.status, 400);
});

test('TC-AUTH-017 profile update ignores privileged fields and persists allowed ones', async () => {
  const u = await newUser('profile');
  await api('PUT', '/api/auth/profile', { token: u.token, body: { title: 'Engineer', role: 'superadmin', email: 'evil@example.test', isActive: false } });
  const me = (await api('GET', '/api/auth/me', { token: u.token })).body.data.user;
  assert.equal(me.title, 'Engineer');
  assert.equal(me.role, 'user');
  assert.equal(me.email, u.email);
});

test('TC-AUTH-018 too-short name on profile update is reported, not silently ignored', async () => {
  const u = await newUser('shortname');
  const r = await api('PUT', '/api/auth/profile', { token: u.token, body: { name: 'x' } });
  assert.equal(r.status, 400, `server said ${r.status} "${r.body?.message}" but did not save the name`);
});

test('TC-AUTH-019 custom status with an invalid date is rejected cleanly', async () => {
  const u = await newUser('status');
  const r = await api('PUT', '/api/auth/status', { token: u.token, body: { customStatus: 'hi', statusExpiresAt: 'not-a-date' } });
  assert.ok(r.status < 500, `got ${r.status} ${r.text}`);
});

test('TC-AUTH-020 concurrent signups with one email create one account and no 500', async () => {
  const body = { name: 'Race', email: `race.${uid()}@example.test`, password: PASSWORD };
  const rs = await Promise.all(Array.from({ length: 6 }, () => signup(body)));
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  assert.deepEqual(rs.filter((r) => r.status >= 500).map((r) => r.body?.error), []);
});
