import { createAdapter } from '@socket.io/redis-adapter';
import { createRedisConnection, redisEnabled } from '../infrastructure/redis/redisClient.js';

/**
 * Attach the Redis adapter synchronously (before listen). Because the connections use unlimited
 * reconnect + backoff, the adapter starts working whenever Redis becomes reachable - no restart.
 * Plain (non-sharded) adapter => requires standalone/Sentinel Redis or a single Cluster entry via the
 * regular pub/sub; sharded pub/sub (createShardedAdapter) is for Redis Cluster >= 7 and is NOT enabled here.
 * Returns { pub, sub, status() }.
 */
export const attachSocketAdapter = (io) => {
  if (!redisEnabled()) {
    console.warn('[realtime] REDIS_URL not set: Socket.IO runs single-instance (events do not cross servers)');
    return { pub: null, sub: null, status: () => ({ enabled: false, ok: false }) };
  }
  // Adapter connections must queue commands while (re)connecting.
  const pub = createRedisConnection('io-pub', { enableOfflineQueue: true, maxRetriesPerRequest: null });
  const sub = createRedisConnection('io-sub', { enableOfflineQueue: true, maxRetriesPerRequest: null });
  io.adapter(createAdapter(pub, sub, { requestsTimeout: 3000 }));
  return {
    pub, sub,
    status: () => ({ enabled: true, ok: pub.status === 'ready' && sub.status === 'ready', pub: pub.status, sub: sub.status }),
  };
};
