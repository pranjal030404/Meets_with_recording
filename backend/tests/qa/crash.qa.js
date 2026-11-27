/**
 * Resilience: can one signed-in client bring the server down with an unexpected socket payload?
 * Starts its OWN throw-away server process per probe (so a crash is observable and harmless).
 * Requires QA_APP_DIR = backend folder with a .env pointing at a DISPOSABLE database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { socket, newUser, closeSockets, sleep } from './helpers.js';

const APP = process.env.QA_APP_DIR;
const PORT = Number(process.env.QA_CRASH_PORT) || 15009;
const base = `http://127.0.0.1:${PORT}`;
let child = null, output = '';

async function start() {
  output = '';
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: APP,
    env: { ...process.env, PORT: String(PORT), METRICS_PORT: '19999', MEDIASOUP_NUM_WORKERS: '1' },
  });
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`server did not start:\n${output.slice(-2000)}`);
}
const alive = () => child && child.exitCode === null && child.signalCode === null;
const stop = async () => { if (alive()) { child.kill('SIGKILL'); await new Promise((r) => child.once('exit', r)); } child = null; };

test.after(async () => { closeSockets(); await stop(); });

const probes = {
  'media:toggle-mute': [],
  'media:toggle-video': [],
  'media:screen-share': [],
  'chat:send': [],
  'chat:typing': [],
  'host:mute-user': [],
  'caption:text': [null],
  'notes:request': [],
  'reaction:emoji': [],
  'timer:start': [null],
  'tools:request': [],
  'team:join': [],
  'team:leave': [],
  'conversation:leave': [],
  'presence:status-update': [],
};

let n = 0;
for (const [event, args] of Object.entries(probes)) {
  const id = `TC-CRASH-${String(++n).padStart(3, '0')}`;
  test(`${id} server survives "${event}" sent with ${args.length ? 'a null' : 'no'} payload`, { skip: !APP && 'set QA_APP_DIR' }, async () => {
    if (!alive()) await start();
    const u = await newUser('crash', { base });
    const s = await socket(u, base);
    s.emit(event, ...args);
    await sleep(700);
    const died = !alive();
    const why = (output.match(/(TypeError|Error):[^\n]*/g) || []).pop();
    s.close();
    if (died) child = null;
    assert.ok(!died, `SERVER PROCESS EXITED: ${why}`);
  });
}
