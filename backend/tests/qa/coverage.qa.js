/**
 * Gap closure: endpoints and socket events that no earlier black-box test reached (or only reached
 * with a refusal). Each case checks the working path and, where it matters, one refusal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { api, newUser, newTeam, addMember, getTeam, newMeeting, getMeeting, newDm, sendDm, join, socket, enter, closeSockets, waitFor, got, sleep, uid, fileForm, adminToken, PASSWORD } from './helpers.js';

test.after(closeSockets);
const ok = (r, ...codes) => assert.ok((codes.length ? codes : [200, 201]).includes(r.status), `HTTP ${r.status} ${r.text.slice(0, 300)}`);
const settle = (ms = 500) => sleep(ms);
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// ---------- account ----------
test('TC-COV-001 custom status: set, read back, clear', async () => {
  const u = await newUser('u');
  const r = await api('PUT', '/api/auth/status', { token: u.token, body: { customStatus: 'In a review', statusEmoji: '📝' } });
  ok(r);
  assert.equal(r.body.data.user.customStatus, 'In a review');
  ok(await api('PUT', '/api/auth/status', { token: u.token, body: {} }));
});

test('TC-COV-002 avatar: upload an image, remove it, reject a non-image', async () => {
  const u = await newUser('u');
  const up = await api('POST', '/api/auth/profile/avatar', { token: u.token, form: fileForm('avatar', 'a.png', PNG, 'image/png') });
  ok(up);
  ok(await api('DELETE', '/api/auth/profile/avatar', { token: u.token }));
  const bad = await api('POST', '/api/auth/profile/avatar', { token: u.token, form: fileForm('avatar', 'a.png', '<script>1</script>', 'image/png') });
  assert.ok(bad.status >= 400 && bad.status < 500, `got ${bad.status}`);
});

// ---------- meetings ----------
test('TC-COV-003 leave: guest leaves and is marked as left; unknown room is 404', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); ok(await join(g, m.roomId));
  ok(await api('POST', `/api/meetings/${m.roomId}/leave`, { token: g.token }));
  const p = (await getMeeting(h, m.roomId)).participants.find((x) => x.userId === g.id);
  assert.ok(p?.leftAt, 'leftAt not saved');
  ok(await api('POST', '/api/meetings/nope/leave', { token: g.token }), 404);
});

test('TC-COV-004 settings: host updates, change persists, others are refused', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h);
  ok(await api('PUT', `/api/meetings/${m.roomId}/settings`, { token: h.token, body: { title: 'Renamed', settings: { waitingRoom: true } } }));
  const after = await getMeeting(h, m.roomId);
  assert.equal(after.title, 'Renamed');
  assert.equal(after.settings.waitingRoom, true);
  ok(await api('PUT', `/api/meetings/${m.roomId}/settings`, { token: o.token, body: { title: 'x' } }), 403);
});

test('TC-COV-005 invite after creation: host invites, invitee is saved and notified', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, { scheduledAt: future(2) });
  ok(await api('POST', `/api/meetings/${m.roomId}/invite`, { token: h.token, body: { invitees: [{ userId: g.id }] } }));
  assert.ok((await getMeeting(h, m.roomId)).inviteeIds.includes(g.id), 'invitee not persisted');
  const n = await api('GET', '/api/notifications', { token: g.token });
  assert.ok(n.body.data.notifications.some((x) => x.data?.meetingId === m.id), 'no notification');
});

test('TC-COV-006 placement lookup for a live meeting; 404 after it ends', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  ok(await api('GET', `/api/meetings/${m.roomId}/placement`, { token: h.token }));
  ok(await api('POST', `/api/meetings/${m.roomId}/end`, { token: h.token }));
  ok(await api('GET', `/api/meetings/${m.roomId}/placement`, { token: h.token }), 404);
});

test('TC-COV-007 transcription retry, complete transcript, summary and signed recording download', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h);
  const up = await api('POST', `/api/meetings/${m.roomId}/recordings`, { token: h.token, form: fileForm('recording', 'r.webm', Buffer.alloc(2048, 1), 'video/webm') });
  ok(up);
  const recId = up.body.data.recording.id;
  await settle(2500);
  ok(await api('POST', `/api/meetings/${m.roomId}/recordings/${recId}/retry-transcription`, { token: h.token, body: {} }), 202, 409);
  ok(await api('POST', `/api/meetings/${m.roomId}/recordings/${recId}/retry-transcription`, { token: o.token, body: {} }), 403);
  const ct = await api('POST', `/api/meetings/${m.roomId}/complete-transcript`, { token: h.token, body: {} });
  ok(ct, 200, 400); // 400 is expected: no transcription engine in this environment
  ok(await api('POST', `/api/meetings/${m.roomId}/complete-transcript`, { token: o.token, body: {} }), 403);
  const dl = await api('POST', `/api/storage/recordings/${m.roomId}/${recId}/download-url`, { token: h.token });
  ok(dl);
  const url = new URL(dl.body.url, 'http://x');
  const file = await api('GET', url.pathname + url.search);
  ok(file);
  assert.equal(file.headers.get('cache-control'), 'private, no-store');
  ok(await api('GET', url.pathname + url.search + 'x'), 403);
  ok(await api('GET', '/api/storage/local?t=forged.sig'), 403);
  ok(await api('POST', `/api/storage/recordings/${m.roomId}/${recId}/download-url`, { token: o.token }), 403);
});

test('TC-COV-008 AI: status, summarize text, meeting summary refused to outsiders, translation without a provider fails cleanly', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h);
  ok(await api('GET', '/api/ai/translate/status', { token: h.token }));
  ok(await api('POST', '/api/ai/summarize', { token: h.token, body: { text: 'We agreed to ship on Friday. Priya will write the release notes before then.' } }));
  ok(await api('POST', '/api/ai/summarize', { token: h.token, body: { text: 'short' } }), 400);
  ok(await api('GET', `/api/ai/meetings/${m.roomId}/summary`, { token: h.token }), 200, 202);
  ok(await api('GET', `/api/ai/meetings/${m.roomId}/summary`, { token: o.token }), 403);
  ok(await api('POST', `/api/ai/meetings/${m.roomId}/summary`, { token: o.token, body: {} }), 403);
  ok(await api('POST', `/api/ai/meetings/${m.roomId}/summary`, { token: h.token, body: {} }), 200, 400, 422);
  const t = await api('POST', '/api/ai/translate', { token: h.token, body: { text: 'hello', targetLanguage: 'Hindi' } });
  ok(t, 200, 502, 503);
});

// ---------- chat, conversations, messages ----------
test('TC-COV-009 group: create, details, add member, remove member, mute, read', async () => {
  const a = await newUser('a'); const b = await newUser('b'); const c = await newUser('c'); const d = await newUser('d');
  const g = await api('POST', '/api/conversations', { token: a.token, body: { type: 'group', name: 'g', userIds: [b.id, c.id] } });
  ok(g);
  const id = g.body.data.conversation.id;
  ok(await api('GET', `/api/conversations/${id}`, { token: b.token }));
  ok(await api('GET', `/api/conversations/${id}`, { token: d.token }), 403);
  ok(await api('POST', `/api/conversations/${id}/members`, { token: b.token, body: { userIds: [d.id] } }), 403);
  ok(await api('POST', `/api/conversations/${id}/members`, { token: a.token, body: { userIds: [d.id] } }));
  ok(await api('PUT', `/api/conversations/${id}/mute`, { token: d.token }));
  ok(await api('PUT', `/api/conversations/${id}/read`, { token: d.token }));
  ok(await api('DELETE', `/api/conversations/${id}/members/${c.id}`, { token: b.token }), 403);
  ok(await api('DELETE', `/api/conversations/${id}/members/${d.id}`, { token: a.token }));
  ok(await api('GET', `/api/conversations/${id}`, { token: d.token }), 403);
});

test('TC-COV-010 contacts and people search', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const t = await newTeam(a); await addMember(a, t, b);
  const c = await api('GET', '/api/conversations/people/contacts', { token: a.token });
  ok(c);
  assert.ok(c.body.data.contacts.some((x) => x.id === b.id));
  ok(await api('GET', `/api/conversations/people/search?q=${encodeURIComponent(b.name)}`, { token: a.token }));
});

test('TC-COV-011 DM reaction (both URL forms), pin by group owner, pinned and saved lists', async () => {
  const a = await newUser('a'); const b = await newUser('b'); const c = await newUser('c');
  const g = (await api('POST', '/api/conversations', { token: a.token, body: { type: 'group', name: 'g', userIds: [b.id, c.id] } })).body.data.conversation.id;
  const msg = await sendDm(a, g, 'pin me');
  ok(await api('POST', `/api/messages/${msg.id}/react`, { token: b.token, body: { emoji: '👍' } }));
  ok(await api('POST', `/api/messages/messages/${msg.id}/react`, { token: b.token, body: { emoji: '👍' } }));
  ok(await api('PUT', `/api/messages/${msg.id}/pin`, { token: b.token }), 403);
  ok(await api('PUT', `/api/messages/messages/${msg.id}/pin`, { token: a.token }));
  const p = await api('GET', `/api/messages/pinned?conversationId=${g}`, { token: b.token });
  ok(p);
  assert.equal(p.body.data.messages.length, 1);
  ok(await api('POST', `/api/messages/${msg.id}/save`, { token: b.token }));
  ok(await api('GET', '/api/messages/saved', { token: b.token }));
});

test('TC-COV-012 meeting chat message delete: author yes, outsider no', async () => {
  const h = await newUser('h'); const o = await newUser('o');
  const m = await newMeeting(h);
  const msg = (await api('POST', `/api/chat/${m.roomId}/messages`, { token: h.token, body: { content: 'x' } })).body.data.message;
  ok(await api('DELETE', `/api/chat/messages/${msg.id}`, { token: o.token }), 403);
  ok(await api('DELETE', `/api/chat/messages/${msg.id}`, { token: h.token }));
});

// ---------- notifications ----------
test('TC-COV-013 notifications: read one, read all, delete one, delete read', async () => {
  const a = await newUser('a'); const b = await newUser('b');
  const c = await newDm(a, b);
  await sendDm(a, c, 'one'); await sendDm(a, c, 'two');
  const list = (await api('GET', '/api/notifications', { token: b.token })).body.data.notifications;
  assert.ok(list.length >= 2);
  ok(await api('PUT', `/api/notifications/${list[0].id}/read`, { token: b.token }));
  ok(await api('DELETE', `/api/notifications/${list[1].id}`, { token: b.token }));
  ok(await api('PUT', '/api/notifications/read-all', { token: b.token }));
  const after = (await api('GET', '/api/notifications', { token: b.token })).body.data;
  assert.equal(after.unreadCount, 0);
  ok(await api('DELETE', '/api/notifications', { token: b.token }));
  assert.equal((await api('GET', '/api/notifications', { token: b.token })).body.data.notifications.length, 0);
});

// ---------- polls, Q&A, breakout ----------
test('TC-COV-014 poll draft: start, end, cannot restart', async () => {
  const h = await newUser('h');
  const m = await newMeeting(h);
  const p = await api('POST', '/api/polls', { token: h.token, body: { meetingId: m.id, question: 'q', options: ['a', 'b'], draft: true } });
  ok(p);
  const id = p.body.data.poll.id;
  ok(await api('PUT', `/api/polls/${id}/start`, { token: h.token }));
  ok(await api('PUT', `/api/polls/${id}/end`, { token: h.token }));
  ok(await api('PUT', `/api/polls/${id}/start`, { token: h.token }), 409);
});

test('TC-COV-015 Q&A dismiss by author', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h); ok(await join(g, m.roomId));
  const q = (await api('POST', '/api/qa', { token: g.token, body: { meetingId: m.id, question: 'why?' } })).body.data.question;
  ok(await api('DELETE', `/api/qa/${q.id}`, { token: g.token }));
});

test('TC-COV-016 breakout: assign, assigned user joins and the join time is saved', async () => {
  const h = await newUser('h'); const g = await newUser('g'); const o = await newUser('o');
  const m = await newMeeting(h);
  const r = await api('POST', '/api/breakout', { token: h.token, body: { meetingId: m.id, rooms: [{ name: 'one' }] } });
  ok(r);
  const room = r.body.data.breakoutRooms[0];
  ok(await api('PUT', `/api/breakout/${room.id}/assign`, { token: h.token, body: { participantIds: [g.id] } }));
  ok(await api('POST', `/api/breakout/${room.id}/join`, { token: o.token }), 403);
  ok(await api('POST', `/api/breakout/${room.id}/join`, { token: g.token }));
  const after = (await api('GET', `/api/breakout/meeting/${m.id}`, { token: h.token })).body.data.breakoutRooms[0];
  assert.ok(after.assignedParticipants.find((p) => p.userId === g.id)?.joinedAt, 'joinedAt returned but not persisted');
});

// ---------- teams, tasks, files ----------
test('TC-COV-017 regenerate invite code invalidates the old one', async () => {
  const o = await newUser('o'); const u = await newUser('u');
  const t = await newTeam(o);
  const r = await api('POST', `/api/teams/${t.id}/regenerate-code`, { token: o.token });
  ok(r);
  assert.notEqual(r.body.inviteCode, t.inviteCode);
  ok(await api('POST', `/api/teams/join/${t.inviteCode}`, { token: u.token }), 404);
});

test('TC-COV-018 team settings update and team delete', async () => {
  const o = await newUser('o'); const u = await newUser('u');
  const t = await newTeam(o); await addMember(o, t, u);
  ok(await api('PUT', `/api/teams/${t.id}`, { token: o.token, body: { name: 'Renamed', description: 'd' } }));
  assert.equal((await getTeam(o, t.id)).name, 'Renamed');
  ok(await api('PUT', `/api/teams/${t.id}`, { token: u.token, body: { name: 'x' } }), 403);
  ok(await api('DELETE', `/api/teams/${t.id}`, { token: u.token }), 403);
  ok(await api('DELETE', `/api/teams/${t.id}`, { token: o.token }));
});

test('TC-COV-019 task list, subtask, team task list', async () => {
  const o = await newUser('o');
  const t = await newTeam(o);
  const task = (await api('POST', '/api/tasks', { token: o.token, body: { title: 'root', teamId: t.id } })).body.data.task;
  ok(await api('POST', `/api/tasks/${task.id}/subtasks`, { token: o.token, body: { title: 'child' } }));
  ok(await api('GET', '/api/tasks?scope=mine', { token: o.token }));
  const r = await api('GET', `/api/tasks?scope=team&teamId=${t.id}`, { token: o.token });
  ok(r);
  assert.ok(r.body.data.tasks.some((x) => x.id === task.id));
});

test('TC-COV-020 storage summary and trash list', async () => {
  const u = await newUser('u');
  const f = (await api('POST', '/api/files/upload', { token: u.token, form: fileForm('file', 'a.txt', 'abc', 'text/plain') })).body.data.file;
  ok(await api('GET', '/api/files/storage/summary', { token: u.token }));
  ok(await api('DELETE', `/api/files/${f.id}`, { token: u.token }));
  const trash = await api('GET', '/api/files/trash/list', { token: u.token });
  ok(trash);
  assert.ok(trash.body.data.files.some((x) => x.id === f.id));
});

test('TC-COV-021 subscription usage', async () => {
  const u = await newUser('u');
  ok(await api('GET', '/api/subscriptions/usage', { token: u.token }));
});

// ---------- admin ----------
test('TC-COV-022 admin read endpoints', async () => {
  const a = await adminToken();
  for (const p of ['/auth/me', '/overview', '/analytics?days=7', '/permissions', '/roles', '/roles?scope=admin', '/users', '/settings', '/admins', '/audit-logs?limit=5', '/meetings?limit=5']) {
    ok(await api('GET', `/api/admin${p}`, { token: a }));
  }
});

test('TC-COV-023 admin roles: create, update, assign, delete; system role protected', async () => {
  const a = await adminToken(); const u = await newUser('u');
  const r = await api('POST', '/api/admin/roles', { token: a, body: { name: `r-${uid()}`, permissions: ['meetings.join', 'bogus'] } });
  ok(r);
  const role = r.body.data.role;
  assert.deepEqual(role.permissions, ['meetings.join']);
  ok(await api('PUT', `/api/admin/roles/${role.id}`, { token: a, body: { permissions: ['chat.send'] } }));
  ok(await api('PUT', `/api/admin/users/${u.id}/role`, { token: a, body: { roleId: role.id } }));
  ok(await api('POST', '/api/meetings', { token: u.token, body: {} }), 403);
  ok(await api('DELETE', `/api/admin/roles/${role.id}`, { token: a }));
  const sys = (await api('GET', '/api/admin/roles', { token: a })).body.data.roles.find((x) => x.isSystem);
  ok(await api('DELETE', `/api/admin/roles/${sys.id}`, { token: a }), 400);
});

test('TC-COV-024 admin creates a user, edits profile and avatar', async () => {
  const a = await adminToken();
  const email = `made.${uid()}@example.test`;
  const c = await api('POST', '/api/admin/users', { token: a, body: { name: 'Made', email, password: PASSWORD } });
  ok(c);
  const id = c.body.data.user.id;
  ok(await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } }));
  ok(await api('PUT', `/api/admin/users/${id}/profile`, { token: a, body: { title: 'Engineer' } }));
  ok(await api('POST', `/api/admin/users/${id}/avatar`, { token: a, form: fileForm('avatar', 'a.png', PNG, 'image/png') }));
  ok(await api('DELETE', `/api/admin/users/${id}/avatar`, { token: a }));
});

test('TC-COV-025 admin accounts: create, update, delete, cannot delete self; test email without SMTP', async () => {
  const a = await adminToken();
  const me = (await api('GET', '/api/admin/auth/me', { token: a })).body.data.admin;
  const c = await api('POST', '/api/admin/admins', { token: a, body: { name: 'Second', email: `adm.${uid()}@example.test`, password: 'LongEnough1!' } });
  ok(c);
  ok(await api('PUT', `/api/admin/admins/${c.body.data.admin.id}`, { token: a, body: { name: 'Renamed' } }));
  ok(await api('DELETE', `/api/admin/admins/${c.body.data.admin.id}`, { token: a }));
  ok(await api('DELETE', `/api/admin/admins/${me.id}`, { token: a }), 400);
  ok(await api('POST', '/api/admin/settings/test-email', { token: a, body: { to: 'x@example.test' } }), 400);
});

test('TC-COV-026 health endpoints', async () => {
  ok(await api('GET', '/api/health'));
});

// ---------- realtime ----------
async function room(settings) {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, settings ? { settings } : {}); await join(g, m.roomId);
  const hs = await enter(h, m.roomId); const gs = await enter(g, m.roomId);
  await settle(300);
  return { h, g, m, hs, gs, roomId: m.roomId };
}

test('TC-COV-027 media signalling: transports, connect, produce, consume, pause, resume, layers, close', async () => {
  const { hs, gs, roomId } = await room();
  const call = (s, event, data) => s.timeout(4000).emitWithAck(event, data);
  const caps = await call(hs, 'mediasoup:getRouterRtpCapabilities', { roomId });
  assert.ok(caps.success, caps.error);
  const dtlsParameters = { role: 'client', fingerprints: [{ algorithm: 'sha-256', value: crypto.randomBytes(32).toString('hex').toUpperCase().match(/../g).join(':') }] };
  const transport = async (s, direction) => {
    const r = await call(s, 'mediasoup:createWebRtcTransport', { roomId, direction });
    assert.ok(r.success, r.error);
    const c = await call(s, 'mediasoup:connectTransport', { transportId: r.transportParams.id, dtlsParameters });
    assert.ok(c.success, c.error);
    return r.transportParams.id;
  };
  const send = await transport(hs, 'send');
  await transport(gs, 'recv');
  const rtpParameters = { codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000, channels: 2 }], encodings: [{ ssrc: 11111111 }], rtcp: { cname: 'qa' } };
  const p = await call(hs, 'mediasoup:produce', { transportId: send, kind: 'audio', rtpParameters, appData: { mediaType: 'audio' } });
  assert.ok(p.success, p.error);
  const c = await call(gs, 'mediasoup:consume', { roomId, producerId: p.producerId, rtpCapabilities: caps.rtpCapabilities });
  assert.ok(c.success, c.error);
  const consumerId = c.consumerParams.id;
  assert.ok((await call(gs, 'mediasoup:resumeConsumer', { consumerId })).success);
  assert.equal((await call(hs, 'mediasoup:resumeConsumer', { consumerId })).success, false, 'another user resumed my consumer');
  await call(gs, 'mediasoup:setConsumerLayers', { consumerId, spatialLayer: 0, temporalLayer: 0 });
  assert.ok((await call(hs, 'mediasoup:restartIce', { transportId: send })).success);
  assert.equal((await call(gs, 'mediasoup:pauseProducer', { producerId: p.producerId })).success, false, 'another user paused my producer');
  assert.ok((await call(hs, 'mediasoup:pauseProducer', { producerId: p.producerId })).success);
  assert.ok((await call(hs, 'mediasoup:resumeProducer', { producerId: p.producerId })).success);
  assert.ok((await call(gs, 'mediasoup:closeConsumer', { consumerId })).success);
  assert.ok((await call(hs, 'mediasoup:closeProducer', { producerId: p.producerId })).success);
});

test('TC-COV-028 recording indicator, hand raise, lower hand, leave room', async () => {
  const { roomId, hs, gs } = await room();
  hs.emit('recording:started', { roomId }); assert.ok(await waitFor(gs, 'recording:started'));
  hs.emit('recording:stopped', { roomId }); assert.ok(await waitFor(gs, 'recording:stopped'));
  gs.emit('reaction:hand-raise', { roomId, isRaised: true }); assert.ok(await waitFor(hs, 'reaction:hand-raise'));
  hs.emit('host:lower-hand', { roomId }); assert.ok(await waitFor(gs, 'host:lower-hand'));
  gs.emit('room:leave'); assert.ok(await waitFor(hs, 'room:user-left'));
});

test('TC-COV-029 host: request unmute, stop all video, spotlight, lock; a guest cannot lock', async () => {
  const { roomId, h, hs, gs } = await room();
  const guestId = gs.id;
  hs.emit('host:request-unmute', { roomId, targetSocketId: guestId }); assert.ok(await waitFor(gs, 'host:request-unmute'));
  hs.emit('host:disable-all-video', { roomId }); assert.ok(await waitFor(gs, 'host:force-video-off'));
  hs.emit('host:spotlight', { roomId, userId: h.id }); assert.ok(await waitFor(gs, 'host:spotlight'));
  gs.emit('host:lock-meeting', { roomId, isLocked: true }); await settle();
  assert.notEqual((await getMeeting(h, roomId)).settings.isLocked, true);
  hs.emit('host:lock-meeting', { roomId, isLocked: true }); assert.ok(await waitFor(gs, 'host:meeting-locked'));
  assert.equal((await getMeeting(h, roomId)).settings.isLocked, true);
});

test('TC-COV-030 waiting room: host denies', async () => {
  const h = await newUser('h'); const g = await newUser('g');
  const m = await newMeeting(h, { settings: { waitingRoom: true } });
  const hs = await enter(h, m.roomId); const gs = await enter(g, m.roomId);
  const knock = await waitFor(hs, 'room:waiting');
  hs.emit('host:deny-user', { roomId: m.roomId, targetSocketId: knock.socketId });
  assert.ok(await waitFor(gs, 'room:denied'));
});

test('TC-COV-031 co-host promotion then demotion', async () => {
  const { roomId, h, g, hs, gs } = await room();
  hs.emit('host:make-cohost', { roomId, targetSocketId: gs.id });
  assert.ok(await waitFor(gs, 'host:promoted'));
  await settle();
  assert.equal((await getMeeting(h, roomId)).participants.find((p) => p.userId === g.id)?.role, 'co-host', 'promotion announced but not saved');
  hs.emit('host:remove-cohost', { roomId, targetSocketId: gs.id });
  assert.ok(await waitFor(gs, 'host:demoted'), 'demotion had no effect');
});

test('TC-COV-032 live transcript: enable, send a line, replay history; timer stop; stream toggle', async () => {
  const { roomId, hs, gs } = await room();
  hs.emit('transcribe:set', { roomId, enabled: true }); assert.ok(await waitFor(gs, 'transcribe:state'));
  await settle(200);
  gs.emit('transcribe:line', { roomId, text: 'decision: ship it' });
  assert.equal((await waitFor(hs, 'transcript:line')).text, 'decision: ship it');
  gs.emit('transcript:request', { roomId });
  assert.equal((await waitFor(gs, 'transcript:history')).lines.length, 1);
  gs.emit('transcribe:audio', { roomId, audio: Buffer.alloc(3200) });
  assert.ok(await waitFor(gs, 'transcribe:unavailable'), 'no notice that server transcription is unavailable');
  await settle(); gs.log.length = 0;
  hs.emit('timer:start', { roomId, seconds: 60 }); assert.equal((await waitFor(gs, 'timer:state')).timer.duration, 60);
  gs.log.length = 0;
  hs.emit('timer:stop', { roomId }); assert.equal((await waitFor(gs, 'timer:state')).timer, null);
  gs.log.length = 0;
  hs.emit('stream:set', { roomId, enabled: true }); assert.ok((await waitFor(gs, 'stream:state')).stream);
});

test('TC-COV-033 whiteboard: draw, clear, history empty; latency ping', async () => {
  const { roomId, hs, gs } = await room();
  hs.emit('whiteboard:draw', { roomId, x0: 0, y0: 0, x1: 1, y1: 1, color: '#000', width: 2, tool: 'pen' });
  assert.ok(await waitFor(gs, 'whiteboard:draw'));
  hs.emit('whiteboard:clear', { roomId }); assert.ok(await waitFor(gs, 'whiteboard:clear'));
  gs.emit('whiteboard:request', { roomId });
  assert.equal((await waitFor(gs, 'whiteboard:history')).strokes.length, 0);
  await gs.timeout(2000).emitWithAck('net:ping');
});

test('TC-COV-034 team typing reaches members', async () => {
  const o = await newUser('o'); const u = await newUser('u');
  const t = await newTeam(o); await addMember(o, t, u);
  const os = await socket(o); const us = await socket(u);
  os.emit('team:join', { teamId: t.id }); us.emit('team:join', { teamId: t.id }); await settle();
  os.emit('team:typing', { teamId: t.id, channelType: 'general', isTyping: true });
  assert.ok(await waitFor(us, 'team:user-typing'));
});
