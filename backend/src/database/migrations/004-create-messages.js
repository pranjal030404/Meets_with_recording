export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Messages', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    meetingId: {
      type: Sequelize.UUID,
      references: { model: 'Meetings', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    teamId: {
      type: Sequelize.UUID,
      references: { model: 'Teams', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    channelType: {
      type: Sequelize.STRING(20),
      defaultValue: 'general'
    },
    channelName: {
      type: Sequelize.STRING(100)
    },
    senderId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    content: {
      type: Sequelize.STRING(2000),
      allowNull: false
    },
    type: {
      type: Sequelize.STRING(20),
      defaultValue: 'text'
    },
    recipientId: {
      type: Sequelize.UUID,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    },
    isPrivate: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    meetingData: {
      type: Sequelize.JSON
    },
    mentions: {
      type: Sequelize.JSON
    },
    fileUrl: {
      type: Sequelize.STRING(500)
    },
    fileName: {
      type: Sequelize.STRING(255)
    },
    fileType: {
      type: Sequelize.STRING(100)
    },
    reactions: {
      type: Sequelize.JSON
    },
    isDeleted: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
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

  await queryInterface.addIndex('Messages', ['meetingId', 'createdAt']);
  await queryInterface.addIndex('Messages', ['teamId', 'channelType', 'createdAt']);
  await queryInterface.addIndex('Messages', ['senderId']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Messages');
}
