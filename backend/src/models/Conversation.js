import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  type: {
    type: DataTypes.ENUM('direct', 'group'),
    defaultValue: 'direct'
  },
  name: {
    type: DataTypes.STRING(100)
  },
  avatar: {
    type: DataTypes.STRING(500)
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false
  },
  teamId: {
    type: DataTypes.UUID
  },
  lastMessageAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  lastMessagePreview: {
    type: DataTypes.STRING(200)
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'Conversations'
});

Conversation.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

export default Conversation;
