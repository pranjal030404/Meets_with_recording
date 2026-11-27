/**
 * Wrong-typed input on every REST write route and list query. A 4xx or a 2xx that ignores the value is fine;
 * a 5xx means unchecked input reached the code or the database. Reads must still work afterwards, so a
 * value that was wrongly stored shows up too. Run against a disposable server (QA_BASE_URL).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { api, newUser, newMeeting, newTeam, addMember, newDm, sendDm, adminToken, uid, join } from './helpers.js';

const routesDir = new URL('../../src/routes/', import.meta.url);

// every name any route reads from req.body, taken from the source so new fields are covered automatically
const FIELDS = [...new Set(fs.readdirSync(routesDir).flatMap((file) => {
  const src = fs.readFileSync(new URL(file, routesDir), 'utf8');
  const names = [...src.matchAll(/req\.body(?:\?)?\.([A-Za-z_]\w*)/g)].map((m) => m[1]);
  for (const m of src.matchAll(/\{([^{}]*)\}\s*=\s*req\.body/g)) {
    names.push(...m[1].split(',').map((s) => s.trim().split(/[:=]/)[0].trim()).filter((s) => /^[A-Za-z_]\w*$/.test(s)));
  }
  return names;
}))];

const SHAPES = {
  object: { a: { b: 1 } },
  array: [{ a: 1 }, 'x', null],
  number: 987654321012,
  boolean: true,
  null: null,
  long: 'x'.repeat(70000),
};

const state = {};

test.before(async () => {
  const owner = await newUser('fzo');
  const peer = await newUser('fzp');
  const meeting = await newMeeting(owner);
  await join(owner, meeting.roomId);
  const team = await newTeam(owner);
  await addMember(owner, team, peer);
  const conversationId = await newDm(owner, peer);
  const message = await sendDm(owner, conversationId, 'hello');
  const post = async (path, body, token = owner.token) => (await api('POST', path, { token, body })).body;
  const task = await post('/api/tasks', { title: `task ${uid()}` });
  const poll = await post('/api/polls', { meetingId: meeting.id, roomId: meeting.roomId, question: 'q?', options: ['a', 'b'] });
  const question = await post('/api/qa', { meetingId: meeting.id, roomId: meeting.roomId, question: 'why?' });
  const idIn = (r) => r?.id || r?.data?.id || r?.data?.task?.id || r?.data?.poll?.id || r?.data?.question?.id
    || r?.task?.id || r?.poll?.id || r?.question?.id || 'missing';
  Object.assign(state, {
    owner, peer, meeting, team, conversationId, messageId: message?.id,
    taskId: idIn(task), pollId: idIn(poll), questionId: idIn(question), admin: await adminToken(),
  });
});

const writeRoutes = () => {
  const { meeting: m, team: t, conversationId: c, messageId, peer, taskId, pollId, questionId } = state;
  const user = [
    ['PUT', '/api/auth/profile'], ['PUT', '/api/auth/status'], ['POST', '/api/auth/change-password/code'],
    ['POST', '/api/auth/change-password'],
    ['POST', '/api/meetings'], ['POST', `/api/meetings/${m.roomId}/join`], ['PUT', `/api/meetings/${m.roomId}/schedule`],
    ['PUT', `/api/meetings/${m.roomId}/settings`], ['POST', `/api/meetings/${m.roomId}/invite`],
    ['PUT', `/api/meetings/${m.roomId}/respond`], ['POST', `/api/meetings/${m.roomId}/complete-transcript`],
    ['POST', `/api/chat/${m.roomId}/messages`], ['POST', `/api/chat/messages/${messageId}/react`],
    ['POST', `/api/chat/team/${t.id}/messages`],
    ['POST', '/api/teams'], ['PUT', `/api/teams/${t.id}`], ['POST', `/api/teams/${t.id}/invite`],
    ['PUT', `/api/teams/${t.id}/members/${peer.id}/role`], ['PUT', `/api/teams/${t.id}/members/${state.owner.id}/notifications`],
    ['POST', `/api/teams/${t.id}/channels`],
    ['POST', '/api/conversations'], ['POST', `/api/conversations/${c}/messages`], ['PUT', `/api/conversations/${c}/mute`],
    ['PUT', `/api/conversations/${c}/read`], ['POST', `/api/conversations/${c}/members`],
    ['POST', '/api/tasks'], ['PUT', `/api/tasks/${taskId}`], ['POST', `/api/tasks/${taskId}/subtasks`],
    ['POST', '/api/polls'], ['POST', `/api/polls/${pollId}/vote`], ['PUT', `/api/polls/${pollId}/start`],
    ['POST', '/api/qa'], ['PUT', `/api/qa/${questionId}/upvote`], ['PUT', `/api/qa/${questionId}/answer`],
    ['POST', '/api/breakout'], ['POST', '/api/breakout/close-all'],
    ['POST', '/api/subscriptions/subscribe'], ['POST', '/api/ai/summarize'], ['POST', '/api/ai/translate'],
    ['POST', `/api/ai/meetings/${m.roomId}/summary`],
  ].map(([method, path]) => ({ method, path, token: state.owner.token }));
  const anonymous = ['signup', 'login', 'verify-email', 'resend-verification', 'forgot-password', 'reset-password']
    .map((name) => ({ method: 'POST', path: `/api/auth/${name}` }));
  const admin = [
    ['POST', '/api/admin/auth/login'], ['POST', '/api/admin/roles'], ['POST', '/api/admin/users'],
    ['PUT', `/api/admin/users/${peer.id}/role`], ['PUT', `/api/admin/users/${peer.id}/status`],
    ['PUT', `/api/admin/users/${peer.id}/profile`], ['POST', '/api/admin/admins'], ['PUT', '/api/admin/settings'],
    ['POST', '/api/admin/settings/test-email'],
  ].map(([method, path]) => ({ method, path, token: state.admin }));
  return [...anonymous, ...user, ...admin];
};

test('wrong-typed bodies never cause a server error', async () => {
  assert.ok(FIELDS.length > 40, `only ${FIELDS.length} body fields found: has the extraction broken?`);
  const failures = [];
  let sent = 0;
  for (const route of writeRoutes()) {
    const bodies = Object.entries(SHAPES).map(([shape, value]) => [shape, Object.fromEntries(FIELDS.map((f) => [f, value]))]);
    bodies.push(['top-level array', [1, 2]], ['broken json', '{"a":']);
    for (const [shape, body] of bodies) {
      const r = await api(route.method, route.path, { token: route.token, body });
      sent++;
      if (r.status >= 500 && r.status !== 503) failures.push(`${route.method} ${route.path} [${shape}] ${r.status} ${r.text.slice(0, 160)}`);
    }
  }
  console.log(`# ${sent} wrong-typed requests, ${FIELDS.length} fields`);
  assert.deepEqual(failures, []);
});

test('one wrong-typed field among valid ones never causes a server error', async () => {
  const { owner, meeting, team, conversationId, taskId } = state;
  const cases = [
    ['POST', '/api/meetings', { title: 'ok' }, ['description', 'scheduledAt', 'duration', 'invitees', 'settings', 'teamId', 'type', 'recurrence', 'password', 'timezone']],
    ['PUT', `/api/meetings/${meeting.roomId}/settings`, {}, ['settings']],
    ['POST', '/api/teams', { name: 'ok team' }, ['description', 'settings']],
    ['PUT', `/api/teams/${team.id}`, {}, ['name', 'description', 'settings']],
    ['POST', `/api/teams/${team.id}/channels`, { name: 'ok' }, ['description', 'type']],
    ['POST', '/api/tasks', { title: 'ok' }, ['description', 'status', 'priority', 'dueDate', 'assigneeId', 'teamId', 'meetingId', 'tags']],
    ['PUT', `/api/tasks/${taskId}`, {}, ['title', 'description', 'status', 'priority', 'dueDate', 'assigneeId', 'tags']],
    ['POST', `/api/conversations/${conversationId}/messages`, { content: 'ok' }, ['type', 'replyTo', 'replyToId', 'attachments', 'mentions']],
    ['PUT', '/api/auth/profile', {}, ['name', 'phone', 'title', 'bio', 'department', 'location', 'timezone', 'preferences', 'avatar']],
  ];
  const failures = [];
  for (const [method, path, valid, fields] of cases) {
    for (const field of fields) {
      for (const [shape, value] of Object.entries(SHAPES)) {
        const r = await api(method, path, { token: owner.token, body: { ...valid, [field]: value } });
        if (r.status >= 500 && r.status !== 503) failures.push(`${method} ${path} ${field}=${shape} ${r.status} ${r.text.slice(0, 160)}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('odd query strings never cause a server error', async () => {
  const { owner, team, conversationId, meeting } = state;
  const paths = ['/api/meetings', '/api/search', '/api/tasks', '/api/files', '/api/notifications', '/api/conversations',
    '/api/conversations/people/search', `/api/conversations/${conversationId}/messages`, `/api/chat/${meeting.roomId}/messages`,
    `/api/chat/team/${team.id}/messages`, '/api/messages/saved', '/api/messages/pinned', '/api/subscriptions/payments'];
  const names = ['q', 'search', 'type', 'status', 'scope', 'teamId', 'page', 'limit', 'before', 'cursor', 'from', 'to', 'filter', 'role'];
  const values = [(n) => `${n}[a]=1`, (n) => `${n}=1&${n}=2`, (n) => `${n}=-1`, (n) => `${n}=${'9'.repeat(40)}`, (n) => `${n}=%00%27%22`];
  const failures = [];
  for (const path of paths) {
    for (const value of values) {
      const r = await api('GET', `${path}?${names.map(value).join('&')}`, { token: owner.token });
      if (r.status >= 500) failures.push(`GET ${path}?${value('x')} ${r.status} ${r.text.slice(0, 160)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('reads still work after all of the above', async () => {
  const { owner, peer, team, meeting, conversationId } = state;
  const failures = [];
  const paths = ['/api/auth/me', '/api/meetings', `/api/meetings/${meeting.roomId}`, '/api/teams', `/api/teams/${team.id}`,
    '/api/tasks', '/api/tasks/stats/summary', '/api/conversations', `/api/conversations/${conversationId}/messages`,
    `/api/search?q=ok`, '/api/files', '/api/notifications', `/api/polls/meeting/${meeting.id}`, `/api/qa/meeting/${meeting.id}`];
  for (const user of [owner, peer]) {
    for (const path of paths) {
      const r = await api('GET', path, { token: user.token });
      if (r.status >= 500) failures.push(`${user === owner ? 'owner' : 'peer'} GET ${path} ${r.status} ${r.text.slice(0, 160)}`);
    }
  }
  const admin = await adminToken();
  for (const path of ['/api/admin/overview', '/api/admin/users', '/api/admin/roles', '/api/admin/settings', '/api/admin/meetings', '/api/admin/audit-logs']) {
    const r = await api('GET', path, { token: admin });
    if (r.status >= 500) failures.push(`admin GET ${path} ${r.status} ${r.text.slice(0, 160)}`);
  }
  assert.deepEqual(failures, []);
});
