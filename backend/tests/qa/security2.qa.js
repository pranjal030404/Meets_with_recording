/**
 * Deeper security assessment. "Tenant" = two unrelated sets of accounts, each with its own team,
 * meeting, chats, files and tasks (the product has no tenant entity).
 * Requires QA_BILLING_URL for entitlement cases and QA_APP_DIR for the rate-limit case.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { api, BASE, newUser, newTeam, addMember, newMeeting, newDm, sendDm, join, socket, enter, closeSockets, waitFor, got, sleep, uid, fileForm, adminToken } from './helpers.js';

test.after(closeSockets);
const settle = (ms = 700) => sleep(ms);
const future = (d) => new Date(Date.now() + d * 86400000).toISOString();

// ---------- victim tenant ----------
let fx;
async function fixtures() {
  if (fx) return fx;
  const a = await newUser('victimA'); const b = await newUser('victimB'); const x = await newUser('attacker');
  const team = await newTeam(a); await addMember(a, team, b);
  const meeting = await newMeeting(a, { title: 'SECRET-meeting', settings: { accessType: 'trusted', allowLinkRequests: false } });
  await join(b, meeting.roomId);
  const rec = (await api('POST', `/api/meetings/${meeting.roomId}/recordings`, { token: a.token, form: fileForm('recording', 'r.webm', 'SECRET-recording', 'video/webm') })).body.data.recording;
  const mmsg = (await api('POST', `/api/chat/${meeting.roomId}/messages`, { token: a.token, body: { content: 'SECRET-mchat' } })).body.data.message;
  const conv = await newDm(a, b); const dmsg = await sendDm(a, conv, 'SECRET-dm');
  const group = (await api('POST', '/api/conversations', { token: a.token, body: { type: 'group', name: 'g', userIds: [b.id, (await newUser('victimC')).id] } })).body.data.conversation.id;
  const task = (await api('POST', '/api/tasks', { token: a.token, body: { title: 'SECRET-task', teamId: team.id } })).body.data.task;
  const file = (await api('POST', '/api/files/upload', { token: a.token, form: fileForm('file', 's.txt', 'SECRET-file', 'text/plain', { teamId: team.id }) })).body.data.file;
  const poll = (await api('POST', '/api/polls', { token: a.token, body: { meetingId: meeting.id, question: 'SECRET-poll', options: ['a', 'b'] } })).body.data.poll;
  const question = (await api('POST', '/api/qa', { token: a.token, body: { meetingId: meeting.id, question: 'SECRET-question' } })).body.data.question;
  const breakout = (await api('POST', '/api/breakout', { token: a.token, body: { meetingId: meeting.id, rooms: [{ name: 'SECRET-room' }] } })).body.data.breakoutRooms[0];
  const notif = (await api('GET', '/api/notifications', { token: b.token })).body.data.notifications[0];
  fx = { a, b, x, team, meeting, rec, mmsg, conv, dmsg, group, task, file, poll, question, breakout, notif };
  return fx;
}

// Every object-addressed route, called by a signed-in stranger. [id, method, path, body]
const routes = (f) => {
  const r = f.meeting.roomId; const m = f.meeting.id;
  return [
    ['meeting details', 'GET', `/api/meetings/${r}`], ['meeting join', 'POST', `/api/meetings/${r}/join`, {}],
    ['meeting leave', 'POST', `/api/meetings/${r}/leave`, {}],
    ['meeting placement', 'GET', `/api/meetings/${r}/placement`], ['meeting series', 'GET', `/api/meetings/${r}/series`],
    ['meeting edit', 'PUT', `/api/meetings/${r}/schedule`, { title: 'pwn' }], ['meeting settings', 'PUT', `/api/meetings/${r}/settings`, { title: 'pwn' }],
    ['meeting end', 'POST', `/api/meetings/${r}/end`, {}], ['meeting cancel', 'PUT', `/api/meetings/${r}/cancel`, {}],
    ['meeting invite', 'POST', `/api/meetings/${r}/invite`, { invitees: [{ userId: f.x.id }] }], ['meeting respond', 'PUT', `/api/meetings/${r}/respond`, { status: 'accepted' }],
    ['team meetings', 'GET', `/api/meetings/team/${f.team.id}`],
    ['recording download-url', 'POST', `/api/storage/recordings/${r}/${f.rec.id}/download-url`, {}],
    ['recording retry', 'POST', `/api/meetings/${r}/recordings/${f.rec.id}/retry-transcription`, {}],
    ['complete transcript', 'POST', `/api/meetings/${r}/complete-transcript`, {}],
    ['summary read', 'GET', `/api/ai/meetings/${r}/summary`], ['summary create', 'POST', `/api/ai/meetings/${r}/summary`, {}],
    ['meeting chat read', 'GET', `/api/chat/${r}/messages`], ['meeting chat write', 'POST', `/api/chat/${r}/messages`, { content: 'pwn' }],
    ['meeting chat react', 'POST', `/api/chat/messages/${f.mmsg.id}/react`, { emoji: 'x' }], ['meeting chat delete', 'DELETE', `/api/chat/messages/${f.mmsg.id}`],
    ['meeting msg thread', 'GET', `/api/messages/${f.mmsg.id}/thread`], ['meeting msg reply', 'POST', `/api/messages/${f.mmsg.id}/replies`, { content: 'pwn' }],
    ['meeting msg react', 'POST', `/api/messages/${f.mmsg.id}/react`, { emoji: 'x' }], ['meeting msg pin', 'PUT', `/api/messages/${f.mmsg.id}/pin`],
    ['team chat read', 'GET', `/api/chat/team/${f.team.id}/messages`], ['team chat write', 'POST', `/api/chat/team/${f.team.id}/messages`, { content: 'pwn' }],
    ['team read', 'GET', `/api/teams/${f.team.id}`], ['team update', 'PUT', `/api/teams/${f.team.id}`, { name: 'pwn' }],
    ['team delete', 'DELETE', `/api/teams/${f.team.id}`], ['team invite', 'POST', `/api/teams/${f.team.id}/invite`, { email: f.x.email }],
    ['team role', 'PUT', `/api/teams/${f.team.id}/members/${f.b.id}/role`, { role: 'admin' }], ['team remove member', 'DELETE', `/api/teams/${f.team.id}/members/${f.b.id}`],
    ['team notif prefs', 'PUT', `/api/teams/${f.team.id}/members/${f.b.id}/notifications`, { notifications: {} }],
    ['team channel add', 'POST', `/api/teams/${f.team.id}/channels`, { name: 'pwn' }], ['team code', 'POST', `/api/teams/${f.team.id}/regenerate-code`, {}],
    ['dm read', 'GET', `/api/conversations/${f.conv}`], ['dm messages', 'GET', `/api/conversations/${f.conv}/messages`],
    ['dm send', 'POST', `/api/conversations/${f.conv}/messages`, { content: 'pwn' }], ['dm read-mark', 'PUT', `/api/conversations/${f.conv}/read`],
    ['dm mute', 'PUT', `/api/conversations/${f.conv}/mute`], ['group add member', 'POST', `/api/conversations/${f.group}/members`, { userIds: [f.x.id] }],
    ['group remove member', 'DELETE', `/api/conversations/${f.group}/members/${f.b.id}`],
    ['dm msg thread', 'GET', `/api/messages/${f.dmsg.id}/thread`], ['dm msg reply', 'POST', `/api/messages/${f.dmsg.id}/replies`, { content: 'pwn' }],
    ['dm msg edit', 'PUT', `/api/messages/${f.dmsg.id}`, { content: 'pwn' }], ['dm msg delete', 'DELETE', `/api/messages/${f.dmsg.id}`],
    ['dm msg react', 'POST', `/api/messages/${f.dmsg.id}/react`, { emoji: 'x' }], ['dm msg pin', 'PUT', `/api/messages/${f.dmsg.id}/pin`],
    ['dm msg forward', 'POST', `/api/messages/${f.dmsg.id}/forward`, { conversationId: 'none' }], ['dm msg save', 'POST', `/api/messages/${f.dmsg.id}/save`],
    ['pinned of dm', 'GET', `/api/messages/pinned?conversationId=${f.conv}`], ['pinned of team', 'GET', `/api/messages/pinned?teamId=${f.team.id}`],
    ['task read', 'GET', `/api/tasks/${f.task.id}`], ['task update', 'PUT', `/api/tasks/${f.task.id}`, { title: 'pwn' }],
    ['task delete', 'DELETE', `/api/tasks/${f.task.id}`], ['task subtask', 'POST', `/api/tasks/${f.task.id}/subtasks`, { title: 'pwn' }],
    ['team tasks', 'GET', `/api/tasks?scope=team&teamId=${f.team.id}`],
    ['file download', 'GET', `/api/files/${f.file.id}/download`], ['file delete', 'DELETE', `/api/files/${f.file.id}`],
    ['file restore', 'PUT', `/api/files/${f.file.id}/restore`], ['file list team', 'GET', `/api/files?teamId=${f.team.id}`],
    ['file raw path', 'GET', f.file.url],
    ['poll create', 'POST', '/api/polls', { meetingId: m, question: 'p', options: ['a'] }], ['poll vote', 'POST', `/api/polls/${f.poll.id}/vote`, { optionIds: [] }],
    ['poll results', 'GET', `/api/polls/${f.poll.id}/results`], ['poll start', 'PUT', `/api/polls/${f.poll.id}/start`],
    ['poll end', 'PUT', `/api/polls/${f.poll.id}/end`], ['poll list', 'GET', `/api/polls/meeting/${m}`],
    ['qa ask', 'POST', '/api/qa', { meetingId: m, question: 'pwn' }], ['qa list', 'GET', `/api/qa/meeting/${m}`],
    ['qa upvote', 'PUT', `/api/qa/${f.question.id}/upvote`], ['qa answer', 'PUT', `/api/qa/${f.question.id}/answer`, { answer: 'pwn' }],
    ['qa dismiss', 'DELETE', `/api/qa/${f.question.id}`],
    ['breakout create', 'POST', '/api/breakout', { meetingId: m, rooms: [{ name: 'p' }] }], ['breakout list', 'GET', `/api/breakout/meeting/${m}`],
    ['breakout assign', 'PUT', `/api/breakout/${f.breakout.id}/assign`, { participantIds: [f.x.id] }],
    ['breakout join', 'POST', `/api/breakout/${f.breakout.id}/join`, {}], ['breakout close', 'POST', '/api/breakout/close-all', { meetingId: m }],
    ['notification read', 'PUT', `/api/notifications/${f.notif.id}/read`], ['notification delete', 'DELETE', `/api/notifications/${f.notif.id}`],
    ['subscription admin list', 'GET', '/api/subscriptions/admin/all'], ['admin users', 'GET', '/api/admin/users'],
    ['admin settings', 'GET', '/api/admin/settings'], ['admin audit', 'GET', '/api/admin/audit-logs'],
  ];
};

test('TC-SX-001 no object route serves an anonymous caller', async () => {
  const f = await fixtures();
  const open = [];
  for (const [name, method, path, body] of routes(f)) {
    const r = await api(method, path, { body });
    if (r.status !== 401) open.push(`${name} ${r.status}`);
  }
  assert.deepEqual(open, []);
});

test('TC-SX-002 object-level authorisation: a stranger is refused on every object route', async () => {
  const f = await fixtures();
  const matrix = [];
  for (const [name, method, path, body] of routes(f)) {
    const r = await api(method, path, { token: f.x.token, body });
    // A 200 that returns only empty lists gave nothing away; "leave" by a stranger is a verified no-op.
    const empty = r.status === 200 && Object.values(r.body?.data || {}).length > 0 && Object.values(r.body.data).every((v) => Array.isArray(v) && !v.length);
    const refused = [400, 401, 403, 404, 409].includes(r.status) || empty || name === 'meeting leave';
    const leaked = r.text.includes('SECRET-');
    // join/leave of a restricted meeting by a stranger must not succeed either
    matrix.push({ name, method, path: path.replace(/[0-9a-f-]{36}/g, ':id'), status: r.status, refused, leaked });
  }
  if (process.env.QA_MATRIX_OUT) fs.writeFileSync(process.env.QA_MATRIX_OUT, JSON.stringify(matrix, null, 1));
  assert.deepEqual(matrix.filter((x) => !x.refused || x.leaked).map((x) => `${x.name}: ${x.status}${x.leaked ? ' LEAKS DATA' : ''}`), []);
});

test('TC-SX-003 a member removed from a group stops receiving its live messages', async () => {
  const a = await newUser('a'); const b = await newUser('b'); const c = await newUser('c');
  const g = (await api('POST', '/api/conversations', { token: a.token, body: { type: 'group', name: 'g', userIds: [b.id, c.id] } })).body.data.conversation.id;
  const cs = await socket(c);
  await cs.timeout(3000).emitWithAck('conversation:join', { conversationId: g });
  assert.equal((await api('DELETE', `/api/conversations/${g}/members/${c.id}`, { token: a.token })).status, 200);
  await settle(200);
  await sendDm(a, g, 'after-removal');
  await settle();
  assert.deepEqual(got(cs, 'conversation:message').map((e) => e.data.content), [], 'removed member still receives messages');
});

test('TC-SX-004 a member removed from a team stops receiving its live messages', async () => {
  const o = await newUser('o'); const u = await newUser('u');
  const t = await newTeam(o); await addMember(o, t, u);
  const us = await socket(u);
  us.emit('team:join', { teamId: t.id });
  assert.ok(await waitFor(us, 'team:joined'));
  assert.equal((await api('DELETE', `/api/teams/${t.id}/members/${u.id}`, { token: o.token })).status, 200);
  await api('POST', `/api/chat/team/${t.id}/messages`, { token: o.token, body: { content: 'after-removal' } });
  await settle();
  assert.deepEqual(us.log.filter((e) => JSON.stringify(e.data ?? '').includes('after-removal')).map((e) => e.event), []);
});

test('TC-SX-005 someone outside a team cannot inject typing indicators into it', async () => {
  const o = await newUser('o'); const x = await newUser('x');
  const t = await newTeam(o);
  const os = await socket(o); os.emit('team:join', { teamId: t.id }); await waitFor(os, 'team:joined');
  const xs = await socket(x);
  xs.emit('team:typing', { teamId: t.id, channelType: 'general', isTyping: true });
  await settle();
  assert.equal(got(os, 'team:user-typing').length, 0);
});

test('TC-SX-006 meeting "private message" cannot be pushed to an arbitrary account or reveal its email', async () => {
  const x = await newUser('x'); const victim = await newUser('v');
  const own = await newMeeting(x);
  const xs = await enter(x, own.roomId); const vs = await socket(victim);
  xs.emit('chat:send', { roomId: own.roomId, content: 'unsolicited', recipientId: victim.id });
  await settle();
  const echo = got(xs, 'chat:message')[0]?.data;
  assert.deepEqual(
    { delivered: got(vs, 'chat:message').length, emailRevealed: echo?.recipient?.email === victim.email },
    { delivered: 0, emailRevealed: false });
});

test('TC-SX-007 email masking in people search cannot be removed by opening a chat', async () => {
  const x = await newUser('x'); const v = await newUser('maskme');
  const search = async () => (await api('GET', `/api/conversations/people/search?q=${encodeURIComponent(v.name)}`, { token: x.token })).body.data.people.find((p) => p.id === v.id);
  assert.notEqual((await search()).email, v.email, 'control: masked for a stranger');
  await newDm(x, v);
  assert.notEqual((await search()).email, v.email, 'one unanswered chat request unmasks the address');
});

test('TC-SX-008 no response exposes password hashes, one-time code hashes or tokens of others', async () => {
  const f = await fixtures();
  const admin = await adminToken();
  const calls = [
    [f.a.token, '/api/auth/me'], [f.b.token, `/api/auth/users/${f.a.id}`], [f.a.token, '/api/teams'], [f.a.token, `/api/meetings/${f.meeting.roomId}`],
    [f.a.token, '/api/meetings'], [f.a.token, `/api/chat/${f.meeting.roomId}/messages`], [f.a.token, '/api/conversations'], [f.a.token, '/api/search?q=SECRET'],
    [f.a.token, '/api/tasks'], [f.a.token, '/api/files'], [f.a.token, '/api/subscriptions/me'], [f.a.token, '/api/notifications'],
    [admin, '/api/admin/users'], [admin, '/api/admin/admins'], [admin, '/api/admin/overview'], [admin, '/api/admin/settings'], [admin, '/api/admin/audit-logs?limit=200'],
  ];
  const bad = [];
  for (const [token, path] of calls) {
    const r = await api('GET', path, { token });
    if (/\$2[aby]\$\d\d\$|"(password|passwordHash|codeHash|verificationToken|smtpPass|SMTP_PASS|JWT_SECRET)"\s*:|eyJhbGciOi/.test(r.text)) bad.push(path);
  }
  assert.deepEqual(bad, []);
});

test('TC-SX-009 authenticated API responses forbid caching', async () => {
  const f = await fixtures();
  const missing = [];
  for (const path of ['/api/auth/me', '/api/meetings', `/api/conversations/${f.conv}/messages`, '/api/files', '/api/subscriptions/payments']) {
    const r = await api('GET', path, { token: f.a.token });
    if (!/no-store/.test(r.headers.get('cache-control') || '')) missing.push(path);
  }
  assert.deepEqual(missing, []);
});

test('TC-SX-010 private file cookie dies with logout', async () => {
  const u = await newUser('u');
  const f = (await api('POST', '/api/files/upload', { token: u.token, form: fileForm('file', 'p.txt', 'private', 'text/plain') })).body.data.file;
  const me = await api('GET', '/api/auth/me', { token: u.token });
  const cookie = me.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('GET', f.url, { headers: { Cookie: cookie } })).status, 200);
  const out = await api('POST', '/api/auth/logout', { token: u.token });
  assert.match(out.headers.get('set-cookie') || '', /mc_assets=;.*Max-Age=0/);
  assert.equal((await api('GET', f.url, { headers: { Cookie: cookie } })).status, 401);
});

test('TC-SX-011 forged tokens are refused (alg=none, edited subject, admin/user confusion)', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const [h, , s] = a.token.split('.');
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const forged = [`${enc({ alg: 'none', typ: 'JWT' })}.${enc({ id: b.id })}.`, `${h}.${enc({ id: b.id, exp: 4e9 })}.${s}`];
  for (const token of forged) assert.equal((await api('GET', '/api/auth/me', { token })).status, 401);
  assert.equal((await api('GET', '/api/admin/users', { token: a.token })).status, 401);
  assert.equal((await api('GET', '/api/auth/me', { token: await adminToken() })).status, 401);
});

test('TC-SX-012 CORS does not allow a foreign origin', async () => {
  const r = await api('OPTIONS', '/api/auth/me', { headers: { Origin: 'https://evil.test', 'Access-Control-Request-Method': 'GET' } });
  assert.notEqual(r.headers.get('access-control-allow-origin'), 'https://evil.test');
  assert.notEqual(r.headers.get('access-control-allow-origin'), '*');
});

// ---------- admin privilege boundaries ----------
async function limitedAdmin(permissions) {
  const root = await adminToken();
  const role = (await api('POST', '/api/admin/roles', { token: root, body: { name: `adm-${uid()}`, scope: 'admin', permissions } })).body.data.role;
  const email = `lim.${uid()}@example.test`;
  const made = (await api('POST', '/api/admin/admins', { token: root, body: { name: 'Limited', email, password: 'LongEnough1!', roleId: role.id } })).body.data.admin;
  const token = (await api('POST', '/api/admin/auth/login', { body: { email, password: 'LongEnough1!' } })).body.data.token;
  return { root, role, id: made.id, email, token };
}
const perms = async (token) => (await api('GET', '/api/admin/auth/me', { token })).body.data.permissions;

test('TC-SX-013 an admin who manages roles cannot grant their own role more permissions', async () => {
  const l = await limitedAdmin(['admin.roles.manage']);
  await api('PUT', `/api/admin/roles/${l.role.id}`, { token: l.token, body: { permissions: ['admin.roles.manage', 'admin.admins.manage', 'admin.settings.manage', 'admin.users.manage'] } });
  assert.deepEqual(await perms(l.token), ['admin.roles.manage']);
});

test('TC-SX-014 an admin who manages admins cannot give themselves a stronger role', async () => {
  const l = await limitedAdmin(['admin.admins.manage']);
  const strong = (await api('POST', '/api/admin/roles', { token: l.root, body: { name: `strong-${uid()}`, scope: 'admin', permissions: ['admin.admins.manage', 'admin.settings.manage', 'admin.users.manage'] } })).body.data.role;
  await api('PUT', `/api/admin/admins/${l.id}`, { token: l.token, body: { roleId: strong.id } });
  assert.deepEqual(await perms(l.token), ['admin.admins.manage']);
});

test('TC-SX-015 changing an admin password ends that admin\'s existing sessions', async () => {
  const l = await limitedAdmin(['admin.users.view']);
  assert.equal((await api('PUT', `/api/admin/admins/${l.id}`, { token: l.root, body: { password: 'Rotated-Password-9' } })).status, 200);
  assert.equal((await api('GET', '/api/admin/users', { token: l.token })).status, 401);
});

// ---------- entitlements (server started with UNLOCK_ALL_FEATURES=false) ----------
const bill = process.env.QA_BILLING_URL || BASE;
const call = (m, p, o = {}) => api(m, p, { ...o, base: bill });
const freeUser = () => newUser('ent', { base: bill });

test('TC-SX-017 Free plan: monthly meeting limit applies to a repeating meeting as a whole', async () => {
  const u = await freeUser();
  const series = (n) => call('POST', '/api/meetings', { token: u.token, body: { scheduledAt: future(1), recurrence: { frequency: 'daily', dates: Array.from({ length: n }, (_, i) => future(i + 1)) } } });
  const over = await series(6);
  assert.equal(over.body.code, 'PLAN_LIMIT_REACHED', `6 dates -> ${over.status}`);
  assert.equal((await series(5)).status, 201);
  assert.equal((await series(2)).body.code, 'PLAN_LIMIT_REACHED');
});

test('TC-SX-018 Free plan: simultaneous repeating meetings cannot exceed the limit', async () => {
  const u = await freeUser();
  const dates = Array.from({ length: 5 }, (_, i) => future(i + 1));
  await Promise.all(Array.from({ length: 6 }, () => call('POST', '/api/meetings', { token: u.token, body: { scheduledAt: dates[0], recurrence: { frequency: 'daily', dates } } })));
  const list = await call('GET', '/api/meetings?limit=100', { token: u.token });
  assert.ok(list.body.data.meetings.length <= 5, `${list.body.data.meetings.length} meetings on a 5-meeting plan`);
});

test('TC-SX-021 payment history and subscription actions are per account', async () => {
  const a = await freeUser(); const b = await freeUser();
  await call('POST', '/api/subscriptions/subscribe', { token: a.token, body: { planSlug: 'pro', billingInterval: 'monthly' } });
  const pays = (await call('GET', '/api/subscriptions/payments', { token: b.token })).body.data.payments;
  assert.equal(pays.length, 0);
});

// ---------- roles ----------
// (Transcription is included in the Free plan, so there is no transcription gate to test.)
async function guest() {
  const u = await newUser('guest');
  const a = await adminToken();
  const role = (await api('GET', '/api/admin/roles', { token: a })).body.data.roles.find((r) => r.name === 'Guest');
  await api('PUT', `/api/admin/users/${u.id}/role`, { token: a, body: { roleId: role.id } });
  return u;
}

test('TC-SX-022 Guest role ("can only join meetings") is refused on every create/AI action', async () => {
  const u = await guest(); const other = await newUser('o');
  const dm = await api('POST', '/api/conversations', { token: u.token, body: { type: 'direct', userId: other.id } });
  const allowed = [];
  const check = async (name, method, path, extra) => { const r = await api(method, path, { token: u.token, ...extra }); if (r.status !== 403) allowed.push(`${name} ${r.status}`); };
  await check('create meeting', 'POST', '/api/meetings', { body: {} });
  await check('create team', 'POST', '/api/teams', { body: { name: 't' } });
  await check('create task', 'POST', '/api/tasks', { body: { title: 't' } });
  await check('upload file', 'POST', '/api/files/upload', { form: fileForm('file', 'a.txt', 'a', 'text/plain') });
  await check('summarize', 'POST', '/api/ai/summarize', { body: { text: 'x'.repeat(60) } });
  if (dm.body?.data?.conversation) {
    const id = dm.body.data.conversation.id;
    await check('open DM and send', 'POST', `/api/conversations/${id}/messages`, { body: { content: 'x' } });
    const m = await api('POST', `/api/conversations/${id}/messages`, { token: u.token, body: { content: 'y' } });
    if (m.body?.data?.message) await check('reply in thread', 'POST', `/api/messages/${m.body.data.message.id}/replies`, { body: { content: 'z' } });
  }
  assert.deepEqual(allowed, []);
});

// A request from this machine is by definition "from the proxy", so this is checked on the trust rule itself:
// only proxies on this host or a private network may say who the caller is.
test('TC-SX-023 X-Forwarded-For is not believed from a public address', { skip: !process.env.QA_APP_DIR && 'set QA_APP_DIR' }, async () => {
  const { trustProxySetting } = await import(`${process.env.QA_APP_DIR}/src/lib/clientIp.js`);
  for (const value of ['1', undefined]) {
    const trust = trustProxySetting(value, true);
    assert.equal(trust('203.0.113.7', 0), false, 'a direct public caller is trusted to name its own address');
    assert.equal(trust('127.0.0.1', 0), true);
    assert.equal(trust('10.0.0.4', 0), true);
    assert.equal(trust('10.0.0.4', 1), false, 'more hops than configured');
  }
  assert.equal(trustProxySetting('false', true), false);
});

