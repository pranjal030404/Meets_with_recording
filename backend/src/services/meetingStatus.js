import User from '../models/User.js';
import ConversationMember from '../models/ConversationMember.js';
import { getRedis } from '../infrastructure/redis/redisClient.js';
import { trackState } from '../lib/stateRegistry.js';

/**
 * Shows "In a meeting" while a user has a socket inside a meeting room, then puts their own status back.
 * The expiry is a safety net: if the restore is ever missed (server restart without Redis), clients
 * stop showing the status on their own.
 */
export const IN_MEETING = { customStatus: 'In a meeting', statusEmoji: '📅' };
const MAX_MS = 4 * 60 * 60 * 1000;

const local = trackState('statusBeforeMeeting', new Map(), 'user'); // userId -> status JSON (when Redis is off)
const key = (id) => `status:before-meeting:${id}`;
const saved = {
  async get(id) {
    const r = getRedis();
    if (r) { try { return JSON.parse(await r.get(key(id))); } catch { /* local */ } }
    return local.has(id) ? JSON.parse(local.get(id)) : null;
  },
  async set(id, value) {
    const json = JSON.stringify(value);
    const r = getRedis();
    if (r) { try { await r.set(key(id), json, 'PX', MAX_MS * 3); return; } catch { /* local */ } }
    local.set(id, json);
  },
  async delete(id) {
    local.delete(id);
    try { await getRedis()?.del(key(id)); } catch { /* expires by itself */ }
  }
};

/** The status change needed for this user, or null when nothing should change. */
const nextStatus = async (user, inMeeting) => {
  const before = await saved.get(user.id);
  const showing = user.customStatus === IN_MEETING.customStatus;
  if (inMeeting) {
    if (showing) return null; // already set by us, or chosen by hand: leave it
    await saved.set(user.id, { customStatus: user.customStatus || null, statusEmoji: user.statusEmoji || null, statusExpiresAt: user.statusExpiresAt || null });
    return { ...IN_MEETING, statusExpiresAt: new Date(Date.now() + MAX_MS) };
  }
  if (!before) return null; // we never changed it
  await saved.delete(user.id);
  return showing ? before : null; // picked something else during the meeting: keep that
};

// Everyone who shares a conversation with this user, plus the user's own tabs
const audience = async (userId) => {
  const mine = await ConversationMember.findAll({ where: { userId }, attributes: ['conversationId'] });
  const peers = mine.length
    ? await ConversationMember.findAll({ where: { conversationId: mine.map((m) => m.conversationId) }, attributes: ['userId'] })
    : [];
  return [...new Set([userId, ...peers.map((p) => p.userId)])].map((id) => `user:${id}`);
};

const queues = new Map(); // userId -> last pending sync, so quick join/leave pairs run in order

/** Call after a socket of this user enters or leaves a meeting room. Safe to call repeatedly. */
export const syncMeetingStatus = (io, userId) => {
  const run = async () => {
    const sockets = await io.in(`user:${userId}`).fetchSockets(); // all tabs and devices, all instances
    const user = await User.findByPk(userId);
    if (!user) return;
    const status = await nextStatus(user, sockets.some((s) => s.data.inMeeting));
    if (!status) return;
    await User.update(status, { where: { id: userId } });
    io.to(await audience(userId)).emit('presence:status', { userId, ...status });
  };
  const next = (queues.get(userId) || Promise.resolve())
    .then(run)
    .catch((e) => console.error('Meeting status sync failed:', e.message))
    .finally(() => { if (queues.get(userId) === next) queues.delete(userId); });
  queues.set(userId, next);
  return next;
};
