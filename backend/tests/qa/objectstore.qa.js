/**
 * STORAGE_DRIVER=s3: what reaches the bucket, and what is left there after deletion.
 * Needs a server started with S3 settings and the same values here, for example against adobe/s3mock:
 *   S3_ENDPOINT=http://127.0.0.1:19090 S3_BUCKET=qa S3_FORCE_PATH_STYLE=true AWS_ACCESS_KEY_ID=x AWS_SECRET_ACCESS_KEY=y
 * Skipped when S3_ENDPOINT is not set.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { api, newUser, newMeeting, join, fileForm, PASSWORD } from './helpers.js';

const { S3_ENDPOINT, S3_BUCKET = 'qa' } = process.env;
const skip = !S3_ENDPOINT;
if (!skip && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(S3_ENDPOINT)) throw new Error('Only a local test bucket may be used');
const s3 = skip ? null : new S3Client({ region: 'us-east-1', endpoint: S3_ENDPOINT, forcePathStyle: true });
const keys = async (Prefix) => ((await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix }))).Contents || []).map((o) => o.Key);

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const avatar = (user) => api('POST', '/api/auth/profile/avatar', { token: user.token, form: fileForm('avatar', 'a.png', PNG, 'image/png') });
const upload = (user) => api('POST', '/api/files/upload', { token: user.token, form: fileForm('file', 'n.txt', 'bytes', 'text/plain') });
const record = (user, roomId) => api('POST', `/api/meetings/${roomId}/recordings`, { token: user.token, form: fileForm('recording', 'r.webm', 'rec', 'video/webm') });
const until = async (check, ms = 5000) => {
  const end = Date.now() + ms;
  while (!(await check()) && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
  return check();
};

test('TC-S3-001 a profile photo reaches the bucket, and replacing it removes the old one', { skip }, async () => {
  const me = await newUser('s3av');
  assert.equal((await avatar(me)).status, 200);
  const first = await keys(`avatars/${me.id}/`);
  assert.equal(first.length, 1, 'other app servers can only show what is in the bucket');
  assert.equal((await avatar(me)).status, 200);
  assert.ok(await until(async () => { const now = await keys(`avatars/${me.id}/`); return now.length === 1 && now[0] !== first[0]; }));
});

test('TC-S3-002 a shared file and a recording are stored in the bucket', { skip }, async () => {
  const me = await newUser('s3up');
  assert.equal((await upload(me)).status, 201);
  assert.equal((await keys(`files/${me.id}/`)).length, 1);
  const m = await newMeeting(me); await join(me, m.roomId);
  assert.equal((await record(me, m.roomId)).status, 201);
  assert.equal((await keys(`recordings/${m.roomId}/`)).length, 1);
});

test('TC-S3-003 deleting an account leaves none of its objects in the bucket', { skip }, async () => {
  const me = await newUser('s3del');
  await avatar(me); await upload(me);
  const m = await newMeeting(me); await join(me, m.roomId);
  await record(me, m.roomId);
  // the transcription job writes its files after the upload has answered
  await until(async () => (await keys(`transcripts/${m.roomId}/`)).length > 0, 8000);
  const prefixes = [`avatars/${me.id}/`, `files/${me.id}/`, `recordings/${m.roomId}/`, `transcripts/${m.roomId}/`];
  assert.equal((await api('DELETE', '/api/auth/me', { token: me.token, body: { password: PASSWORD } })).status, 200);
  const left = (await Promise.all(prefixes.map(keys))).flat();
  assert.deepEqual(left, []);
});
