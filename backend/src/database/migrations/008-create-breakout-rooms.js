export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('BreakoutRooms', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    parentMeetingId: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'Meetings', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    roomNumber: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    name: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    assignedParticipants: {
      type: Sequelize.JSON
    },
    status: {
      type: Sequelize.STRING(10),
      defaultValue: 'open'
    },
    duration: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    autoCloseAt: {
      type: Sequelize.DATE
    },
    createdById: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
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

  await queryInterface.addIndex('BreakoutRooms', ['parentMeetingId']);
  await queryInterface.addIndex('BreakoutRooms', ['status']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('BreakoutRooms');
}
