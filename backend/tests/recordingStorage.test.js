import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
process.env.JWT_SECRET ||= 'x';
const { mirrorFile, ensureLocalRecording } = await import('../src/services/recordingService.js');

const fakeS3 = () => {
  const objects = new Map();
  return {
    name: 's3', objects,
    async putObject(key, body) { const chunks = []; for await (const c of body) chunks.push(c); objects.set(key, Buffer.concat(chunks)); },
    async downloadToFile(key, dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, objects.get(key)); },
  };
};

test('mirrorFile is a no-op on the local driver', async () => {
  assert.equal(await mirrorFile('/x/y.webm', 'video/webm', { name: 'local' }), null);
});

test('recording uploaded on node A can be transcribed on node B via the bucket', async () => {
  const s3 = fakeS3();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
  const file = path.join(dir, 'a.webm'); fs.writeFileSync(file, 'media-bytes');
  // mirrorFile derives the key relative to uploadsRoot; emulate by calling the driver with the same shape
  const key = 'recordings/room1/a.webm';
  await s3.putObject(key, fs.createReadStream(file));
  const nodeB = path.join(dir, 'nodeB', 'a.webm');
  const p = await ensureLocalRecording({ path: nodeB, storageKey: key }, s3);
  assert.equal(fs.readFileSync(p, 'utf8'), 'media-bytes');
});

test('missing everywhere -> clear error', async () => {
  await assert.rejects(() => ensureLocalRecording({ path: '/nope/none.webm' }, fakeS3()), /not available/);
});

test('mirrorFile failure never throws (local copy stays authoritative)', async () => {
  const bad = { name: 's3', putObject: async () => { throw new Error('boom'); } };
  assert.equal(await mirrorFile(path.join(process.cwd(), 'uploads', 'recordings', 'r', 'x.webm'), 'video/webm', bad), null);
});
