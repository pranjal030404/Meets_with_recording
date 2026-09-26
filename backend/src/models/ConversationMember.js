import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const ConversationMember = sequelize.define('ConversationMember', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  conversationId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING(20),
    defaultValue: 'member'
  },
  lastReadAt: {
    type: DataTypes.DATE
  },
  isMuted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'ConversationMembers',
  indexes: [
    {
      unique: true,
      fields: ['conversationId', 'userId']
    }
  ]
});

ConversationMember.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

export default ConversationMember;
