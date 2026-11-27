/**
 * Who may see or act on what. REST routes and socket handlers both ask here, so the two paths cannot drift.
 */
import Meeting from '../models/Meeting.js';
import Team from '../models/Team.js';
import ConversationMember from '../models/ConversationMember.js';
import TeamUser from '../models/TeamUser.js';
import { canManageMeeting, canAccessMeeting, hostHasJoined } from './meetingPermissions.js';
import { isUpcoming, presentParticipants } from '../services/meetingLifecycle.js';

const invited = (meeting, user) => (meeting.inviteeIds || []).includes(user.id)
  || (meeting.invitees || []).some((i) => i.userId === user.id || (i.email && user.email && i.email.toLowerCase() === user.email.toLowerCase()));

/**
 * Is this person part of the meeting (and so allowed its chat, polls, Q&A, rooms)? Merely being able to open
 * an "anyone with the link" meeting is not enough: they become a participant by joining.
 */
export const isInsider = async (meeting, user) => {
  if (!meeting || !user) return false;
  if (canManageMeeting(meeting, user.id) || (meeting.participantIds || []).includes(user.id) || invited(meeting, user)) return true;
  if (!meeting.teamId) return false;
  const team = await Team.findByPk(meeting.teamId);
  return !!team && team.isMember(user.id);
};

// No limit unless the host set one for this meeting (or a plan did)
export const maxParticipantsOf = (meeting) => meeting.settings?.maxParticipants || Infinity;

/** Has this person already been let in (so a lock or waiting room does not apply to them again)? */
export const hasAttended = (meeting, userId) => (meeting.participants || []).some((p) => p.userId === userId && p.joinedAt);

/**
 * Why this person may not enter the meeting, as { status, message, code }, or null.
 * `present` is how many OTHER people are in it. The lock and waiting room are handled by the caller,
 * because only the socket path can queue someone.
 */
export const admissionError = async (meeting, user, { present = presentParticipants(meeting).filter((p) => p.userId !== user.id).length } = {}) => {
  if (meeting.status === 'cancelled') return { status: 400, code: 'MEETING_ENDED', message: 'This meeting was cancelled' };
  if (meeting.status === 'ended') return { status: 400, code: 'MEETING_ENDED', message: 'This meeting has ended' };
  const manager = canManageMeeting(meeting, user.id);
  if (!manager && !canAccessMeeting(meeting, user) && !(await isInsider(meeting, user))) {
    return { status: 403, message: 'This meeting is restricted to invited people' };
  }
  if (meeting.status === 'scheduled' && isUpcoming(meeting) && !manager) {
    return { status: 403, code: 'MEETING_NOT_STARTED', message: 'This meeting has not started yet' };
  }
  if (meeting.settings?.hostMustJoinFirst && !manager && !hostHasJoined(meeting)) {
    return { status: 403, code: 'HOST_NOT_JOINED', message: 'The host has not joined yet. Please try again shortly.' };
  }
  if (!manager && present >= maxParticipantsOf(meeting)) return { status: 400, message: 'Meeting is full' };
  return null;
};

/** May this user read (and so forward, save, react to) this message? */
export const canReadMessage = async (message, user) => {
  if (!message) return false;
  if (message.conversationId) {
    return !!(await ConversationMember.findOne({ where: { conversationId: message.conversationId, userId: user.id } }));
  }
  if (message.teamId) {
    const team = await Team.findByPk(message.teamId);
    return !!team && team.isMember(user.id);
  }
  if (message.meetingId) {
    if (message.isPrivate && message.senderId !== user.id && message.recipientId !== user.id) return false;
    const meeting = await Meeting.findByPk(message.meetingId);
    return isInsider(meeting, user);
  }
  return false;
};

/** Teammates, and people who have written to this user in a shared conversation. */
export const contactIdsOf = async (userId) => {
  const mine = await TeamUser.findAll({ where: { userId }, attributes: ['teamId'] });
  const teams = mine.length ? await Team.findAll({ where: { id: mine.map((r) => r.teamId), isActive: true } }) : [];
  const out = new Set(teams.flatMap((t) => (t.members || []).map((m) => m.userId)));
  // people in a conversation with this user who have themselves written in it (index: conversationId, senderId)
  const [writers] = await ConversationMember.sequelize.query(
    `SELECT DISTINCT other.userId FROM ConversationMembers mine
       JOIN ConversationMembers other ON other.conversationId = mine.conversationId AND other.userId <> mine.userId
      WHERE mine.userId = :userId
        AND EXISTS (SELECT 1 FROM Messages m WHERE m.conversationId = other.conversationId AND m.senderId = other.userId)`,
    { replacements: { userId } }
  );
  writers.forEach((w) => out.add(w.userId));
  out.delete(userId);
  return out;
};

export const maskEmail = (email) => String(email || '').replace(/^(.{1,2})[^@]*/, '$1***');
