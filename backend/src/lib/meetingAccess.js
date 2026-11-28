/** Route guard: is the signed-in user part of the meeting with this database id? Answers the request if not. */
import Meeting from '../models/Meeting.js';
import { isInsider } from './access.js';

export const requireInsider = async (req, res, meetingId) => {
  const meeting = meetingId ? await Meeting.findByPk(meetingId) : null;
  if (!meeting) { res.status(404).json({ success: false, message: 'Meeting not found' }); return null; }
  if (!(await isInsider(meeting, req.user))) { res.status(403).json({ success: false, message: 'You are not part of this meeting' }); return null; }
  return meeting;
};
