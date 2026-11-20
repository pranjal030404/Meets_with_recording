import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { createLocalDriver } from '../src/storage/localDriver.js';
import { createS3Driver } from '../src/storage/s3Driver.js';
import { assertSafeKey } from '../src/storage/keys.js';

test('keys: traversal and malformed keys are rejected', () => {
  for (const bad of ['../x', '/abs', 'a/../b', 'a//b', 'a\\b', '', 'a/./b', 'a\0b']) assert.throws(() => assertSafeKey(bad), /Invalid/);
  assert.equal(assertSafeKey('recordings/room1/f.webm'), 'recordings/room1/f.webm');
});

test('local driver: signed URL works, tampering / expiry / other-key rejected, confined to root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'store-'));
  const d = createLocalDriver({ root, secret: 's3cret' });
  await d.putObject('recordings/r1/a.webm', Buffer.from('hello'));
  assert.deepEqual(await d.headObject('recordings/r1/a.webm'), { size: 5 });
  const url = await d.getSignedDownloadUrl('recordings/r1/a.webm', { expiresSec: 60, filename: 'a.webm' });
  const token = new URL(url, 'http://x').searchParams.get('t');
  assert.equal(d.verifyToken(token).path, path.join(root, 'recordings/r1/a.webm'));
  const [payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ k: 'recordings/r2/b.webm', e: 9e12, f: null })).toString('base64url');
  assert.equal(d.verifyToken(`${forged}.${sig}`), null);          // payload swapped, old signature
  assert.equal(d.verifyToken(`${payload}.${sig.slice(0, -2)}xx`), null);
  assert.equal(createLocalDriver({ root, secret: 'other' }).verifyToken(token), null); // wrong secret
  const expired = await d.getSignedDownloadUrl('recordings/r1/a.webm', { expiresSec: -10 });
  assert.equal(d.verifyToken(new URL(expired, 'http://x').searchParams.get('t')), null);
  await assert.rejects(() => d.getSignedDownloadUrl('../etc/passwd'));
});

test('s3 driver: presigned URLs are generated offline, private-bucket style, time-limited', async () => {
  process.env.AWS_ACCESS_KEY_ID = 'AKIATEST'; process.env.AWS_SECRET_ACCESS_KEY = 'secret';
  const d = createS3Driver({ bucket: 'b', region: 'eu-west-1', prefix: 'prod/' });
  const dl = new URL(await d.getSignedDownloadUrl('recordings/r1/a.webm', { expiresSec: 120, filename: 'my rec.webm' }));
  assert.match(dl.host, /s3\.eu-west-1\.amazonaws\.com$/);
  assert.ok(dl.pathname.endsWith('/prod/recordings/r1/a.webm') && dl.pathname.includes('b'));
  assert.equal(dl.searchParams.get('X-Amz-Expires'), '120');
  assert.ok(dl.searchParams.get('X-Amz-Signature'));
  assert.match(dl.searchParams.get('response-content-disposition'), /attachment/);
  const up = new URL(await d.getSignedUploadUrl('recordings/r1/b.webm', { contentType: 'video/webm' }));
  assert.ok(up.searchParams.get('X-Amz-SignedHeaders').includes('content-type'));
  const part = new URL(await d.getSignedPartUrl('recordings/r1/b.webm', 'UP1', 3));
  assert.equal(part.searchParams.get('partNumber'), '3'); assert.equal(part.searchParams.get('uploadId'), 'UP1');
  await assert.rejects(async () => d.getSignedDownloadUrl('../x'));
});
