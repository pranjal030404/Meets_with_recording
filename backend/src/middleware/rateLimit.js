import jwt from 'jsonwebtoken';
import { tokenFrom } from '../lib/webSession.js';
import { getRedis } from '../infrastructure/redis/redisClient.js';

/**
 * Fixed-window limiter shared across instances via Redis (INCR + PEXPIRE on first hit).
 * If Redis is unavailable it degrades to a per-process counter (limits become per-instance, never open).
 * `identify(req)` returns { id, max }; without it requests are counted per address.
 */
// Without Redis, `durable` counters are kept in the database (wired up at server start) so a restart does not clear them
let store = null;
export const useCounterStore = (next) => { store = next; };

export const createRateLimiter = ({ windowMs = 60000, max = 100, prefix = 'rl:api', identify, durable = false } = {}) => {
  const local = new Map(); // id -> { n, reset }
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, v] of local) if (v.reset <= now) local.delete(k); }, windowMs);
  sweep.unref?.();
  const keyOf = (id) => `${prefix}:${id}:${Math.floor(Date.now() / windowMs)}`;

  const hit = async (id) => {
    const r = getRedis();
    if (r) {
      try {
        const k = keyOf(id);
        const res = await r.multi().incr(k).pexpire(k, windowMs * 2).exec();
        return res[0][1];
      } catch { /* degrade */ }
    }
    if (durable && store) {
      try { return await store.hit(`${prefix}:${id}`, windowMs); } catch (e) { console.warn(`[limits] not stored: ${e.message}`); }
    }
    const now = Date.now();
    let e = local.get(id);
    if (!e || e.reset <= now) { e = { n: 0, reset: now + windowMs }; local.set(id, e); }
    return ++e.n;
  };

  const middleware = async (req, res, next) => {
    const who = identify?.(req) || { id: req.ip || req.socket?.remoteAddress || 'unknown', max };
    const n = await hit(who.id);
    res.setHeader('X-RateLimit-Limit', who.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, who.max - n));
    if (n > who.max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ success: false, message: 'Too many requests' });
    }
    next();
  };
  middleware.hit = hit;
  middleware.count = async (id) => {
    const r = getRedis();
    if (r) { try { return Number(await r.get(keyOf(id))) || 0; } catch { /* degrade */ } }
    if (durable && store) { try { return await store.count(`${prefix}:${id}`); } catch (e) { console.warn(`[limits] not read: ${e.message}`); } }
    const e = local.get(id);
    return e && e.reset > Date.now() ? e.n : 0;
  };
  middleware.reset = async (id) => {
    local.delete(id);
    if (durable && store && !getRedis()) await store.reset(`${prefix}:${id}`).catch(() => {});
    try { await getRedis()?.del(keyOf(id)); } catch { /* expires by itself */ }
  };
  return middleware;
};

/**
 * Signed-in callers are counted per account (people behind one office address no longer share a budget, and a
 * page load is several requests, so the allowance is six times higher); everyone else per address.
 */
export const perCaller = (max) => (req) => {
  const token = tokenFrom(req);
  if (token) {
    try {
      const { id } = jwt.verify(token, process.env.JWT_SECRET);
      return { id: `user:${id}`, max: max * 6 };
    } catch { /* not a valid token: count by address */ }
  }
  return { id: req.ip || req.socket?.remoteAddress || 'unknown', max };
};
