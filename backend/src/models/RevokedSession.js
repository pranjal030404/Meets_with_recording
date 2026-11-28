import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

/** Signed-out sessions, so that a restart does not bring them back (used when Redis is not configured). */
const RevokedSession = sequelize.define('RevokedSession', {
  key: { type: DataTypes.STRING(80), primaryKey: true }, // t:<token hash> or u:<user id>
  value: { type: DataTypes.BIGINT, allowNull: false },   // expiry (ms) for a token, earliest valid issue time (s) for a user
  expiresAt: { type: DataTypes.DATE, allowNull: false }
}, { tableName: 'RevokedSessions', timestamps: false });

export default RevokedSession;
