import { getRedis, redisEnabled } from './redisClient.js';

/** { enabled, ok, latencyMs }. A disabled Redis is reported as such, never as healthy. */
export const checkRedis = async (timeoutMs = 1000) => {
  if (!redisEnabled()) return { enabled: false, ok: false };
  const r = getRedis();
  const t0 = Date.now();
  try {
    await Promise.race([r.ping(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
    return { enabled: true, ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { enabled: true, ok: false, error: e.message };
  }
};
