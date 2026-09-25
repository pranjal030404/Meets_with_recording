import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const UsageLog = sequelize.define('UsageLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  meetingId: {
    type: DataTypes.UUID
  },
  // meeting_created | meeting_minutes | recording_minutes
  type: {
    type: DataTypes.ENUM('meeting_created', 'meeting_minutes', 'recording_minutes'),
    allowNull: false
  },
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'UsageLogs',
  updatedAt: false
});

export default UsageLog;
