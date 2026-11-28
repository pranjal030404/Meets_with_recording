/**
 * The merged transcript of a meeting. A transcript normally needs a speech engine, so the recording's text is written
 * straight into the disposable database (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD as given to the server).
 * TC-TR-002 and 003 also need QA_APP_DIR and the server's JWT_SECRET.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { api, newUser, newMeeting, join } from './helpers.js';

const { DB_HOST = '127.0.0.1', DB_PORT = '3306', DB_NAME, DB_USER, DB_PASSWORD = '' } = process.env;
const skip = !DB_NAME || !/^(127\.0\.0\.1|localhost)$/.test(DB_HOST);

test('TC-TR-001 a freshly built transcript does not reveal where the server keeps files', { skip }, async () => {
  const host = await newUser('tr');
  const m = await newMeeting(host); await join(host, m.roomId);
  const db = await mysql.createConnection({ host: DB_HOST, port: Number(DB_PORT), database: DB_NAME, user: DB_USER, password: DB_PASSWORD });
  const recordings = [{ id: 'r1', filename: 'r1.webm', transcription: { status: 'completed', provider: 'test', text: 'hello', segments: [{ start: 0, end: 1, text: 'hello' }] } }];
  await db.execute('UPDATE Meetings SET recordings = ? WHERE roomId = ?', [JSON.stringify(recordings), m.roomId]);
  await db.end();

  for (const cached of [false, true]) {
    const r = await api('POST', `/api/meetings/${m.roomId}/complete-transcript`, { token: host.token, body: {} });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.data.cached, cached);
    assert.ok(r.body.data.completeTranscript.files.txt.url);
    assert.doesNotMatch(r.text, /"path"/, 'a server file path is in the answer');
  }
});

const { QA_APP_DIR, JWT_SECRET } = process.env;
const noService = skip || !QA_APP_DIR || !JWT_SECRET;
const fromApp = (file) => import(pathToFileURL(path.join(QA_APP_DIR, file)).href);
test.after(async () => { if (!noService) await (await fromApp('src/database/index.js')).sequelize.close(); });

test('TC-TR-002 a transcription that finishes after its recording was erased leaves nothing behind', { skip: noService }, async () => {
  const host = await newUser('trgone');
  const m = await newMeeting(host); await join(host, m.roomId);
  const { runTranscription } = await fromApp('src/services/recordingService.js');

  // as erasure leaves it: the meeting no longer lists the recording, while the job still holds its details
  const recording = { id: 'erased-1', path: path.join(QA_APP_DIR, 'uploads/recordings', m.roomId, 'erased-1.webm'), duration: 1 };
  fs.mkdirSync(path.dirname(recording.path), { recursive: true });
  fs.writeFileSync(recording.path, 'sound');
  await runTranscription({ meetingId: m.id, roomId: m.roomId, recording, language: 'en', context: {} }, { throwOnError: true });
  const transcripts = path.join(QA_APP_DIR, 'uploads/transcripts', m.roomId);
  assert.deepEqual(fs.existsSync(transcripts) ? fs.readdirSync(transcripts) : [], [], 'transcript files were left behind');
  assert.ok(!fs.existsSync(recording.path), 'the recording copy was left behind');
});

test('TC-TR-003 a recording that is still there keeps its files, and a failure is reported as one', { skip: noService }, async () => {
  const host = await newUser('trkept');
  const m = await newMeeting(host); await join(host, m.roomId);
  const { runTranscription } = await fromApp('src/services/recordingService.js');
  const file = (id) => path.join(QA_APP_DIR, 'uploads/recordings', m.roomId, `${id}.webm`);
  const recordings = ['kept', 'broken'].map((id) => ({ id, filename: `${id}.webm`, path: file(id), transcription: { status: 'queued' } }));
  fs.mkdirSync(path.dirname(file('kept')), { recursive: true });
  fs.writeFileSync(file('kept'), 'sound'); // 'broken' has no file
  const db = await mysql.createConnection({ host: DB_HOST, port: Number(DB_PORT), database: DB_NAME, user: DB_USER, password: DB_PASSWORD });
  await db.execute('UPDATE Meetings SET recordings = ? WHERE roomId = ?', [JSON.stringify(recordings), m.roomId]);
  await db.end();

  const run = (recording) => runTranscription({ meetingId: m.id, roomId: m.roomId, recording, language: 'en', context: {} }, { throwOnError: true });
  await run(recordings[0]);
  await assert.rejects(run(recordings[1]), /not available/);
  assert.ok(fs.existsSync(file('kept')), 'the recording was removed');
  assert.ok(fs.existsSync(path.join(QA_APP_DIR, 'uploads/transcripts', m.roomId, 'kept.txt')), 'the transcript was removed');
  const got = (await api('GET', `/api/meetings/${m.roomId}`, { token: host.token })).body.data.meeting.recordings;
  assert.equal(got.find((r) => r.id === 'broken').transcription.status, 'failed');
  assert.notEqual(got.find((r) => r.id === 'kept').transcription.status, 'queued');
});
