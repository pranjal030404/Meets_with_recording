/**
 * Headers, error handling, injection, path traversal, ops endpoints, admin authorisation.
 * QA_APP_DIR (the backend folder of the server under test) enables the filesystem checks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { api, newUser, newMeeting, adminToken, uid, fileForm, BASE } from './helpers.js';

const APP = process.env.QA_APP_DIR;

test('TC-SEC-001 baseline security headers are present on the web app', async () => {
  const r = await api('GET', '/');
  const missing = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security']
    .filter((h) => !r.headers.get(h));
  assert.deepEqual(missing, []);
});

test('TC-SEC-002 server does not advertise its framework', async () => {
  assert.equal((await api('GET', '/api/health')).headers.get('x-powered-by'), null);
});

test('TC-SEC-003 CORS does not allow an arbitrary origin', async () => {
  const r = await api('GET', '/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.notEqual(r.headers.get('access-control-allow-origin'), 'https://evil.example');
});

test('TC-SEC-004 readiness probe returns a JSON health result (production mode)', async () => {
  const r = await api('GET', '/readyz');
  assert.match(r.headers.get('content-type') || '', /json/, `got ${r.headers.get('content-type')}`);
  assert.ok(r.body?.checks?.database);
});

test('TC-SEC-005 liveness probe returns JSON', async () => {
  const r = await api('GET', '/healthz');
  assert.equal(r.body?.status, 'ok', `got ${r.text.slice(0, 60)}`);
});

test('TC-SEC-006 unknown API route is a JSON 404', async () => {
  const r = await api('GET', '/api/does-not-exist');
  assert.equal(r.status, 404);
  assert.ok(r.body, `body is not JSON: ${r.text.slice(0, 80)}`);
});

test('TC-SEC-007 malformed JSON does not leak a stack trace', async () => {
  const r = await api('POST', '/api/auth/login', { body: '{bad json' });
  assert.equal(r.status, 400);
  assert.ok(!/node_modules|at \w+ \(/.test(r.text), r.text.slice(0, 300));
});

test('TC-SEC-008 server errors do not expose internal error text', async () => {
  const u = await newUser('u');
  const r = await api('GET', '/api/meetings?limit=-1', { token: u.token });
  assert.ok(!r.body?.error, `internal detail returned: ${r.body?.error}`);
});

test('TC-SEC-009 SQL metacharacters in search are treated as data', async () => {
  const u = await newUser('u');
  for (const q of ["' OR 1=1 --", '"; DROP TABLE Users; --', "%' UNION SELECT password FROM Users --"]) {
    const r = await api('GET', `/api/search?q=${encodeURIComponent(q)}`, { token: u.token });
    assert.equal(r.status, 200, r.text);
    assert.ok(!/\$2[ab]\$/.test(r.text));
  }
  assert.equal((await api('GET', '/api/auth/me', { token: u.token })).status, 200);
});

test('TC-SEC-010 /uploads path traversal is refused', async () => {
  const u = await newUser('u');
  for (const p of ['/uploads/avatars/x/..%2F..%2F..%2F.env', '/uploads/avatars/x/%2e%2e/%2e%2e/%2e%2e/.env', '/uploads/files/' + u.id + '/..%2F..%2F..%2F.env']) {
    const r = await api('GET', p, { token: u.token });
    assert.ok(!r.text.includes('JWT_SECRET'), p);
  }
});

test('TC-SEC-011 recording upload cannot create files outside the temporary upload folder', { skip: !APP && 'set QA_APP_DIR' }, async () => {
  const u = await newUser('attacker'); // an ordinary account, in no meeting at all
  const marker = `qa-traversal-${uid()}`;
  const target = path.resolve(APP, marker); // <backend>/<marker>, well outside uploads/tmp/recordings
  const evil = encodeURIComponent(`../../../${marker}`);
  const r = await api('POST', `/api/meetings/${evil}/recordings`, { token: u.token, form: fileForm('recording', 'x.html', 'planted-by-qa', 'text/html') });
  const planted = fs.existsSync(target) ? fs.readdirSync(target) : [];
  fs.rmSync(target, { recursive: true, force: true }); // clean up the proof
  assert.deepEqual(planted, [], `HTTP ${r.status}, yet attacker file written to ${target}: ${planted}`);
});

test('TC-SEC-012 a refused recording upload leaves nothing on disk', { skip: !APP && 'set QA_APP_DIR' }, async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h);
  const r = await api('POST', `/api/meetings/${m.roomId}/recordings`, { token: o.token, form: fileForm('recording', 'x.webm', Buffer.alloc(1024 * 1024), 'video/webm') });
  assert.equal(r.status, 403);
  const dir = path.resolve(APP, 'uploads/tmp/recordings', m.roomId);
  const left = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  assert.deepEqual(left, [], 'temporary file kept after 403 (any account can fill the disk, 512 MB per request)');
});

test('TC-SEC-013 admin API rejects anonymous and ordinary user tokens', async () => {
  const u = await newUser('u');
  for (const p of ['/api/admin/users', '/api/admin/overview', '/api/admin/audit-logs', '/api/admin/admins', '/api/admin/settings']) {
    assert.equal((await api('GET', p)).status, 401, p);
    assert.equal((await api('GET', p, { token: u.token })).status, 401, p);
  }
  assert.equal((await api('GET', '/api/subscriptions/admin/all', { token: u.token })).status, 403);
});

test('TC-SEC-014 an admin token is not a user session', async () => {
  const t = await adminToken();
  assert.equal((await api('GET', '/api/auth/me', { token: t })).status, 401);
});

test('TC-SEC-015 a limited admin role cannot manage users, admins or settings', async () => {
  const su = await adminToken();
  const email = `viewer.${uid()}@example.test`;
  assert.equal((await api('POST', '/api/admin/admins', { token: su, body: { name: 'View Only', email, password: 'Viewer-pass-1' } })).status, 201);
  const v = (await api('POST', '/api/admin/auth/login', { body: { email, password: 'Viewer-pass-1' } })).body.data.token;
  assert.equal((await api('GET', '/api/admin/users', { token: v })).status, 200);
  assert.equal((await api('POST', '/api/admin/users', { token: v, body: { name: 'xx', email: `n.${uid()}@example.test`, password: 'abcdef1' } })).status, 403);
  assert.equal((await api('POST', '/api/admin/admins', { token: v, body: {} })).status, 403);
  assert.equal((await api('PUT', '/api/admin/settings', { token: v, body: { emailVerificationEnabled: false } })).status, 403);
});

test('TC-SEC-016 audit log records actions without passwords', async () => {
  const t = await adminToken();
  await api('POST', '/api/auth/login', { body: { email: 'nobody@example.test', password: 'S3cret-should-not-be-logged' } });
  await new Promise((r) => setTimeout(r, 500));
  const r = await api('GET', '/api/admin/audit-logs?limit=200', { token: t });
  assert.equal(r.status, 200);
  assert.ok(r.body.data.logs.length > 0);
  assert.ok(!r.text.includes('S3cret-should-not-be-logged'));
});

test('TC-SEC-017 AI endpoints validate input and require a session', async () => {
  const u = await newUser('u');
  assert.equal((await api('POST', '/api/ai/summarize', { body: { text: 'x'.repeat(60) } })).status, 401);
  assert.equal((await api('POST', '/api/ai/summarize', { token: u.token, body: { text: 'short' } })).status, 400);
  const bad = await api('POST', '/api/ai/summarize', { token: u.token, body: { text: 12345 } });
  assert.ok(bad.status < 500, `non-string text -> ${bad.status} ${bad.body?.error}`);
});

test('TC-SEC-018 TURN/STUN configuration requires a session', async () => {
  assert.equal((await api('GET', '/api/webrtc/ice-servers')).status, 401);
  const u = await newUser('u');
  const r = await api('GET', '/api/webrtc/ice-servers', { token: u.token });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /no-store/);
});

test('TC-SEC-019 the SPA is served for client routes', async () => {
  const r = await fetch(`${BASE}/meeting/abc`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /id="root"/);
});
