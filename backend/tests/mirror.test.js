import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { moveToObjectStorage } from '../src/storage/mirror.js';

test('local driver: no-op, file stays', async () => {
  const f = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'm-')), 'a.txt'); await fs.writeFile(f, 'x');
  assert.equal(await moveToObjectStorage('files/u/a.txt', f, 'text/plain', { name: 'local' }), false);
  await fs.access(f);
});
test('s3 driver: uploads the stream then deletes the local copy', async () => {
  const f = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'm-')), 'a.txt'); await fs.writeFile(f, 'payload');
  let got = ''; const st = { name: 's3', putObject: async (k, body, o) => { for await (const c of body) got += c; st.key = k; st.ct = o.contentType; } };
  assert.equal(await moveToObjectStorage('files/u/a.txt', f, 'text/plain', st), true);
  assert.equal(got, 'payload'); assert.equal(st.key, 'files/u/a.txt'); assert.equal(st.ct, 'text/plain');
  await assert.rejects(fs.access(f));
});
test('s3 upload failure keeps the local file (still served)', async () => {
  const f = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'm-')), 'a.txt'); await fs.writeFile(f, 'payload');
  const st = { name: 's3', putObject: async () => { throw new Error('bucket down'); } };
  assert.equal(await moveToObjectStorage('files/u/a.txt', f, 'text/plain', st), false);
  await fs.access(f);
});
