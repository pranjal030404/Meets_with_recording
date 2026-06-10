import { DataTypes } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { sequelize } from '../database/index.js';

const Meeting = sequelize.define('Meeting', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  roomId: {
    type: DataTypes.STRING(50),
    unique: true,
    defaultValue: () => uuidv4().substring(0, 8) + '-' + uuidv4().substring(0, 4) + '-' + uuidv4().substring(0, 4)
  },
  title: {
    type: DataTypes.STRING(255),
    defaultValue: 'Untitled Meeting'
  },
  description: {
    type: DataTypes.TEXT
  },
  hostId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  teamId: {
    type: DataTypes.UUID
  },
  meetingLink: {
    type: DataTypes.STRING(500)
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'active', 'ended', 'cancelled'),
    defaultValue: 'scheduled'
  },
  scheduledAt: {
    type: DataTypes.DATE
  },
  startedAt: {
    type: DataTypes.DATE
  },
  endedAt: {
    type: DataTypes.DATE
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {
      waitingRoom: false,
      allowScreenShare: true,
      allowChat: true,
      allowRecording: true,
      muteOnEntry: false,
      isLocked: false,
      maxParticipants: 50
    }
  },
  isInstant: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  recurrence: {
    type: DataTypes.JSON,
    defaultValue: { enabled: false }
  },
  notificationsSent: {
    type: DataTypes.JSON,
    defaultValue: {
      scheduled: false,
      reminder15min: false,
      reminder1hour: false,
      reminder1day: false,
      started: false
    }
  }
}, {
  tableName: 'Meetings'
});

Meeting.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

export default Meeting;
