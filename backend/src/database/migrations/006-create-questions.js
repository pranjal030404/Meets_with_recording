export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Questions', {
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
    askedById: {
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
    answer: {
      type: Sequelize.TEXT
    },
    answeredById: {
      type: Sequelize.UUID,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    },
    answeredAt: {
      type: Sequelize.DATE
    },
    upvotes: {
      type: Sequelize.JSON
    },
    isAnswered: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    isDismissed: {
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

  await queryInterface.addIndex('Questions', ['meetingId']);
  await queryInterface.addIndex('Questions', ['askedById']);
  await queryInterface.addIndex('Questions', ['isAnswered']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Questions');
}
