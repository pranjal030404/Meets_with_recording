import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { enableJsonLogs } from './observability/jsonLogs.js';
enableJsonLogs();
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import meetingRoutes from './routes/meeting.js';
import chatRoutes from './routes/chat.js';
import teamRoutes from './routes/team.js';
import notificationRoutes from './routes/notification.js';
import pollRoutes from './routes/poll.js';
import breakoutRoutes from './routes/breakout.js';
import qaRoutes from './routes/qa.js';
import subscriptionRoutes from './routes/subscription.js';
import conversationRoutes from './routes/conversation.js';
import messageRoutes from './routes/message.js';
import taskRoutes from './routes/task.js';
import fileRoutes from './routes/file.js';
import searchRoutes from './routes/search.js';
import adminRoutes from './routes/admin.js';
import activityLog from './middleware/activityLog.js';
import { ensureSystemRoles } from './lib/permissions.js';
import aiRoutes from './routes/ai.js';
import storageRoutes from './routes/storage.js';
import { createUploadsRouter } from './routes/uploads.js';
import webrtcRoutes from './routes/webrtc.js';

import { initializeSocketHandlers } from './sockets/index.js';

import ReminderService from './services/reminderService.js';
import { recoverStuckTranscriptions } from './services/recordingService.js';
import mediasoupService from './lib/mediasoup.js';

import { connectDB, sequelize, poolStats, dbStats } from './database/index.js';
import { getRedis, closeRedis, quitClient, redisEnabled } from './infrastructure/redis/redisClient.js';
import { checkRedis } from './infrastructure/redis/redisHealth.js';
import { runExclusive } from './infrastructure/redis/lock.js';
import { attachSocketAdapter } from './realtime/socketAdapter.js';
import { onlineUserIds } from './realtime/presenceManager.js';
import { createRateLimiter, perCaller } from './middleware/rateLimit.js';
import { httpMetrics, attachCollectors, startMetricsServer } from './observability/metrics.js';
import { queueCounts } from './queues/index.js';
import { getMonitor } from './media/sfuManager.js';
import { startSfuManager, drainSfu, stopSfuManager } from './media/sfuManager.js';
import { startWorkers } from './workers/index.js';
import './workers/handlers.js';
import { closeQueues } from './queues/index.js';
import { registerShutdown, state as lifecycle } from './lib/shutdown.js';
import './models/associations.js';
import User from './models/User.js';
import Admin from './models/Admin.js';
import './models/RevokedSession.js';
import { usePersistentStore } from './lib/sessionRevocation.js';
import { revocationStore } from './lib/revocationStore.js';
import { counterStore } from './lib/counterStore.js';
import { useCounterStore } from './middleware/rateLimit.js';
import { UNLOCK_ALL_FEATURES } from './services/subscriptionService.js';
import { backfillMembership } from './models/membership.js';
import { securityHeaders, apiResponses, apiNotFound, errorHandler } from './lib/http.js';
import { validateRequest } from './lib/validate.js';
import { trustProxySetting } from './lib/clientIp.js';
import { PUBLISHED_PASSWORDS } from './lib/password.js';
import { checkConfig } from './lib/configCheck.js';
import { legalDetails } from './lib/legal.js';
import { processExpiries } from './services/subscriptionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = parseInt(process.env.PORT) || 5000;

let io;

// =============================================
// APP SETUP
// =============================================
const app = express();
// Behind nginx/Apache/a cloud balancer: trust X-Forwarded-* so req.ip, secure cookies and logs see the real client.
// TRUST_PROXY=1 (one hop, default in production), a number of hops, or 'false' to disable.
app.set('trust proxy', trustProxySetting());
app.disable('x-powered-by');

const httpServer = createServer(app);

io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || process.env.NODE_ENV !== 'production', // without CLIENT_URL: same origin only in production
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: parseInt(process.env.SOCKET_MAX_BUFFER_BYTES) || 1e6, // was 100 MB; uploads go over REST
});
const socketAdapter = attachSocketAdapter(io);

// =============================================
// MIDDLEWARE
// =============================================
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(securityHeaders);
app.use('/api', apiResponses);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Redis-backed (shared by all instances); degrades to per-process counting if Redis is down
app.use('/api', createRateLimiter({ windowMs: 60000, identify: perCaller(parseInt(process.env.RATE_LIMIT_MAX) || 100) }));

