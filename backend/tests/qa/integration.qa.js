/**
 * Integrations: SMTP (against a local fake mail sink; nothing is ever sent), the scheduled reminder job,
 * recording -> transcription -> summary. Starts its own server on QA_MAIL_PORT. Requires QA_APP_DIR.
 * The reminder test waits for two cron ticks (up to ~2.5 minutes).
 * Run only ONE server against the database: every extra instance without Redis sends its own copy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { api, newUser, adminToken, uid, sleep, PASSWORD, fileForm } from './helpers.js';

const APP = process.env.QA_APP_DIR;
const PORT = Number(process.env.QA_MAIL_PORT) || 15005;
const SMTP_PORT = 12525;
const base = `http://127.0.0.1:${PORT}`;
const skip = !APP && 'set QA_APP_DIR';

const mail = [];
let smtpFail = false;
const sink = net.createServer((c) => {
  let data = '', inData = false, buf = '', to = [], authStep = 0;
  const say = (s) => c.write(`${s}\r\n`);
  say('220 sink');
  c.on('error', () => {});
  c.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (inData) {
        if (line === '.') { inData = false; mail.push({ to: [...to], raw: data }); data = ''; to = []; say('250 ok'); } else data += `${line}\n`;
        continue;
      }
      if (authStep === 1) { authStep = 2; say('334 UGFzc3dvcmQ6'); continue; }
      if (authStep === 2) { authStep = 0; say('235 ok'); continue; }
      if (/^EHLO|^HELO/i.test(line)) say('250-sink\r\n250 AUTH PLAIN LOGIN');
      else if (/^AUTH PLAIN/i.test(line)) say('235 ok');
      else if (/^AUTH LOGIN/i.test(line)) { authStep = 1; say('334 VXNlcm5hbWU6'); }
      else if (/^MAIL/i.test(line)) say(smtpFail ? '451 temporary failure' : '250 ok');
      else if (/^RCPT/i.test(line)) { to.push(line.match(/<(.*)>/)?.[1]); say('250 ok'); }
      else if (/^DATA/i.test(line)) { inData = true; say('354 go'); }
      else if (/^QUIT/i.test(line)) { say('221 bye'); c.end(); }
      else say('250 ok');
    }
  });
});
const decode = (raw) => raw.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
async function mailTo(address, pattern, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = [...mail].reverse().find((m) => m.to.includes(address) && pattern.test(decode(m.raw)));
    if (hit) return decode(hit.raw);
    await sleep(100);
  }
  return null;
}

let child, output = '', admin;
const call = (m, p, o = {}) => api(m, p, { ...o, base });
const setVerification = (on) => call('PUT', '/api/admin/settings', { token: admin, body: { emailVerificationEnabled: on } });

test.before(async () => {
  if (skip) return;
  await new Promise((r) => sink.listen(SMTP_PORT, '127.0.0.1', r));
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: APP,
    env: {
      ...process.env, PORT: String(PORT), METRICS_PORT: '19466', MEDIASOUP_NUM_WORKERS: '1',
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SMTP_USER: 'qa', SMTP_PASS: 'qa', MAIL_FROM: 'qa@example.test',
    },
  });
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
    await sleep(200);
  }
  admin = (await call('POST', '/api/admin/auth/login', { body: { email: process.env.QA_ADMIN_EMAIL || 'qa-admin@example.test', password: process.env.QA_ADMIN_PASSWORD || 'QaAdmin!2026' } })).body.data.token;
});
test.after(async () => {
  if (skip) return;
  await setVerification(false).catch(() => {});
  child.kill('SIGKILL');
  sink.close();
});

test('TC-INT-001 email verification: no session until the emailed link is used; link is single use', { skip }, async () => {
  assert.equal((await setVerification(true)).status, 200);
  const email = `verify.${uid()}@example.test`;
  const r = await call('POST', '/api/auth/signup', { body: { name: 'Verify Me', email, password: PASSWORD } });
  assert.equal(r.status, 201);
  assert.ok(!r.body.data.token);
  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } })).body.code, 'EMAIL_NOT_VERIFIED');
  const body = await mailTo(email, /verify-email\?token=/);
  assert.ok(body, 'no verification mail arrived');
  const token = body.match(/token=([0-9a-f]{64})/)[1];
  assert.equal((await call('POST', '/api/auth/verify-email', { body: { token } })).status, 200);
  assert.equal((await call('POST', '/api/auth/verify-email', { body: { token } })).status, 400);
  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } })).status, 200);
});

test('TC-INT-002 resend-verification does not reveal whether an account exists', { skip }, async () => {
  await setVerification(true);
  const email = `enum.${uid()}@example.test`;
  await call('POST', '/api/auth/signup', { body: { name: 'Enum', email, password: PASSWORD } });
  const real = await call('POST', '/api/auth/resend-verification', { body: { email } });
  const ghost = await call('POST', '/api/auth/resend-verification', { body: { email: `ghost.${uid()}@example.test` } });
  assert.equal(real.status, ghost.status, `existing=${real.status}, unknown=${ghost.status}`);
});

test('TC-INT-003 signup survives an SMTP outage and says the mail was not sent', { skip }, async () => {
  await setVerification(true);
  smtpFail = true;
  const r = await call('POST', '/api/auth/signup', { body: { name: 'Outage', email: `out.${uid()}@example.test`, password: PASSWORD } });
  smtpFail = false;
  assert.equal(r.status, 201);
  assert.equal(r.body.data.emailSent, false);
  await setVerification(false);
});

test('TC-INT-004 password change with emailed code revokes older sessions', { skip }, async () => {
  await setVerification(false);
  const u = await newUser('pw', { base });
  const other = (await call('POST', '/api/auth/login', { body: { email: u.email, password: PASSWORD } })).body.data.token;
  await sleep(1100);
  const body = { currentPassword: PASSWORD, newPassword: 'Brand-new-pass-9' };
  assert.equal((await call('POST', '/api/auth/change-password/code', { token: u.token, body })).status, 200);
  const code = (await mailTo(u.email, /password change code/i)).match(/password is (\d{6})/)[1];
  const r = await call('POST', '/api/auth/change-password', { token: u.token, body: { ...body, code } });
  assert.equal(r.status, 200, r.text);
  assert.equal((await call('GET', '/api/auth/me', { token: other })).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { token: r.body.data.token })).status, 200);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: u.email, password: PASSWORD } })).status, 401);
});

test('TC-INT-005 password code dies after 5 wrong tries', { skip }, async () => {
  const u = await newUser('otp', { base });
  const body = { currentPassword: PASSWORD, newPassword: 'Brand-new-pass-9' };
  await call('POST', '/api/auth/change-password/code', { token: u.token, body });
  const code = (await mailTo(u.email, /password change code/i)).match(/password is (\d{6})/)[1];
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await call('POST', '/api/auth/change-password', { token: u.token, body: { ...body, code: wrong } });
  assert.equal((await call('POST', '/api/auth/change-password', { token: u.token, body: { ...body, code } })).status, 400);
});

test('TC-INT-006 team invite and task assignment send mail with user text HTML-escaped', { skip }, async () => {
  const o = await newUser('o', { base }); const m = await newUser('m', { base });
  const team = (await call('POST', '/api/teams', { token: o.token, body: { name: '<img src=x> Team' } })).body;
  await call('POST', `/api/teams/${team.id}/invite`, { token: o.token, body: { email: m.email } });
  const invite = await mailTo(m.email, /invited you to/);
  assert.ok(invite, 'invite mail');
  assert.ok(invite.includes('&lt;img'), 'team name must be escaped in HTML part');
  await call('POST', '/api/tasks', { token: o.token, body: { title: '<b>task</b>', teamId: team.id, assigneeId: m.id } });
  assert.ok(await mailTo(m.email, /assigned you a task|new task/i), 'task mail');
});

test('TC-INT-007 meeting invitation is emailed (FEATURES.md section 8 claims this)', { skip }, async () => {
  const h = await newUser('h', { base }); const g = await newUser('g', { base });
  const title = `emailed-${uid()}`;
  await call('POST', '/api/meetings', { token: h.token, body: { title, scheduledAt: new Date(Date.now() + 86400000).toISOString(), invitees: [{ email: g.email }] } });
  assert.ok(await mailTo(g.email, new RegExp(title), 3000), 'no email was sent to the meeting invitee');
});

test('TC-INT-008 a 15-minute reminder is delivered exactly once', { skip, timeout: 240000 }, async () => {
  const h = await newUser('rem', { base });
  // The job runs at each minute boundary and fires while 14 <= whole minutes left <= 15. Starting the meeting
  // 15m30s after the next boundary guarantees two ticks fall inside that window (no dependence on luck).
  const tick = Math.ceil((Date.now() + 5000) / 60000) * 60000;
  const r = await call('POST', '/api/meetings', { token: h.token, body: { title: 'Reminder probe', scheduledAt: new Date(tick + 15 * 60000 + 30000).toISOString() } });
  assert.equal(r.status, 201);
  await sleep(tick + 75000 - Date.now());
  const list = (await call('GET', '/api/notifications', { token: h.token })).body.data.notifications
    .filter((n) => n.type === 'meeting_reminder');
  assert.equal(list.length, 1, `${list.length} identical reminders delivered`);
});

test('TC-INT-009 recording is transcribed and the status reaches a final state', { skip, timeout: 240000 }, async () => {
  const u = await newUser('rec', { base });
  const m = (await call('POST', '/api/meetings', { token: u.token, body: {} })).body.data.meeting;
  const file = path.join(os.tmpdir(), `qa-${uid()}.webm`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libopus', file]);
  const up = await call('POST', `/api/meetings/${m.roomId}/recordings`, { token: u.token, form: fileForm('recording', 'r.webm', fs.readFileSync(file), 'audio/webm', { duration: '2' }) });
  fs.rmSync(file);
  assert.equal(up.status, 201);
  let status;
  for (let i = 0; i < 60; i++) {
    status = (await call('GET', `/api/meetings/${m.roomId}`, { token: u.token })).body.data.meeting.recordings[0].transcription.status;
    if (status === 'completed' || status === 'failed') break;
    await sleep(500);
  }
  assert.ok(['completed', 'failed'].includes(status), status);
});

test('TC-INT-010 AI summarize still answers when no language model is running', { skip }, async () => {
  const u = await newUser('ai', { base });
  const r = await call('POST', '/api/ai/summarize', { token: u.token, body: { text: 'We decided to ship on Friday. Priya will write the release notes before Thursday.' } });
  assert.equal(r.status, 200);
  assert.ok(r.body.data.summary.length > 10);
});

test('TC-INT-011 forgotten password: emailed code sets a new password and ends old sessions', { skip }, async () => {
  await setVerification(false);
  const u = await newUser('forgot', { base });
  await sleep(1100);
  assert.equal((await call('POST', '/api/auth/forgot-password', { body: { email: u.email } })).status, 200);
  const code = (await mailTo(u.email, /password reset code/i)).match(/password is (\d{6})/)[1];
  const r = await call('POST', '/api/auth/reset-password', { body: { email: u.email, code, newPassword: 'Reset-pass-42' } });
  assert.equal(r.status, 200, r.text);
  assert.equal((await call('GET', '/api/auth/me', { token: u.token })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: u.email, password: PASSWORD } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: u.email, password: 'Reset-pass-42' } })).status, 200);
  assert.equal((await call('POST', '/api/auth/reset-password', { body: { email: u.email, code, newPassword: 'Reset-pass-43' } })).status, 400, 'a code works once');
});

test('TC-INT-012 with verification on, signup does not reveal that an address already has an account', { skip }, async () => {
  const taken = `taken.${uid()}@example.test`;
  const signup = (email) => call('POST', '/api/auth/signup', { body: { name: 'Same Answer', email, password: PASSWORD } });
  await setVerification(false);
  assert.equal((await signup(taken)).status, 201);
  await setVerification(true);
  try {
    const again = await signup(taken);
    const fresh = await signup(`new.${uid()}@example.test`);
    assert.equal(again.status, fresh.status);
    assert.equal(again.body.message, fresh.body.message);
    assert.deepEqual(Object.keys(again.body.data).sort(), Object.keys(fresh.body.data).sort());
    for (let i = 0; i < 50 && !mail.some((m) => m.to.includes(taken) && /already have/i.test(m.raw)); i++) await sleep(100);
    assert.ok(mail.some((m) => m.to.includes(taken) && /already have/i.test(m.raw)), 'the owner of the address is told by email');
  } finally {
    await setVerification(false);
  }
});

// strangers fail to sign in until a device that is new to the account is refused
const attackFrom = (n, extra = {}) => ({ 'X-Forwarded-For': `203.0.113.${n}`, ...extra });
const signIn = (email, password, headers) => call('POST', '/api/auth/login', { headers, body: { email, password } });
const resetFrom = async (u, headers, newPassword) => {
  assert.equal((await call('POST', '/api/auth/forgot-password', { headers, body: { email: u.email } })).status, 200);
  const code = (await mailTo(u.email, /password reset code/i)).match(/password is (\d{6})/)[1];
  return call('POST', '/api/auth/reset-password', { headers, body: { email: u.email, code, newPassword } });
};

test('TC-INT-013 somebody refused during an attack is told about the reset, and gets in with it', { skip }, async () => {
  await setVerification(false);
  const u = await newUser('attacked', { base });
  for (const n of [111, 112, 113]) for (let i = 0; i < 10; i++) await signIn(u.email, 'wrong-password', attackFrom(n));
  const refused = await signIn(u.email, PASSWORD, attackFrom(114));
  assert.equal(refused.status, 429);
  assert.match(refused.body.message, /Forgot password/);
  const reset = await resetFrom(u, attackFrom(114), 'Reset-pass-42');
  assert.equal(reset.status, 200, reset.text);
  assert.equal((await signIn(u.email, 'Reset-pass-42', attackFrom(114, { 'X-Device-Token': reset.body.data.deviceToken }))).status, 200);
});

test('TC-INT-014 a reset also lifts the limit on a device the owner has used up themselves', { skip }, async () => {
  await setVerification(false);
  const u = await newUser('forgetful', { base });
  const mark = (await signIn(u.email, PASSWORD, attackFrom(115))).body.data.deviceToken;
  const headers = attackFrom(115, { 'X-Device-Token': mark });
  for (let i = 0; i < 10; i++) await signIn(u.email, 'wrong-password', headers);
  assert.equal((await signIn(u.email, PASSWORD, headers)).status, 429);
  const reset = await resetFrom(u, headers, 'Reset-pass-42');
  assert.equal(reset.status, 200, reset.text);
  assert.equal((await signIn(u.email, 'Reset-pass-42', headers)).status, 200);
});
