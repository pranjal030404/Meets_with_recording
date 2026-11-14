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

/** scheduled|active → cancelled. Throws StateTransitionError (409) if it's already over. */
export const cancelMeeting = async (meeting) => {
  meetingMachine.assertTransition(meeting.status, 'cancelled');
  meeting.status = 'cancelled';
  await meeting.save();
};
