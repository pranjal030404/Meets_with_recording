import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import Meeting from '../models/Meeting.js';

/**
 * Repeating meetings. Each date is its own Meeting row (own room, attendance, recordings, reminders),
 * tied together by recurrence.seriesId. The whole series shares one invite link: that of its first
 * room (recurrence.seriesRoomId), which leads on to whichever date is current. The client works out the dates, because only it knows the
 * host's time zone ("every Monday at 10:00" must survive a clock change).
 */

export const FREQUENCIES = ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'];
export const MAX_OCCURRENCES = 52;
const MISSED_AFTER_MS = 12 * 60 * 60 * 1000;

/**
 * Reads `recurrence: { frequency, dates }` from a create request.
 * Returns null for a one-off meeting, { error } for a bad request, or { frequency, dates: Date[] }.
 */
export const parseSeries = (recurrence) => {
  if (!recurrence?.frequency) return null;
  const { frequency, dates } = recurrence;
  if (!FREQUENCIES.includes(frequency)) return { error: 'Unknown repeat option' };
  if (!Array.isArray(dates) || dates.length < 2 || dates.length > MAX_OCCURRENCES) {
    return { error: `A repeating meeting needs between 2 and ${MAX_OCCURRENCES} dates` };
  }
  const parsed = dates.map((d) => new Date(d));
  if (parsed.some((d, i) => Number.isNaN(d.getTime()) || (i > 0 && d <= parsed[i - 1]))) {
    return { error: 'Repeat dates must be valid and in order' };
  }
  return { frequency, dates: parsed };
};

/** Creates dates 2..n as copies of the first occurrence. */
export const createFollowing = async (first, dates) => {
  const { seriesId } = first.recurrence;
  const rows = dates.slice(1).map((scheduledAt, i) => {
    const roomId = `${uuidv4().slice(0, 8)}-${uuidv4().slice(0, 4)}-${uuidv4().slice(0, 4)}`;
    return {
      roomId,
      meetingLink: first.meetingLink,
      title: first.title,
      description: first.description,
      hostId: first.hostId,
      teamId: first.teamId,
      scheduledAt,
      status: 'scheduled',
      isInstant: false,
      settings: first.settings,
      participants: first.participants,
      participantIds: first.participantIds,
      invitees: first.invitees,
      inviteeIds: first.inviteeIds,
      recordings: [],
      reminders: (first.reminders || []).map((r) => ({ ...r, id: uuidv4(), sent: false })),
      recurrence: { ...first.recurrence, seriesId, index: i + 2 }
    };
  });
  return Meeting.bulkCreate(rows);
};

const sameSeries = (meeting) => (m) => m.recurrence?.seriesId === meeting.recurrence.seriesId;

/** Later occurrences of the same series that have not started yet, soonest first. */
export const followingInSeries = async (meeting) => {
  if (!meeting.recurrence?.seriesId || !meeting.scheduledAt) return [];
  const later = await Meeting.findAll({
    where: { hostId: meeting.hostId, status: 'scheduled', scheduledAt: { [Op.gt]: meeting.scheduledAt } },
    order: [['scheduledAt', 'ASC']]
  });
  return later.filter(sameSeries(meeting));
};

/** Is this date finished (or long missed), so its link should point on to the next one? */
export const isOver = (meeting, now = Date.now()) =>
  meeting.status === 'ended' || meeting.status === 'cancelled'
  || (meeting.status === 'scheduled' && !!meeting.scheduledAt && now - new Date(meeting.scheduledAt) > MISSED_AFTER_MS);

/** Room of the next date that can still be attended, or null. */
export const nextRoomInSeries = async (meeting, now = Date.now()) => {
  if (!meeting.recurrence?.seriesId || !isOver(meeting, now)) return null;
  const rows = await Meeting.findAll({
    where: { hostId: meeting.hostId, status: { [Op.in]: ['scheduled', 'active'] }, id: { [Op.ne]: meeting.id } },
    order: [['scheduledAt', 'ASC']]
  });
  return rows.filter(sameSeries(meeting)).find((m) => !isOver(m, now))?.roomId || null;
};
