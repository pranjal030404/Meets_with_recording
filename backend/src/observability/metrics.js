import http from 'http';
import client from 'prom-client';
import { stateEntries } from '../lib/stateRegistry.js';

/**
 * Prometheus metrics. Served on a SEPARATE internal listener (METRICS_HOST default 127.0.0.1, METRICS_PORT) so the
 * public app port / nginx never exposes it. Scrape from the same host or over a private network only.
 * Label cardinality is bounded on purpose: HTTP uses the matched route pattern, never raw URLs/ids; no user/room ids as labels.
 */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry }); // process CPU/memory, event-loop lag (nodejs_eventloop_lag_*), GC, handles

const reg = { registers: [registry] };
const nodeId = process.env.NODE_ID || 'node';
registry.setDefaultLabels({ node: nodeId });

export const httpDuration = new client.Histogram({ name: 'http_request_duration_seconds', help: 'HTTP request duration', labelNames: ['method', 'route', 'status'], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], ...reg });
export const httpActive = new client.Gauge({ name: 'http_requests_active', help: 'In-flight HTTP requests', ...reg });

export const stateGauge = new client.Gauge({ name: 'inmemory_state_entries', help: 'Entries in each registered per-process collection (a monotonic climb = leak)', labelNames: ['store', 'scope'], ...reg });
export const socketConnected = new client.Gauge({ name: 'socketio_connected_clients', help: 'Sockets connected to this instance', ...reg });
export const socketConnections = new client.Counter({ name: 'socketio_connections_total', help: 'Connections accepted', ...reg });
export const socketDisconnects = new client.Counter({ name: 'socketio_disconnects_total', help: 'Disconnects by reason', labelNames: ['reason'], ...reg });
export const socketEvents = new client.Counter({ name: 'socketio_events_total', help: 'Inbound socket events', labelNames: ['event'], ...reg });
export const socketRateLimited = new client.Counter({ name: 'socketio_events_rate_limited_total', help: 'Inbound events dropped by the per-socket limiter', labelNames: ['event'], ...reg });

export const sfuGauge = (name, help, labelNames = []) => new client.Gauge({ name: `sfu_${name}`, help, labelNames, ...reg });
const g = {
  workers: sfuGauge('workers', 'mediasoup workers alive'),
  routers: sfuGauge('routers', 'Routers (= meetings owned)'),
  transports: sfuGauge('transports', 'WebRTC transports'),
  producers: sfuGauge('producers', 'Producers'),
  consumers: sfuGauge('consumers', 'Consumers'),
  workerConsumers: sfuGauge('worker_consumers', 'Consumers per worker', ['worker']),
  workerProducers: sfuGauge('worker_producers', 'Producers per worker', ['worker']),
  inBitrate: sfuGauge('incoming_bitrate_bps', 'Sum of transport recv bitrate (sampled)'),
  outBitrate: sfuGauge('outgoing_bitrate_bps', 'Sum of transport send bitrate (sampled)'),
  draining: sfuGauge('draining', '1 when this node is draining'),
};
export const sfuDenied = new client.Counter({ name: 'sfu_subscription_denied_total', help: 'Subscriptions refused by policy', labelNames: ['reason'], ...reg });
export const sfuAllowed = new client.Counter({ name: 'sfu_subscription_allowed_total', help: 'Subscriptions granted', ...reg });
export const sfuWorkerDeaths = new client.Counter({ name: 'sfu_worker_deaths_total', help: 'mediasoup worker crashes', ...reg });
export const sfuConsumerScore = new client.Histogram({ name: 'sfu_consumer_score', help: 'mediasoup consumer quality score (0-10), sampled', buckets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ...reg });
export const sfuProducerLoss = new client.Histogram({ name: 'sfu_producer_packet_loss_ratio', help: 'Producer inbound packet loss ratio, sampled', buckets: [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5], ...reg });
export const sfuProducerJitter = new client.Histogram({ name: 'sfu_producer_jitter', help: 'Producer RTP jitter (clock units), sampled', buckets: [0, 5, 10, 20, 40, 80, 160, 320], ...reg });
export const placementTotal = new client.Counter({ name: 'meeting_placement_total', help: 'Meeting placement outcomes', labelNames: ['result'], ...reg });

const dbG = {
  size: new client.Gauge({ name: 'db_pool_size', help: 'Open DB connections', ...reg }),
  using: new client.Gauge({ name: 'db_pool_using', help: 'Connections in use', ...reg }),
  waiting: new client.Gauge({ name: 'db_pool_waiting', help: 'Queries waiting for a connection', ...reg }),
  max: new client.Gauge({ name: 'db_pool_max', help: 'Configured pool max', ...reg }),
  queries: new client.Gauge({ name: 'db_queries_total', help: 'Queries executed (monotonic)', ...reg }),
  slow: new client.Gauge({ name: 'db_slow_queries_total', help: 'Slow queries (monotonic)', ...reg }),
};
const redisUp = new client.Gauge({ name: 'app_redis_up', help: '1 if Redis answers PING', ...reg });
const queueG = new client.Gauge({ name: 'queue_jobs', help: 'BullMQ job counts', labelNames: ['queue', 'state'], ...reg });