app.use(httpMetrics);
// Health probes come before the web app's catch-all, which would otherwise answer them with index.html
// Liveness: process is up (never checks dependencies, so a DB blip doesn't restart-loop the pod)
// What this installation offers; the clients hide what it does not (no sign-in needed)
app.get('/api/config', (req, res) => res.json({ success: true, data: { billingEnabled: !UNLOCK_ALL_FEATURES, legal: legalDetails() } }));

app.get('/healthz', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Readiness: should the balancer send traffic here? Fails while draining or if the DB is unreachable.
// Redis down is reported but not fatal (non-meeting features degrade); set REDIS_REQUIRED=true to make it fatal.
app.get('/readyz', async (req, res) => {
  if (lifecycle.draining) return res.status(503).json({ status: 'draining' });
  const checks = {};
  try { await sequelize.query('SELECT 1'); checks.database = { ok: true }; } catch (e) { console.warn('Readiness: database', e.message); checks.database = { ok: false }; }
  checks.redis = await checkRedis();
  checks.socketAdapter = socketAdapter.status();
  checks.media = { workers: mediasoupService.workers.length };
  checks.dbPool = poolStats();
  const redisRequired = process.env.REDIS_REQUIRED === 'true';
  const ready = checks.database.ok && (!redisRequired || checks.redis.ok);
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
});

// Private files: authenticated + authorised per path (was a public express.static). See routes/uploads.js
app.use('/uploads', createUploadsRouter());

if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  const webFiles = express.static(frontendDist, { maxAge: '1y' });
  // not for the API: looking for a file on disk uses the same thread pool as password hashing
  app.use((req, res, next) => (req.path.startsWith('/api') ? next() : webFiles(req, res, next)));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// =============================================
// ROUTES
// =============================================
app.use('/api', activityLog);
app.use('/api', validateRequest);
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/breakout', breakoutRoutes);
app.use('/api/qa', qaRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/webrtc', webrtcRoutes);

// Back-compat for existing monitors/deploy scripts
app.get('/api/health', (req, res) => {
  if (lifecycle.draining) return res.status(503).json({ status: 'draining' });
  const basic = { status: 'ok', timestamp: new Date().toISOString() };
  // process and media details are for monitoring on this machine, not for the internet
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)) return res.json(basic);
  res.json({
    ...basic,
    pid: process.pid,
    uptime: process.uptime(),
    mediasoup: mediasoupService.workers.length > 0 ? mediasoupService.getStats() : 'inactive',
  });
});

// =============================================
// SOCKET.IO HANDLERS
// =============================================
initializeSocketHandlers(io);
app.set('io', io);

app.use('/api', apiNotFound);
app.use(errorHandler);

// A forgotten await somewhere must not take every live meeting down with it
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

const warnAboutAdminPasswords = async () => {
  for (const admin of await Admin.findAll({ attributes: ['email', 'password'] })) {
    for (const known of PUBLISHED_PASSWORDS) {
      if (await admin.comparePassword(known)) {
        console.warn(`SECURITY: administrator ${admin.email} still has a password published in this repository. Change it now.`);
        break;
      }
    }
  }
};

