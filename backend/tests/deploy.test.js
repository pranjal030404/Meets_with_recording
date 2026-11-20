import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { createRequire } from 'module';
import { makeTurnCredential, buildIceServers } from '../src/lib/turnCredentials.js';
const { buildApps } = createRequire(import.meta.url)('../ecosystem.multinode.config.cjs');

test('TURN credential: coturn REST scheme, expires, verifiable only with the secret', () => {
  const now = 1_700_000_000_000;
  const { username, credential } = makeTurnCredential('user-1', 'topsecret', 600, now);
  assert.equal(username, `${1_700_000_600}:user-1`);
  assert.equal(credential, crypto.createHmac('sha1', 'topsecret').update(username).digest('base64'));
  assert.notEqual(credential, makeTurnCredential('user-1', 'other', 600, now).credential);
});

test('ICE servers: no TURN without secret; secret never appears in the response; per-user creds', () => {
  const none = buildIceServers('u', { STUN_URLS: 'stun:s:3478' });
  assert.deepEqual(none.iceServers, [{ urls: ['stun:s:3478'] }]);
  const env = { TURN_SECRET: 'sekrit', TURN_URLS: 'turn:t:3478?transport=udp, turns:t:443?transport=tcp', TURN_TTL_SEC: '900' };
  const a = buildIceServers('alice', env), b = buildIceServers('bob', env);
  assert.equal(a.iceServers[1].urls.length, 2);
  assert.ok(!JSON.stringify(a).includes('sekrit'));
  assert.notEqual(a.iceServers[1].username, b.iceServers[1].username);
  assert.equal(a.ttlSec, 900);
});

test('PM2 multinode: unique ports/ids, disjoint mediasoup ranges, cores split, requires public URL for >1 node', () => {
  const apps = buildApps({ NODES_PER_HOST: '3', HOST_ID: 'h1', CPU_CORES: '8', NODE_PUBLIC_URL_PATTERN: 'https://{host}-{i}.x.test', WORKER_PROCESSES: '1' });
  const nodes = apps.filter((a) => a.name.startsWith('meetclone-node'));
  const e = nodes.map((n) => n.env_production);
  assert.equal(new Set(e.map((x) => x.PORT)).size, 3);
  assert.equal(new Set(e.map((x) => x.NODE_ID)).size, 3);
  assert.deepEqual(e.map((x) => x.NODE_PUBLIC_URL), ['https://h1-1.x.test', 'https://h1-2.x.test', 'https://h1-3.x.test']);
  for (let i = 1; i < 3; i++) assert.ok(e[i].MEDIASOUP_MIN_PORT > e[i - 1].MEDIASOUP_MAX_PORT);
  assert.ok(e.every((x) => x.MEDIASOUP_NUM_WORKERS === 2 && x.WORKERS_IN_PROCESS === 'false' && x.REDIS_REQUIRED === 'true'));
  assert.equal(apps.filter((a) => a.name.startsWith('meetclone-worker')).length, 1);
  assert.throws(() => buildApps({ NODES_PER_HOST: '2' }), /NODE_PUBLIC_URL_PATTERN/);
  assert.equal(buildApps({})[0].env_production.REDIS_REQUIRED, 'false'); // single node stays backward compatible
});
