import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, newMeeting, newTeam, addMember, getMeeting, join, uid, fileForm } from './helpers.js';

const future = (days = 2) => new Date(Date.now() + days * 86400000).toISOString();

test('TC-MTG-001 instant meeting is active and host is present', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  assert.equal(m.status, 'active');
  assert.ok(m.participants[0].joinedAt);
});

test('TC-MTG-002 scheduled meeting stores title, time and invitee', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const at = future();
  const m = await newMeeting(h, { title: 'Planning', scheduledAt: at, invitees: [{ email: g.email }] });
  const saved = await getMeeting(h, m.roomId);
  assert.equal(saved.title, 'Planning');
  assert.equal(saved.status, 'scheduled');
  assert.ok(Math.abs(new Date(saved.scheduledAt) - new Date(at)) < 1000);
  assert.deepEqual(saved.inviteeIds, [g.id]);
  const n = await api('GET', '/api/notifications', { token: g.token });
  assert.ok(n.body.data.notifications.some((x) => x.type === 'meeting_scheduled'));
});

test('TC-MTG-003 invalid scheduledAt is rejected with 4xx', async () => {
  const h = await newUser('h');
  const r = await api('POST', '/api/meetings', { token: h.token, body: { scheduledAt: 'tomorrow-ish' } });
  assert.ok(r.status >= 400 && r.status < 500, `got ${r.status}: ${r.body?.error || r.body?.data?.meeting?.scheduledAt}`);
});

test('TC-MTG-004 a meeting cannot be scheduled in the past', async () => {
  const h = await newUser('h');
  const r = await api('POST', '/api/meetings', { token: h.token, body: { scheduledAt: '2001-01-01T10:00:00Z' } });
  assert.equal(r.status, 400, `past date accepted with ${r.status}`);
});

test('TC-MTG-005 over-long title is a 4xx validation error', async () => {
  const h = await newUser('h');
  const r = await api('POST', '/api/meetings', { token: h.token, body: { title: 'x'.repeat(1000) } });
  assert.ok(r.status >= 400 && r.status < 500, `got ${r.status} ${r.body?.error}`);
});

test('TC-MTG-006 recurring meeting creates one row per date', async () => {
  const h = await newUser('h');
  const dates = [future(1), future(8), future(15)];
  const m = await newMeeting(h, { scheduledAt: dates[0], recurrence: { frequency: 'weekly', dates } });
  const r = await api('GET', '/api/meetings?limit=50', { token: h.token });
  assert.equal(r.body.data.meetings.filter((x) => x.recurrence?.seriesId === m.recurrence.seriesId).length, 3);
  const next = await api('GET', '/api/meetings?limit=50&series=next', { token: h.token });
  assert.equal(next.body.data.meetings.length, 1);
});

test('TC-MTG-007 recurrence with bad frequency / unordered / too many dates is rejected', async () => {
  const h = await newUser('h');
  for (const recurrence of [
    { frequency: 'hourly', dates: [future(1), future(2)] },
    { frequency: 'daily', dates: [future(2), future(1)] },
    { frequency: 'daily', dates: Array.from({ length: 53 }, (_, i) => future(i + 1)) },
  ]) {
    const r = await api('POST', '/api/meetings', { token: h.token, body: { scheduledAt: recurrence.dates[0], recurrence } });
    assert.equal(r.status, 400);
  }
});

test('TC-MTG-008 pagination parameters are validated (no 500, bounded page size)', async () => {
  const h = await newUser('h');
  for (const q of ['limit=-1', 'limit=abc', 'page=0', 'page=-5']) {
    const r = await api('GET', `/api/meetings?${q}`, { token: h.token });
    assert.ok(r.status < 500, `?${q} -> ${r.status} ${r.body?.error}`);
  }
});

test('TC-MTG-009 invitee can accept; accepted state persists', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, { scheduledAt: future(), invitees: [{ userId: g.id }] });
  assert.equal((await api('PUT', `/api/meetings/${m.roomId}/respond`, { token: g.token, body: { status: 'accepted' } })).status, 200);
  assert.equal((await getMeeting(h, m.roomId)).invitees[0].status, 'accepted');
});

test('TC-MTG-010 guest cannot enter before the start time', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, { scheduledAt: future() });
  assert.equal((await join(g, m.roomId)).body.code, 'MEETING_NOT_STARTED');
});

