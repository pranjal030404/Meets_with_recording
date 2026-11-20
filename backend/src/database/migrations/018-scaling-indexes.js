/**
 * 018 - Composite indexes for the hot read paths (query shapes taken from routes/*.js).
 * Idempotent (skips existing) and reversible (down drops exactly what up created).
 * Each index serves one query shape:
 *   messages_conv_thread_deleted_created : GET conversation messages  WHERE conversationId=? AND threadRootId IS NULL AND isDeleted=0 ORDER BY createdAt DESC
 *   messages_meeting_deleted_created     : meeting chat               WHERE meetingId=? AND isDeleted=0 ORDER BY createdAt DESC
 *   messages_team_channel_created        : team channels              WHERE teamId=? AND channelType=? AND isDeleted=0 ORDER BY createdAt DESC
 *   messages_thread_created              : thread replies             WHERE threadRootId=? ORDER BY createdAt
 *   notifications_recipient_created      : notification list          WHERE recipientId=? ORDER BY createdAt DESC
 *   notifications_recipient_read         : unread badge count         WHERE recipientId=? AND isRead=0
 *   meetings_status_scheduled            : reminder cron              WHERE status='scheduled' AND scheduledAt ...
 * NOTE: no index was added for Meetings listing: it filters with JSON_CONTAINS on participantIds/inviteeIds
 * which no B-tree index can serve (see docs/DATABASE_SCALING.md for the join-table plan).
 * Online DDL: on MariaDB these are INPLACE and do not block writes (verify on your version for big tables).
 */
const INDEXES = [
  ['Messages', 'messages_conv_thread_deleted_created', ['conversationId', 'threadRootId', 'isDeleted', 'createdAt']],
  ['Messages', 'messages_meeting_deleted_created', ['meetingId', 'isDeleted', 'createdAt']],
  ['Messages', 'messages_team_channel_created', ['teamId', 'channelType', 'isDeleted', 'createdAt']],
  ['Messages', 'messages_thread_created', ['threadRootId', 'createdAt']],
  ['Notifications', 'notifications_recipient_created', ['recipientId', 'createdAt']],
  ['Notifications', 'notifications_recipient_read', ['recipientId', 'isRead']],
  ['Meetings', 'meetings_status_scheduled', ['status', 'scheduledAt']],
];

const existing = async (qi, table) => new Set((await qi.showIndex(table)).map((i) => i.name));

export async function up(queryInterface) {
  for (const [table, name, fields] of INDEXES) {
    if ((await existing(queryInterface, table)).has(name)) continue;
    const cols = await queryInterface.describeTable(table);
    const missing = fields.filter((f) => !cols[f]);
    if (missing.length) { console.warn(`  skip ${name}: ${table} has no column ${missing.join(',')}`); continue; }
    await queryInterface.addIndex(table, fields, { name });
    console.log(`  created ${name}`);
  }
}

export async function down(queryInterface) {
  for (const [table, name] of INDEXES) {
    if ((await existing(queryInterface, table)).has(name)) await queryInterface.removeIndex(table, name);
  }
}
