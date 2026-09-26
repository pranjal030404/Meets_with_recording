import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  actorId: {
    type: DataTypes.UUID
  },
  actorName: {
    type: DataTypes.STRING(100)
  },
  action: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  entityType: {
    type: DataTypes.STRING(50)
  },
  entityId: {
    type: DataTypes.STRING(64)
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  ip: {
    type: DataTypes.STRING(64)
  },
  userAgent: {
    type: DataTypes.STRING(255)
  }
}, {
  tableName: 'AuditLogs',
  updatedAt: false
});

AuditLog.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

export default AuditLog;
