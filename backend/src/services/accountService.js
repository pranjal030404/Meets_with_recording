/**
 * Export and erasure of one person's data.
 *
 * Erasure removes what identifies the person or is theirs alone, and keeps an anonymous placeholder row so that other
 * people's history stays intact. Deliberately kept: billing records, security audit entries (without name, address of
 * origin or browser), what other people wrote, and transcripts or recordings of meetings somebody else hosted.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import { sequelize } from '../database/index.js';
import User from '../models/User.js';
import Meeting from '../models/Meeting.js';
import Team from '../models/Team.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Task from '../models/Task.js';
import FileEntry from '../models/FileEntry.js';
import Notification from '../models/Notification.js';
import SavedMessage from '../models/SavedMessage.js';
import UsageLog from '../models/UsageLog.js';
import AuditLog from '../models/AuditLog.js';
import { meetingIdsOf, myTeams } from '../models/membership.js';
import { updateLocked } from '../lib/locked.js';
import { revokeUserSessions } from '../lib/sessionRevocation.js';
import { disconnectUser } from '../realtime/sessions.js';
import { getStorage } from '../storage/index.js';

const UPLOADS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
const GONE = 'Deleted user';

export class AccountError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** `column LIKE '%text%'` for a JSON column, with the text safely quoted. */
const contains = (column, text) => sequelize.literal(`\`${column}\` LIKE ${sequelize.escape(`%${String(text).replace(/[\\%_]/g, '\\$&')}%`)}`);

/** Removes one upload folder from this disk and, when object storage is used, from the bucket. */
const removeDir = async (...parts) => {
  const dir = path.resolve(UPLOADS, ...parts);
  if (!dir.startsWith(UPLOADS + path.sep)) return;
  fs.rmSync(dir, { recursive: true, force: true });
  const storage = getStorage();
  if (storage.name === 's3') await storage.deleteFolder(parts.join('/')).catch((e) => console.error(`[erase] could not delete ${parts.join('/')} from object storage: ${e.message}`));
};

const meetingsOf = (user) => Meeting.findAll({
  where: { [Op.or]: [{ id: { [Op.in]: meetingIdsOf(user.id) } }, { hostId: user.id }, contains('invitees', user.email)] }
});

