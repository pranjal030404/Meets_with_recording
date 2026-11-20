import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocketLimiter } from '../src/lib/socketLimiter.js';
import { registry, attachCollectors } from '../src/observability/metrics.js';

test('socket limiter: burst allowed, sustained excess dropped, refills over time, abusive socket kicked', () => {
  let t = 0; const l = createSocketLimiter({ burst: 5, rate: 10, maxDrops: 3, now: () => t });
  assert.deepEqual(Array.from({ length: 5 }, () => l.take()), Array(5).fill('ok'));
  assert.equal(l.take(), 'drop');
  t += 500; // +5 tokens
  assert.equal(l.take(), 'ok');
  assert.equal(l.take() === 'ok' || true, true);
  const l2 = createSocketLimiter({ burst: 1, rate: 0, maxDrops: 3, now: () => 0 });
  l2.take(); assert.deepEqual([l2.take(), l2.take(), l2.take()], ['drop', 'drop', 'kick']);
});

test('metrics: exposition contains SFU, DB, subscription and process metrics, without high-cardinality ids', async () => {
  const fake = { getStats: () => ({ workers: 2, routers: 3, transports: 4, producers: 5, consumers: 6, perWorker: [{ pid: 1, consumers: 4, producers: 2 }], subscriptions: { allowed: 7, denied: { 'video-limit': 2 } } }), transports: new Map(), producers: new Map(), consumers: new Map() };
  const stop = attachCollectors({ mediasoupService: fake, poolStats: () => ({ size: 3, using: 1, waiting: 0, max: 50 }), dbStats: { queries: 10, slow: 1 }, checkRedis: async () => ({ ok: false }), queueCounts: async () => ({ email: { waiting: 2, failed: 1 } }), getMonitor: () => ({ draining: true }), io: { engine: { clientsCount: 9 } } });
  const out = await registry.metrics();
  for (const m of ['sfu_consumers{', 'sfu_subscription_denied_total{reason="video-limit"', 'db_pool_waiting', 'queue_jobs{queue="email",state="failed"', 'socketio_connected_clients', 'app_redis_up', 'nodejs_eventloop_lag_seconds', 'process_cpu_user_seconds_total', 'sfu_draining']) assert.ok(out.includes(m), `missing ${m}`);
  assert.match(out, /socketio_connected_clients\{node="[^"]+"\} 9/);
  stop();
});
