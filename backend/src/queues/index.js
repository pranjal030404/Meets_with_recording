import { Queue } from 'bullmq';
import { redisEnabled, createRedisConnection } from '../infrastructure/redis/redisClient.js';
import { QUEUES, jobOptions } from './definitions.js';

/**
 * Producer side. With Redis: durable BullMQ queues shared by all instances.
 * Without Redis: the job runs in-process (the previous behaviour), so nothing is lost for single-node setups.
 * Idempotency: pass `jobId` (e.g. `transcribe:<meetingId>:<recordingId>`); BullMQ ignores a duplicate id
 * while the earlier job still exists, so a double-click or retried request cannot enqueue twice.
 */

const queues = new Map();
const inline = new Map(); // name -> handler (registered by workers/handlers)

export const registerInlineHandler = (name, fn) => inline.set(name, fn);

const conns = [];
const connection = () => { const c = createRedisConnection('bullmq-producer', { maxRetriesPerRequest: null, enableOfflineQueue: true }); conns.push(c); return c; };

export const getQueue = (name) => {
  if (!QUEUES[name]) throw new Error(`Unknown queue ${name}`);
  if (!queues.has(name)) queues.set(name, new Queue(name, { connection: connection(), defaultJobOptions: jobOptions(name) }));
  return queues.get(name);
};

/** @returns {Promise<{mode:'queued'|'inline', id?:string}>} */
export const enqueue = async (name, data, { jobId, delayMs } = {}) => {
  if (!redisEnabled()) {
    const handler = inline.get(name);
    if (!handler) throw new Error(`No inline handler for ${name}`);
    setImmediate(() => handler({ data, attemptsMade: 0, id: jobId }).catch((e) => console.error(`[queue:${name}] inline job failed: ${e.message}`)));
    return { mode: 'inline', id: jobId };
  }
  // With Redis unreachable BullMQ would buffer forever: fail fast so callers can degrade (inline run / retry later)
  const job = await Promise.race([
    getQueue(name).add(name, data, { jobId, delay: delayMs }),
    new Promise((_, rej) => { const t = setTimeout(() => rej(new Error('queue unavailable (Redis not responding)')), 3000); t.unref?.(); }),
  ]);
  return { mode: 'queued', id: job.id };
};

export const queueCounts = async () => {
  if (!redisEnabled()) return null;
  const out = {};
  for (const name of Object.keys(QUEUES)) out[name] = await getQueue(name).getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  return out;
};

export const closeQueues = async () => {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
  conns.splice(0).forEach((c) => c.disconnect()); // Queue.close() does not close connections it was handed
};
