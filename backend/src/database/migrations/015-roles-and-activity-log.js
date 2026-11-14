async function addColumn(qi, Sequelize, table, name, def) {
  const cols = await qi.describeTable(table);
  if (!cols[name]) await qi.addColumn(table, name, def);
}

export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('Roles')) {
    await queryInterface.createTable('Roles', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(60), allowNull: false, unique: true },
      description: { type: Sequelize.STRING(255) },
      permissions: { type: Sequelize.JSON },
      isSystem: { type: Sequelize.BOOLEAN, defaultValue: false },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
  }
  await addColumn(queryInterface, Sequelize, 'Users', 'roleId', { type: Sequelize.UUID, allowNull: true });
  await addColumn(queryInterface, Sequelize, 'Users', 'isActive', { type: Sequelize.BOOLEAN, defaultValue: true });
  await addColumn(queryInterface, Sequelize, 'AuditLogs', 'actorType', { type: Sequelize.STRING(16), defaultValue: 'user' });
  await addColumn(queryInterface, Sequelize, 'AuditLogs', 'method', { type: Sequelize.STRING(10) });
  await addColumn(queryInterface, Sequelize, 'AuditLogs', 'path', { type: Sequelize.STRING(500) });
  await addColumn(queryInterface, Sequelize, 'AuditLogs', 'statusCode', { type: Sequelize.INTEGER });
}

export async function down() {}
