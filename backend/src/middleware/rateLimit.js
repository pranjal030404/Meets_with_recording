import { getRedis } from '../infrastructure/redis/redisClient.js';

/**
 * Fixed-window limiter shared across instances via Redis (INCR + PEXPIRE on first hit).
 * If Redis is unavailable it degrades to a per-process counter (limits become per-instance, never open).
 */
export const createRateLimiter = ({ windowMs = 60000, max = 100, prefix = 'rl:api' } = {}) => {
  const local = new Map(); // id -> { n, reset }
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, v] of local) if (v.reset <= now) local.delete(k); }, windowMs);
  sweep.unref?.();

  const hit = async (id) => {
    const r = getRedis();
    if (r) {
      try {
        const k = `${prefix}:${id}:${Math.floor(Date.now() / windowMs)}`;
        const res = await r.multi().incr(k).pexpire(k, windowMs * 2).exec();
        return res[0][1];
      } catch { /* degrade */ }
    }
    const now = Date.now();
    let e = local.get(id);
    if (!e || e.reset <= now) { e = { n: 0, reset: now + windowMs }; local.set(id, e); }
    return ++e.n;
  };

  const middleware = async (req, res, next) => {
    const n = await hit(req.ip || req.socket?.remoteAddress || 'unknown');
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - n));
    if (n > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ success: false, message: 'Too many requests' });
    }
    next();
  };
  middleware.hit = hit;
  return middleware;
};
