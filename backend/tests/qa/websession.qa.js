/**
 * The web app's session: an HttpOnly cookie that only counts with the X-Client header, and one-minute socket tickets.
 * Run against a disposable server (QA_BASE_URL).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, socket, closeSockets, sleep, fileForm, ADMIN, PASSWORD } from './helpers.js';

test.after(closeSockets);
const WEB = { 'X-Client': 'web' };
const cookiesOf = (r) => r.headers.getSetCookie();
const cookie = (r, name) => cookiesOf(r).find((c) => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`));
const pair = (c) => c.split(';')[0];
const me = (headers) => api('GET', '/api/auth/me', { headers });
const signIn = async () => {
  const user = await newUser('web');
  const r = await api('POST', '/api/auth/login', { headers: WEB, body: { email: user.email, password: PASSWORD } });
  assert.equal(r.status, 200);
  const jar = pair(cookie(r, 'mc_session'));
  return { user, response: r, jar, headers: { ...WEB, Cookie: jar } };
};
const ticketFor = async (headers) => (await api('GET', '/api/auth/socket-ticket', { headers })).body?.data?.ticket;
const connects = (token) => socket({ token }).then((s) => s, () => null);

test('TC-WEBS-001 a web sign-in gets a protected cookie and never sees the token', async () => {
  const { response } = await signIn();
  assert.equal(response.body.data.token, undefined);
  const set = cookie(response, 'mc_session');
  for (const part of ['HttpOnly', 'SameSite=Strict', 'Path=/api']) assert.match(set, new RegExp(part));
  const signup = await api('POST', '/api/auth/signup', { headers: WEB, body: { name: 'Web', email: `w.${Date.now()}@example.test`, password: PASSWORD } });
  assert.equal(signup.body.data.token, undefined);
  assert.ok(cookie(signup, 'mc_session'));
});

test('TC-WEBS-002 other clients still receive a token and get no session cookie', async () => {
  const user = await newUser('app');
  const r = await api('POST', '/api/auth/login', { body: { email: user.email, password: PASSWORD } });
  assert.ok(r.body.data.token);
  assert.equal(cookie(r, 'mc_session'), undefined);
});

test('TC-WEBS-003 the cookie alone is not enough: forged cross-site requests have no X-Client header', async () => {
  const { jar, headers } = await signIn();
  assert.equal((await me(headers)).status, 200);
  assert.equal((await me({ Cookie: jar })).status, 401);
  assert.equal((await api('POST', '/api/teams', { headers: { Cookie: jar }, body: { name: 'Forged' } })).status, 401);
  const preflight = await api('OPTIONS', '/api/teams', { headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-client' } });
  assert.notEqual(preflight.headers.get('access-control-allow-origin'), 'https://evil.example');
});

test('TC-WEBS-004 a socket opens with a ticket; the ticket is good for nothing else', async () => {
  const { jar, headers } = await signIn();
  const ticket = await ticketFor(headers);
  assert.ok(await connects(ticket), 'ticket opens a socket');
  assert.equal((await me({ Authorization: `Bearer ${ticket}` })).status, 401, 'not a session');
  assert.equal((await me({ ...WEB, Cookie: `mc_session=${ticket}` })).status, 401, 'not a session cookie either');
  assert.notEqual((await api('GET', '/uploads/files/x/y.txt', { headers: { Authorization: `Bearer ${ticket}` } })).status, 200);
  assert.equal(await connects(''), null);
  assert.equal(await connects(jar), null, 'the cookie pair is not a credential');
});

test('TC-WEBS-005 signing out ends the cookie session, its sockets and its tickets, and clears the cookie', async () => {
  const { headers } = await signIn();
  const unused = await ticketFor(headers);
  const live = await connects(await ticketFor(headers));
  const out = await api('POST', '/api/auth/logout', { headers });
  assert.equal(out.status, 200);
  assert.ok(cookiesOf(out).some((c) => c.startsWith('mc_session=;') && /Max-Age=0/.test(c)));
  assert.equal((await me(headers)).status, 401);
  assert.equal(await connects(unused), null, 'a ticket fetched earlier is void');
  for (let i = 0; i < 40 && live.connected; i++) await sleep(50);
  assert.equal(live.connected, false);
});

test('TC-WEBS-006 uploads and their downloads work with cookies only', async () => {
  const { headers } = await signIn();
  const up = await api('POST', '/api/files/upload', { headers, form: fileForm('file', 'c.txt', 'cookie-bytes', 'text/plain') });
  assert.equal(up.status, 201);
  const asset = pair(cookie(up, 'mc_assets') || cookie(await me(headers), 'mc_assets'));
  assert.equal((await api('GET', up.body.data.file.url, { headers: { Cookie: asset } })).text, 'cookie-bytes');
});

test('TC-WEBS-007 the administrator session is its own cookie, and sign-out ends it', async () => {
  const r = await api('POST', '/api/admin/auth/login', { headers: WEB, body: ADMIN });
  assert.equal(r.body.data.token, undefined);
  const set = cookie(r, 'mc_admin');
  for (const part of ['HttpOnly', 'SameSite=Strict', 'Path=/api/admin']) assert.match(set, new RegExp(part));
  const headers = { ...WEB, Cookie: pair(set) };
  assert.equal((await api('GET', '/api/admin/auth/me', { headers })).status, 200);
  assert.equal((await api('GET', '/api/admin/auth/me', { headers: { Cookie: pair(set) } })).status, 401);
  assert.equal((await me(headers)).status, 401, 'an admin cookie is not a user session');
  assert.equal((await api('POST', '/api/admin/auth/logout', { headers })).status, 200);
  assert.equal((await api('GET', '/api/admin/auth/me', { headers })).status, 401);
});
