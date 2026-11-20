import express from 'express';
import path from 'path';
import { protect } from '../middleware/auth.js';
import Meeting from '../models/Meeting.js';
import { canManageMeeting } from '../lib/meetingPermissions.js';
import { getStorage } from '../storage/index.js';
import { recordingIdOf } from '../services/recordingService.js';

const router = express.Router();

/**
 * Short-lived download URL for a meeting recording. Authorised against the meeting
 * (host/co-host or a participant who was actually in it) - the URL itself is the capability, so keep expiry short.
 * Recordings are stored under  recordings/<roomId>/<filename>  (same layout as today's uploads/ tree).
 */
router.post('/recordings/:roomId/:recordingId/download-url', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });
    const allowed = canManageMeeting(meeting, req.user.id) || (meeting.participantIds || []).includes(req.user.id);
    if (!allowed) return res.status(403).json({ success: false, message: 'Not allowed to access this recording' });
    const rec = (meeting.recordings || []).find((r) => recordingIdOf(r) === req.params.recordingId);
    if (!rec?.filename) return res.status(404).json({ success: false, message: 'Recording not found' });
    const key = path.posix.join('recordings', meeting.roomId, rec.filename);
    const url = await getStorage().getSignedDownloadUrl(key, { expiresSec: 300, filename: rec.originalName || rec.filename });
    res.json({ success: true, url, expiresInSec: 300 });
  } catch (error) {
    console.error('Recording download-url error:', error.message);
    res.status(500).json({ success: false, message: 'Could not create download URL' });
  }
});

// Serves local-driver signed URLs (only registered content: HMAC + expiry checked, path confined to uploads/)
router.get('/local', (req, res) => {
  const storage = getStorage();
  const v = storage.name === 'local' ? storage.verifyToken(req.query.t) : null;
  if (!v) return res.status(403).json({ success: false, message: 'Invalid or expired link' });
  res.setHeader('Cache-Control', 'private, no-store');
  res.download(v.path, v.filename || path.basename(v.path), (err) => { if (err && !res.headersSent) res.status(404).json({ success: false, message: 'File not found' }); });
});

export default router;