test('TC-MTG-011 a host who joins a scheduled meeting is recorded as joined (persisted)', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h, { scheduledAt: future() });
  assert.equal((await join(h, m.roomId)).status, 200);
  const entry = (await getMeeting(h, m.roomId)).participants.find((p) => p.userId === h.id);
  assert.ok(entry.joinedAt, 'host joinedAt was not saved to the database');
});

test('TC-MTG-012 "host must join first": guests can enter once the host has joined a scheduled meeting', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, { scheduledAt: new Date(Date.now() + 3000).toISOString(), settings: { hostMustJoinFirst: true } });
  await new Promise((r) => setTimeout(r, 3500));
  assert.equal((await join(h, m.roomId)).status, 200);
  const r = await join(g, m.roomId);
  assert.equal(r.status, 200, `guest refused after host joined: ${r.body?.message}`);
});

test('TC-MTG-013 accepted invitee who then joins is recorded as joined', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, { scheduledAt: new Date(Date.now() + 2000).toISOString(), invitees: [{ userId: g.id }] });
  await api('PUT', `/api/meetings/${m.roomId}/respond`, { token: g.token, body: { status: 'accepted' } });
  await new Promise((r) => setTimeout(r, 2500));
  await join(g, m.roomId);
  assert.ok((await getMeeting(h, m.roomId)).participants.find((p) => p.userId === g.id).joinedAt);
});

test('TC-MTG-014 only the host/co-host can end, cancel, edit or invite', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h, { scheduledAt: future() });
  const calls = [['POST', 'end'], ['PUT', 'cancel'], ['PUT', 'settings'], ['PUT', 'schedule'], ['POST', 'invite']];
  for (const [method, p] of calls) {
    const r = await api(method, `/api/meetings/${m.roomId}/${p}`, { token: o.token, body: { title: 'x', invitees: [] } });
    assert.equal(r.status, 403, `${method} ${p} -> ${r.status}`);
  }
});

test('TC-MTG-015 end is idempotent; ended meeting cannot be joined or cancelled', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  assert.equal((await api('POST', `/api/meetings/${m.roomId}/end`, { token: h.token })).status, 200);
  assert.equal((await api('POST', `/api/meetings/${m.roomId}/end`, { token: h.token })).status, 200);
  assert.equal((await join(h, m.roomId)).body.code, 'MEETING_ENDED');
  assert.equal((await api('PUT', `/api/meetings/${m.roomId}/cancel`, { token: h.token })).status, 400);
});

test('TC-MTG-016 edit and cancel a scheduled meeting persist and notify', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, { scheduledAt: future(), invitees: [{ userId: g.id }] });
  const at = future(5);
  assert.equal((await api('PUT', `/api/meetings/${m.roomId}/schedule`, { token: h.token, body: { title: 'Moved', dates: [at] } })).status, 200);
  assert.equal((await getMeeting(h, m.roomId)).title, 'Moved');
  assert.equal((await api('PUT', `/api/meetings/${m.roomId}/cancel`, { token: h.token })).status, 200);
  assert.equal((await getMeeting(h, m.roomId)).status, 'cancelled');
  const n = (await api('GET', '/api/notifications', { token: g.token })).body.data.notifications.map((x) => x.title);
  assert.ok(n.includes('Meeting time changed') && n.includes('Meeting Cancelled'));
});

test('TC-MTG-017 participant limit is enforced on join', async () => {
  const h = await newUser('h'); const a = await newUser('a'); const b = await newUser('b');
  const m = await newMeeting(h, { settings: { maxParticipants: 2 } });
  assert.equal((await join(a, m.roomId)).status, 200);
  assert.equal((await join(b, m.roomId)).status, 400);
});

test('TC-MTG-018 locked meeting refuses new people on REST join', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h, { settings: { isLocked: true } });
  const r = await join(o, m.roomId);
  assert.notEqual(r.status, 200, 'REST join succeeded on a locked meeting and added the user to participantIds');
});

test('TC-MTG-019 waiting-room guest is not made a participant before admission', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h, { settings: { waitingRoom: true } });
  await join(o, m.roomId);
  const saved = await getMeeting(h, m.roomId);
  assert.ok(!saved.participantIds.includes(o.id), 'un-admitted guest is already in participantIds (grants recording/transcript access)');
});

