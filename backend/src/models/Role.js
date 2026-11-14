import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

// Custom roles that bundle permissions. Assigned to users via Users.roleId.
const Role = sequelize.define('Role', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(60), allowNull: false, unique: true },
  description: { type: DataTypes.STRING(255) },
  permissions: { type: DataTypes.JSON, defaultValue: [] },
  scope: { type: DataTypes.STRING(8), defaultValue: 'user' },
  isSystem: { type: DataTypes.BOOLEAN, defaultValue: false },
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'Roles' });

export default Role;
