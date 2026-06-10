import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export async function up(queryInterface, Sequelize) {
  const email = process.env.SUPERADMIN_EMAIL || 'admin@meetclone.com';
  const password = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@2026';
  const name = process.env.SUPERADMIN_NAME || 'Super Admin';

  const existing = await queryInterface.rawSelect('Users', {
    where: { email }
  }, ['id']);

  if (!existing) {
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    await queryInterface.bulkInsert('Users', [{
      id: uuidv4(),
      name,
      email,
      password: hashedPassword,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
      isOnline: false,
      lastSeen: new Date(),
      role: 'superadmin',
      createdAt: new Date(),
      updatedAt: new Date()
    }]);

    console.log(`Superadmin created: ${email}`);
  } else {
    console.log(`Superadmin already exists: ${email}`);
  }
}

export async function down(queryInterface) {
  const email = process.env.SUPERADMIN_EMAIL || 'admin@meetclone.com';
  await queryInterface.bulkDelete('Users', { email });
}
