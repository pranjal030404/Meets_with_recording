// Requires a REAL Redis: REDIS_TEST_URL=redis://localhost:6379 npm test   (skipped otherwise)
// Verified against redis-server 8.x on localhost during development.
import test from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.REDIS_TEST_URL;
if (URL) process.env.REDIS_URL = URL;
const skip = !URL;

const { Worker, Queue, QueueEvents } = await import('bullmq');
const { enqueue, getQueue, closeQueues, queueCounts } = await import('../src/queues/index.js');
const { closeRedis, createRedisConnection } = await import('../src/infrastructure/redis/redisClient.js');

const opened = [];
const conn = () => { const c = createRedisConnection('t', { maxRetriesPerRequest: null, enableOfflineQueue: true }); opened.push(c); return c; };

test('retries with exponential backoff until success', { skip }, async () => {
  const q = new Queue('email', { connection: conn() });
  await q.obliterate({ force: true });
  const events = new QueueEvents('email', { connection: conn() });
  let calls = 0;
  const w = new Worker('email', async () => { calls++; if (calls < 3) throw new Error('smtp down'); return 'ok'; }, { connection: conn() });
  const job = await q.add('email', { to: 'a@b.c' }, { attempts: 5, backoff: { type: 'exponential', delay: 50 } });
  await job.waitUntilFinished(events, 5000);
  assert.equal(calls, 3);
  await w.close(); await events.close(); await q.obliterate({ force: true }); await q.close();
});

test('job failing every attempt ends in the failed set (dead-letter store)', { skip }, async () => {
  const q = new Queue('email', { connection: conn() });
  await q.obliterate({ force: true });
  const w = new Worker('email', async () => { throw new Error('always'); }, { connection: conn() });
  const done = new Promise((r) => w.on('failed', (j) => { if (j.attemptsMade === 2) r(); }));
  await q.add('email', { to: 'x' }, { attempts: 2, backoff: { type: 'exponential', delay: 20 }, removeOnFail: { count: 100 } });
  await done;
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await q.getJobCounts('failed')).failed, 1);
  await w.close(); await q.obliterate({ force: true }); await q.close();
});

test('duplicate jobId is ignored (idempotent enqueue)', { skip }, async () => {
  const q = getQueue('transcription');
  await q.obliterate({ force: true });
  const a = await enqueue('transcription', { x: 1 }, { jobId: 'same' });
  const b = await enqueue('transcription', { x: 2 }, { jobId: 'same' });
  assert.equal(a.id, b.id);
  assert.equal((await queueCounts()).transcription.waiting, 1);
  await q.obliterate({ force: true });
});

test('worker concurrency limit is respected', { skip }, async () => {
  const q = new Queue('email', { connection: conn() });
  await q.obliterate({ force: true });
  let active = 0, max = 0;
  const w = new Worker('email', async () => { max = Math.max(max, ++active); await new Promise((r) => setTimeout(r, 80)); active--; }, { connection: conn(), concurrency: 2 });
  await Promise.all(Array.from({ length: 6 }, (_, i) => q.add('email', { i })));
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(max, 2);
  await w.close(); await q.obliterate({ force: true }); await q.close();
});

test.after(async () => { await closeQueues(); await closeRedis(); opened.forEach((c) => c.disconnect()); });
