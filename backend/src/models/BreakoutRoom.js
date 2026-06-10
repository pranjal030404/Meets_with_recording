import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const BreakoutRoom = sequelize.define('BreakoutRoom', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  parentMeetingId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  roomNumber: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('open', 'closed'),
    defaultValue: 'open'
  },
  duration: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  autoCloseAt: {
    type: DataTypes.DATE
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false
  }
}, {
  tableName: 'BreakoutRooms'
});

BreakoutRoom.prototype.isUserAssigned = function(userId) {
  if (!this.assignedParticipants) return false;
  return this.assignedParticipants.some(
    p => p.userId.toString() === userId.toString()
  );
};

BreakoutRoom.prototype.getActiveParticipants = function() {
  if (!this.assignedParticipants) return [];
  return this.assignedParticipants.filter(p => p.joinedAt && !p.leftAt);
};

BreakoutRoom.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  values.activeParticipantCount = (values.assignedParticipants || [])
    .filter(p => p.joinedAt && !p.leftAt).length;
  return values;
};

export default BreakoutRoom;
