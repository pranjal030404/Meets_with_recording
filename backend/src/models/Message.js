import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  meetingId: {
    type: DataTypes.UUID
  },
  teamId: {
    type: DataTypes.UUID
  },
  conversationId: {
    type: DataTypes.UUID
  },
  threadRootId: {
    type: DataTypes.UUID
  },
  replyToId: {
    type: DataTypes.UUID
  },
  replyCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  channelType: {
    type: DataTypes.ENUM('general', 'meetings', 'announcements', 'custom'),
    defaultValue: 'general'
  },
  channelName: {
    type: DataTypes.STRING(100)
  },
  senderId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  content: {
    type: DataTypes.STRING(2000),
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('text', 'file', 'system', 'meeting_link'),
    defaultValue: 'text'
  },
  recipientId: {
    type: DataTypes.UUID
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  meetingData: {
    type: DataTypes.JSON
  },
  mentions: {
    type: DataTypes.JSON
  },
  fileUrl: {
    type: DataTypes.STRING(500)
  },
  fileName: {
    type: DataTypes.STRING(255)
  },
  fileType: {
    type: DataTypes.STRING(100)
  },
  fileSize: {
    type: DataTypes.BIGINT
  },
  reactions: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  editedAt: {
    type: DataTypes.DATE
  },
  isPinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  pinnedBy: {
    type: DataTypes.UUID
  },
  forwardedFromId: {
    type: DataTypes.UUID
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'Messages'
});

Message.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

export default Message;
