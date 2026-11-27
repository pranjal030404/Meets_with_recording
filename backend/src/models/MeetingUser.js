import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

/** Index of who belongs to which meeting (host, participants, invitees). Derived from the Meetings row. */
const MeetingUser = sequelize.define('MeetingUser', {
  meetingId: { type: DataTypes.UUID, primaryKey: true },
  userId: { type: DataTypes.UUID, primaryKey: true }
}, { tableName: 'MeetingUsers', timestamps: false, indexes: [{ name: 'meeting_users_user', fields: ['userId', 'meetingId'] }] });

export default MeetingUser;