export const exportAccount = async (userId) => {
  const user = await User.findByPk(userId);
  const mine = { where: { senderId: userId, isDeleted: false }, order: [['createdAt', 'ASC']] };
  const [meetings, teams, messages, files, tasks, notifications] = await Promise.all([
    meetingsOf(user),
    myTeams(userId),
    Message.findAll({ ...mine, attributes: ['id', 'content', 'createdAt', 'meetingId', 'teamId', 'conversationId', 'fileName'] }),
    FileEntry.findAll({ where: { ownerId: userId, isDeleted: false }, attributes: ['id', 'originalName', 'mimeType', 'size', 'url', 'createdAt'] }),
    Task.findAll({ where: { [Op.or]: [{ createdById: userId }, { assigneeId: userId }] }, attributes: ['id', 'title', 'description', 'status', 'dueDate', 'createdAt'] }),
    Notification.findAll({ where: { recipientId: userId }, attributes: ['title', 'message', 'createdAt'] }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile: user.toJSON(),
    meetings: meetings.map((m) => ({
      title: m.title, status: m.status, scheduledAt: m.scheduledAt, startedAt: m.startedAt, endedAt: m.endedAt,
      role: m.hostId === userId ? 'host' : 'participant or invitee',
      recordings: m.hostId === userId ? (m.recordings || []).map((r) => r.url).filter(Boolean) : undefined,
    })),
    teams: teams.map((t) => ({ name: t.name, role: t.getMemberRole(userId) })),
    messages, files, tasks, notifications,
  };
};

const eraseMeetings = async (user) => {
  for (const meeting of await meetingsOf(user)) {
    const hosted = meeting.hostId === user.id;
    await updateLocked(Meeting, meeting.id, (row) => {
      row.participants = (row.participants || []).map((p) => (p.userId === user.id
        ? { ...p, user: { id: user.id, name: GONE, email: null, avatar: null } } : p));
      row.invitees = (row.invitees || []).filter((i) => i.userId !== user.id && String(i.email || '').toLowerCase() !== user.email.toLowerCase());
      row.inviteeIds = (row.inviteeIds || []).filter((id) => id !== user.id);
      if (!hosted) return;
      if (row.status === 'scheduled') row.status = 'cancelled';
      if (row.status === 'active') { row.status = 'ended'; row.endedAt = new Date(); }
      row.description = '';
      row.recordings = [];
      row.aiSummary = null;
      row.completeTranscript = null;
    });
    // after the meeting forgot them: a transcription still running sees that and removes whatever it writes later
    if (hosted) {
      await removeDir('recordings', meeting.roomId);
      await removeDir('transcripts', meeting.roomId);
    }
  }
};

const eraseMessages = async (userId) => {
  const where = { senderId: userId };
  const conversationIds = [...new Set((await Message.findAll({ where, attributes: ['conversationId'], raw: true })).map((m) => m.conversationId).filter(Boolean))];
  await Message.update({ content: '[deleted]', isDeleted: true, fileUrl: null, fileName: null, meetingData: null, reactions: [] }, { where });
  for (const reacted of await Message.findAll({ where: contains('reactions', userId), attributes: ['id', 'reactions'] })) {
    await Message.update({ reactions: (reacted.reactions || []).filter((r) => r.userId !== userId) }, { where: { id: reacted.id } });
  }
  for (const id of conversationIds) {
    const last = await Message.findOne({ where: { conversationId: id }, order: [['createdAt', 'DESC']], attributes: ['senderId'] });
    if (last?.senderId === userId) await Conversation.update({ lastMessagePreview: '' }, { where: { id } });
  }
};

/** Teams the person owns that still have other people in them: these must be dealt with first. */
export const blockingTeams = async (userId) => (await Team.findAll({ where: { ownerId: userId, isActive: true } }))
  .filter((team) => (team.members || []).some((m) => m.userId !== userId));

export const eraseAccount = async (userId, io) => {
  const user = await User.findByPk(userId);
  if (!user) throw new AccountError(404, 'User not found');
  const blocking = await blockingTeams(userId);
  if (blocking.length) {
    throw new AccountError(409, `First delete the team${blocking.length > 1 ? 's' : ''} you own that other people are in: ${blocking.map((t) => t.name).join(', ')}`);
  }

  // signed out first, so nothing new is written while the data is being removed
  await user.update({ isActive: false, isOnline: false });
  await revokeUserSessions(userId);
  disconnectUser(io, userId);

  for (const team of await myTeams(userId)) {
    if (team.ownerId === userId) await team.update({ isActive: false });
    await updateLocked(Team, team.id, (row) => { row.members = (row.members || []).filter((m) => m.userId !== userId); });
  }
  await eraseMeetings(user);
  await eraseMessages(userId);

  await FileEntry.destroy({ where: { ownerId: userId } });
  await removeDir('files', userId);
  await removeDir('avatars', userId);

  await Task.destroy({ where: { createdById: userId, teamId: null, [Op.or]: [{ assigneeId: null }, { assigneeId: userId }] } });
  await Task.update({ assigneeId: null }, { where: { assigneeId: userId } });
  await Notification.destroy({ where: { recipientId: userId } });
  await SavedMessage.destroy({ where: { userId } });
  await UsageLog.destroy({ where: { userId } });
  await AuditLog.update({ actorName: GONE, ip: null, userAgent: null }, { where: { actorId: userId } });

  await user.update({
    name: GONE, email: `deleted-${user.id}@deleted.invalid`, password: crypto.randomBytes(32).toString('hex'), avatar: null,
    customStatus: null, statusEmoji: null, statusExpiresAt: null, timezone: null, title: null, department: null,
    phone: null, bio: null, location: null, roleId: null, isEmailVerified: false, emailVerifyToken: null, emailVerifyExpires: null,
  });
};
