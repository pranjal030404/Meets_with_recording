import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const SavedMessage = sequelize.define('SavedMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  messageId: {
    type: DataTypes.UUID,
    allowNull: false
  }
}, {
  tableName: 'SavedMessages',
  indexes: [
    {
      unique: true,
      fields: ['userId', 'messageId']
    }
  ]
});

SavedMessage.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

export default SavedMessage;
