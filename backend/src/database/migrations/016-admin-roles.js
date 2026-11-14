async function addColumn(qi, table, name, def) {
  const cols = await qi.describeTable(table);
  if (!cols[name]) await qi.addColumn(table, name, def);
}
export async function up(queryInterface, Sequelize) {
  await addColumn(queryInterface, 'Roles', 'scope', { type: Sequelize.STRING(8), defaultValue: 'user' });
  await addColumn(queryInterface, 'Admins', 'roleId', { type: Sequelize.UUID, allowNull: true });
}
export async function down() {}
