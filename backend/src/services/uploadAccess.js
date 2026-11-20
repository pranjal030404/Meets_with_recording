import path from 'path';

/**
 * Who may read a file under uploads/ ?  Pure decision logic with injected lookups (unit-testable).
 *   recordings/<roomId>/*, transcripts/<roomId>/*  -> meeting host/co-host, or a participant of that meeting
 *   files/<ownerId>/<name>                         -> owner; or via its FileEntry: team member / conversation member /
 *                                                     meeting host or participant; (soft-deleted => owner only)
 *   anything else (tmp/, runtime/, unknown)         -> nobody (served by no route)
 * Returns { ok:true, file } with the sanitised relative path, or { ok:false, status, reason }.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._@~+-]+$/;

export const parseUploadPath = (rawPath) => {
  let decoded;
  try { decoded = decodeURIComponent(String(rawPath || '')); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const segs = decoded.split('/').filter((s) => s.length > 0);
  if (segs.length < 3 || segs.some((s) => s === '.' || s === '..' || s.startsWith('.') || !SAFE_SEGMENT.test(s))) return null;
  return { kind: segs[0], scope: segs[1], segs, rel: segs.join('/') };
};

export const createUploadAuthorizer = (deps) => async (user, rawPath) => {
  const p = parseUploadPath(rawPath);
  if (!p) return { ok: false, status: 404, reason: 'not found' };
  const deny = { ok: false, status: 403, reason: 'forbidden' };
  const allow = { ok: true, file: p.rel };

  if (p.kind === 'recordings' || p.kind === 'transcripts') {
    const meeting = await deps.findMeetingByRoomId(p.scope);
    if (!meeting) return deny; // don't reveal which rooms exist
    if (deps.canManageMeeting(meeting, user.id) || (meeting.participantIds || []).includes(user.id)) return allow;
    return deny;
  }

  if (p.kind === 'files') {
    if (p.scope === user.id) return allow;                       // owner
    const entry = await deps.findFileEntryByUrl(`/uploads/${p.rel}`);
    if (!entry) return deny;                                     // orphan file: owner only
    if (entry.isDeleted) return deny;
    if (entry.ownerId === user.id) return allow;
    if (entry.teamId && await deps.isTeamMember(entry.teamId, user.id)) return allow;
    if (entry.conversationId && await deps.isConversationMember(entry.conversationId, user.id)) return allow;
    if (entry.meetingId) {
      const m = await deps.findMeetingById(entry.meetingId);
      if (m && (m.hostId === user.id || (m.participantIds || []).includes(user.id))) return allow;
    }
    return deny;
  }

  return { ok: false, status: 404, reason: 'not found' };
};

export const resolveInside = (root, rel) => {
  const abs = path.resolve(root, rel);
  return abs.startsWith(path.resolve(root) + path.sep) ? abs : null;
};
