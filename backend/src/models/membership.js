/**
 * Keeps the MeetingUsers / TeamUsers index tables in step with the JSON columns, so "my meetings" and
 * "my teams" are index lookups instead of scans of every row. Imported by models/associations.js.
 */
import { Op } from 'sequelize';
import { sequelize } from '../database/index.js';
import Meeting from './Meeting.js';
import Team from './Team.js';
import MeetingUser from './MeetingUser.js';
import TeamUser from './TeamUser.js';

const ids = (list) => [...new Set(list.filter((id) => typeof id === 'string' && id.length <= 36))];
const meetingUserIds = (m) => ids([m.hostId, ...(Array.isArray(m.participantIds) ? m.participantIds : []), ...(Array.isArray(m.inviteeIds) ? m.inviteeIds : [])]);
const teamUserIds = (t) => ids((Array.isArray(t.members) ? t.members : []).map((m) => m?.userId || m?.id));

const replace = async (Link, key, keyValue, userIds, transaction) => {
  await Link.destroy({ where: { [key]: keyValue, ...(userIds.length ? { userId: { [Op.notIn]: userIds } } : {}) }, transaction });
  if (userIds.length) await Link.bulkCreate(userIds.map((userId) => ({ [key]: keyValue, userId })), { ignoreDuplicates: true, transaction });
};

const touched = (row, options, names) => !options?.fields || names.some((n) => options.fields.includes(n));

export const syncMeetingUsers = (meeting, options = {}) => {
  if (!touched(meeting, options, ['hostId', 'participantIds', 'inviteeIds'])) return null;
  return replace(MeetingUser, 'meetingId', meeting.id, meetingUserIds(meeting), options.transaction);
};
export const syncTeamUsers = (team, options = {}) => {
  if (!touched(team, options, ['members'])) return null;
  return replace(TeamUser, 'teamId', team.id, teamUserIds(team), options.transaction);
};

Meeting.addHook('afterSave', 'membership', syncMeetingUsers);
Meeting.addHook('afterBulkCreate', 'membership', async (rows, options) => { for (const row of rows) await syncMeetingUsers(row, { transaction: options.transaction }); });
Meeting.addHook('afterDestroy', 'membership', (row, options) => MeetingUser.destroy({ where: { meetingId: row.id }, transaction: options.transaction }));
Team.addHook('afterSave', 'membership', syncTeamUsers);
Team.addHook('afterDestroy', 'membership', (row, options) => TeamUser.destroy({ where: { teamId: row.id }, transaction: options.transaction }));

/**
 * Fills whatever the index is missing from the rows themselves: a first start on existing data, or a start that was
 * interrupted half way. A row is complete when its host/owner is listed (all of a row's entries are written in one
 * insert). `force` rewrites every row: needed after running an older version that did not maintain the index.
 */
export const backfillMembership = async ({ force = false } = {}) => {
  for (const [Model, Link, key, owner, sync, attributes] of [
    [Meeting, MeetingUser, 'meetingId', 'hostId', syncMeetingUsers, ['id', 'hostId', 'participantIds', 'inviteeIds']],
    [Team, TeamUser, 'teamId', 'ownerId', syncTeamUsers, ['id', 'members']]
  ]) {
    await Link.sync();
    const missing = force ? {} : {
      [Op.notIn]: sequelize.literal(`(SELECT l.${key} FROM ${Link.tableName} l JOIN ${Model.tableName} r ON r.id = l.${key} AND r.${owner} = l.userId)`)
    };
    let last = '';
    for (;;) {
      const rows = await Model.findAll({ where: { id: { [Op.gt]: last, ...missing } }, attributes, order: [['id', 'ASC']], limit: 500 });
      if (!rows.length) break;
      for (const row of rows) await sync(row);
      last = rows[rows.length - 1].id;
    }
  }
};

/** SQL subquery of the ids this user belongs to, for `{ [Op.in]: ... }`. */
export const meetingIdsOf = (userId) => sequelize.literal(`(SELECT meetingId FROM MeetingUsers WHERE userId = ${sequelize.escape(String(userId))})`);
export const teamIdsOf = (userId) => sequelize.literal(`(SELECT teamId FROM TeamUsers WHERE userId = ${sequelize.escape(String(userId))})`);

/** Active teams this user is in. The member list stays the authority: a stale index entry grants nothing. */
export const myTeams = async (userId) => (await Team.findAll({ where: { id: { [Op.in]: teamIdsOf(userId) }, isActive: true } }))
  .filter((team) => team.isMember(userId));
