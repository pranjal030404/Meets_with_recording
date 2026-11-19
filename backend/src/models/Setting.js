import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

// Simple key/value store for admin-controlled platform settings.
const Setting = sequelize.define('Setting', {
  key: { type: DataTypes.STRING(100), primaryKey: true },
  value: { type: DataTypes.JSON }
}, { tableName: 'Settings' });

export default Setting;
