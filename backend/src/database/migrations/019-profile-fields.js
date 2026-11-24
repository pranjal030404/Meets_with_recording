/** 019 - richer profile: phone, bio, location (idempotent). */
async function addColumn(qi, Sequelize, table, name, def) {
  const cols = await qi.describeTable(table);
  if (!cols[name]) await qi.addColumn(table, name, def);
}

export async function up(queryInterface, Sequelize) {
  await addColumn(queryInterface, Sequelize, 'Users', 'phone', { type: Sequelize.STRING(30), allowNull: true });
  await addColumn(queryInterface, Sequelize, 'Users', 'bio', { type: Sequelize.STRING(300), allowNull: true });
  await addColumn(queryInterface, Sequelize, 'Users', 'location', { type: Sequelize.STRING(100), allowNull: true });
}

export async function down() {}