test('TC-MTG-020 restricted meeting (trusted, no link requests) refuses outsiders on REST join', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h, { settings: { accessType: 'trusted', allowLinkRequests: false } });
  assert.equal((await join(o, m.roomId)).status, 403);
});

test('TC-MTG-021 an outsider cannot read the details of a restricted meeting', async () => {
  const h = await newUser('h'); const g = await newUser('g'); const o = await newUser('o');
  const m = await newMeeting(h, { title: 'Board only', description: 'confidential agenda', invitees: [{ userId: g.id }], settings: { allowLinkRequests: false } });
  const r = await api('GET', `/api/meetings/${m.roomId}`, { token: o.token });
  assert.ok(r.status === 403 || r.status === 404, `outsider got ${r.status} incl. emails: ${r.text.includes(h.email)}; description: ${r.text.includes('confidential agenda')}`);
});

test('TC-MTG-022 someone removed from a team no longer sees team meetings', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const t = await newTeam(h); await addMember(h, t, g);
  assert.equal((await api('GET', `/api/meetings/team/${t.id}`, { token: g.token })).status, 200);
  await api('DELETE', `/api/teams/${t.id}/members/${g.id}`, { token: h.token });
  assert.equal((await api('GET', `/api/meetings/team/${t.id}`, { token: g.token })).status, 403);
});

test('TC-MTG-023 twenty simultaneous joins are all recorded', async () => {
  const h = await newUser('h');
  const guests = await Promise.all(Array.from({ length: 20 }, () => newUser('c')));
  const m = await newMeeting(h);
  const rs = await Promise.all(guests.map((g) => join(g, m.roomId)));
  assert.equal(rs.filter((r) => r.status === 200).length, 20);
  const saved = await getMeeting(h, m.roomId);
  assert.equal(saved.participantIds.length, 21, `only ${saved.participantIds.length - 1} of 20 joins were persisted`);
});

test('TC-MTG-024 simultaneous joins cannot exceed the participant limit', async () => {
  const h = await newUser('h');
  const guests = await Promise.all(Array.from({ length: 8 }, () => newUser('c')));
  const m = await newMeeting(h, { settings: { maxParticipants: 3 } });
  const rs = await Promise.all(guests.map((g) => join(g, m.roomId)));
  const admitted = rs.filter((r) => r.status === 200).length;
  assert.ok(admitted <= 2, `${admitted} guests were admitted to a meeting limited to 3 including the host`);
});

test('TC-MTG-025 a participant can upload a recording; outsiders cannot', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h);
  const bad = await api('POST', `/api/meetings/${m.roomId}/recordings`, { token: o.token, form: fileForm('recording', 'x.webm', 'abc', 'video/webm', { duration: '60' }) });
  assert.equal(bad.status, 403);
  const ok = await api('POST', `/api/meetings/${m.roomId}/recordings`, { token: h.token, form: fileForm('recording', 'r.webm', 'abc', 'video/webm', { duration: '60' }) });
  assert.equal(ok.status, 201, ok.text);
  const file = await api('GET', ok.body.data.recording.url, { token: h.token });
  assert.equal(file.status, 200);
  assert.equal((await api('GET', ok.body.data.recording.url, { token: o.token })).status, 403);
  assert.equal((await api('GET', ok.body.data.recording.url)).status, 401);
});

test('TC-MTG-026 recording responses do not disclose server filesystem paths', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  const r = await api('POST', `/api/meetings/${m.roomId}/recordings`, { token: h.token, form: fileForm('recording', 'r.webm', 'abc', 'video/webm') });
  assert.ok(!('path' in r.body.data.recording), `response contains ${r.body.data.recording.path}`);
});

test('TC-MTG-027 search finds own meeting but not another user\'s', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const key = `zebra${uid()}`;
  await newMeeting(a, { title: key });
  const mine = await api('GET', `/api/search?q=${key}&type=meetings`, { token: a.token });
  const theirs = await api('GET', `/api/search?q=${key}&type=meetings`, { token: b.token });
  assert.equal(mine.body.data.results.meetings.length, 1);
  assert.equal(theirs.body.data.results.meetings.length, 0);
});
