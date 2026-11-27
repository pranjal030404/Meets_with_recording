/**
 * Foreign keys the schema was missing. Used by migration 023 and by `npm run check-integrity`.
 * [table, column, referenced table, what happens to the row when the referenced one is deleted]
 */
export const RELATIONS = [
  ['Users', 'roleId', 'Roles', 'SET NULL'],
  ['Admins', 'roleId', 'Roles', 'SET NULL'],
  ['Conversations', 'createdById', 'Users', 'RESTRICT'],
  ['Conversations', 'teamId', 'Teams', 'SET NULL'],
  ['ConversationMembers', 'conversationId', 'Conversations', 'CASCADE'],
  ['ConversationMembers', 'userId', 'Users', 'CASCADE'],
  ['Messages', 'conversationId', 'Conversations', 'CASCADE'],
  ['Messages', 'threadRootId', 'Messages', 'SET NULL'],
  ['Messages', 'replyToId', 'Messages', 'SET NULL'],
  ['Messages', 'forwardedFromId', 'Messages', 'SET NULL'],
  ['Files', 'ownerId', 'Users', 'CASCADE'],
  ['Files', 'teamId', 'Teams', 'SET NULL'],
  ['Files', 'conversationId', 'Conversations', 'SET NULL'],
  ['Files', 'messageId', 'Messages', 'SET NULL'],
  ['Files', 'meetingId', 'Meetings', 'SET NULL'],
  ['Tasks', 'createdById', 'Users', 'CASCADE'],
  ['Tasks', 'assigneeId', 'Users', 'SET NULL'],
  ['Tasks', 'teamId', 'Teams', 'SET NULL'],
  ['Tasks', 'parentId', 'Tasks', 'CASCADE'],
  ['Tasks', 'messageId', 'Messages', 'SET NULL'],
  ['Tasks', 'meetingId', 'Meetings', 'SET NULL'],
  ['SavedMessages', 'userId', 'Users', 'CASCADE'],
  ['SavedMessages', 'messageId', 'Messages', 'CASCADE'],
  ['Subscriptions', 'userId', 'Users', 'CASCADE'],
  ['Subscriptions', 'planId', 'SubscriptionPlans', 'RESTRICT'],
  ['Payments', 'userId', 'Users', 'RESTRICT'],
  ['Payments', 'subscriptionId', 'Subscriptions', 'SET NULL'],
  ['Payments', 'planId', 'SubscriptionPlans', 'SET NULL'],
  ['UsageLogs', 'userId', 'Users', 'CASCADE'],
  ['UsageLogs', 'meetingId', 'Meetings', 'SET NULL'],
  // only the owning side: the user ids in these index tables come from JSON lists and may name nobody
  ['MeetingUsers', 'meetingId', 'Meetings', 'CASCADE'],
  ['TeamUsers', 'teamId', 'Teams', 'CASCADE'],
];

export const nameOf = ([table, column]) => `fk_${table}_${column}`;

const rows = async (sequelize, sql, replacements) => (await sequelize.query(sql, { replacements }))[0];

export const hasForeignKey = async (sequelize, [table, column]) => (await rows(sequelize,
  `SELECT 1 FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     AND referenced_table_name IS NOT NULL`, [table, column])).length > 0;

export const tableExists = async (sequelize, table) => (await rows(sequelize,
  'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [table])).length > 0;

const orphanWhere = ([, column, target]) => `c.\`${column}\` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM \`${target}\` p WHERE p.id = c.\`${column}\`)`;

// a derived table, because MariaDB will not read the table it is changing in a self-reference
const orphanValues = (relation) => `SELECT v FROM (SELECT DISTINCT c.\`${relation[1]}\` AS v FROM \`${relation[0]}\` c WHERE ${orphanWhere(relation)}) o`;

export const countOrphans = async (sequelize, relation) => Number((await rows(sequelize,
  `SELECT COUNT(*) AS n FROM \`${relation[0]}\` c WHERE ${orphanWhere(relation)}`))[0].n);

/** Clear the broken reference, or delete the row where it cannot exist without what it pointed at. */
export const repairOrphans = async (sequelize, relation) => {
  const [table, column, , onDelete] = relation;
  if (onDelete === 'SET NULL') await sequelize.query(`UPDATE \`${table}\` SET \`${column}\` = NULL WHERE \`${column}\` IN (${orphanValues(relation)})`);
  else if (onDelete === 'CASCADE') await sequelize.query(`DELETE FROM \`${table}\` WHERE \`${column}\` IN (${orphanValues(relation)})`);
  else return false; // RESTRICT (money, history): a person has to decide
  return true;
};

export const addForeignKey = async (sequelize, relation) => {
  const [table, column, target, onDelete] = relation;
  await sequelize.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${nameOf(relation)}\` FOREIGN KEY (\`${column}\`)
    REFERENCES \`${target}\` (id) ON DELETE ${onDelete} ON UPDATE CASCADE`);
};
