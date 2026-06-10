export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Polls', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    meetingId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'Meetings', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    createdById: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    question: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    options: {
      type: Sequelize.JSON
    },
    allowMultiple: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    isAnonymous: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: Sequelize.STRING(10),
      defaultValue: 'draft'
    },
    endsAt: {
      type: Sequelize.DATE
    },
    totalVotes: {
      type: Sequelize.INTEGER,
      defaultValue: 0
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

  await queryInterface.addIndex('Polls', ['meetingId']);
  await queryInterface.addIndex('Polls', ['createdById']);
  await queryInterface.addIndex('Polls', ['status']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Polls');
}
