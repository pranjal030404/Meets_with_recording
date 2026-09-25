export async function up(queryInterface, Sequelize) {
  if (!(await queryInterface.tableExists('SubscriptionPlans'))) {
    await queryInterface.createTable('SubscriptionPlans', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      description: {
        type: Sequelize.STRING(255)
      },
      monthlyPrice: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      yearlyPrice: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      currency: {
        type: Sequelize.STRING(3),
        defaultValue: 'USD'
      },
      features: {
        type: Sequelize.JSON
      },
      limits: {
        type: Sequelize.JSON
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      sortOrder: {
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
  }

  if (!(await queryInterface.tableExists('Subscriptions'))) {
    await queryInterface.createTable('Subscriptions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true
      },
      planId: {
        type: Sequelize.UUID,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(20),
        defaultValue: 'active'
      },
      billingInterval: {
        type: Sequelize.STRING(10),
        defaultValue: 'monthly'
      },
      currentPeriodStart: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      currentPeriodEnd: {
        type: Sequelize.DATE
      },
      cancelAtPeriodEnd: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0
      },
      currency: {
        type: Sequelize.STRING(3),
        defaultValue: 'USD'
      },
      paymentMethod: {
        type: Sequelize.STRING(50),
        defaultValue: 'none'
      },
      canceledAt: {
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
  }

  if (!(await queryInterface.tableExists('Payments'))) {
    await queryInterface.createTable('Payments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false
      },
      subscriptionId: {
        type: Sequelize.UUID
      },
      planId: {
        type: Sequelize.UUID
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      currency: {
        type: Sequelize.STRING(3),
        defaultValue: 'USD'
      },
      status: {
        type: Sequelize.STRING(20),
        defaultValue: 'pending'
      },
      method: {
        type: Sequelize.STRING(50),
        defaultValue: 'demo-card'
      },
      transactionId: {
        type: Sequelize.STRING(100),
        unique: true
      },
      description: {
        type: Sequelize.STRING(255)
      },
      periodStart: {
        type: Sequelize.DATE
      },
      periodEnd: {
        type: Sequelize.DATE
      },
      paidAt: {
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
  }

  if (!(await queryInterface.tableExists('UsageLogs'))) {
    await queryInterface.createTable('UsageLogs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false
      },
      meetingId: {
        type: Sequelize.UUID
      },
      type: {
        type: Sequelize.STRING(30),
        allowNull: false
      },
      amount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      metadata: {
        type: Sequelize.JSON
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });
  }

  await queryInterface.addIndex('Subscriptions', ['userId']).catch(() => {});
  await queryInterface.addIndex('Payments', ['userId']).catch(() => {});
  await queryInterface.addIndex('UsageLogs', ['userId', 'type', 'createdAt']).catch(() => {});
}

export async function down(queryInterface) {
  await queryInterface.dropTable('UsageLogs').catch(() => {});
  await queryInterface.dropTable('Payments').catch(() => {});
  await queryInterface.dropTable('Subscriptions').catch(() => {});
  await queryInterface.dropTable('SubscriptionPlans').catch(() => {});
}
