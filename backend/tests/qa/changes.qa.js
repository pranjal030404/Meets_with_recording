/**
 * Regression tests for recent changes: commit 92f19dc (repeating meetings, editing, "take notes",
 * phone speech) and the uncommitted `?series=next` list change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, newMeeting, getMeeting, join, socket, enter, closeSockets, waitFor, got, sleep } from './helpers.js';

test.after(closeSockets);
const at = (hours) => new Date(Date.now() + hours * 3600e3).toISOString();
const days = (...d) => d.map((x) => at(x * 24));
const series = async (host, dates, extra = {}) => newMeeting(host, { scheduledAt: dates[0], recurrence: { frequency: 'daily', dates }, ...extra });
const list = async (u, qs = '') => (await api('GET', `/api/meetings?limit=200${qs}`, { token: u.token })).body.data;
const allOf = async (u, m) => (await list(u)).meetings.filter((x) => x.recurrence?.seriesId === m.recurrence.seriesId).sort((a, b) => a.recurrence.index - b.recurrence.index);
const notes = async (u) => (await api('GET', '/api/notifications', { token: u.token })).body.data.notifications;
const status = (r, code) => assert.equal(r.status, code, `HTTP ${r.status} ${r.text.slice(0, 300)}`);

test('TC-CHG-001 series=next keeps one date per series plus every one-off, with a matching total', async () => {
  const h = await newUser('h');
  await series(h, days(1, 2, 3)); await series(h, days(1.5, 8));
  await newMeeting(h, { scheduledAt: at(500) });
  const d = await list(h, '&series=next');
  assert.equal(d.meetings.length, 3);
  assert.equal(d.pagination.total, 3);
  assert.equal((await list(h)).meetings.length, 6, 'without the parameter every date is still returned');
});

test('TC-CHG-002 series=next is applied before paging, so a long series cannot push others off the page', async () => {
  const h = await newUser('h');
  await newMeeting(h, { scheduledAt: at(2), title: 'one-off' });
  await series(h, Array.from({ length: 52 }, (_, i) => at((i + 1) * 24)));
  const d = (await api('GET', '/api/meetings?limit=5&series=next', { token: h.token })).body.data;
  assert.deepEqual(d.meetings.map((m) => m.title).filter((t) => t === 'one-off'), ['one-off']);
});

test('TC-CHG-003 series=next: a date a few hours late does not hide the next; dates missed >12h are left out', async () => {
  const h = await newUser('h');
  await series(h, [at(-30), at(-3), at(21), at(45)]);
  const got2 = (await list(h, '&series=next')).meetings.map((m) => m.recurrence.index).sort();
  assert.deepEqual(got2, [2, 3]);
});

test('TC-CHG-004 series=next with a status filter and for an invitee', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  await series(h, days(1, 2, 3), { invitees: [{ userId: g.id }] });
  assert.equal((await list(g, '&series=next&status=scheduled')).meetings.length, 1);
  assert.equal((await list(h, '&series=next&status=ended')).meetings.length, 0);
});

test('TC-CHG-005 edit one date: only that date changes', async () => {
  const h = await newUser('h');
  const m = await series(h, days(1, 2, 3));
  const [, second] = await allOf(h, m);
  status(await api('PUT', `/api/meetings/${second.roomId}/schedule`, { token: h.token, body: { title: 'moved', dates: days(2.2), scope: 'one' } }), 200);
  assert.deepEqual((await allOf(h, m)).map((x) => x.title === 'moved'), [false, true, false]);
});

test('TC-CHG-006 edit scope=series: this and later dates change, earlier ones do not; invitees are told', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await series(h, days(1, 2, 3), { invitees: [{ userId: g.id }] });
  const [, second] = await allOf(h, m);
  const dates = await api('GET', `/api/meetings/${second.roomId}/series`, { token: h.token });
  status(dates, 200);
  assert.equal(dates.body.data.dates.length, 2);
  const moved = dates.body.data.dates.map((d) => new Date(new Date(d).getTime() + 3600e3).toISOString());
  const r = await api('PUT', `/api/meetings/${second.roomId}/schedule`, { token: h.token, body: { title: 'new', dates: moved, scope: 'series' } });
  status(r, 200);
  assert.equal(r.body.data.updated, 2);
  const after = await allOf(h, m);
  assert.deepEqual(after.map((x) => x.title === 'new'), [false, true, true]);
  assert.equal(new Date(after[2].scheduledAt).getTime(), Math.floor(new Date(moved[1]).getTime() / 1000) * 1000);
  assert.ok((await notes(g)).some((n) => n.title === 'Meeting time changed'));
});

test('TC-CHG-007 edit keeps settings it was not given', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h, { scheduledAt: at(24), settings: { waitingRoom: true, accessType: 'trusted' } });
  status(await api('PUT', `/api/meetings/${m.roomId}/schedule`, { token: h.token, body: { settings: { takeNotes: true } } }), 200);
  const s = (await getMeeting(h, m.roomId)).settings;
  assert.deepEqual([s.waitingRoom, s.accessType, s.takeNotes], [true, 'trusted', true]);
});

test('TC-CHG-008 edit refuses: others, past times, wrong date count, ended meetings', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await series(h, days(1, 2, 3));
  const put = (u, body) => api('PUT', `/api/meetings/${m.roomId}/schedule`, { token: u.token, body });
  status(await put(o, { title: 'x' }), 403);
  status(await api('GET', `/api/meetings/${m.roomId}/series`, { token: o.token }), 403);
  status(await put(h, { dates: [at(-1)] }), 400);
  status(await put(h, { dates: days(4), scope: 'series' }), 409);
  status(await put(h, { dates: ['soon'] }), 400);
  status(await api('PUT', `/api/meetings/${m.roomId}/cancel`, { token: h.token }), 200);
  status(await put(h, { title: 'x' }), 400);
});

test('TC-CHG-009 edit validates title type and length (4xx, not 500)', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h, { scheduledAt: at(24) });
  const bad = [];
  for (const title of [123, { a: 1 }, 'x'.repeat(2000)]) {
    const r = await api('PUT', `/api/meetings/${m.roomId}/schedule`, { token: h.token, body: { title } });
    if (r.status < 400 || r.status >= 500) bad.push(`${JSON.stringify(title).slice(0, 20)} -> ${r.status}`);
  }
  assert.deepEqual(bad, []);
});

test('TC-CHG-010 moving a date past the next one is refused or keeps the series in order', async () => {
  const h = await newUser('h');
  const m = await series(h, days(1, 2, 3));
  const r = await api('PUT', `/api/meetings/${m.roomId}/schedule`, { token: h.token, body: { dates: days(10), scope: 'one' } });
  if (r.status === 200) {
    const after = await allOf(h, m);
    const times = after.map((x) => new Date(x.scheduledAt).getTime());
    const d = await api('GET', `/api/meetings/${after[0].roomId}/series`, { token: h.token });
    // "this and later" from the moved date must still cover the dates that were after it in the series
    assert.ok(times[0] < times[1] || d.body.data.dates.length === 3, `moved first date now reports only ${d.body.data.dates.length} date(s) for "this and all later"`);
  }
});

test('TC-CHG-011 cancel scope=series cancels this and later dates only', async () => {
  const h = await newUser('h');
  const m = await series(h, days(1, 2, 3));
  const [, second] = await allOf(h, m);
  status(await api('PUT', `/api/meetings/${second.roomId}/cancel`, { token: h.token, body: { scope: 'series' } }), 200);
  assert.deepEqual((await allOf(h, m)).map((x) => x.status), ['scheduled', 'cancelled', 'cancelled']);
});

test('TC-CHG-012 one answer covers later dates and is saved', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await series(h, days(1, 2, 3), { invitees: [{ userId: g.id }] });
  status(await api('PUT', `/api/meetings/${m.roomId}/respond`, { token: g.token, body: { status: 'accepted' } }), 200);
  const after = await allOf(h, m);
  assert.deepEqual(after.map((x) => [x.invitees[0].status, x.participantIds.includes(g.id)]), [['accepted', true], ['accepted', true], ['accepted', true]]);
  status(await api('PUT', `/api/meetings/${m.roomId}/respond`, { token: g.token, body: { status: 'declined' } }), 200);
  assert.deepEqual((await allOf(h, m)).map((x) => [x.invitees[0].status, x.participantIds.includes(g.id)]), [['declined', false], ['declined', false], ['declined', false]]);
});

test('TC-CHG-013 inviting after creation applies to later dates and is saved', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await series(h, days(1, 2, 3));
  status(await api('POST', `/api/meetings/${m.roomId}/invite`, { token: h.token, body: { invitees: [{ userId: g.id }] } }), 200);
  assert.deepEqual((await allOf(h, m)).map((x) => x.inviteeIds.includes(g.id)), [true, true, true]);
});

test('TC-CHG-014 an old date of a series points to the next one instead of being joinable', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await series(h, [at(-30), at(24), at(48)]);
  const r = await api('POST', `/api/meetings/${m.roomId}/join`, { token: g.token });
  assert.equal(r.body.code, 'MEETING_ENDED');
  const d = await api('GET', `/api/meetings/${m.roomId}`, { token: g.token });
  const second = (await allOf(h, m))[1];
  assert.equal(d.body.data.nextRoomId, second.roomId);
});

test('TC-CHG-015 the next room of a restricted series is not given to an outsider', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await series(h, [at(-30), at(24)], { settings: { accessType: 'trusted', allowLinkRequests: false } });
  const d = await api('GET', `/api/meetings/${m.roomId}`, { token: o.token });
  assert.ok(!d.body?.data?.nextRoomId, `outsider got next room id (HTTP ${d.status})`);
});

test('TC-CHG-016 "take notes" starts the transcript on join; a host who stops it stays stopped', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, { settings: { takeNotes: true } }); await join(g, m.roomId);
  const hs = await enter(h, m.roomId);
  assert.equal((await waitFor(hs, 'transcribe:state')).enabled, true);
  hs.emit('transcribe:set', { roomId: m.roomId, enabled: false }); await sleep(500);
  const gs = await enter(g, m.roomId);
  assert.equal((await waitFor(gs, 'transcribe:state')).enabled, false);
});

test('TC-CHG-017 phone speech clips: outsider, oversize, odd length and non-binary input are ignored', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h, { settings: { takeNotes: true } });
  const hs = await enter(h, m.roomId); const os = await socket(o);
  os.emit('transcribe:audio', { roomId: m.roomId, audio: Buffer.alloc(320) });
  for (const audio of [Buffer.alloc(961000), Buffer.alloc(3), 'text', { length: 4 }]) hs.emit('transcribe:audio', { roomId: m.roomId, audio });
  await sleep(700);
  assert.equal(got(os, 'transcribe:unavailable').length + got(hs, 'transcript:line').length + got(hs, 'transcribe:unavailable').length, 0);
  assert.ok(hs.connected);
});
