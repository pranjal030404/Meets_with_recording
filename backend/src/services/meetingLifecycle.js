import { Op } from 'sequelize';
import Meeting from '../models/Meeting.js';
import Poll from '../models/Poll.js';
import BreakoutRoom from '../models/BreakoutRoom.js';
import { meetingMachine } from '../lib/stateMachines.js';
import { recordUsage } from './subscriptionService.js';

/**
 * The only place a meeting changes status. REST routes and socket handlers all go through here,
 * so rules (idempotent end, bill once, set leftAt, valid transitions) can't drift apart.
 */

/** People actually in the call: seeded host/invitee entries have no joinedAt until they really join. */
export const isPresent = (p) => !!p.joinedAt && !p.leftAt;
export const presentParticipants = (meeting) => (meeting.participants || []).filter(isPresent);

/** Scheduled for a time that hasn't arrived yet. */
export const isUpcoming = (meeting, now = Date.now()) => !!meeting.scheduledAt && new Date(meeting.scheduledAt) > now;

/**
 * What someone leaving does to the meeting: 'end', 'reschedule' or 'keep'.
 * A scheduled meeting is not over just because somebody opened its link and left: until its time has
 * come and the host has actually been in it, an empty room goes back to 'scheduled'.
 */
export const leaveOutcome = (meeting, userId, now = Date.now()) => {
  const participants = meeting.participants || [];
  const present = presentParticipants(meeting);
  const hostCame = participants.some((p) => p.userId === meeting.hostId && p.joinedAt);
  if (meeting.scheduledAt && (isUpcoming(meeting, now) || !hostCame)) {
    return present.length === 0 ? 'reschedule' : 'keep';
  }
  const hostGone = userId === meeting.hostId && !present.some((p) => p.role === 'co-host');
  return present.length === 0 || hostGone ? 'end' : 'keep';
};

/** active → scheduled, for a scheduled meeting whose room emptied before it really took place. */
export const rescheduleMeeting = async (meeting) => {
  if (meeting.status !== 'active') return;
  meetingMachine.assertTransition(meeting.status, 'scheduled');
  await Meeting.update({ status: 'scheduled', startedAt: null }, { where: { id: meeting.id, status: 'active' } });
  await meeting.reload();
};

/** scheduled → active. No-op in any other state. Returns true if it started. */
export const startMeeting = async (meeting) => {
  if (meeting.status !== 'scheduled') return false;
  meetingMachine.assertTransition(meeting.status, 'active');
  meeting.status = 'active';
  meeting.startedAt = new Date();
  return true;
};

/**
 * scheduled|active → ended, exactly once. The status flip is one conditional UPDATE, so two
 * concurrent callers (host clicks End while the last participant leaves) can't both win or both bill.
 * Returns { changed } - false when it was already ended/cancelled.
 */
export const endMeeting = async (meeting) => {
  const endedAt = new Date();
  const [affected] = await Meeting.update(
    { status: 'ended', endedAt },
    { where: { id: meeting.id, status: { [Op.in]: ['scheduled', 'active'] } } }
  );

  // Re-read so the caller's instance reflects reality (and avoids a later .save() reverting status).
  await meeting.reload();
  if (!affected) return { changed: false };

  const leftAt = endedAt.toISOString();
  meeting.participants = (meeting.participants || []).map((p) => ({ ...p, leftAt: p.leftAt || leftAt }));
  await meeting.save();

  // Nothing in a finished meeting should stay open: close breakout rooms, end running polls.
  await Promise.all([
    BreakoutRoom.update({ status: 'closed' }, { where: { parentMeetingId: meeting.id, status: 'open' } }),
    Poll.update({ status: 'ended', endsAt: endedAt }, { where: { meetingId: meeting.id, status: 'active' } })
  ]).catch((e) => console.error('Meeting end cleanup failed:', e.message));

  const minutes = Math.max(0, (endedAt - new Date(meeting.startedAt || meeting.createdAt)) / 60000);
  await recordUsage(meeting.hostId, 'meeting_minutes', minutes, meeting.id, { title: meeting.title }).catch((e) =>
    console.error('Meeting minutes usage failed:', e.message));

  return { changed: true };
};

/**
 * scheduled|active → cancelled, as one conditional UPDATE (can't race endMeeting).
 * Throws StateTransitionError (409) if it's already over. Also closes breakouts/polls and
 * marks everyone as having left so a live room doesn't outlive its cancelled meeting.
 */
export const cancelMeeting = async (meeting) => {
  meetingMachine.assertTransition(meeting.status, 'cancelled');
  const cancelledAt = new Date();
  const [affected] = await Meeting.update(
    { status: 'cancelled', endedAt: cancelledAt },
    { where: { id: meeting.id, status: { [Op.in]: ['scheduled', 'active'] } } }
  );
  await meeting.reload();
  if (!affected) {
    // Lost a race with end/cancel: report it the same way the machine would.
    meetingMachine.assertTransition(meeting.status, 'cancelled');
    return { changed: false };
  }
  const leftAt = cancelledAt.toISOString();
  meeting.participants = (meeting.participants || []).map((p) => ({ ...p, leftAt: p.leftAt || leftAt }));
  await meeting.save();
  await Promise.all([
    BreakoutRoom.update({ status: 'closed' }, { where: { parentMeetingId: meeting.id, status: 'open' } }),
    Poll.update({ status: 'ended', endsAt: cancelledAt }, { where: { meetingId: meeting.id, status: 'active' } })
  ]).catch((e) => console.error('Meeting cancel cleanup failed:', e.message));
  return { changed: true };
};
