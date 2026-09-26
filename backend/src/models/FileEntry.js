import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const FileEntry = sequelize.define('FileEntry', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  teamId: {
    type: DataTypes.UUID
  },
  conversationId: {
    type: DataTypes.UUID
  },
  messageId: {
    type: DataTypes.UUID
  },
  meetingId: {
    type: DataTypes.UUID
  },
  originalName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  fileName: {
    type: DataTypes.STRING(255)
  },
  mimeType: {
    type: DataTypes.STRING(100)
  },
  size: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  url: {
    type: DataTypes.STRING(500)
  },
  category: {
    type: DataTypes.STRING(20),
    defaultValue: 'shared'
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'Files'
});

FileEntry.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

export default FileEntry;
