export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Meetings', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    roomId: {
      type: Sequelize.STRING(50),
      unique: true
    },
    title: {
      type: Sequelize.STRING(255),
      defaultValue: 'Untitled Meeting'
    },
    description: {
      type: Sequelize.TEXT
    },
    hostId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    teamId: {
      type: Sequelize.UUID,
      references: { model: 'Teams', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    },
    meetingLink: {
      type: Sequelize.STRING(500)
    },
    participants: {
      type: Sequelize.JSON
    },
    participantIds: {
      type: Sequelize.JSON
    },
    invitees: {
      type: Sequelize.JSON
    },
    inviteeIds: {
      type: Sequelize.JSON
    },
    status: {
      type: Sequelize.STRING(20),
      defaultValue: 'scheduled'
    },
    scheduledAt: {
      type: Sequelize.DATE
    },
    startedAt: {
      type: Sequelize.DATE
    },
    endedAt: {
      type: Sequelize.DATE
    },
    settings: {
      type: Sequelize.JSON
    },
    recordings: {
      type: Sequelize.JSON
    },
    isInstant: {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    },
    recurrence: {
      type: Sequelize.JSON
    },
    reminders: {
      type: Sequelize.JSON
    },
    notificationsSent: {
      type: Sequelize.JSON
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false
    }
  });

  await queryInterface.addIndex('Meetings', ['roomId']);
  await queryInterface.addIndex('Meetings', ['hostId']);
  await queryInterface.addIndex('Meetings', ['status']);
  await queryInterface.addIndex('Meetings', ['teamId']);
  await queryInterface.addIndex('Meetings', ['scheduledAt']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Meetings');
}
