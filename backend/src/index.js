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

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/breakout', breakoutRoutes);
app.use('/api/qa', qaRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

initializeSocketHandlers(io);

app.set('io', io);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    await sequelize.sync({ alter: false });
    console.log('Database tables synchronized');

    try {
      await mediasoupService.init();
      console.log('Mediasoup SFU ready');
    } catch (mediasoupError) {
      console.warn('Mediasoup initialization failed, running without SFU:', mediasoupError.message);
    }

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Socket.IO ready for connections`);

      if (mediasoupService.workers.length > 0) {
        console.log('Mediasoup SFU active');
      }

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
