import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkConfig, jwtSecretProblem } from '../src/lib/configCheck.js';
import { blockedExtension, scanFile, uploadRefusal } from '../src/lib/uploadSafety.js';

test('weak signing secrets are rejected', () => {
  for (const bad of ['', 'short', 'your-super-secret-jwt-key-change-in-production']) assert.ok(jwtSecretProblem(bad), bad);
  assert.equal(jwtSecretProblem('4f'.repeat(32)), null);
  assert.equal(checkConfig({ JWT_SECRET: '4f'.repeat(32) }).fatal.length, 0);
  assert.equal(checkConfig({}).fatal.length, 1);
});

test('blocked extensions can be replaced or turned off', () => {
  assert.equal(blockedExtension('a.exe', {}), 'exe');
  assert.equal(blockedExtension('a.pdf', {}), null);
  assert.equal(blockedExtension('a.pdf', { BLOCKED_UPLOAD_EXTENSIONS: 'pdf' }), 'pdf');
  assert.equal(blockedExtension('a.exe', { BLOCKED_UPLOAD_EXTENSIONS: 'none' }), null);
});

// a stand-in clamd: reads the INSTREAM chunks and answers according to their content
const fakeClamd = () => net.createServer((c) => {
  let buf = Buffer.alloc(0);
  c.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (buf.length >= 14 && buf.subarray(-4).equals(Buffer.alloc(4))) c.end(buf.includes('VIRUS') ? 'stream: Test-Signature FOUND\0' : 'stream: OK\0');
  });
});

test('virus scanning: clean passes, infected is refused, an unreachable scanner refuses too', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  const file = (name, body) => { const p = path.join(dir, name); fs.writeFileSync(p, body); return p; };
  const server = fakeClamd();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const opts = { host: '127.0.0.1', port: server.address().port };
  assert.deepEqual(await scanFile(file('c', 'x'.repeat(200000)), opts), { clean: true });
  assert.deepEqual(await scanFile(file('v', 'VIRUS'), opts), { clean: false, signature: 'Test-Signature' });
  await new Promise((r) => server.close(r));
  await assert.rejects(scanFile(file('d', 'x'), opts));
  Object.assign(process.env, { CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(opts.port) });
  try {
    assert.equal((await uploadRefusal({ originalname: 'a.txt', path: file('e', 'x') })).status, 503);
  } finally {
    delete process.env.CLAMAV_HOST; delete process.env.CLAMAV_PORT;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
