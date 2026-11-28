/** Data export, account deletion, and what may be uploaded. Run against a disposable server (QA_BASE_URL). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { api, newUser, newTeam, addMember, newMeeting, join, newDm, sendDm, adminToken, fileForm, getTeam, uid, PASSWORD } from './helpers.js';

const APP = process.env.QA_APP_DIR;
const upload = (user, name, content = 'hello', type = 'text/plain') => api('POST', '/api/files/upload', { token: user.token, form: fileForm('file', name, content, type) });
// 401 once the session is revoked; 403 (account disabled) for a token issued in the very same second
const refused = async (user) => assert.ok([401, 403].includes((await api('GET', '/api/auth/me', { token: user.token })).status), 'old session refused');
const erase = (user, password = PASSWORD) => api('DELETE', '/api/auth/me', { token: user.token, body: { password } });

test('TC-ACC-001 export holds own data; messages by others are not listed as own', async () => {
  const me = await newUser('exp'); const other = await newUser('oth');
  const c = await newDm(me, other);
  await sendDm(me, c, 'mine-to-export');
  await sendDm(other, c, 'theirs-not-mine');
  await upload(me, 'a.txt');
  const r = await api('GET', '/api/auth/me/export', { token: me.token });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.equal(r.body.profile.email, me.email);
  assert.deepEqual(r.body.messages.map((m) => m.content), ['mine-to-export']);
  assert.doesNotMatch(r.text, /\$2[aby]\$/, 'no password hash');
  assert.equal(r.body.files.length, 1);
  assert.equal((await api('GET', '/api/auth/me/export')).status, 401);
});

test('TC-ACC-002 deletion needs the password', async () => {
  const me = await newUser('pw');
  assert.equal((await erase(me, 'wrong-password')).status, 403);
  assert.equal((await api('DELETE', '/api/auth/me', { token: me.token })).status, 403);
  assert.equal((await api('GET', '/api/auth/me', { token: me.token })).status, 200);
});

test('TC-ACC-003 an owner of a team with other people must deal with it first', async () => {
  const me = await newUser('own'); const mate = await newUser('mate');
  const team = await newTeam(me);
  await addMember(me, team, mate);
  const r = await erase(me);
  assert.equal(r.status, 409);
  assert.match(r.body.message, new RegExp(team.name));
  assert.equal((await api('GET', '/api/auth/me', { token: me.token })).status, 200, 'nothing was changed');
});

test('TC-ACC-004 deletion removes the person and keeps other people\'s history', async () => {
  const me = await newUser('del'); const friend = await newUser('friend');
  const friendsTeam = await newTeam(friend);
  await addMember(friend, friendsTeam, me);
  const c = await newDm(me, friend);
  const secret = `secret-${uid()}`;
  await sendDm(me, c, secret);
  await sendDm(friend, c, 'friend stays');
  const file = (await upload(me, 'private.txt', 'private-bytes')).body.data.file;
  const onDisk = APP && path.join(APP, file.url);
  if (onDisk) assert.ok(fs.existsSync(onDisk));
  const hosted = await newMeeting(me, { description: secret });
  await join(me, hosted.roomId);
  await api('POST', `/api/meetings/${hosted.roomId}/recordings`, { token: me.token, form: fileForm('recording', 'r.webm', 'rec', 'video/webm') });
  const theirs = await newMeeting(friend, { invitees: [{ email: me.email }] });
  await join(me, theirs.roomId);

  assert.equal((await erase(me)).status, 200);

  await refused(me);
  assert.notEqual((await api('POST', '/api/auth/login', { body: { email: me.email, password: PASSWORD } })).status, 200);
  const history = (await api('GET', `/api/conversations/${c}/messages`, { token: friend.token })).text;
  assert.doesNotMatch(history, new RegExp(secret));
  assert.match(history, /friend stays/);
  assert.notEqual((await api('GET', file.url, { token: friend.token })).status, 200, 'file not served');
  if (onDisk) {
    assert.ok(!fs.existsSync(onDisk), 'uploaded file removed from disk');
    assert.ok(!fs.existsSync(path.join(APP, 'uploads', 'recordings', hosted.roomId)), 'hosted recording removed from disk');
  }
  const team = await getTeam(friend, friendsTeam.id);
  assert.doesNotMatch(JSON.stringify(team), new RegExp(me.email));
  const meeting = (await api('GET', `/api/meetings/${theirs.roomId}`, { token: friend.token })).text;
  assert.doesNotMatch(meeting, new RegExp(`${me.email}|${me.name}`), 'name and address gone from another host\'s meeting');
  const again = await api('POST', '/api/auth/signup', { body: { name: 'Back again', email: me.email, password: PASSWORD } });
  assert.equal(again.status, 201, 'the address is free');
  assert.notEqual(again.body.data.user.id, me.id);
});

test('TC-ACC-005 only an administrator with user management can erase someone else', async () => {
  const victim = await newUser('victim'); const stranger = await newUser('str');
  assert.equal((await api('DELETE', `/api/admin/users/${victim.id}`, { token: stranger.token })).status, 401);
  assert.equal((await api('DELETE', `/api/admin/users/${victim.id}`, { token: await adminToken() })).status, 200);
  await refused(victim);
});

test('TC-ACC-006 files that run when opened are refused', async () => {
  const me = await newUser('up');
  for (const name of ['setup.exe', 'run.BAT', 'app.apk', 'x.ps1', 'trick.exe.']) {
    assert.equal((await upload(me, name)).status, 415, name);
  }
  assert.equal((await upload(me, 'notes.txt')).status, 201);
});

test('TC-ACC-007 a recording must be audio or video', async () => {
  const me = await newUser('rec');
  const m = await newMeeting(me);
  await join(me, m.roomId);
  const send = (name) => api('POST', `/api/meetings/${m.roomId}/recordings`, { token: me.token, form: fileForm('recording', name, 'abc', 'video/webm') });
  for (const name of ['evil.html', 'evil.exe', 'x.svg']) assert.equal((await send(name)).status, 415, name);
  assert.equal((await send('ok.webm')).status, 201);
});
