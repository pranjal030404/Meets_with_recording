import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

/** Wrong-password and wrong-code counts, so a restart does not wipe them (used when Redis is not configured). */
const AttemptCounter = sequelize.define('AttemptCounter', {
  key: { type: DataTypes.STRING(190), primaryKey: true },
  n: { type: DataTypes.INTEGER, allowNull: false },
  resetAt: { type: DataTypes.BIGINT, allowNull: false } // ms
}, { tableName: 'AttemptCounters', timestamps: false });

export default AttemptCounter;
