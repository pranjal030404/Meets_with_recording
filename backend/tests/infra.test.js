import test from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import RealRedis from 'ioredis';
import { setRedisFactory, getRedis, closeRedis } from '../src/infrastructure/redis/redisClient.js';
import * as presence from '../src/realtime/presenceManager.js';
import { acquireLock, runExclusive, withLock } from '../src/infrastructure/redis/lock.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { registerShutdown, state } from '../src/lib/shutdown.js';

// REDIS_TEST_URL => run against a REAL Redis (Lua CAS, pipelines, TTLs behave for real); otherwise ioredis-mock
const shared = process.env.REDIS_TEST_URL ? new RealRedis(process.env.REDIS_TEST_URL) : new RedisMock();
if (process.env.REDIS_TEST_URL) await shared.flushall();
setRedisFactory(() => shared.duplicate());

test('presence: multi-tab / multi-instance transitions', async () => {
  const a = await presence.connect('u1', 's1');
  const b = await presence.connect('u1', 's2');       // second tab, maybe another instance
  assert.equal(a.wasOffline, true);
  assert.equal(b.wasOffline, false);
  assert.equal((await presence.disconnect('u1', 's1')).nowOffline, false);
  assert.equal(await presence.isOnline('u1'), true);
  assert.equal((await presence.disconnect('u1', 's2')).nowOffline, true);
  assert.equal(await presence.isOnline('u1'), false);
});

test('presence: stale sockets expire via TTL', async () => {
  await presence.connect('u2', 'dead');
  await getRedis().zadd('presence:u:u2', Date.now() - 1, 'dead'); // simulate crashed instance, heartbeat lapsed
  assert.equal(await presence.isOnline('u2'), false);
  assert.deepEqual([...await presence.onlineUserIds(['u2', 'u3'])], []);
});

test('lock: mutual exclusion and owner-only release', async () => {
  const l1 = await acquireLock('t', 5000);
  assert.ok(l1);
  assert.equal(await acquireLock('t', 5000), null);
  await l1.release();
  assert.ok(await acquireLock('t', 5000));
});

test('runExclusive: only one concurrent runner', async () => {
  let runs = 0;
  await closeRedisLocks();
  await Promise.all([1, 2, 3].map(() => runExclusive('job', 5000, async () => { runs++; await new Promise((r) => setTimeout(r, 30)); })));
  assert.equal(runs, 1);
});
const closeRedisLocks = async () => { for (const k of await getRedis().keys('lock:*')) await getRedis().del(k); };

test('withLock serialises critical sections', async () => {
  let active = 0, max = 0;
  await Promise.all([1, 2, 3, 4].map(() => withLock('cs', 2000, async () => { max = Math.max(max, ++active); await new Promise((r) => setTimeout(r, 10)); active--; })));
  assert.equal(max, 1);
});

test('rate limiter is shared across limiter instances (= app instances)', async () => {
  const mk = () => createRateLimiter({ windowMs: 60000, max: 3, prefix: 'rl:t' });
  const l1 = mk(), l2 = mk();
  const ns = [await l1.hit('ip'), await l2.hit('ip'), await l1.hit('ip'), await l2.hit('ip')];
  assert.deepEqual(ns, [1, 2, 3, 4]);
});

test('rate limiter degrades to local counting when Redis fails', async () => {
  const l = createRateLimiter({ windowMs: 60000, max: 2, prefix: 'rl:d' });
  const r = getRedis(); const orig = r.multi.bind(r);
  r.multi = () => { throw new Error('down'); };
  assert.equal(await l.hit('x'), 1); assert.equal(await l.hit('x'), 2);
  r.multi = orig;
});

test('presence falls back to local map when Redis commands throw', async () => {
  const r = getRedis(); const orig = r.multi.bind(r);
  r.multi = () => { throw new Error('down'); };
  assert.equal((await presence.connect('u9', 'sx')).wasOffline, true);
  r.multi = orig;
});

test('shutdown runs stages in order, continues after a failing stage, exits 0', async () => {
  const order = []; let code;
  const run = registerShutdown([['a', async () => order.push('a')], ['b', async () => { throw new Error('x'); }], ['c', async () => order.push('c')]], { exit: (c) => { code = c; }, timeoutMs: 1000 });
  await run('TEST');
  assert.deepEqual(order, ['a', 'c']); assert.equal(code, 0); assert.equal(state.draining, true);
});

test.after(async () => { await closeRedis(); shared.disconnect(); });
