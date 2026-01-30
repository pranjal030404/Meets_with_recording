import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const SUPERADMIN_CREDENTIALS = {
  name: 'Super Admin',
  email: 'admin@meetclone.com',
  password: 'SuperAdmin@2026',
  role: 'superadmin'
};

const createSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/meetclone');
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
    process.exit(1);
  }
};

createSuperAdmin();
