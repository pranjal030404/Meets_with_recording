/** 020 - Index tables for meeting and team membership (see models/membership.js), filled from existing rows. */
export async function up() {
  await import('../../models/associations.js');
  const { backfillMembership } = await import('../../models/membership.js');
  await backfillMembership({ force: true });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('MeetingUsers');
  await queryInterface.dropTable('TeamUsers');
}
