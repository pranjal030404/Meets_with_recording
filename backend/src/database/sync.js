import { sequelize } from './index.js';
import '../models/associations.js';
import User from '../models/User.js';
import Meeting from '../models/Meeting.js';
import Team from '../models/Team.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import Question from '../models/Question.js';
import Poll from '../models/Poll.js';
import BreakoutRoom from '../models/BreakoutRoom.js';

async function syncDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await sequelize.sync({ alter: false });
    console.log('Database tables synchronized');
    process.exit(0);
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

syncDatabase();
