import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SUPERADMIN_CREDENTIALS = {
  name: 'Super Admin',
  email: 'admin@meetclone.com',
  password: 'SuperAdmin@2026',
  role: 'superadmin'
};

const createSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/meetclone';

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB connected');

    // Check if superadmin already exists
    const existingAdmin = await User.findOne({ email: SUPERADMIN_CREDENTIALS.email });
    
    if (existingAdmin) {
      console.log('ℹ️  Superadmin already exists');
      console.log('Email:', SUPERADMIN_CREDENTIALS.email);
      console.log('Password: (unchanged)');
    } else {
      // Create superadmin
      const superAdmin = await User.create(SUPERADMIN_CREDENTIALS);
      
      console.log('✅ Superadmin created successfully!');
      console.log('\n📧 LOGIN CREDENTIALS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Email:    ', SUPERADMIN_CREDENTIALS.email);
      console.log('Password: ', SUPERADMIN_CREDENTIALS.password);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n⚠️  Please change the password after first login!');
    }

    await mongoose.disconnect();
    console.log('✅ Database disconnected');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('ℹ️  MongoDB is not reachable at the configured URI.');
      console.error('ℹ️  Start MongoDB locally or set MONGODB_URI in backend/.env (Atlas/local URI).');
    }
    process.exit(1);
  }
};

createSuperAdmin();
