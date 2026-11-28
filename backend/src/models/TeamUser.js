import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

/** Index of team membership. Derived from Teams.members. */
const TeamUser = sequelize.define('TeamUser', {
  teamId: { type: DataTypes.UUID, primaryKey: true },
  userId: { type: DataTypes.UUID, primaryKey: true }
}, { tableName: 'TeamUsers', timestamps: false, indexes: [{ name: 'team_users_user', fields: ['userId', 'teamId'] }] });

export default TeamUser;
