import { Sequelize } from 'sequelize';

/**
 * 013 — Complete meeting transcript
 * Adds Meetings.completeTranscript (JSON) to persist the merged, full-meeting
 * transcript generated from all recording transcripts.
 * Idempotent: safe to re-run (checks existence before altering).
 */

const columnExists = async (queryInterface, table, column) => {
  const desc = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(desc, column);
};

export async function up(queryInterface) {
  if (!(await columnExists(queryInterface, 'Meetings', 'completeTranscript'))) {
    await queryInterface.addColumn('Meetings', 'completeTranscript', { type: Sequelize.JSON });
  }
}

export async function down(queryInterface) {
  if (await columnExists(queryInterface, 'Meetings', 'completeTranscript')) {
    await queryInterface.removeColumn('Meetings', 'completeTranscript');
  }
}