// =============================================
// START
// =============================================
const timers = [];
let reminderService;
let queueWorkers = null;
let stopCollectors = null;
let metricsServer = null;
const startServer = async () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      const { fatal, warnings } = checkConfig();
      warnings.forEach((w) => console.warn(`CONFIG: ${w}`));
      if (fatal.length) {
        fatal.forEach((f) => console.error(`Refusing to start: ${f}`));
        process.exit(1);
      }
    }
    await connectDB();
    recoverStuckTranscriptions().then((n) => n && console.log(`Marked ${n} interrupted transcription(s) as failed (retry available)`)).catch((e) => console.error('Transcription recovery failed:', e.message));
    // Two instances starting together can both try to create the same index: the loser simply tries again
    for (let attempt = 1; ; attempt++) {
      try {
        await sequelize.sync({ alter: false });
        break;
      } catch (e) {
        if (attempt >= 5 || !/ER_DUP_KEYNAME|ER_TABLE_EXISTS|ER_LOCK_DEADLOCK/.test(`${e.original?.code}`)) throw e;
        await new Promise((r) => setTimeout(r, attempt * 500));
      }
    }
    console.log('Database tables synchronized');
    if (!redisEnabled()) {
      await usePersistentStore(revocationStore);
      useCounterStore(counterStore);
      timers.push(setInterval(() => counterStore.prune().catch(() => {}), 60 * 60 * 1000));
    }
    await runExclusive('job:membership-backfill', 10 * 60 * 1000, () => backfillMembership());
    // Single-instance (no Redis): no sockets survive a restart, so nobody can still be online.
    // With Redis other instances may hold live sockets, so we must NOT reset globally; the leader-elected
    // reconcile below clears stale flags using the TTL-based presence set instead.
    if (!redisEnabled()) await User.update({ isOnline: false }, { where: { isOnline: true } }).catch((e) => console.error('Presence reset failed:', e.message));
    await ensureSystemRoles();

    // Downgrade lapsed paid subscriptions to Free now and every hour
    const expiries = () => runExclusive('job:subscription-expiry', 10 * 60 * 1000, processExpiries).catch((e) => console.warn('Subscription expiry check failed:', e.message));
    timers.push(setInterval(expiries, 60 * 60 * 1000));
    expiries();

    // Clear stale DB isOnline flags (crashed instance) using the Redis presence TTL as truth
    if (redisEnabled()) {
      timers.push(setInterval(() => runExclusive('job:presence-reconcile', 50000, async () => {
        const rows = await User.findAll({ where: { isOnline: true }, attributes: ['id'], limit: 5000, raw: true });
        const live = await onlineUserIds(rows.map((r) => r.id));
        const stale = rows.map((r) => r.id).filter((id) => !live.has(id));
        if (stale.length) await User.update({ isOnline: false, lastSeen: new Date() }, { where: { id: stale } });
      }).catch((e) => console.warn('Presence reconcile failed:', e.message)), 60000));
    }

    try {
      await mediasoupService.init();
      console.log('Mediasoup SFU ready');
      startSfuManager(mediasoupService);
      stopCollectors = attachCollectors({ mediasoupService, poolStats, dbStats, checkRedis, queueCounts, getMonitor, io });
      metricsServer = startMetricsServer();
    } catch (e) {
      console.warn('Mediasoup init failed, running without SFU:', e.message);
    }

    httpServer.listen(PORT, () => {
      console.log(`Server (pid:${process.pid}) running on port ${PORT}`);
      // after listening: it hashes each administrator's password several times and must not hold up a restart
      warnAboutAdminPasswords().catch((e) => console.warn('Admin password check failed:', e.message));
      if (process.env.REDIS_REQUIRED === 'true' && !getRedis()) { console.error('REDIS_REQUIRED=true but REDIS_URL is not set'); process.exit(1); }
      if (mediasoupService.workers.length > 0) console.log('Mediasoup SFU active');
      // In-process workers by default; set WORKERS_IN_PROCESS=false when running dedicated `node src/workers/main.js` pods
      if (process.env.WORKERS_IN_PROCESS !== 'false') queueWorkers = startWorkers();
      reminderService = new ReminderService(io);
      reminderService.start();
    });
  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  }
};

// Graceful shutdown: fail /readyz first, let the balancer notice, stop accepting, drain, then close dependencies
const SHUTDOWN_GRACE_MS = parseInt(process.env.SHUTDOWN_DRAIN_DELAY_MS) || 5000;
registerShutdown([
  ['sfu-drain', () => drainSfu()], // stop receiving NEW meetings; existing ones keep running until shutdown completes
  ['lb-drain-delay', () => new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS))],
  ['timers', () => { stopSfuManager(); stopCollectors?.(); metricsServer?.close(); timers.forEach(clearInterval); reminderService?.stop(); }],
  // io.close() disconnects websocket clients (they auto-reconnect to another instance) and closes the HTTP
  // server; in-flight HTTP requests finish before the callback fires (bounded by SHUTDOWN_TIMEOUT_MS).
  ['http+socket.io', () => new Promise((resolve) => { io.close(() => resolve()); httpServer.closeIdleConnections?.(); })],
  ['workers', async () => { await queueWorkers?.close(); await closeQueues(); }],
  ['mediasoup', async () => { await mediasoupService.close?.(); }],
  ['redis', async () => { await closeRedis(); await Promise.allSettled([quitClient(socketAdapter.pub), quitClient(socketAdapter.sub)]); }],
  ['database', () => sequelize.close()],
]);

startServer();

export { io };
