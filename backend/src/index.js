import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
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

import { initializeSocketHandlers } from './sockets/index.js';

import ReminderService from './services/reminderService.js';
import mediasoupService from './lib/mediasoup.js';

import { connectDB, sequelize } from './database/index.js';
import './models/associations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = parseInt(process.env.PORT) || 5000;

// =============================================
// REDIS ADAPTER (for Socket.IO horizontal scaling across PM2/multi-server)
// =============================================
let io;

(async () => {
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  if (REDIS_URL) {
    try {
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const { createClient } = await import('ioredis');
      const pubClient = createClient(REDIS_URL);
      const subClient = createClient(REDIS_URL);
      await Promise.all([pubClient.connect(), subClient.connect()]);
      if (io) {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('Redis adapter connected for Socket.IO scaling');
      }
    } catch (e) {
      console.warn('Redis adapter unavailable, running single-instance:', e.message);
    }
  }
})();

// =============================================
// APP SETUP
// =============================================
const app = express();
const httpServer = createServer(app);

io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || true,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e8,
});

// =============================================
// MIDDLEWARE
// =============================================
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// In-memory rate limiting (swap with Redis-based for multi-instance)
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX) || 100;

app.use('/api', (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  if (!rateLimits.has(ip)) rateLimits.set(ip, []);
  const timestamps = rateLimits.get(ip).filter(t => now - t < RATE_LIMIT_WINDOW);
  timestamps.push(now);
  rateLimits.set(ip, timestamps);
  if (timestamps.length > RATE_LIMIT_MAX) {
    return res.status(429).json({ success: false, message: 'Too many requests' });
  }
  next();
});
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of rateLimits) {
    const v = ts.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (v.length === 0) rateLimits.delete(ip); else rateLimits.set(ip, v);
  }
}, 60000);

app.use('/uploads', express.static(path.resolve(__dirname, '../uploads'), { maxAge: '1d' }));

if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist, { maxAge: '1y' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// =============================================
// ROUTES
// =============================================
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/breakout', breakoutRoutes);
app.use('/api/qa', qaRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    mediasoup: mediasoupService.workers.length > 0 ? mediasoupService.getStats() : 'inactive',
  });
});

// =============================================
// SOCKET.IO HANDLERS
// =============================================
initializeSocketHandlers(io);
app.set('io', io);

// =============================================
// START
// =============================================
const startServer = async () => {
  try {
    await connectDB();
    await sequelize.sync({ alter: false });
    console.log('Database tables synchronized');

    try {
      await mediasoupService.init();
      console.log('Mediasoup SFU ready');
    } catch (e) {
      console.warn('Mediasoup init failed, running without SFU:', e.message);
    }

    httpServer.listen(PORT, () => {
      console.log(`Server (pid:${process.pid}) running on port ${PORT}`);
      if (mediasoupService.workers.length > 0) console.log('Mediasoup SFU active');
      const reminderService = new ReminderService(io);
      reminderService.start();
    });
  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  }
};

startServer();

export { io };
