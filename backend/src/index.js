import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routes
import authRoutes from './routes/auth.js';
import meetingRoutes from './routes/meeting.js';
import chatRoutes from './routes/chat.js';
import teamRoutes from './routes/team.js';
import notificationRoutes from './routes/notification.js';
import pollRoutes from './routes/poll.js';
import breakoutRoutes from './routes/breakout.js';
import qaRoutes from './routes/qa.js';

// Import socket handlers
import { initializeSocketHandlers } from './sockets/index.js';

// Import services
import ReminderService from './services/reminderService.js';
import mediasoupService from './lib/mediasoup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const httpServer = createServer(app);

// Socket.IO setup with CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/breakout', breakoutRoutes);
app.use('/api/qa', qaRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize Socket.IO handlers
initializeSocketHandlers(io);

// Make io accessible in routes
app.set('io', io);

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/meetclone';

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.error('ℹ️  Ensure MongoDB is running and MONGODB_URI is correctly set in backend/.env');
    console.error('ℹ️  Example: MONGODB_URI=mongodb://127.0.0.1:27017/meetclone');
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Initialize mediasoup workers
    await mediasoupService.init();
    
    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Socket.IO ready for connections`);
      console.log(`🎥 Mediasoup SFU ready`);
      
      // Start reminder service
      const reminderService = new ReminderService(io);
      reminderService.start();
    });
  } catch (error) {
    console.error('❌ Server startup error:', error);
    process.exit(1);
  }
};

startServer();

export { io };
