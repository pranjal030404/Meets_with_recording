import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { verifySocketToken } from '../middleware/auth.js';
import Meeting from '../models/Meeting.js';
import FileEntry from '../models/FileEntry.js';
import Team from '../models/Team.js';
import ConversationMember from '../models/ConversationMember.js';
import { canManageMeeting } from '../lib/meetingPermissions.js';
import { createUploadAuthorizer, resolveInside } from '../services/uploadAccess.js';
import { getStorage } from '../storage/index.js';

export const UPLOADS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
export const ASSET_COOKIE = 'mc_assets';

export const readCookie = (header, name) => {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
};

const realDeps = {
  findMeetingByRoomId: (roomId) => Meeting.findOne({ where: { roomId }, attributes: ['id', 'hostId', 'participantIds', 'participants'] }),
  findMeetingById: (id) => Meeting.findByPk(id, { attributes: ['id', 'hostId', 'participantIds'] }),
  findFileEntryByUrl: (url) => FileEntry.findOne({ where: { url }, attributes: ['id', 'ownerId', 'teamId', 'conversationId', 'meetingId', 'isDeleted'] }),
  isTeamMember: async (teamId, userId) => { const t = await Team.findByPk(teamId); return !!t && t.isMember(userId); },
  isConversationMember: async (conversationId, userId) => !!(await ConversationMember.findOne({ where: { conversationId, userId } })),
  canManageMeeting,
};

/**
 * Authenticated, authorised file serving (replaces public express.static('/uploads')).
 * Credential: the HttpOnly `mc_assets` cookie (set by `protect`, scoped to Path=/uploads so <img>/<video>/<a> work with no
 * frontend change) or an Authorization: Bearer header. Tokens in query strings are NOT accepted (they leak into logs/referrers).
 */
export const createUploadsRouter = ({ deps = realDeps, verifyToken = verifySocketToken, root = UPLOADS_ROOT, storage = () => getStorage() } = {}) => {
  const router = express.Router();
  const authorize = createUploadAuthorizer(deps);

  router.get('/*', async (req, res) => {
    try {
      const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
      const token = bearer || readCookie(req.headers.cookie, ASSET_COOKIE);
      const user = token ? await verifyToken(token) : null;
      if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });

      const decision = await authorize(user, req.params[0]);
      if (!decision.ok) return res.status(decision.status).json({ success: false, message: decision.reason });

      const abs = resolveInside(root, decision.file);
      if (!abs) return res.status(404).json({ success: false, message: 'not found' });
      if (!fs.existsSync(abs)) {
        // Not on this node's disk: with object storage it lives in the bucket -> short-lived presigned redirect (authorised above)
        const st = storage();
        if (st.name === 's3') {
          const url = await st.getSignedDownloadUrl(decision.file, { expiresSec: 120 });
          res.setHeader('Cache-Control', 'private, no-store');
          return res.redirect(302, url);
        }
        return res.status(404).json({ success: false, message: 'not found' });
      }

      res.setHeader('Cache-Control', 'private, max-age=300');   // never cache in shared proxies/CDNs
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.sendFile(abs, { dotfiles: 'deny', acceptRanges: true }); // Range support keeps video seeking working
    } catch (e) {
      console.error('uploads error:', e.message);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'error' });
    }
  });
  return router;
};
