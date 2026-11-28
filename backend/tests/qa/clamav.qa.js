/**
 * Uploads against a real virus scanner. Start the server with CLAMAV_HOST (and CLAMAV_PORT) and set CLAMAV_HOST here;
 * skipped otherwise. Uses EICAR, the harmless standard test file every scanner reports.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, newUser, newMeeting, join, fileForm } from './helpers.js';

const skip = !process.env.CLAMAV_HOST;
// assembled here so that this source file is not itself reported
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE', '!$H+H*'].join('');
const share = (user, name, content) => api('POST', '/api/files/upload', { token: user.token, form: fileForm('file', name, content, 'text/plain') });

test('TC-AV-001 a clean file is accepted and the test virus is refused', { skip }, async () => {
  const u = await newUser('av');
  assert.equal((await share(u, 'clean.txt', 'nothing to see')).status, 201);
  const bad = await share(u, 'notes.txt', EICAR);
  assert.equal(bad.status, 422, bad.text);
  const mine = await api('GET', '/api/files', { token: u.token });
  assert.deepEqual(mine.body.data.files.map((f) => f.originalName), ['clean.txt'], 'the refused file was not kept');
});

test('TC-AV-002 an infected recording is refused', { skip }, async () => {
  const u = await newUser('avrec');
  const m = await newMeeting(u); await join(u, m.roomId);
  const r = await api('POST', `/api/meetings/${m.roomId}/recordings`, { token: u.token, form: fileForm('recording', 'r.webm', EICAR, 'video/webm') });
  assert.equal(r.status, 422, r.text);
});
