import { Sequelize } from 'sequelize';

/**
 * 012 — Workspace collaboration features (ARTHVEX TEAM spec alignment)
 * Adds: Conversations + members (DMs/group chat), Tasks, Files, AuditLogs,
 * SavedMessages, and new columns on Messages / Users / Meetings.
 * Idempotent: safe to re-run (checks existence before creating/altering).
 */

const columnExists = async (queryInterface, table, column) => {
  const desc = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(desc, column);
};

const safeAddColumn = async (queryInterface, table, column, options) => {
  if (await columnExists(queryInterface, table, column)) return;
  await queryInterface.addColumn(table, column, options);
};

export default {
  async up(queryInterface) {
    // --- Conversations (DMs & group chats) ---
    if (!(await queryInterface.tableExists('Conversations'))) {
      await queryInterface.createTable('Conversations', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        type: { type: Sequelize.STRING(20), defaultValue: 'direct' },
        name: { type: Sequelize.STRING(100) },
        avatar: { type: Sequelize.STRING(500) },
        createdById: { type: Sequelize.UUID, allowNull: false },
        teamId: { type: Sequelize.UUID },
        lastMessageAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
        lastMessagePreview: { type: Sequelize.STRING(200) },
        metadata: { type: Sequelize.JSON },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
      });
    }

    if (!(await queryInterface.tableExists('ConversationMembers'))) {
      await queryInterface.createTable('ConversationMembers', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        conversationId: { type: Sequelize.UUID, allowNull: false },
        userId: { type: Sequelize.UUID, allowNull: false },
        role: { type: Sequelize.STRING(20), defaultValue: 'member' },
        lastReadAt: { type: Sequelize.DATE },
        isMuted: { type: Sequelize.BOOLEAN, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
      });
      await queryInterface.addIndex('ConversationMembers', ['conversationId', 'userId'], {
        unique: true,
        name: 'conversation_members_unique'
      });
    }

    // --- Tasks ---
    if (!(await queryInterface.tableExists('Tasks'))) {
      await queryInterface.createTable('Tasks', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        title: { type: Sequelize.STRING(255), allowNull: false },
        description: { type: Sequelize.TEXT },
        status: { type: Sequelize.STRING(20), defaultValue: 'todo' },
        priority: { type: Sequelize.STRING(10), defaultValue: 'medium' },
        dueDate: { type: Sequelize.DATE },
        assigneeId: { type: Sequelize.UUID },
        createdById: { type: Sequelize.UUID, allowNull: false },
        teamId: { type: Sequelize.UUID },
        parentId: { type: Sequelize.UUID },
        messageId: { type: Sequelize.UUID },
        meetingId: { type: Sequelize.UUID },
        labels: { type: Sequelize.JSON },
        completedAt: { type: Sequelize.DATE },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
      });
    }

    // --- Files ---
    if (!(await queryInterface.tableExists('Files'))) {
      await queryInterface.createTable('Files', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        ownerId: { type: Sequelize.UUID, allowNull: false },
        teamId: { type: Sequelize.UUID },
        conversationId: { type: Sequelize.UUID },
        messageId: { type: Sequelize.UUID },
        meetingId: { type: Sequelize.UUID },
        originalName: { type: Sequelize.STRING(255), allowNull: false },
        fileName: { type: Sequelize.STRING(255) },
        mimeType: { type: Sequelize.STRING(100) },
        size: { type: 'BIGINT', defaultValue: 0 },
        url: { type: Sequelize.STRING(500) },
        category: { type: Sequelize.STRING(20), defaultValue: 'shared' },
        isDeleted: { type: Sequelize.BOOLEAN, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
      });
    }

    // --- Audit logs (append-only) ---
    if (!(await queryInterface.tableExists('AuditLogs'))) {
      await queryInterface.createTable('AuditLogs', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        actorId: { type: Sequelize.UUID },
        actorName: { type: Sequelize.STRING(100) },
        action: { type: Sequelize.STRING(50), allowNull: false },
        entityType: { type: Sequelize.STRING(50) },
        entityId: { type: Sequelize.STRING(64) },
        metadata: { type: Sequelize.JSON },
        ip: { type: Sequelize.STRING(64) },
        userAgent: { type: Sequelize.STRING(255) },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
      });
    }

    // --- Saved (bookmarked) messages ---
    if (!(await queryInterface.tableExists('SavedMessages'))) {
      await queryInterface.createTable('SavedMessages', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        userId: { type: Sequelize.UUID, allowNull: false },
        messageId: { type: Sequelize.UUID, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
      });
      await queryInterface.addIndex('SavedMessages', ['userId', 'messageId'], {
        unique: true,
        name: 'saved_messages_unique'
      });
    }

    // --- Messages: conversations, threads, edit/pin/forward ---
    await safeAddColumn(queryInterface, 'Messages', 'conversationId', { type: Sequelize.UUID });
    await safeAddColumn(queryInterface, 'Messages', 'threadRootId', { type: Sequelize.UUID });
    await safeAddColumn(queryInterface, 'Messages', 'replyToId', { type: Sequelize.UUID });
    await safeAddColumn(queryInterface, 'Messages', 'replyCount', { type: Sequelize.INTEGER, defaultValue: 0 });
    await safeAddColumn(queryInterface, 'Messages', 'editedAt', { type: Sequelize.DATE });
    await safeAddColumn(queryInterface, 'Messages', 'isPinned', { type: Sequelize.BOOLEAN, defaultValue: false });
    await safeAddColumn(queryInterface, 'Messages', 'pinnedBy', { type: Sequelize.UUID });
    await safeAddColumn(queryInterface, 'Messages', 'forwardedFromId', { type: Sequelize.UUID });
    await safeAddColumn(queryInterface, 'Messages', 'fileSize', { type: 'BIGINT' });

    // --- Users: presence/status & profile fields ---
    await safeAddColumn(queryInterface, 'Users', 'customStatus', { type: Sequelize.STRING(100) });
    await safeAddColumn(queryInterface, 'Users', 'statusEmoji', { type: Sequelize.STRING(10) });
    await safeAddColumn(queryInterface, 'Users', 'statusExpiresAt', { type: Sequelize.DATE });
    await safeAddColumn(queryInterface, 'Users', 'timezone', { type: Sequelize.STRING(50) });
    await safeAddColumn(queryInterface, 'Users', 'title', { type: Sequelize.STRING(100) });
    await safeAddColumn(queryInterface, 'Users', 'department', { type: Sequelize.STRING(100) });

    // --- Meetings: AI summary ---
    await safeAddColumn(queryInterface, 'Meetings', 'aiSummary', { type: Sequelize.JSON });
    await safeAddColumn(queryInterface, 'Meetings', 'summaryGeneratedAt', { type: Sequelize.DATE });
  },

  async down(queryInterface) {
    const safeRemoveColumn = async (table, column) => {
      if (await columnExists(queryInterface, table, column)) {
        await queryInterface.removeColumn(table, column);
      }
    };

    if (await queryInterface.tableExists('SavedMessages')) await queryInterface.dropTable('SavedMessages');
    if (await queryInterface.tableExists('AuditLogs')) await queryInterface.dropTable('AuditLogs');
    if (await queryInterface.tableExists('Files')) await queryInterface.dropTable('Files');
    if (await queryInterface.tableExists('Tasks')) await queryInterface.dropTable('Tasks');
    if (await queryInterface.tableExists('ConversationMembers')) await queryInterface.dropTable('ConversationMembers');
    if (await queryInterface.tableExists('Conversations')) await queryInterface.dropTable('Conversations');

    for (const col of ['conversationId', 'threadRootId', 'replyToId', 'replyCount', 'editedAt', 'isPinned', 'pinnedBy', 'forwardedFromId', 'fileSize']) {
      await safeRemoveColumn('Messages', col);
    }
    for (const col of ['customStatus', 'statusEmoji', 'statusExpiresAt', 'timezone', 'title', 'department']) {
      await safeRemoveColumn('Users', col);
    }
    await safeRemoveColumn('Meetings', 'aiSummary');
    await safeRemoveColumn('Meetings', 'summaryGeneratedAt');
  }
};
