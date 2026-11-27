/** Socket.IO authorisation and realtime behaviour. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, newMeeting, getMeeting, join, socket, enter, closeSockets, waitFor, got, sleep, uid, newDm } from './helpers.js';

test.after(closeSockets);
const settle = () => sleep(600);

test('TC-RT-001 socket handshake requires a valid token', async () => {
  await assert.rejects(socket({ token: 'bad' }));
  await assert.rejects(socket({ token: undefined }));
});

test('TC-RT-002 two participants see each other and exchange chat', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); await join(g, m.roomId);
  const hs = await enter(h, m.roomId);
  const gs = await enter(g, m.roomId);
  assert.ok(await waitFor(hs, 'room:user-joined'));
  gs.emit('chat:send', { roomId: m.roomId, content: 'hello' });
  assert.equal((await waitFor(hs, 'chat:message')).content, 'hello');
});

test('TC-RT-003 waiting room: guest waits, host admits, guest enters', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, { settings: { waitingRoom: true } });
  const hs = await enter(h, m.roomId);
  const gs = await enter(g, m.roomId);
  assert.ok(await waitFor(gs, 'room:waiting-for-host'));
  const knock = await waitFor(hs, 'room:waiting');
  hs.emit('host:admit-user', { roomId: m.roomId, targetSocketId: knock.socketId });
  assert.ok(await waitFor(gs, 'room:participants'));
});

test('TC-RT-004 restricted meeting: socket join refuses an uninvited user', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h, { settings: { accessType: 'trusted', allowLinkRequests: false } });
  assert.equal((await join(o, m.roomId)).status, 403, 'control: REST refuses');
  const os = await enter(o, m.roomId);
  assert.equal(got(os, 'room:participants').length, 0, 'uninvited user entered the room (and can consume its audio/video)');
});

test('TC-RT-005 socket join enforces the participant limit', async () => {
  const h = await newUser('h'); const a = await newUser('a'); const b = await newUser('b');
  const m = await newMeeting(h, { settings: { maxParticipants: 2 } });
  await enter(h, m.roomId); await enter(a, m.roomId);
  const bs = await enter(b, m.roomId);
  assert.equal(got(bs, 'room:participants').length, 0, 'third person entered a 2-person meeting');
});

test('TC-RT-006 locked meeting refuses socket join', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h, { settings: { isLocked: true } });
  const os = await enter(o, m.roomId);
  assert.equal(got(os, 'room:participants').length, 0);
});

test('TC-RT-007 someone not in the room cannot send chat into it', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h, { settings: { accessType: 'trusted', allowLinkRequests: false } });
  const hs = await enter(h, m.roomId);
  const os = await socket(o);
  os.emit('chat:send', { roomId: m.roomId, content: 'injected from outside' });
  await settle();
  assert.equal(got(hs, 'chat:message').length, 0, 'outsider message delivered to the meeting');
});

test('TC-RT-008 someone not in the room cannot push captions or reactions into it', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h);
  const hs = await enter(h, m.roomId);
  const os = await socket(o);
  os.emit('caption:text', { roomId: m.roomId, text: 'fake caption' });
  os.emit('reaction:emoji', { roomId: m.roomId, emoji: '💣' });
  await settle();
  assert.deepEqual([got(hs, 'caption:text').length, got(hs, 'reaction:emoji').length], [0, 0]);
});

test('TC-RT-009 a host of one meeting cannot remove or mute users of another meeting', async () => {
  const h = await newUser('h'); const victim = await newUser('v'); const attacker = await newUser('x');
  const target = await newMeeting(h); await join(victim, target.roomId);
  const vs = await enter(victim, target.roomId);
  const own = await newMeeting(attacker);
  const xs = await enter(attacker, own.roomId);
  xs.emit('host:mute-user', { roomId: own.roomId, targetSocketId: vs.id });
  xs.emit('host:force-video-off', { roomId: own.roomId, targetSocketId: vs.id });
  xs.emit('host:remove-user', { roomId: own.roomId, targetSocketId: vs.id });
  await settle();
  assert.deepEqual(
    ['host:force-mute', 'host:force-video-off', 'host:removed'].map((e) => got(vs, e).length), [0, 0, 0],
    'victim in a different meeting received host commands');
});

test('TC-RT-010 non-host cannot use host controls', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); await join(g, m.roomId);
  const hs = await enter(h, m.roomId); const gs = await enter(g, m.roomId);
  gs.emit('host:mute-all', { roomId: m.roomId });
  gs.emit('host:end-meeting', { roomId: m.roomId });
  gs.emit('host:update-settings', { roomId: m.roomId, settings: { isLocked: true } });
  await settle();
  assert.equal(got(hs, 'host:force-mute').length, 0);
  const saved = await getMeeting(h, m.roomId);
  assert.equal(saved.status, 'active');
  assert.notEqual(saved.settings.isLocked, true);
});

test('TC-RT-011 co-host promotion is persisted', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); await join(g, m.roomId);
  const hs = await enter(h, m.roomId); const gs = await enter(g, m.roomId);
  hs.emit('host:make-cohost', { roomId: m.roomId, targetSocketId: gs.id });
  assert.ok(await waitFor(gs, 'host:promoted'), 'control: live event delivered');
  await settle();
  const role = (await getMeeting(h, m.roomId)).participants.find((p) => p.userId === g.id).role;
  assert.equal(role, 'co-host', `database still says "${role}": co-host rights vanish on the next check`);
});

test('TC-RT-012 a removed participant cannot immediately walk back in', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); await join(g, m.roomId);
  const hs = await enter(h, m.roomId); const gs = await enter(g, m.roomId);
  hs.emit('host:remove-user', { roomId: m.roomId, targetSocketId: gs.id });
  assert.ok(await waitFor(gs, 'host:removed'));
  const again = await enter(g, m.roomId);
  assert.equal(got(again, 'room:participants').length, 0, 'removed user rejoined at once');
});

test('TC-RT-013 host ending the meeting notifies everyone and persists', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); await join(g, m.roomId);
  const hs = await enter(h, m.roomId); const gs = await enter(g, m.roomId);
  hs.emit('host:end-meeting', { roomId: m.roomId });
  assert.ok(await waitFor(gs, 'meeting:ended'));
  await settle();
  assert.equal((await getMeeting(h, m.roomId)).status, 'ended');
});

test('TC-RT-014 non-member cannot join a conversation room or fake typing in it', async () => {
  const a = await newUser('a'); const b = await newUser('b'); const o = await newUser('o');
  const c = await newDm(a, b);
  const as = await socket(a);
  await new Promise((r) => as.emit('conversation:join', { conversationId: c }, r));
  const os = await socket(o);
  const ack = await new Promise((r) => os.emit('conversation:join', { conversationId: c }, r));
  assert.equal(ack.success, false);
  os.emit('conversation:typing', { conversationId: c, isTyping: true });
  await settle();
  assert.equal(got(as, 'conversation:user-typing').length, 0, 'outsider typing indicator delivered');
});

test('TC-RT-015 non-member of a conversation receives none of its messages', async () => {
  const a = await newUser('a'); const b = await newUser('b'); const o = await newUser('o');
  const c = await newDm(a, b);
  const os = await socket(o);
  await api('POST', `/api/conversations/${c}/messages`, { token: a.token, body: { content: uid() } });
  await settle();
  assert.equal(got(os, 'conversation:message').length, 0);
});

test('TC-RT-016 shared notes and whiteboard replay to late joiners', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); await join(g, m.roomId);
  const hs = await enter(h, m.roomId);
  hs.emit('notes:update', { roomId: m.roomId, text: 'agenda' });
  hs.emit('whiteboard:draw', { roomId: m.roomId, x0: 0, y0: 0, x1: 1, y1: 1, color: '#fff', width: 2, tool: 'pen' });
  await settle();
  const gs = await enter(g, m.roomId);
  gs.emit('notes:request', { roomId: m.roomId });
  gs.emit('whiteboard:request', { roomId: m.roomId });
  assert.equal((await waitFor(gs, 'notes:update')).text, 'agenda');
  assert.equal((await waitFor(gs, 'whiteboard:history')).strokes.length, 1);
});

test('TC-RT-017 SFU: a participant obtains router capabilities and a transport', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  const s = await enter(h, m.roomId);
  const caps = await new Promise((r) => s.emit('mediasoup:getRouterRtpCapabilities', { roomId: m.roomId }, r));
  assert.equal(caps.success, true);
  assert.ok(caps.rtpCapabilities.codecs.length);
  const t = await new Promise((r) => s.emit('mediasoup:createWebRtcTransport', { roomId: m.roomId, direction: 'send' }, r));
  assert.equal(t.success, true);
  assert.ok(t.transportParams.iceCandidates.length);
});

test('TC-RT-018 SFU: an uninvited user cannot allocate a media transport for a restricted meeting', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h, { settings: { accessType: 'trusted', allowLinkRequests: false } });
  const os = await socket(o);
  const t = await new Promise((r) => os.emit('mediasoup:createWebRtcTransport', { roomId: m.roomId, direction: 'recv' }, r));
  assert.equal(t.success, false, 'transport allocated for an outsider');
});

test('TC-RT-019 a breakout room closed while someone is on the way in sends them back', async () => {
  const host = await newUser('bh'); const guest = await newUser('bg');
  const m = await newMeeting(host);
  await join(host, m.roomId); await join(guest, m.roomId);
  const made = await api('POST', '/api/breakout', { token: host.token, body: { meetingId: m.id, rooms: [{ name: 'One', participantIds: [guest.id] }] } });
  const room = (made.body.breakoutRooms || made.body.data?.breakoutRooms)[0];
  const roomId = room.joinRoomId || `${m.roomId}--br-${room.id}`;
  assert.equal((await join(guest, roomId)).status, 200);
  assert.equal((await api('POST', '/api/breakout/close-all', { token: host.token, body: { meetingId: m.id } })).status, 200);
  // arriving after the announcement was sent
  const late = await join(guest, roomId);
  assert.deepEqual([late.status, late.body.code], [403, 'BREAKOUT_CLOSED']);
  const s = await socket(guest);
  s.emit('tools:request', { roomId });
  assert.deepEqual(await waitFor(s, 'breakout:closed'), { returnRoomId: m.roomId });
});
