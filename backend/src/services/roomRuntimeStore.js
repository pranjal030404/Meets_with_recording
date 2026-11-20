import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRedis } from '../infrastructure/redis/redisClient.js';

const RUNTIME_TTL_SEC = 24 * 3600; // mirrored to Redis so ANOTHER node can restore the room after a node failure

/**
 * In-meeting tool state (timer, transcription on/off, shared notes, live stream, admitted guests) lives in
 * memory for speed. This mirrors it to a small JSON file per room so a server restart doesn't wipe a live
 * meeting: clients reconnect, the first join restores it. Files are removed when the room closes.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '../../uploads/runtime');
const SAFE = /^[A-Za-z0-9_-]+$/; // roomIds are uuid-ish; refuse anything that could escape the folder

const fileFor = (roomId) => (SAFE.test(roomId) ? path.join(DIR, `${roomId}.json`) : null);

const timers = new Map();

/** Debounced: many rapid changes (typing in shared notes) become one write. */
export const saveRuntime = (roomId, snapshotFn, delay = 1000) => {
  const file = fileFor(roomId);
  if (!file) return;
  clearTimeout(timers.get(roomId));
  timers.set(roomId, setTimeout(async () => {
    timers.delete(roomId);
    try {
      const redis = getRedis();
      if (redis) { await redis.set(`runtime:${roomId}`, JSON.stringify(snapshotFn()), 'EX', RUNTIME_TTL_SEC); return; }
    } catch (error) { console.error('Redis runtime save failed, using disk:', error.message); }
    try {
      await fs.mkdir(DIR, { recursive: true });
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(snapshotFn()), 'utf8');
      await fs.rename(tmp, file); // atomic: a crash mid-write can't leave a half file
    } catch (error) {
      console.error('Save room runtime failed:', error.message);
    }
  }, delay));
};

export const loadRuntime = async (roomId) => {
  const file = fileFor(roomId);
  if (!file) return null;
  try {
    const redis = getRedis();
    const v = redis ? await redis.get(`runtime:${roomId}`) : null;
    if (v) return JSON.parse(v);
  } catch { /* fall back to disk */ }
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
};

export const deleteRuntime = async (roomId) => {
  clearTimeout(timers.get(roomId));
  timers.delete(roomId);
  const file = fileFor(roomId);
  await getRedis()?.del(`runtime:${roomId}`).catch(() => {});
  if (file) await fs.unlink(file).catch(() => {});
};
