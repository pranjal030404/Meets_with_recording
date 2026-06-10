import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  recipientId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM(
      'meeting_scheduled',
      'meeting_reminder',
      'meeting_started',
      'meeting_cancelled',
      'team_invite',
      'team_member_added',
      'mention',
      'chat_message'
    ),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  data: {
    type: DataTypes.JSON
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  readAt: {
    type: DataTypes.DATE
  },
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    defaultValue: 'normal'
  },
  expiresAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'Notifications'
});

Notification.prototype.markAsRead = async function() {
  this.isRead = true;
  this.readAt = new Date();
  return await this.save();
};

Notification.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

export default Notification;
