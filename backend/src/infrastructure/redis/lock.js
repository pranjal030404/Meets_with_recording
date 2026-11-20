import crypto from 'crypto';
import { getRedis } from './redisClient.js';

const RELEASE = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;
const RENEW = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("pexpire",KEYS[1],ARGV[2]) else return 0 end`;

/** Single-key lock with token ownership (SET NX PX). Returns { release, renew } or null if not acquired / Redis down. */
export const acquireLock = async (key, ttlMs) => {
  const r = getRedis();
  if (!r) return null;
  const token = crypto.randomUUID();
  try {
    if ((await r.set(`lock:${key}`, token, 'PX', ttlMs, 'NX')) !== 'OK') return null;
  } catch { return null; }
  return {
    release: () => r.eval(RELEASE, 1, `lock:${key}`, token).catch(() => 0),
    renew: () => r.eval(RENEW, 1, `lock:${key}`, token, ttlMs).then((n) => n === 1).catch(() => false),
  };
};

/**
 * Run fn on exactly one instance per tick (cron de-duplication). Without Redis falls back to
 * running locally (single-instance behaviour, as before) unless failClosed.
 */
export const runExclusive = async (key, ttlMs, fn, { failClosed = false } = {}) => {
  if (!getRedis()) return failClosed ? undefined : fn();
  const lock = await acquireLock(key, ttlMs);
  if (!lock) return undefined;
  try { return await fn(); } finally { await lock.release(); }
};

/** Cross-instance mutex that waits (used where code relied on an in-process lock). */
export const withLock = async (key, ttlMs, fn, { waitMs = 5000 } = {}) => {
  if (!getRedis()) return fn();
  const deadline = Date.now() + waitMs;
  for (;;) {
    const lock = await acquireLock(key, ttlMs);
    if (lock) { try { return await fn(); } finally { await lock.release(); } }
    if (Date.now() > deadline) throw new Error(`Could not acquire lock ${key}`);
    await new Promise((r) => setTimeout(r, 25 + Math.random() * 50));
  }
};
