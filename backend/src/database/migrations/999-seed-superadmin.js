import { v4 as uuidv4 } from 'uuid';
import { hashPassword, weakAdminPassword } from '../../lib/password.js';

export async function up(queryInterface) {
  const email = process.env.SUPERADMIN_EMAIL || 'admin@meetclone.com';
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME || 'Super Admin';

  const existing = await queryInterface.rawSelect('Admins', { where: { email } }, ['id']);
  if (existing) {
    console.log(`Superadmin already exists: ${email}`);
    return;
  }
  // No built-in password: an administrator is only created with one you chose
  if (weakAdminPassword(password)) {
    console.warn('NO ADMIN CREATED: set SUPERADMIN_PASSWORD in backend/.env to a private password of at least 10 characters,');
    console.warn('then run: npm run create-admin');
    return;
  }

  await queryInterface.bulkInsert('Admins', [{
    id: uuidv4(),
    name,
    email,
    password: await hashPassword(password),
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
    role: 'superadmin',
    createdAt: new Date(),
    updatedAt: new Date()
  }]);

  console.log(`Superadmin created: ${email}`);
}

export async function down(queryInterface) {
  const email = process.env.SUPERADMIN_EMAIL || 'admin@meetclone.com';
  await queryInterface.bulkDelete('Admins', { email });
}
