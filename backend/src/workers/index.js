import { Worker } from 'bullmq';
import { createRedisConnection, redisEnabled } from '../infrastructure/redis/redisClient.js';
import { QUEUES } from '../queues/definitions.js';
import { handlers } from './handlers.js';

const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms); t.unref?.(); }),
]);

/** Start BullMQ workers for the given queue names (default: all). Returns { close }. No-op without Redis. */
export const startWorkers = (names = Object.keys(QUEUES)) => {
  if (!redisEnabled()) { return { workers: [], close: async () => {} }; }
  const workers = names.map((name) => {
    const cfg = QUEUES[name];
    const w = new Worker(name, (job) => withTimeout(handlers[name](job), cfg.timeoutMs, `${name} job ${job.id}`), {
      connection: createRedisConnection(`bullmq-worker-${name}`, { maxRetriesPerRequest: null, enableOfflineQueue: true }),
      concurrency: cfg.concurrency,
      lockDuration: Math.min(cfg.timeoutMs, 5 * 60 * 1000), // stalled-job detection window; renewed automatically
    });
    w.on('failed', (job, err) => console.error(`[worker:${name}] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}): ${err.message}`));
    let lastErr = 0;
    w.on('error', (err) => { if (Date.now() - lastErr > 10000) { lastErr = Date.now(); console.warn(`[worker:${name}] ${err.message || err.code || err.name}`); } });
    return w;
  });
  console.log(`[workers] started: ${names.join(', ')}`);
  // close(): stop taking jobs and wait for active ones (bounded by the caller's shutdown timeout)
  return { workers, close: async () => {
    // graceful first (waits for active jobs); force after 5s so an unreachable Redis can't hang shutdown
    await Promise.allSettled(workers.map((w) => Promise.race([w.close(), new Promise((r) => setTimeout(r, 5000))]).then(() => w.close(true))));
  } };
};
