import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '../database/index.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SUPERADMIN_CREDENTIALS = {
  name: process.env.SUPERADMIN_NAME || 'Super Admin',
  email: process.env.SUPERADMIN_EMAIL || 'admin@meetclone.com',
  password: process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@2026',
  role: 'superadmin'
};

const createSuperAdmin = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    const existingAdmin = await User.findOne({
      where: { email: SUPERADMIN_CREDENTIALS.email }
    });

    if (existingAdmin) {
      console.log('Superadmin already exists');
      console.log('Email:', SUPERADMIN_CREDENTIALS.email);
      console.log('Password: (unchanged)');
    } else {
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(SUPERADMIN_CREDENTIALS.password, salt);

      await User.create({
        name: SUPERADMIN_CREDENTIALS.name,
        email: SUPERADMIN_CREDENTIALS.email,
        password: hashedPassword,
        role: SUPERADMIN_CREDENTIALS.role,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(SUPERADMIN_CREDENTIALS.name)}&background=random`
      });

      console.log('Superadmin created successfully!');
      console.log('\nLOGIN CREDENTIALS:');
      console.log('Email:    ', SUPERADMIN_CREDENTIALS.email);
      console.log('Password: ', SUPERADMIN_CREDENTIALS.password);
      console.log('\nPlease change the password after first login!');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
      console.error('MySQL is not reachable. Check your DB_HOST, DB_USER, DB_PASSWORD in backend/.env');
    }
    process.exit(1);
  }
};

createSuperAdmin();
