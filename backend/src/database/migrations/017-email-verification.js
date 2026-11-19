/**
 * 017 - Email verification + admin Settings table.
 * Idempotent. Existing users are marked verified so enabling verification never locks them out.
 */
async function addColumn(qi, Sequelize, table, name, def) {
  const cols = await qi.describeTable(table);
  if (!cols[name]) await qi.addColumn(table, name, def);
}

export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('Settings')) {
    await queryInterface.createTable('Settings', {
      key: { type: Sequelize.STRING(100), primaryKey: true, allowNull: false },
      value: { type: Sequelize.JSON },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  }

  const cols = await queryInterface.describeTable('Users');
  const isNew = !cols.isEmailVerified;
  await addColumn(queryInterface, Sequelize, 'Users', 'isEmailVerified', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
  await addColumn(queryInterface, Sequelize, 'Users', 'emailVerifyToken', { type: Sequelize.STRING(64), allowNull: true });
  await addColumn(queryInterface, Sequelize, 'Users', 'emailVerifyExpires', { type: Sequelize.DATE, allowNull: true });
  await addColumn(queryInterface, Sequelize, 'Users', 'emailVerifySentAt', { type: Sequelize.DATE, allowNull: true });
  if (isNew) await queryInterface.sequelize.query('UPDATE Users SET isEmailVerified = 1');
}

export async function down() {}