/** Wire sources lazily; everything is read at scrape time so there is no per-event overhead on hot paths. */
export const attachCollectors = ({ mediasoupService, poolStats, dbStats, checkRedis, queueCounts, getMonitor, io }) => {
  let last = { subAllowed: 0, subDenied: {}, deaths: 0 };
  let bitrate = { in: 0, out: 0 };

  // Heavier sampling (getStats is async per object): bounded, off the scrape path
  const sample = async () => {
    try {
      let inb = 0, outb = 0, n = 0;
      for (const t of mediasoupService.transports.values()) {
        if (n++ >= 200) break;
        const st = await t.getStats();
        for (const s of st) { if (s.recvBitrate) inb += s.recvBitrate; if (s.sendBitrate) outb += s.sendBitrate; }
      }
      bitrate = { in: inb, out: outb };
      let p = 0;
      for (const pr of mediasoupService.producers.values()) {
        if (p++ >= 50) break;
        for (const s of await pr.getStats()) {
          if (s.type === 'inbound-rtp' || s.type === 'inbound') {
            if (s.packetsLost != null && s.packetCount) sfuProducerLoss.observe(Math.max(0, s.packetsLost) / (s.packetCount + Math.max(0, s.packetsLost)));
            if (s.jitter != null) sfuProducerJitter.observe(s.jitter);
          }
        }
      }
    } catch { /* objects close mid-sample */ }
  };
  const timer = setInterval(sample, 15000); timer.unref?.();

  const origMetrics = registry.metrics.bind(registry);
  registry.metrics = async () => {
    const st = mediasoupService.getStats();
    g.workers.set(st.workers); g.routers.set(st.routers); g.transports.set(st.transports); g.producers.set(st.producers); g.consumers.set(st.consumers);
    g.workerConsumers.reset(); g.workerProducers.reset();
    for (const w of st.perWorker || []) { g.workerConsumers.set({ worker: String(w.pid) }, w.consumers); g.workerProducers.set({ worker: String(w.pid) }, w.producers); }
    g.inBitrate.set(bitrate.in); g.outBitrate.set(bitrate.out);
    g.draining.set(getMonitor?.()?.draining ? 1 : 0);
    // monotonic counters mirrored from service-owned counters
    sfuAllowed.inc(Math.max(0, st.subscriptions.allowed - last.subAllowed)); last.subAllowed = st.subscriptions.allowed;
    for (const [r, v] of Object.entries(st.subscriptions.denied)) { sfuDenied.inc({ reason: r }, Math.max(0, v - (last.subDenied[r] || 0))); last.subDenied[r] = v; }
    sfuConsumerScore.reset?.();
    let i = 0; for (const c of mediasoupService.consumers.values()) { if (i++ >= 500) break; const sc = c.score?.score; if (typeof sc === 'number' && c.kind === 'video') sfuConsumerScore.observe(sc); }
    const pool = poolStats?.(); if (pool) { dbG.size.set(pool.size); dbG.using.set(pool.using); dbG.waiting.set(pool.waiting); dbG.max.set(pool.max); }
    if (dbStats) { dbG.queries.set(dbStats.queries); dbG.slow.set(dbStats.slow); }
    const r = await checkRedis?.(500); redisUp.set(r?.ok ? 1 : 0);
    // a scrape must never hang on a dependency that is down (that is exactly when metrics matter)
    try { const q = await Promise.race([queueCounts?.(), new Promise((r) => setTimeout(() => r(null), 1000))]); if (q) for (const [name, counts] of Object.entries(q)) for (const [state, n] of Object.entries(counts)) queueG.set({ queue: name, state }, n); } catch { /* redis down */ }
    stateGauge.reset(); for (const e of stateEntries()) stateGauge.set({ store: e.name, scope: e.scope }, e.size);
    socketConnected.set(io?.engine?.clientsCount ?? 0);
    return origMetrics();
  };
  return () => clearInterval(timer);
};

/** Express middleware: duration by matched route pattern. */
export const httpMetrics = (req, res, next) => {
  const end = httpDuration.startTimer();
  httpActive.inc();
  res.on('finish', () => {
    httpActive.dec();
    const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : (req.baseUrl || 'unmatched');
    end({ method: req.method, route, status: String(res.statusCode) });
  });
  next();
};

/** Internal-only /metrics listener. */
export const startMetricsServer = () => {
  const port = parseInt(process.env.METRICS_PORT);
  if (!port) return null; // disabled unless METRICS_PORT is set
  const host = process.env.METRICS_HOST || '127.0.0.1';
  const srv = http.createServer(async (req, res) => {
    if (req.url !== '/metrics') { res.statusCode = 404; return res.end(); }
    if (process.env.METRICS_TOKEN && req.headers.authorization !== `Bearer ${process.env.METRICS_TOKEN}`) { res.statusCode = 401; return res.end(); }
    try { res.setHeader('Content-Type', registry.contentType); res.end(await registry.metrics()); }
    catch (e) { res.statusCode = 500; res.end(e.message); }
  });
  srv.listen(port, host, () => console.log(`[metrics] listening on ${host}:${port}`));
  return srv;
};
