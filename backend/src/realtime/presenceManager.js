import { trackState } from '../lib/stateRegistry.js';
import { getRedis } from '../infrastructure/redis/redisClient.js';

/**
 * Cluster-wide presence. Per user a sorted set  presence:u:<userId>  of socketId -> expiry(ms).
 * A user is online while at least one entry has not expired, so multiple tabs/devices work and a
 * crashed instance's sockets simply age out (no stale "online" forever). Sockets refresh via heartbeat().
 * Without Redis it degrades to a process-local map (correct for a single instance only).
 */

const TTL_MS = parseInt(process.env.PRESENCE_TTL_MS) || 60000;
const local = trackState('presenceLocal', new Map(), 'user'); // userId -> Map<socketId, expiry>   (fallback only)
const key = (id) => `presence:u:${id}`;

const localLive = (userId, now) => {
  const m = local.get(userId);
  if (!m) return 0;
  for (const [s, exp] of m) if (exp <= now) m.delete(s);
  if (!m.size) local.delete(userId);
  return m.size;
};

/** @returns {Promise<{wasOffline:boolean}>} */
export const connect = async (userId, socketId) => {
  const now = Date.now();
  const r = getRedis();
  if (r) {
    try {
      const res = await r.multi()
        .zremrangebyscore(key(userId), '-inf', now)
        .zcard(key(userId))
        .zadd(key(userId), now + TTL_MS, socketId)
        .pexpire(key(userId), TTL_MS * 2)
        .exec();
      return { wasOffline: res[1][1] === 0 };
    } catch { /* fall through to local */ }
  }
  const wasOffline = localLive(userId, now) === 0;
  if (!local.has(userId)) local.set(userId, new Map());
  local.get(userId).set(socketId, now + TTL_MS);
  return { wasOffline };
};

export const heartbeat = async (userId, socketId) => {
  const now = Date.now();
  const r = getRedis();
  if (r) {
    try { await r.multi().zadd(key(userId), now + TTL_MS, socketId).pexpire(key(userId), TTL_MS * 2).exec(); return; } catch { /* local */ }
  }
  local.get(userId)?.set(socketId, now + TTL_MS);
};

/** @returns {Promise<{nowOffline:boolean}>} */
export const disconnect = async (userId, socketId) => {
  const now = Date.now();
  const r = getRedis();
  if (r) {
    try {
      const res = await r.multi().zrem(key(userId), socketId).zremrangebyscore(key(userId), '-inf', now).zcard(key(userId)).exec();
      return { nowOffline: res[2][1] === 0 };
    } catch { /* local */ }
  }
  local.get(userId)?.delete(socketId);
  return { nowOffline: localLive(userId, now) === 0 };
};

export const isOnline = async (userId) => (await onlineUserIds([userId])).size > 0;

/** Subset of userIds that are currently online (one pipelined round trip). */
export const onlineUserIds = async (userIds) => {
  const now = Date.now();
  const out = new Set();
  if (!userIds.length) return out;
  const r = getRedis();
  if (r) {
    try {
      const p = r.pipeline();
      userIds.forEach((id) => p.zcount(key(id), `(${now}`, '+inf'));
      const res = await p.exec();
      res.forEach(([err, n], i) => { if (!err && n > 0) out.add(userIds[i]); });
      return out;
    } catch { /* local */ }
  }
  userIds.forEach((id) => { if (localLive(id, now) > 0) out.add(id); });
  return out;
};

export const _resetLocalForTests = () => local.clear();
