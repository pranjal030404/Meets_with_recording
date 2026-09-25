import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.STRING(255)
  },
  monthlyPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  yearlyPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD'
  },
  // Marketing feature list shown on pricing pages
  features: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  // Enforceable limits. -1 means unlimited, 0 means not available.
  // { meetingsPerMonth, meetingDurationMinutes, participantsPerMeeting,
  //   recordingMinutesPerMonth, storageGB, maxTeams,
  //   canRecord, canTranscribe, canBreakout, canPoll }
  limits: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'SubscriptionPlans',
  // MariaDB stores JSON columns as LONGTEXT, so reads can return raw strings.
  // Normalize to real objects/arrays no matter how the row was written.
  hooks: {
    afterFind: (result) => {
      if (Array.isArray(result)) result.forEach(normalizePlan);
      else normalizePlan(result);
    }
  }
});

export function normalizePlan(plan) {
  if (!plan) return plan;
  if (typeof plan.features === 'string') {
    try { plan.setDataValue('features', JSON.parse(plan.features)); }
    catch { plan.setDataValue('features', []); }
  }
  if (typeof plan.limits === 'string') {
    try { plan.setDataValue('limits', JSON.parse(plan.limits)); }
    catch { plan.setDataValue('limits', {}); }
  }
  return plan;
}

export default SubscriptionPlan;
