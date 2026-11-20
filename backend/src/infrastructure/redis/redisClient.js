import Redis from 'ioredis';

/**
 * Shared Redis access. REDIS_URL unset => Redis is DISABLED (no silent localhost default), and every
 * consumer must degrade explicitly. REDIS_REQUIRED=true makes startup fail instead.
 * Retries forever with capped exponential backoff (a Redis restart must never need an app restart).
 */

const state = { clients: new Map(), factory: null };

export const redisEnabled = () => !!process.env.REDIS_URL || !!state.factory;

/** Test hook: inject a factory (e.g. ioredis-mock). */
export const setRedisFactory = (f) => { state.factory = f; };

export const backoff = (times) => Math.min(100 * 2 ** Math.min(times, 8), 5000) + Math.floor(Math.random() * 200);

/** Create a NEW connection (the socket.io adapter needs dedicated pub/sub connections). */
export const createRedisConnection = (name = 'default', opts = {}) => {
  if (!redisEnabled()) return null;
  const client = state.factory
    ? state.factory()
    : new Redis(process.env.REDIS_URL, {
        connectionName: `meetclone:${name}`,
        retryStrategy: backoff,
        maxRetriesPerRequest: 2,       // fail fast per command instead of queueing forever
        enableOfflineQueue: false,     // callers see an error and take the degraded path
        connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS) || 5000,
        reconnectOnError: (err) => err.message.includes('READONLY'),
        ...opts,
      });
  client.on('error', (e) => { if (!client.__lastErr || Date.now() - client.__lastErr > 10000) { client.__lastErr = Date.now(); console.warn(`[redis:${name}] ${e.message || e.code || e.name}`); } });
  client.on('ready', () => console.log(`[redis:${name}] ready`));
  client.on('end', () => console.warn(`[redis:${name}] connection ended`));
  return client;
};

/** Shared general-purpose client (one per name). Returns null when Redis is disabled. */
export const getRedis = (name = 'main') => {
  if (!state.clients.has(name)) {
    const c = createRedisConnection(name);
    if (!c) return null;
    state.clients.set(name, c);
  }
  return state.clients.get(name);
};

export const isRedisReady = (name = 'main') => state.clients.get(name)?.status === 'ready';

/** QUIT politely, but never hang on a connection that is mid-reconnect. */
export const quitClient = async (c, ms = 1500) => {
  if (!c) return;
  await Promise.race([c.quit().catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
  c.disconnect();
};

export const closeRedis = async () => {
  const all = [...state.clients.values()];
  state.clients.clear();
  await Promise.allSettled(all.map((c) => quitClient(c)));
};

/** Run fn with the client; on Redis failure return fallback (logged once by the error handler). */
export const safeRedis = async (fn, fallback = null) => {
  const r = getRedis();
  if (!r) return fallback;
  try { return await fn(r); } catch { return fallback; }
};
