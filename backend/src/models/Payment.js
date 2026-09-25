import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  subscriptionId: {
    type: DataTypes.UUID
  },
  planId: {
    type: DataTypes.UUID
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD'
  },
  status: {
    type: DataTypes.ENUM('paid', 'pending', 'failed', 'refunded'),
    defaultValue: 'pending'
  },
  method: {
    type: DataTypes.STRING(50),
    defaultValue: 'demo-card'
  },
  transactionId: {
    type: DataTypes.STRING(100),
    unique: true
  },
  description: {
    type: DataTypes.STRING(255)
  },
  periodStart: {
    type: DataTypes.DATE
  },
  periodEnd: {
    type: DataTypes.DATE
  },
  paidAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'Payments'
});

export default Payment;
