import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { createUploadsRouter, readCookie } from '../src/routes/uploads.js';
import { parseUploadPath } from '../src/services/uploadAccess.js';

const users = { tHost: { id: 'host' }, tPart: { id: 'part' }, tOut: { id: 'out' }, tMember: { id: 'member' }, tOwner: { id: 'owner' } };
const meeting = { id: 'm1', hostId: 'host', participantIds: ['part'], participants: [] };
const deps = {
  findMeetingByRoomId: async (r) => (r === 'room1' ? meeting : null),
  findMeetingById: async (id) => (id === 'm1' ? meeting : null),
  findFileEntryByUrl: async (url) => ({
    '/uploads/files/owner/team.txt': { ownerId: 'owner', teamId: 't1', isDeleted: false },
    '/uploads/files/owner/conv.txt': { ownerId: 'owner', conversationId: 'c1', isDeleted: false },
    '/uploads/files/owner/gone.txt': { ownerId: 'owner', teamId: 't1', isDeleted: true },
    '/uploads/files/owner/meet.txt': { ownerId: 'owner', meetingId: 'm1', isDeleted: false },
  }[url] || null),
  isTeamMember: async (t, u) => t === 't1' && u === 'member',
  isConversationMember: async (c, u) => c === 'c1' && u === 'member',
  canManageMeeting: (m, u) => m.hostId === u,
};

let server, base, root;
test.before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'up-'));
  for (const f of ['recordings/room1/a.webm', 'transcripts/room1/a.txt', 'files/owner/team.txt', 'files/owner/conv.txt', 'files/owner/gone.txt', 'files/owner/meet.txt', 'files/owner/orphan.txt', 'tmp/recordings/x.webm', 'runtime/room1.json']) {
    await fs.mkdir(path.dirname(path.join(root, f)), { recursive: true }); await fs.writeFile(path.join(root, f), '0123456789');
  }
  await fs.writeFile(path.join(root, '..', 'secret-outside.txt'), 'nope').catch(() => {});
  const app = express();
  app.use('/uploads', createUploadsRouter({ deps, root, verifyToken: async (t) => users[t] || null }));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/uploads`;
});
test.after(() => server.close());

const get = (p, token, how = 'cookie', extra = {}) => fetch(base + p, { redirect: 'manual', headers: { ...(token ? (how === 'cookie' ? { Cookie: `mc_assets=${token}` } : { Authorization: `Bearer ${token}` }) : {}), ...extra } });

test('no credential => 401, bad token => 401 (nothing is public any more)', async () => {
  assert.equal((await get('/recordings/room1/a.webm')).status, 401);
  assert.equal((await get('/recordings/room1/a.webm', 'garbage')).status, 401);
  assert.equal((await get('/recordings/room1/a.webm?token=tHost')).status, 401); // query tokens are not accepted
});

test('recordings/transcripts: host and participants yes, outsiders no, unknown room no', async () => {
  for (const t of ['tHost', 'tPart']) { assert.equal((await get('/recordings/room1/a.webm', t)).status, 200); assert.equal((await get('/transcripts/room1/a.txt', t)).status, 200); }
  assert.equal((await get('/recordings/room1/a.webm', 'tOut')).status, 403);
  assert.equal((await get('/recordings/nope/a.webm', 'tHost')).status, 403);
});

test('files: owner, team member, conversation member, meeting participant allowed; others, orphans and deleted denied', async () => {
  assert.equal((await get('/files/owner/team.txt', 'tOwner')).status, 200);
  assert.equal((await get('/files/owner/orphan.txt', 'tOwner')).status, 200);        // owner may always read own files
  assert.equal((await get('/files/owner/team.txt', 'tMember')).status, 200);
  assert.equal((await get('/files/owner/conv.txt', 'tMember')).status, 200);
  assert.equal((await get('/files/owner/meet.txt', 'tPart')).status, 200);
  assert.equal((await get('/files/owner/team.txt', 'tOut')).status, 403);
  assert.equal((await get('/files/owner/orphan.txt', 'tMember')).status, 403);
  assert.equal((await get('/files/owner/gone.txt', 'tMember')).status, 403);
  assert.equal((await get('/files/owner/gone.txt', 'tOwner')).status, 200);
});

test('tmp/, runtime/ and traversal are never served', async () => {
  assert.equal((await get('/tmp/recordings/x.webm', 'tHost')).status, 404);
  assert.equal((await get('/runtime/room1.json', 'tHost')).status, 404);
  for (const p of ['/files/owner/..%2F..%2Fsecret-outside.txt', '/files/%2e%2e/owner/team.txt', '/files/owner/%00', '/recordings/room1/..%5Ca.webm']) {
    const s = (await get(p, 'tHost')).status; assert.ok(s === 404 || s === 403 || s === 400, `${p} -> ${s}`);
  }
  assert.equal(parseUploadPath('files/owner/.env'), null);
});

test('Authorization header works; Range requests (video seeking) work; response is private-cached with nosniff', async () => {
  assert.equal((await get('/recordings/room1/a.webm', 'tHost', 'bearer')).status, 200);
  const r = await get('/recordings/room1/a.webm', 'tHost', 'cookie', { Range: 'bytes=2-5' });
  assert.equal(r.status, 206); assert.equal(await r.text(), '2345');
  assert.match(r.headers.get('cache-control'), /private/); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('cookie parsing', () => { assert.equal(readCookie('a=1; mc_assets=tok; b=2', 'mc_assets'), 'tok'); assert.equal(readCookie('x=1', 'mc_assets'), null); });

test('object storage: authorised request for a file that is not on local disk redirects to a presigned URL; unauthorised never does', async () => {
  const fake = { name: 's3', getSignedDownloadUrl: async (key) => `https://bucket.example/${key}?sig=1` };
  const app = express();
  app.use('/uploads', createUploadsRouter({ deps, root, storage: () => fake, verifyToken: async (t) => users[t] || null }));
  const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const b = `http://127.0.0.1:${srv.address().port}/uploads`;
  const hit = (p, t) => fetch(b + p, { redirect: 'manual', headers: { Cookie: `mc_assets=${t}` } });
  const ok = await hit('/recordings/room1/in-bucket-only.webm', 'tHost');
  assert.equal(ok.status, 302); assert.equal(ok.headers.get('location'), 'https://bucket.example/recordings/room1/in-bucket-only.webm?sig=1');
  assert.match(ok.headers.get('cache-control'), /no-store/);
  assert.equal((await hit('/recordings/room1/in-bucket-only.webm', 'tOut')).status, 403);   // no redirect for people without access
  assert.equal((await hit('/tmp/recordings/x.webm', 'tHost')).status, 404);
  srv.close();
});
