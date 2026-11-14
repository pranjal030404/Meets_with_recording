export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('Admins')) {
    await queryInterface.createTable('Admins', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password: { type: Sequelize.STRING(255), allowNull: false },
      role: { type: Sequelize.ENUM('admin', 'superadmin'), defaultValue: 'admin' },
      avatar: { type: Sequelize.STRING(500) },
      lastLoginAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  }

  // Move existing admin accounts out of Users into Admins, then demote the user rows.
  const [rows] = await queryInterface.sequelize.query(
    "SELECT id, name, email, password, role, avatar, createdAt FROM Users WHERE role IN ('admin','superadmin')"
  );
  for (const r of rows) {
    const exists = await queryInterface.rawSelect('Admins', { where: { email: r.email } }, ['id']);
    if (exists) continue;
    await queryInterface.bulkInsert('Admins', [{
      id: r.id, name: r.name, email: r.email, password: r.password, role: r.role,
      avatar: r.avatar, createdAt: r.createdAt, updatedAt: new Date()
    }]);
  }
  await queryInterface.sequelize.query("UPDATE Users SET role = 'user' WHERE role IN ('admin','superadmin')");
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Admins');
}
