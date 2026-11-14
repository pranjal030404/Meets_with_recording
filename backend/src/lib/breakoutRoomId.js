import BreakoutRoom from '../models/BreakoutRoom.js';
import Meeting from '../models/Meeting.js';
import { canManageMeeting } from './meetingPermissions.js';

// A breakout room is its own socket/mediasoup room whose id is `<parent roomId>--br-<breakout uuid>`.
const SEPARATOR = '--br-';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const makeBreakoutRoomId = (parentRoomId, breakoutId) => `${parentRoomId}${SEPARATOR}${breakoutId}`;

export const parseBreakoutRoomId = (roomId) => {
  if (typeof roomId !== 'string') return null;
  const index = roomId.lastIndexOf(SEPARATOR);
  if (index < 1) return null;
  const breakoutId = roomId.slice(index + SEPARATOR.length);
  if (!UUID_RE.test(breakoutId)) return null;
  return { parentRoomId: roomId.slice(0, index), breakoutId };
};

// Returns { meeting, breakout } (the parent meeting plus the open breakout room) when the
// user may enter it: hosts/co-hosts can visit any room, everyone else only their assigned one.
export const resolveBreakoutAccess = async (roomId, userId) => {
  const parsed = parseBreakoutRoomId(roomId);
  if (!parsed) return null;

  const [meeting, breakout] = await Promise.all([
    Meeting.findOne({ where: { roomId: parsed.parentRoomId } }),
    BreakoutRoom.findByPk(parsed.breakoutId)
  ]);

  if (!meeting || !breakout) return null;
  if (breakout.parentMeetingId !== meeting.id || breakout.status !== 'open') return null;
  if (!canManageMeeting(meeting, userId) && !breakout.isUserAssigned(userId)) return null;

  return { meeting, breakout };
};
