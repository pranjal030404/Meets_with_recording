/**
 * Every Socket.IO event the server listens for, sent with no payload and with `null`, by a signed-in
 * user who is in no room. Starts its own throw-away server and restarts it after each crash.
 * Requires QA_APP_DIR.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { socket, newUser, closeSockets, sleep } from './helpers.js';

const APP = process.env.QA_APP_DIR;
const PORT = Number(process.env.QA_CRASH_PORT) || 15009;
const base = `http://127.0.0.1:${PORT}`;
let child = null, output = '', user = null;

async function start() {
  output = '';
  child = spawn(process.execPath, ['src/index.js'], { cwd: APP, env: { ...process.env, PORT: String(PORT), METRICS_PORT: '19999', MEDIASOUP_NUM_WORKERS: '1' } });
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ }
    await sleep(200);
  }
  throw new Error(`server did not start:\n${output.slice(-1500)}`);
}
const alive = () => child && child.exitCode === null && child.signalCode === null;
test.after(async () => { closeSockets(); child?.kill('SIGKILL'); });

const source = APP ? fs.readFileSync(`${APP}/src/sockets/index.js`, 'utf8') : '';
const events = [...source.matchAll(/socket\.on\('([^']+)'/g)].map((m) => m[1]).filter((e) => !['disconnect', 'disconnecting'].includes(e));

let n = 0;
for (const event of events) {
  for (const [label, args] of [['no', []], ['a null', [null]]]) {
    const id = `TC-FUZZ-${String(++n).padStart(3, '0')}`;
    test(`${id} server survives "${event}" sent with ${label} payload`, async () => {
      if (!alive()) await start();
      user ||= await newUser('fuzz', { base });
      const s = await socket(user, base);
      s.emit(event, ...args);
      await sleep(250);
      const died = !alive();
      const why = (output.match(/(TypeError|Error):[^\n]*/g) || []).pop();
      s.close();
      if (died) child = null;
      assert.ok(!died, `SERVER PROCESS EXITED: ${why}`);
    });
  }
}
