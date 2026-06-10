export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Teams', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    name: {
      type: Sequelize.STRING(100),
      allowNull: false
    },
    description: {
      type: Sequelize.STRING(500)
    },
    ownerId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    members: {
      type: Sequelize.JSON
    },
    inviteCode: {
      type: Sequelize.STRING(50),
      unique: true
    },
    settings: {
      type: Sequelize.JSON
    },
    channels: {
      type: Sequelize.JSON
    },
    isActive: {
      type: Sequelize.BOOLEAN,
      defaultValue: true
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

  await queryInterface.addIndex('Teams', ['ownerId']);
  await queryInterface.addIndex('Teams', ['inviteCode']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Teams');
}
