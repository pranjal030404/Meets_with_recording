/** 024 - Attempt counters that survive a restart when Redis is not configured (see models/AttemptCounter.js). */
export async function up() {
  const { default: AttemptCounter } = await import('../../models/AttemptCounter.js');
  await AttemptCounter.sync(); // CREATE TABLE IF NOT EXISTS
}

export async function down(queryInterface) {
  await queryInterface.dropTable('AttemptCounters');
}
