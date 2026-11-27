/** Teams, chat, tasks, files, polls, Q&A, breakout rooms, notifications. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, newTeam, addMember, getTeam, newMeeting, newDm, sendDm, join, uid, fileForm, adminToken } from './helpers.js';

// ---------- teams ----------
test('TC-TEAM-001 joining a team with its invite code persists membership', async () => {
  const o = await newUser('o'); const j = await newUser('j');
  const t = await newTeam(o);
  const r = await api('POST', `/api/teams/join/${t.inviteCode}`, { token: j.token });
  assert.equal(r.status, 200);
  const list = (await api('GET', '/api/teams', { token: j.token })).body;
  assert.ok(list.some((x) => x.id === t.id), 'API said "Successfully joined team" but the membership was not saved');
});

test('TC-TEAM-002 changing a member role persists', async () => {
  const o = await newUser('o'); const u = await newUser('u');
  const t = await newTeam(o); await addMember(o, t, u);
  assert.equal((await api('PUT', `/api/teams/${t.id}/members/${u.id}/role`, { token: o.token, body: { role: 'admin' } })).status, 200);
  const role = (await getTeam(o, t.id)).members.find((m) => m.userId === u.id).role;
  assert.equal(role, 'admin', `API said success but role is still "${role}"`);
});

test('TC-TEAM-003 member notification preferences persist', async () => {
  const o = await newUser('o');
  const t = await newTeam(o);
  await api('PUT', `/api/teams/${t.id}/members/${o.id}/notifications`, { token: o.token, body: { notifications: { meetings: false } } });
  assert.equal((await getTeam(o, t.id)).members[0].notifications.meetings, false);
});

test('TC-TEAM-004 role update rejects "owner" and unknown values', async () => {
  const o = await newUser('o'); const u = await newUser('u');
  const t = await newTeam(o); await addMember(o, t, u);
  for (const role of ['owner', 'god']) {
    const r = await api('PUT', `/api/teams/${t.id}/members/${u.id}/role`, { token: o.token, body: { role } });
    assert.equal(r.status, 400, `role "${role}" accepted with ${r.status}`);
  }
});

test('TC-TEAM-005 invite, duplicate invite, invalid email, remove member', async () => {
  const o = await newUser('o'); const u = await newUser('u');
  const t = await newTeam(o);
  const inv = (email) => api('POST', `/api/teams/${t.id}/invite`, { token: o.token, body: { email } });
  assert.equal((await inv(u.email)).status, 200);
  assert.equal((await inv(u.email)).status, 400);
  assert.equal((await inv('bad')).status, 400);
  assert.equal((await api('DELETE', `/api/teams/${t.id}/members/${u.id}`, { token: o.token })).status, 200);
  assert.equal((await getTeam(o, t.id)).memberCount, 1);
  assert.equal((await api('DELETE', `/api/teams/${t.id}/members/${o.id}`, { token: o.token })).status, 403);
});

test('TC-TEAM-006 team name is required (4xx)', async () => {
  const o = await newUser('o');
  const r = await api('POST', '/api/teams', { token: o.token, body: {} });
  assert.ok(r.status >= 400 && r.status < 500, `got ${r.status} ${r.body?.error}`);
});

test('TC-TEAM-007 channels: create, duplicate, protect defaults, delete', async () => {
  const o = await newUser('o');
  const t = await newTeam(o);
  const c = await api('POST', `/api/teams/${t.id}/channels`, { token: o.token, body: { name: 'design' } });
  assert.equal(c.status, 200);
  assert.equal((await api('POST', `/api/teams/${t.id}/channels`, { token: o.token, body: { name: 'Design' } })).status, 400);
  const ch = c.body.channels.find((x) => x.name === 'design');
  const general = c.body.channels.find((x) => x.name === 'general');
  assert.equal((await api('DELETE', `/api/teams/${t.id}/channels/${general.id}`, { token: o.token })).status, 403);
  assert.equal((await api('DELETE', `/api/teams/${t.id}/channels/${ch.id}`, { token: o.token })).status, 200);
  assert.equal((await getTeam(o, t.id)).channels.length, 3);
});

// ---------- chat ----------
test('TC-CHAT-001 DM send, history, unread count, edit, delete', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const c = await newDm(a, b);
  const msg = await sendDm(a, c, 'hello');
  const list = (await api('GET', '/api/conversations', { token: b.token })).body.data.conversations;
  assert.equal(list.find((x) => x.id === c).unreadCount, 1);
  assert.equal((await api('PUT', `/api/messages/${msg.id}`, { token: b.token, body: { content: 'x' } })).status, 403);
  assert.equal((await api('PUT', `/api/messages/${msg.id}`, { token: a.token, body: { content: 'edited' } })).status, 200);
  assert.equal((await api('DELETE', `/api/messages/${msg.id}`, { token: a.token })).status, 200);
  const hist = (await api('GET', `/api/conversations/${c}/messages`, { token: b.token })).body.data.messages;
  assert.equal(hist.length, 0);
});

test('TC-CHAT-002 empty and oversize messages are 4xx', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const c = await newDm(a, b);
  const send = (content) => api('POST', `/api/conversations/${c}/messages`, { token: a.token, body: { content } });
  assert.equal((await send('   ')).status, 400);
  const big = await send('x'.repeat(5000));
  assert.ok(big.status >= 400 && big.status < 500, `got ${big.status} ${big.body?.error}`);
});

test('TC-CHAT-003 a client cannot post "system" messages', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const c = await newDm(a, b);
  const m = await sendDm(a, c, 'Your account is locked, visit http://evil.test', { type: 'system' });
  assert.notEqual(m?.type, 'system', 'user-supplied system notice accepted');
});

test('TC-CHAT-004 attachment URL cannot be an arbitrary/script URL', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const c = await newDm(a, b);
  const m = await sendDm(a, c, 'doc', { type: 'file', fileUrl: 'javascript:alert(document.domain)', fileName: 'report.pdf' });
  assert.ok(!m || !String(m.fileUrl).startsWith('javascript:'), `stored fileUrl=${m?.fileUrl}`);
});

test('TC-CHAT-005 history limit is bounded and validated', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const c = await newDm(a, b);
  const r = await api('GET', `/api/conversations/${c}/messages?limit=abc`, { token: a.token });
  assert.ok(r.status < 500, `limit=abc -> ${r.status} ${r.body?.error}`);
});

test('TC-CHAT-006 thread reply increments reply count', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const c = await newDm(a, b);
  const root = await sendDm(a, c, 'root');
  assert.equal((await api('POST', `/api/messages/${root.id}/replies`, { token: b.token, body: { content: 'reply' } })).status, 201);
  const t = (await api('GET', `/api/messages/${root.id}/thread`, { token: a.token })).body.data;
  assert.equal(t.root.replyCount, 1);
  assert.equal(t.replies.length, 1);
});

test('TC-CHAT-007 team message round trip and mention notification', async () => {
  const o = await newUser('o'); const u = await newUser('u');
  const t = await newTeam(o); await addMember(o, t, u);
  const r = await api('POST', `/api/chat/team/${t.id}/messages`, { token: o.token, body: { content: 'ping', mentions: [u.id] } });
  assert.equal(r.status, 201);
  const hist = await api('GET', `/api/chat/team/${t.id}/messages`, { token: u.token });
  assert.ok(hist.body.data.messages.some((m) => m.content === 'ping'));
  const n = await api('GET', '/api/notifications', { token: u.token });
  assert.ok(n.body.data.notifications.some((x) => x.type === 'mention'));
});

test('TC-CHAT-008 reacting twice to a meeting message toggles the reaction', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  const msg = (await api('POST', `/api/chat/${m.roomId}/messages`, { token: h.token, body: { content: 'x' } })).body.data.message;
  const react = () => api('POST', `/api/chat/messages/${msg.id}/react`, { token: h.token, body: { emoji: '👍' } });
  await react();
  await react();
  const after = (await api('GET', `/api/chat/${m.roomId}/messages`, { token: h.token })).body.data.messages[0];
  assert.equal(after.reactions.length, 0);
});

test('TC-CHAT-009 a first reaction on a meeting message is saved', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  const msg = (await api('POST', `/api/chat/${m.roomId}/messages`, { token: h.token, body: { content: 'x' } })).body.data.message;
  await api('POST', `/api/chat/messages/${msg.id}/react`, { token: h.token, body: { emoji: '🎉' } });
  const after = (await api('GET', `/api/chat/${m.roomId}/messages`, { token: h.token })).body.data.messages[0];
  assert.equal(after.reactions.length, 1, 'reaction was returned but not persisted');
});

// ---------- tasks ----------
test('TC-TASK-001 create, move through states, delete', async () => {
  const u = await newUser('u');
  const t = (await api('POST', '/api/tasks', { token: u.token, body: { title: 'ship', priority: 'high' } })).body.data.task;
  assert.equal((await api('PUT', `/api/tasks/${t.id}`, { token: u.token, body: { status: 'in_progress' } })).status, 200);
  assert.equal((await api('PUT', `/api/tasks/${t.id}`, { token: u.token, body: { status: 'nope' } })).status, 400);
  assert.equal((await api('GET', `/api/tasks/${t.id}`, { token: u.token })).body.data.task.status, 'in_progress');
  assert.equal((await api('DELETE', `/api/tasks/${t.id}`, { token: u.token })).status, 200);
  assert.equal((await api('GET', `/api/tasks/${t.id}`, { token: u.token })).status, 404);
});

test('TC-TASK-002 invalid priority / date / title type are 4xx', async () => {
  const u = await newUser('u');
  for (const body of [{ title: 'a', priority: 'mega' }, { title: 'a', dueDate: 'soon' }, { title: 123 }, { title: '  ' }]) {
    const r = await api('POST', '/api/tasks', { token: u.token, body });
    assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(body)} -> ${r.status} ${r.body?.data?.task?.priority ?? r.body?.error}`);
  }
});

test('TC-TASK-003 summary counts match the task list', async () => {
  const u = await newUser('u');
  await api('POST', '/api/tasks', { token: u.token, body: { title: 'one', dueDate: '2001-01-01' } });
  await api('POST', '/api/tasks', { token: u.token, body: { title: 'two' } });
  const r = await api('GET', '/api/tasks/stats/summary', { token: u.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, { todo: 2, inProgress: 0, done: 0, overdue: 1 });
});

// ---------- files ----------
test('TC-FILE-001 upload, list, download, trash, restore', async () => {
  const u = await newUser('u');
  const name = 'résumé & notes (1).txt';
  const up = await api('POST', '/api/files/upload', { token: u.token, form: fileForm('file', name, 'hello', 'text/plain') });
  assert.equal(up.status, 201);
  const f = up.body.data.file;
  const dl = await api('GET', `/api/files/${f.id}/download`, { token: u.token });
  assert.equal(dl.text, 'hello');
  assert.equal((await api('DELETE', `/api/files/${f.id}`, { token: u.token })).status, 200);
  assert.equal((await api('GET', `/api/files/${f.id}/download`, { token: u.token })).status, 404);
  assert.equal((await api('PUT', `/api/files/${f.id}/restore`, { token: u.token })).status, 200);
  assert.equal((await api('GET', '/api/files', { token: u.token })).body.data.files.length, 1);
});

test('TC-FILE-002 non-ASCII filenames are preserved', async () => {
  const u = await newUser('u');
  const name = 'résumé-हिन्दी.txt';
  const up = await api('POST', '/api/files/upload', { token: u.token, form: fileForm('file', name, 'x', 'text/plain') });
  assert.equal(up.body.data.file.originalName, name);
});

test('TC-FILE-003 a file over the size limit is refused with 413/400, not 500', async () => {
  const u = await newUser('u');
  const big = Buffer.alloc(51 * 1024 * 1024);
  const r = await api('POST', '/api/files/upload', { token: u.token, form: fileForm('file', 'big.bin', big) });
  assert.ok([400, 413].includes(r.status), `got ${r.status} ${r.text.slice(0, 200)}`);
});

test('TC-FILE-004 uploaded HTML is served with a sandboxing CSP', async () => {
  const u = await newUser('u');
  const up = await api('POST', '/api/files/upload', { token: u.token, form: fileForm('file', 'x.html', '<script>alert(1)</script>', 'text/html') });
  const r = await api('GET', up.body.data.file.url, { token: u.token });
  assert.match(r.headers.get('content-security-policy') || '', /sandbox/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('TC-FILE-005 avatar accepts real images only', async () => {
  const u = await newUser('u');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  assert.equal((await api('POST', '/api/auth/profile/avatar', { token: u.token, form: fileForm('avatar', 'a.png', png, 'image/png') })).status, 200);
  assert.equal((await api('POST', '/api/auth/profile/avatar', { token: u.token, form: fileForm('avatar', 'a.png', '<svg onload=alert(1)>', 'image/png') })).status, 400);
});

// ---------- polls / Q&A / breakout ----------
const poll = async (host, meeting, extra = {}) =>
  (await api('POST', '/api/polls', { token: host.token, body: { meetingId: meeting.id, question: 'Q', options: ['a', 'b'], ...extra } })).body.data.poll;
const results = async (host, id) => (await api('GET', `/api/polls/${id}/results`, { token: host.token })).body.data.poll;

test('TC-POLL-001 vote once; second vote refused; counts persist', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); await join(g, m.roomId);
  const p = await poll(h, m);
  const vote = () => api('POST', `/api/polls/${p.id}/vote`, { token: g.token, body: { optionIds: [p.options[0].id] } });
  assert.equal((await vote()).status, 200);
  assert.equal((await vote()).status, 400);
  assert.equal((await results(h, p.id)).options[0].votes, 1);
});

test('TC-POLL-002 one voter cannot stack votes by repeating an option id', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  const p = await poll(h, m, { allowMultiple: true });
  await api('POST', `/api/polls/${p.id}/vote`, { token: h.token, body: { optionIds: Array(10).fill(p.options[0].id) } });
  const votes = (await results(h, p.id)).options[0].votes;
  assert.ok(votes <= 1, `one user recorded ${votes} votes on one option`);
});

test('TC-POLL-003 unknown option id is rejected, not counted', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  const p = await poll(h, m);
  const r = await api('POST', `/api/polls/${p.id}/vote`, { token: h.token, body: { optionIds: ['nope'] } });
  assert.equal(r.status, 400, `got ${r.status}, totalVotes=${r.body?.data?.poll?.totalVotes}`);
});

test('TC-POLL-004 simultaneous votes are all counted', async () => {
  const h = await newUser('h');
  const voters = await Promise.all(Array.from({ length: 15 }, () => newUser('v')));
  const m = await newMeeting(h);
  await Promise.all(voters.map((v) => join(v, m.roomId)));
  const p = await poll(h, m);
  const rs = await Promise.all(voters.map((v) => api('POST', `/api/polls/${p.id}/vote`, { token: v.token, body: { optionIds: [p.options[0].id] } })));
  assert.equal(rs.filter((r) => r.status === 200).length, 15);
  const votes = (await results(h, p.id)).options[0].votes;
  assert.equal(votes, 15, `${votes} of 15 accepted votes were stored`);
});

test('TC-POLL-005 poll without options is a 4xx', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  const r = await api('POST', '/api/polls', { token: h.token, body: { meetingId: m.id, question: 'Q' } });
  assert.ok(r.status >= 400 && r.status < 500, `got ${r.status} ${r.body?.error}`);
});

test('TC-QA-001 ask, upvote, answer; only managers answer', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); await join(g, m.roomId);
  const q = (await api('POST', '/api/qa', { token: g.token, body: { meetingId: m.id, question: 'when?' } })).body.data.question;
  assert.equal((await api('PUT', `/api/qa/${q.id}/upvote`, { token: h.token })).status, 200);
  assert.equal((await api('PUT', `/api/qa/${q.id}/answer`, { token: g.token, body: { answer: 'x' } })).status, 403);
  assert.equal((await api('PUT', `/api/qa/${q.id}/answer`, { token: h.token, body: { answer: 'now' } })).status, 200);
  const list = (await api('GET', `/api/qa/meeting/${m.id}`, { token: g.token })).body.data.questions;
  assert.equal(list[0].answer, 'now');
  assert.equal(list[0].upvoteCount, 1);
});

test('TC-BRK-001 create rooms, only assigned person sees and joins theirs, close all', async () => {
  const h = await newUser('h'); const g = await newUser('g'); const o = await newUser('o');
  const m = await newMeeting(h); await join(g, m.roomId); await join(o, m.roomId);
  const r = await api('POST', '/api/breakout', { token: h.token, body: { meetingId: m.id, rooms: [{ name: 'One', participantIds: [g.id] }] } });
  assert.equal(r.status, 201);
  const room = r.body.data.breakoutRooms[0];
  assert.equal((await api('GET', `/api/breakout/meeting/${m.id}`, { token: g.token })).body.data.breakoutRooms.length, 1);
  assert.equal((await api('GET', `/api/breakout/meeting/${m.id}`, { token: o.token })).body.data.breakoutRooms.length, 0);
  assert.equal((await join(g, room.joinRoomId)).status, 200);
  assert.equal((await join(o, room.joinRoomId)).status, 403);
  assert.equal((await api('POST', '/api/breakout/close-all', { token: h.token, body: { meetingId: m.id } })).status, 200);
  assert.equal((await join(g, room.joinRoomId)).status, 403);
});

// ---------- role permissions ----------
test('TC-ROLE-001 a "Guest" role user cannot send messages through any channel', async () => {
  const admin = await adminToken();
  const roles = (await api('GET', '/api/admin/roles', { token: admin })).body.data.roles;
  const guestRole = roles.find((r) => r.name === 'Guest');
  const g = await newUser('guest'); const other = await newUser('o');
  const c = await newDm(g, other);
  const t = await newTeam(g);
  const m = await newMeeting(other);
  assert.equal((await api('PUT', `/api/admin/users/${g.id}/role`, { token: admin, body: { roleId: guestRole.id } })).status, 200);
  assert.equal((await api('POST', '/api/meetings', { token: g.token, body: {} })).status, 403, 'control: create meeting is blocked');
  const dm = await api('POST', `/api/conversations/${c}/messages`, { token: g.token, body: { content: 'x' } });
  const team = await api('POST', `/api/chat/team/${t.id}/messages`, { token: g.token, body: { content: 'x' } });
  const meet = await api('POST', `/api/chat/${m.roomId}/messages`, { token: g.token, body: { content: 'x' } });
  assert.deepEqual([dm.status, team.status, meet.status], [403, 403, 403], `dm=${dm.status} team=${team.status} meetingChat=${meet.status}`);
});
