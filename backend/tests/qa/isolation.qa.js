/** Isolation between teams / users. "Team A" and "Team B" are the closest thing this product has to tenants. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, newMeeting, newTeam, addMember, getTeam, join, newDm, sendDm, uid, fileForm } from './helpers.js';

let A, A2, B, B2, teamA, teamB, dmA, secret, secretMsg;
test.before(async () => {
  [A, A2, B, B2] = await Promise.all(['alice', 'amy', 'bob', 'ben'].map((n) => newUser(n)));
  teamA = await newTeam(A); await addMember(A, teamA, A2);
  teamB = await newTeam(B); await addMember(B, teamB, B2);
  dmA = await newDm(A, A2);
  secret = `payroll-${uid()}`;
  secretMsg = await sendDm(A, dmA, secret);
});

test('TC-ISO-001 outsider cannot read another team, its messages, meetings, tasks or files', async () => {
  for (const p of [`/api/teams/${teamA.id}`, `/api/chat/team/${teamA.id}/messages`, `/api/meetings/team/${teamA.id}`,
    `/api/tasks?scope=team&teamId=${teamA.id}`, `/api/files?scope=team&teamId=${teamA.id}`, `/api/messages/pinned?teamId=${teamA.id}`]) {
    assert.equal((await api('GET', p, { token: B.token })).status, 403, p);
  }
});

test('TC-ISO-002 outsider cannot post into or change another team', async () => {
  const calls = [
    ['POST', `/api/chat/team/${teamA.id}/messages`, { content: 'hi' }],
    ['PUT', `/api/teams/${teamA.id}`, { name: 'pwned' }],
    ['DELETE', `/api/teams/${teamA.id}`],
    ['POST', `/api/teams/${teamA.id}/channels`, { name: 'x' }],
    ['POST', `/api/teams/${teamA.id}/regenerate-code`],
    ['PUT', `/api/teams/${teamA.id}/members/${A2.id}/role`, { role: 'guest' }],
    ['DELETE', `/api/teams/${teamA.id}/members/${A2.id}`],
    ['POST', '/api/tasks', { title: 't', teamId: teamA.id }],
    ['POST', '/api/meetings', { teamId: teamA.id }],
  ];
  for (const [m, p, body] of calls) assert.equal((await api(m, p, { token: B.token, body })).status, 403, `${m} ${p}`);
});

test('TC-ISO-003 outsider cannot read or send in someone else\'s direct message', async () => {
  assert.equal((await api('GET', `/api/conversations/${dmA}/messages`, { token: B.token })).status, 403);
  assert.equal((await api('POST', `/api/conversations/${dmA}/messages`, { token: B.token, body: { content: 'x' } })).status, 403);
  assert.equal((await api('GET', `/api/messages/${secretMsg.id}/thread`, { token: B.token })).status, 403);
});

test('TC-ISO-004 outsider cannot read a private message by FORWARDING it by id', async () => {
  const own = await newDm(B, B2);
  const r = await api('POST', `/api/messages/${secretMsg.id}/forward`, { token: B.token, body: { conversationId: own } });
  assert.ok(r.status === 403 || r.status === 404, `${r.status}: forwarded content disclosed=${r.text.includes(secret)}`);
});

test('TC-ISO-005 outsider cannot read a private message by SAVING it by id', async () => {
  await api('POST', `/api/messages/${secretMsg.id}/save`, { token: B.token });
  const r = await api('GET', '/api/messages/saved', { token: B.token });
  assert.ok(!r.text.includes(secret), 'private DM content is readable through /api/messages/saved');
});

test('TC-ISO-006 outsider cannot read/alter a private message through the meeting-chat react endpoint', async () => {
  const r = await api('POST', `/api/chat/messages/${secretMsg.id}/react`, { token: B.token, body: { emoji: '👀' } });
  assert.ok(r.status === 403 || r.status === 404, `${r.status}: content disclosed=${r.text.includes(secret)}`);
});

test('TC-ISO-007 outsider cannot read another meeting\'s chat', async () => {
  const m = await newMeeting(A, { settings: { allowLinkRequests: false } });
  const text = `confidential-${uid()}`;
  await api('POST', `/api/chat/${m.roomId}/messages`, { token: A.token, body: { content: text } });
  const r = await api('GET', `/api/chat/${m.roomId}/messages`, { token: B.token });
  assert.ok(r.status === 403 || !r.text.includes(text), `outsider read meeting chat (${r.status})`);
});

test('TC-ISO-008 outsider cannot write into another meeting\'s chat', async () => {
  const m = await newMeeting(A, { settings: { allowLinkRequests: false } });
  const r = await api('POST', `/api/chat/${m.roomId}/messages`, { token: B.token, body: { content: 'injected' } });
  assert.equal(r.status, 403, `outsider message accepted with ${r.status}`);
});

test('TC-ISO-009 private (1:1) meeting chat is not searchable by other participants', async () => {
  const h = await newUser('h'); const x = await newUser('x'); const y = await newUser('y');
  const m = await newMeeting(h); await join(x, m.roomId); await join(y, m.roomId);
  const text = `whisper${uid()}`;
  await api('POST', `/api/chat/${m.roomId}/messages`, { token: h.token, body: { content: text, recipientId: x.id } });
  const history = await api('GET', `/api/chat/${m.roomId}/messages`, { token: y.token });
  assert.ok(!history.text.includes(text), 'visible in history');
  const search = await api('GET', `/api/search?q=${text}&type=messages`, { token: y.token });
  assert.equal(search.body.data.results.messages.length, 0, 'private message between two others appears in third participant\'s search');
});

test('TC-ISO-010 outsider cannot see, vote in, or read another meeting\'s polls', async () => {
  const m = await newMeeting(A, { settings: { allowLinkRequests: false } });
  const p = (await api('POST', '/api/polls', { token: A.token, body: { meetingId: m.id, question: 'Layoffs?', options: ['yes', 'no'] } })).body.data.poll;
  const list = await api('GET', `/api/polls/meeting/${m.id}`, { token: B.token });
  const vote = await api('POST', `/api/polls/${p.id}/vote`, { token: B.token, body: { optionIds: [p.options[0].id] } });
  assert.deepEqual([list.status, vote.status], [403, 403], `list=${list.status} vote=${vote.status}`);
});

test('TC-ISO-011 outsider cannot read or post in another meeting\'s Q&A', async () => {
  const m = await newMeeting(A, { settings: { allowLinkRequests: false } });
  await api('POST', '/api/qa', { token: A.token, body: { meetingId: m.id, question: 'Is the merger on?' } });
  const list = await api('GET', `/api/qa/meeting/${m.id}`, { token: B.token });
  const post = await api('POST', '/api/qa', { token: B.token, body: { meetingId: m.id, question: 'spam' } });
  assert.deepEqual([list.status, post.status], [403, 403], `list=${list.status} post=${post.status}`);
});

test('TC-ISO-012 outsider cannot download or view another user\'s private file', async () => {
  const up = await api('POST', '/api/files/upload', { token: A.token, form: fileForm('file', 'salaries.txt', 'top secret', 'text/plain') });
  assert.equal(up.status, 201);
  const f = up.body.data.file;
  assert.equal((await api('GET', `/api/files/${f.id}/download`, { token: B.token })).status, 403);
  assert.equal((await api('GET', f.url, { token: B.token })).status, 403);
  assert.equal((await api('GET', f.url)).status, 401);
  assert.equal((await api('DELETE', `/api/files/${f.id}`, { token: B.token })).status, 403);
});

test('TC-ISO-013 outsider cannot read, edit or delete another team\'s task', async () => {
  const t = (await api('POST', '/api/tasks', { token: A.token, body: { title: 'A only', teamId: teamA.id } })).body.data.task;
  for (const m of ['GET', 'PUT', 'DELETE']) {
    assert.equal((await api(m, `/api/tasks/${t.id}`, { token: B.token, body: m === 'PUT' ? { title: 'x' } : undefined })).status, 403, m);
  }
});

test('TC-ISO-014 outsider cannot attach a subtask to another team\'s task by id', async () => {
  const t = (await api('POST', '/api/tasks', { token: A.token, body: { title: 'parent', teamId: teamA.id } })).body.data.task;
  const r = await api('POST', '/api/tasks', { token: B.token, body: { title: 'planted by outsider', parentId: t.id } });
  assert.equal(r.status, 403, `got ${r.status}`);
});

test('TC-ISO-015 a task cannot be assigned to a user outside the task\'s team via update', async () => {
  const t = (await api('POST', '/api/tasks', { token: A.token, body: { title: 'internal roadmap', teamId: teamA.id } })).body.data.task;
  const r = await api('PUT', `/api/tasks/${t.id}`, { token: A.token, body: { assigneeId: B.id } });
  assert.ok(r.status >= 400 && r.status < 500, `outsider assigned (${r.status})`);
});

test('TC-ISO-016 outsider cannot add themselves to a team that allows member invites', async () => {
  const t = await newTeam(A);
  await api('PUT', `/api/teams/${t.id}`, { token: A.token, body: { settings: { allowMemberInvite: true } } });
  const r = await api('POST', `/api/teams/${t.id}/invite`, { token: B.token, body: { email: B.email } });
  const members = (await getTeam(A, t.id)).members.map((m) => m.userId);
  assert.ok(!members.includes(B.id), `non-member added themselves (${r.status})`);
});

test('TC-ISO-017 a deleted team\'s content is no longer accessible', async () => {
  const t = await newTeam(A); await addMember(A, t, A2);
  await api('POST', `/api/chat/team/${t.id}/messages`, { token: A.token, body: { content: 'old' } });
  assert.equal((await api('DELETE', `/api/teams/${t.id}`, { token: A.token })).status, 200);
  const r = await api('GET', `/api/chat/team/${t.id}/messages`, { token: A2.token });
  assert.ok(r.status === 404 || r.status === 410 || r.status === 403, `deleted team chat still returns ${r.status}`);
});

test('TC-ISO-018 a user\'s public profile does not give unrelated users the full email address', async () => {
  const r = await api('GET', `/api/auth/users/${A.id}`, { token: B.token });
  assert.ok(!r.text.includes(A.email), 'full email returned to an unrelated user (people search masks it)');
});

test('TC-ISO-019 notifications are private to their recipient', async () => {
  const n = (await api('GET', '/api/notifications', { token: A2.token })).body.data.notifications[0];
  assert.ok(n, 'precondition: Amy has a notification');
  assert.equal((await api('PUT', `/api/notifications/${n.id}/read`, { token: B.token })).status, 403);
  assert.equal((await api('DELETE', `/api/notifications/${n.id}`, { token: B.token })).status, 403);
});

test('TC-ISO-020 global search never returns another team\'s data', async () => {
  // A fresh message: `secret` above may have been copied into Bob's own chat by TC-ISO-004 if forwarding leaks.
  const text = `untouched${uid()}`;
  await sendDm(A, dmA, text);
  await api('POST', '/api/tasks', { token: A.token, body: { title: text, teamId: teamA.id } });
  await api('POST', `/api/chat/team/${teamA.id}/messages`, { token: A.token, body: { content: text } });
  const r = await api('GET', `/api/search?q=${text}`, { token: B.token });
  assert.equal(r.status, 200);
  const hits = Object.values(r.body.data.results).reduce((n, list) => n + list.length, 0);
  assert.equal(hits, 0, JSON.stringify(r.body.data.results).slice(0, 300));
});
