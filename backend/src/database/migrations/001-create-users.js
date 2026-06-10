export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Users', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    name: {
      type: Sequelize.STRING(100),
      allowNull: false
    },
    email: {
      type: Sequelize.STRING(255),
      allowNull: false,
      unique: true
    },
    password: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    avatar: {
      type: Sequelize.STRING(500)
    },
    isOnline: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    lastSeen: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    },
    role: {
      type: Sequelize.STRING(20),
      defaultValue: 'user'
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

  await queryInterface.addIndex('Users', ['email']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Users');
}
