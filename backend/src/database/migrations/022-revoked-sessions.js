/** 022 - Signed-out sessions, kept across restarts when Redis is not configured (see models/RevokedSession.js). */
export async function up() {
  const { default: RevokedSession } = await import('../../models/RevokedSession.js');
  await RevokedSession.sync(); // CREATE TABLE IF NOT EXISTS
}

export async function down(queryInterface) {
  await queryInterface.dropTable('RevokedSessions');
}
