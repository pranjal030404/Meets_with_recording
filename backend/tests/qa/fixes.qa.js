/**
 * Behaviour added or tightened by the defect fixes: what must still work, not only what must be refused.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, newTeam, addMember, newMeeting, getMeeting, join, enter, socket, closeSockets, waitFor, got, sleep, uid, fileForm, adminToken, newDm, sendDm, PASSWORD } from './helpers.js';

test.after(closeSockets);
const at = (h) => new Date(Date.now() + h * 3600e3).toISOString();

test('TC-FIX-001 waiting room: admission records attendance and opens the chat', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, { settings: { waitingRoom: true } });
  const r = await join(g, m.roomId);
  assert.equal(r.body.data.waiting, true);
  assert.deepEqual(r.body.data.meeting.participants, []);
  assert.equal((await api('GET', `/api/chat/${m.roomId}/messages`, { token: g.token })).status, 403, 'not in yet');
  const hs = await enter(h, m.roomId); const gs = await enter(g, m.roomId);
  const knock = await waitFor(hs, 'room:waiting');
  hs.emit('host:admit-user', { roomId: m.roomId, targetSocketId: knock.socketId });
  assert.ok(await waitFor(gs, 'room:participants'));
  assert.ok((await getMeeting(h, m.roomId)).participantIds.includes(g.id));
  assert.equal((await api('GET', `/api/chat/${m.roomId}/messages`, { token: g.token })).status, 200);
});

test('TC-FIX-002 a removed participant can come back once the host lets them in', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); await join(g, m.roomId);
  const hs = await enter(h, m.roomId); const gs = await enter(g, m.roomId);
  hs.emit('host:remove-user', { roomId: m.roomId, targetSocketId: gs.id });
  assert.ok(await waitFor(gs, 'host:removed'));
  const again = await enter(g, m.roomId);
  assert.ok(await waitFor(again, 'room:waiting-for-host'));
  const knock = await waitFor(hs, 'room:waiting');
  hs.emit('host:admit-user', { roomId: m.roomId, targetSocketId: knock.socketId });
  assert.ok(await waitFor(again, 'room:participants'));
});

test('TC-FIX-003 a co-host of one date cannot change or cancel the whole series', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const dates = [at(0.001), at(24), at(48)];
  const m = await newMeeting(h, { scheduledAt: dates[0], recurrence: { frequency: 'daily', dates } });
  await sleep(4000); // the first date has arrived
  await join(h, m.roomId); await join(g, m.roomId);
  const hs = await enter(h, m.roomId); const gs = await enter(g, m.roomId);
  hs.emit('host:make-cohost', { roomId: m.roomId, targetSocketId: gs.id });
  assert.ok(await waitFor(gs, 'host:promoted'));
  assert.equal((await api('PUT', `/api/meetings/${m.roomId}/settings`, { token: g.token, body: { title: 'by co-host' } })).status, 200, 'co-host manages this date');
  await api('POST', `/api/meetings/${m.roomId}/leave`, { token: g.token });
  assert.equal((await api('PUT', `/api/meetings/${m.roomId}/cancel`, { token: g.token, body: { scope: 'series' } })).status, 403);
});

test('TC-FIX-004 anyone-with-the-link: a stranger sees only what is needed to join, and joining opens the rest', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h, { title: 'open day' });
  const before = await api('GET', `/api/meetings/${m.roomId}`, { token: o.token });
  assert.equal(before.status, 200);
  assert.deepEqual(before.body.data.meeting.participants, []);
  assert.ok(!before.text.includes(h.email));
  assert.equal((await join(o, m.roomId)).status, 200);
  assert.equal((await api('POST', `/api/chat/${m.roomId}/messages`, { token: o.token, body: { content: 'hi' } })).status, 201);
});

test('TC-FIX-005 team meeting: members see it and its chat; a removed member no longer does', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const t = await newTeam(h); await addMember(h, t, g);
  const m = await newMeeting(h, { teamId: t.id });
  assert.equal((await api('GET', `/api/chat/${m.roomId}/messages`, { token: g.token })).status, 200);
  await api('DELETE', `/api/teams/${t.id}/members/${g.id}`, { token: h.token });
  assert.equal((await api('GET', `/api/chat/${m.roomId}/messages`, { token: g.token })).status, 403);
});

test('TC-FIX-006 membership index follows joins, invitations and declines', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const mine = async () => (await api('GET', '/api/meetings?limit=50', { token: g.token })).body.data.meetings.map((x) => x.id);
  const m = await newMeeting(h, { scheduledAt: at(5) });
  assert.ok(!(await mine()).includes(m.id));
  await api('POST', `/api/meetings/${m.roomId}/invite`, { token: h.token, body: { invitees: [{ userId: g.id }] } });
  assert.ok((await mine()).includes(m.id));
  await api('PUT', `/api/meetings/${m.roomId}/respond`, { token: g.token, body: { status: 'declined' } });
  assert.ok((await mine()).includes(m.id), 'still invited, so still listed');
});

test('TC-FIX-007 logging out one device leaves the other device connected', async () => {
  const u = await newUser('u');
  const second = (await api('POST', '/api/auth/login', { body: { email: u.email, password: PASSWORD } })).body.data.token;
  await sleep(1100);
  const third = (await api('POST', '/api/auth/login', { body: { email: u.email, password: PASSWORD } })).body.data.token;
  const a = await socket({ token: second }); const b = await socket({ token: third });
  await api('POST', '/api/auth/logout', { token: second });
  await sleep(1100);
  assert.deepEqual([a.connected, b.connected], [false, true]);
});

test('TC-FIX-008 wrong passwords do not lock out a person who then types it correctly early enough', async () => {
  const u = await newUser('u');
  const login = (password) => api('POST', '/api/auth/login', { body: { email: u.email, password } });
  for (let i = 0; i < 5; i++) assert.equal((await login('nope-nope')).status, 401);
  for (let i = 0; i < 3; i++) assert.equal((await login(PASSWORD)).status, 200);
  for (let i = 0; i < 9; i++) assert.equal((await login('nope-nope')).status, 401, 'the count restarts after a success');
});

test('TC-FIX-009 signed-in callers are limited per account with a larger allowance', async () => {
  const u = await newUser('u');
  const anon = await api('GET', '/api/health');
  const mine = await api('GET', '/api/auth/me', { token: u.token });
  assert.equal(Number(mine.headers.get('x-ratelimit-limit')), 6 * Number(anon.headers.get('x-ratelimit-limit')));
});

test('TC-FIX-010 attaching your own uploaded file to a direct message still works', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const c = await newDm(a, b);
  const f = (await api('POST', '/api/files/upload', { token: a.token, form: fileForm('file', 'n.txt', 'hi', 'text/plain', { conversationId: c }) })).body.data.file;
  const m = await sendDm(a, c, '', { type: 'file', fileUrl: f.url, fileName: 'spoofed.exe' });
  assert.equal(m.fileName, 'n.txt', 'name comes from the stored file');
  assert.equal(await sendDm(b, c, '', { type: 'file', fileUrl: f.url }), undefined, 'someone else\'s file');
});

test('TC-FIX-011 forwarding and saving your own conversations still works', async () => {
  const a = await newUser('a'); const b = await newUser('b'); const c = await newUser('c');
  const ab = await newDm(a, b); const bc = await newDm(b, c);
  const m = await sendDm(a, ab, 'pass it on');
  assert.equal((await api('POST', `/api/messages/${m.id}/forward`, { token: b.token, body: { conversationId: bc } })).status, 201);
  assert.equal((await api('POST', `/api/messages/${m.id}/save`, { token: b.token })).status, 200);
  assert.equal((await api('GET', '/api/messages/saved', { token: b.token })).body.data.saved.length, 1);
});

test('TC-FIX-012 the super admin can still manage roles and administrators', async () => {
  const root = await adminToken();
  const role = (await api('POST', '/api/admin/roles', { token: root, body: { name: `r-${uid()}`, scope: 'admin', permissions: ['admin.admins.manage', 'admin.settings.manage'] } })).body.data.role;
  const made = await api('POST', '/api/admin/admins', { token: root, body: { name: 'N', email: `a.${uid()}@example.test`, password: 'LongEnough1!', roleId: role.id } });
  assert.equal(made.status, 201);
  assert.equal((await api('PUT', `/api/admin/admins/${made.body.data.admin.id}`, { token: root, body: { password: 'Another-Long-9' } })).status, 200);
});

test('TC-FIX-013 password reset never says whether an account exists and refuses bad codes', async () => {
  const u = await newUser('u');
  const ask = (email) => api('POST', '/api/auth/forgot-password', { body: { email } });
  const [known, unknown] = [await ask(u.email), await ask(`nobody.${uid()}@example.test`)];
  assert.deepEqual([known.status, known.body.message], [unknown.status, unknown.body.message]);
  const r = await api('POST', '/api/auth/reset-password', { body: { email: u.email, code: '000000', newPassword: 'Whatever-123' } });
  assert.equal(r.status, 400);
  assert.equal((await api('POST', '/api/auth/login', { body: { email: u.email, password: PASSWORD } })).status, 200);
});

test('TC-FIX-014 bad paging, arrays in the query and unknown routes are clean 4xx JSON', async () => {
  const u = await newUser('u');
  for (const p of ['/api/meetings?limit=0', '/api/meetings?page=x', '/api/search?q[]=a', '/api/notifications?limit=-3']) {
    const r = await api('GET', p, { token: u.token });
    assert.equal(r.status, 400, `${p} -> ${r.status}`);
    assert.ok(r.body?.message);
  }
  assert.equal((await api('GET', '/api/nothing', { token: u.token })).status, 404);
});

test('TC-FIX-015 password reset codes cannot be guessed without limit', async () => {
  const u = await newUser('u');
  const guess = (email, i) => api('POST', '/api/auth/reset-password', { body: { email, code: String(i).padStart(6, '0'), newPassword: 'Guess-pass-1' } });
  const known = []; for (let i = 0; i < 12; i++) known.push((await guess(u.email, i)).status);
  assert.deepEqual(known.slice(-2), [429, 429]);
  const nobody = `no.${uid()}@example.test`;
  const unknown = []; for (let i = 0; i < 12; i++) unknown.push((await guess(nobody, i)).status);
  assert.deepEqual(unknown, known, 'the limit must not reveal which addresses have accounts');
});

test('TC-FIX-016 public health check says nothing about the process', async () => {
  const outside = await api('GET', '/api/health', { headers: { 'X-Forwarded-For': '203.0.113.9' } });
  assert.deepEqual(Object.keys(outside.body).sort(), ['status', 'timestamp']);
  assert.ok((await api('GET', '/api/health')).body.pid, 'tools on the server still get details');
});

test('TC-FIX-017 address masking follows who has actually written, and a long chat list stays quick', async () => {
  const me = await newUser('busy');
  const quiet = await newUser('quiet'); const talker = await newUser('talker');
  await newDm(me, quiet);
  const c = await newDm(me, talker); await sendDm(talker, c, 'hello');
  for (let i = 0; i < 30; i++) await newDm(me, await newUser('p'));
  const started = performance.now();
  const list = (await api('GET', '/api/conversations', { token: me.token })).body.data.conversations;
  assert.ok(performance.now() - started < 1500);
  const email = (u) => list.map((x) => x.partner).find((p) => p?.id === u.id).email;
  assert.equal(email(talker), talker.email);
  assert.notEqual(email(quiet), quiet.email);
});

test('TC-FIX-018 with limits off: no participant cap unless the host sets one, and nothing to buy', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  assert.equal(m.settings.maxParticipants, undefined);
  const crowd = []; for (let i = 0; i < 60; i++) crowd.push(await newUser('c'));
  const rs = await Promise.all(crowd.map((u) => join(u, m.roomId)));
  assert.equal(rs.filter((r) => r.status === 200).length, 60);
  const capped = await newMeeting(h, { settings: { maxParticipants: 2 } });
  assert.equal((await join(crowd[0], capped.roomId)).status, 200);
  assert.equal((await api('GET', '/api/config')).body.data.billingEnabled, false);
  assert.equal((await api('POST', '/api/subscriptions/subscribe', { token: h.token, body: { planSlug: 'pro' } })).status, 400);
});

test('TC-FIX-019 invite codes are long, and guessing them is throttled', async () => {
  const o = await newUser('o'); const x = await newUser('x');
  const t = await newTeam(o);
  assert.equal(t.inviteCode.length, 16);
  const st = []; for (let i = 0; i < 22; i++) st.push((await api('POST', `/api/teams/join/${uid()}`, { token: x.token })).status);
  assert.deepEqual(st.slice(-2), [429, 429]);
});

test('TC-FIX-020 a burst of wrong invite codes cannot slip past the throttle', async () => {
  const guesser = await newUser('burst');
  const statuses = await Promise.all(Array.from({ length: 60 }, () => api('POST', `/api/teams/join/${uid()}0000`, { token: guesser.token }).then((r) => r.status)));
  assert.deepEqual([statuses.filter((s) => s === 404).length, statuses.filter((s) => s === 429).length], [20, 40]);
});
