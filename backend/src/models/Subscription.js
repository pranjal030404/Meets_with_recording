import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const Subscription = sequelize.define('Subscription', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true
  },
  planId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'trialing', 'past_due', 'canceled', 'expired'),
    defaultValue: 'active'
  },
  billingInterval: {
    type: DataTypes.ENUM('monthly', 'yearly'),
    defaultValue: 'monthly'
  },
  // Null currentPeriodEnd on the free plan = never expires
  currentPeriodStart: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  currentPeriodEnd: {
    type: DataTypes.DATE
  },
  cancelAtPeriodEnd: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD'
  },
  paymentMethod: {
    type: DataTypes.STRING(50),
    defaultValue: 'none'
  },
  canceledAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'Subscriptions'
});

export default Subscription;
