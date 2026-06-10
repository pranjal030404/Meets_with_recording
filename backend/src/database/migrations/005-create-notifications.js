export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Notifications', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    recipientId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    type: {
      type: Sequelize.STRING(30),
      allowNull: false
    },
    title: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    message: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    data: {
      type: Sequelize.JSON
    },
    isRead: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    readAt: {
      type: Sequelize.DATE
    },
    priority: {
      type: Sequelize.STRING(10),
      defaultValue: 'normal'
    },
    expiresAt: {
      type: Sequelize.DATE
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

  await queryInterface.addIndex('Notifications', ['recipientId', 'isRead', 'createdAt']);
  await queryInterface.addIndex('Notifications', ['expiresAt']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Notifications');
}
