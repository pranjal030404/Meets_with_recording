import express from 'express';
import { Op } from 'sequelize';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import Meeting from '../models/Meeting.js';
import Team from '../models/Team.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { enforceMeetingQuota, enforceRecordingAllowed, enforceTranscriptionAllowed } from '../middleware/subscription.js';
import { recordUsage, assertCanRecord, assertCanCreateMeeting } from '../services/subscriptionService.js';
import { saveMeetingRecording, appendRecording, enqueueTranscription, retryTranscription, mirrorFile } from '../services/recordingService.js';
import { buildCompleteTranscriptArtifacts } from '../services/transcriptionService.js';
import { canManageMeeting, canAccessMeeting, hostHasJoined } from '../lib/meetingPermissions.js';
import { requirePermission } from '../lib/permissions.js';
import { inviteeMachine, StateTransitionError } from '../lib/stateMachines.js';
import { startMeeting, endMeeting, cancelMeeting, presentParticipants, isUpcoming, leaveOutcome, rescheduleMeeting } from '../services/meetingLifecycle.js';
import { parseBreakoutRoomId, resolveBreakoutAccess } from '../lib/breakoutRoomId.js';
import { sanitizeSettings } from '../lib/meetingSettings.js';
import { parseSeries, createFollowing, followingInSeries, nextRoomInSeries, isOver, hiddenSeriesDates } from '../services/meetingSeries.js';
import { resolveOwner } from '../media/meetingPlacementService.js';
import { admissionError, isInsider, hasAttended, maxParticipantsOf } from '../lib/access.js';
import { updateLocked } from '../lib/locked.js';
import { addAttendee } from '../services/attendance.js';
import { withoutServerPaths } from '../lib/publicJson.js';
import { publicBaseUrl } from '../lib/appLinks.js';
import { capParticipants, withUserLock } from '../services/subscriptionService.js';
import { emailMeetingPeople } from '../services/meetingMail.js';
import { fixUploadName } from '../lib/validate.js';
import { meetingIdsOf } from '../models/membership.js';
import { uploadRefusal } from '../lib/uploadSafety.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const temporaryRecordingRoot = path.resolve(__dirname, '../../uploads/tmp/recordings');

const recordingUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, callback) => {
      try {
        const roomTempDir = path.join(temporaryRecordingRoot, req.recordingMeeting.id);
        await fs.mkdir(roomTempDir, { recursive: true });
        callback(null, roomTempDir);
      } catch (error) {
        callback(error);
      }
    },
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase() || '.webm';
      callback(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`);
    }
  }),
  limits: {
    fileSize: 1024 * 1024 * 512
  },
  // the stored name keeps the sender's extension, so only media ones are taken
  fileFilter: (req, file, callback) => fixUploadName(req, file, () => (/^(\.(webm|mp4|mkv|mov|ogg|oga|opus|wav|mp3|m4a|aac))?$/i.test(path.extname(file.originalname || ''))
    ? callback(null, true)
    : callback(Object.assign(new Error('A recording must be an audio or video file'), { status: 415, expose: true }))))
});

// Anyone who took part may upload, even after leftAt is set: the recorder's onstop upload routinely lands
// after /leave or /end has already closed their entry.
const authorizeRecordingUpload = async (req, res, next) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });
    if (meeting.hostId !== req.user.id && !hasAttended(meeting, req.user.id)) {
      return res.status(403).json({ success: false, message: 'Only meeting participants can upload recordings' });
    }
    req.recordingMeeting = meeting;
    // whatever happens next, no temporary file outlives the request
    res.once('finish', () => { if (req.file?.path) fs.unlink(req.file.path).catch(() => {}); });
    next();
  } catch (error) {
    next(error);
  }
};

const cappedSettings = async (meeting, input) => {
  const clean = sanitizeSettings(input);
  if (clean.maxParticipants) clean.maxParticipants = await capParticipants(meeting.hostId, clean.maxParticipants);
  return clean;
};

const includeHost = () => ({
  model: User,
  as: 'host',
  attributes: ['id', 'name', 'email', 'avatar']
});

const includeTeam = () => ({
  model: Team,
  as: 'team',
  attributes: ['id', 'name', 'description']
});

router.post('/', protect, requirePermission('meetings.create'), (req, res, next) => withUserLock(req.user.id, () => new Promise((done) => {
  res.once('finish', done);
  res.once('close', done);
  next();
})).catch(next), enforceMeetingQuota, async (req, res) => {
  try {
    const { title, description, scheduledAt, settings, invitees, reminders, recurrence } = req.body;
    const teamId = req.body.teamId || null; // "No team" arrives as an empty string

    let team = null;
    if (teamId) {
      team = await Team.findByPk(teamId);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }
      if (!team.isMember(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this team'
        });
      }
    }

    const series = parseSeries(recurrence);
    if (series?.error) return res.status(400).json({ success: false, message: series.error });
    if (series && !scheduledAt) return res.status(400).json({ success: false, message: 'A repeating meeting needs a start time' });
    if (series) {
      // Every date counts as a meeting, so the whole series has to fit in what is left of the plan
      const quota = await assertCanCreateMeeting(req.user.id, series.dates.length);
      if (!quota.allowed) return res.status(403).json({ success: false, message: quota.reason, code: 'PLAN_LIMIT_REACHED' });
    }

    const isInstant = !scheduledAt;
    // A little slack for clocks and slow forms; a series may start earlier today as long as dates remain
    const lastDate = series ? series.dates[series.dates.length - 1] : scheduledAt ? new Date(scheduledAt) : null;
    if (lastDate && !(new Date(lastDate).getTime() > Date.now() - 5 * 60 * 1000)) {
      return res.status(400).json({ success: false, message: 'Pick a time in the future' });
    }
    // What was not specified keeps the documented default (so "no link requests" really restricts the meeting)
    const cleanSettings = { ...Meeting.rawAttributes.settings.defaultValue, ...sanitizeSettings(settings) };
    const cap = await capParticipants(req.user.id, cleanSettings.maxParticipants);
    if (cap) cleanSettings.maxParticipants = cap;

    const participantEntry = {
      id: uuidv4(),
      userId: req.user.id,
      user: { id: req.user.id, name: req.user.name, email: req.user.email, avatar: req.user.avatar },
      role: 'host',
      joinedAt: isInstant ? new Date().toISOString() : undefined
    };

    const meetingData = {
      title: title || 'Untitled Meeting',
      description,
      hostId: req.user.id,
      teamId,
      scheduledAt: series ? series.dates[0] : scheduledAt,
      isInstant,
      settings: cleanSettings,
      participants: [participantEntry],
      participantIds: [req.user.id],
      invitees: [],
      inviteeIds: [],
      recordings: [],
      reminders: [],
      recurrence: series
        ? { enabled: true, frequency: series.frequency, seriesId: uuidv4(), index: 1, total: series.dates.length }
        : { enabled: false }
    };

    const meeting = await Meeting.create(meetingData);
    await recordUsage(req.user.id, 'meeting_created', 1, meeting.id, { title: meeting.title });
    meeting.meetingLink = `${publicBaseUrl(req)}/meeting/${meeting.roomId}`;

    // A scheduled team meeting invites the whole team, so it shows up on everyone's calendar
    const requested = [
      ...(Array.isArray(invitees) ? invitees : []),
      ...(team && scheduledAt ? (team.members || []).map((m) => ({ userId: m.userId })) : [])
    ];
    const entries = [];
    for (const inv of requested) {
      const email = (inv.email || '').trim().toLowerCase();
      let { userId } = inv;
      if (!userId && email) userId = (await User.findOne({ where: { email }, attributes: ['id'] }))?.id;
      if (!userId && !email) continue;
      if (userId === req.user.id) continue;
      if (entries.some((e) => (userId && e.userId === userId) || (email && e.email === email))) continue;
      entries.push({ id: uuidv4(), userId, email: email || undefined, status: 'pending' });
    }
    // Drop ids that aren't real accounts (a notification to one would fail after the meeting is saved)
    const ids = entries.map((e) => e.userId).filter(Boolean);
    const real = new Set((ids.length ? await User.findAll({ where: { id: ids }, attributes: ['id'] }) : []).map((u) => u.id));
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].userId && !real.has(entries[i].userId)) entries.splice(i, 1);
    }
    meeting.invitees = entries;
    meeting.inviteeIds = entries.map((e) => e.userId).filter(Boolean);

    if (scheduledAt) {
      meeting.reminders = reminders || [
        { id: uuidv4(), time: 15, unit: 'minutes', sent: false },
        { id: uuidv4(), time: 1, unit: 'hours', sent: false },
        { id: uuidv4(), time: 1, unit: 'days', sent: false }
      ];
    }

    if (isInstant) {
      meeting.status = 'active';
      meeting.startedAt = new Date();
    }

    if (series) meeting.recurrence = { ...meeting.recurrence, seriesRoomId: meeting.roomId };
    await meeting.save();

    if (series) {
      const rest = await createFollowing(meeting, series.dates);
      await Promise.all(rest.map((m) => recordUsage(req.user.id, 'meeting_created', 1, m.id, { title: m.title })));
    }

    // One invitation per person, however many dates there are
    if (scheduledAt) {
      await Promise.all(meeting.inviteeIds.map((recipientId) =>
        Notification.create({
          recipientId,
          type: 'meeting_scheduled',
          title: 'Meeting Invitation',
          message: `${req.user.name} invited you to "${meeting.title}"${series ? ` (repeats, ${series.dates.length} dates)` : ''}`,
          data: {
            meetingId: meeting.id,
            senderId: req.user.id,
            link: meeting.meetingLink
          },
          priority: 'normal'
        })));
    }

    if (scheduledAt) emailMeetingPeople(meeting, { kind: 'invite', from: req.user.name, entries: meeting.invitees });

    const fullMeeting = await Meeting.findByPk(meeting.id, {
      include: [includeHost(), teamId ? includeTeam() : null].filter(Boolean)
    });

    res.status(201).json({
      success: true,
      message: 'Meeting created successfully',
      data: { meeting: fullMeeting.toJSON() }
    });
  } catch (error) {
    console.error('Create meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating meeting',
      error: error.message
    });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const { status, limit = 20, page = 1 } = req.query;

    const whereClause = { [Op.and]: [{ id: { [Op.in]: meetingIdsOf(req.user.id) } }] };

    if (status) {
      whereClause.status = status;
    }

    // ?series=next: one upcoming date per repeating meeting (applied before paging)
    if (req.query.series === 'next') {
      const rows = await Meeting.findAll({ where: whereClause, attributes: ['id', 'status', 'scheduledAt', 'recurrence'] });
      const hidden = hiddenSeriesDates(rows);
      if (hidden.length) whereClause.id = { [Op.notIn]: hidden };
    }

    const meetings = await Meeting.findAll({
      where: whereClause,
      include: [includeHost(), includeTeam()],
      order: [['scheduledAt', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await Meeting.count({ where: whereClause });

    res.json({
      success: true,
      data: {
        meetings: meetings.map(m => m.toJSON()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get meetings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching meetings',
      error: error.message
    });
  }
});

router.get('/team/:teamId', protect, async (req, res) => {
  try {
    const team = await Team.findByPk(req.params.teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    if (!team.isMember(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }

    const { status, limit = 50, page = 1 } = req.query;
    const whereClause = { teamId: req.params.teamId };

    if (status) {
      whereClause.status = status;
    }

    const meetings = await Meeting.findAll({
      where: whereClause,
      include: [includeHost()],
      order: [['scheduledAt', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await Meeting.count({ where: whereClause });

    res.json({
      success: true,
      data: {
        meetings: meetings.map(m => m.toJSON()),
        team: { id: team.id, name: team.name },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get team meetings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team meetings',
      error: error.message
    });
  }
});

// Which node owns this meeting's signaling + media? Clients connect their socket to `url` (empty = same origin).
router.get('/:roomId/placement', protect, async (req, res) => {
  try {
    const roomId = parseBreakoutRoomId(req.params.roomId)?.parentRoomId || req.params.roomId;
    const meeting = await Meeting.findOne({ where: { roomId }, attributes: ['id', 'status', 'hostId', 'settings', 'participants', 'participantIds', 'invitees', 'inviteeIds', 'teamId'] });
    if (!meeting || meeting.status === 'ended' || meeting.status === 'cancelled') {
      return res.status(404).json({ success: false, message: 'Meeting not available' });
    }
    if (!canAccessMeeting(meeting, req.user) && !(await isInsider(meeting, req.user))) {
      return res.status(403).json({ success: false, message: 'This meeting is restricted to invited people' });
    }
    const owner = await resolveOwner(roomId, { region: req.query.region });
    if (!owner) return res.status(503).json({ success: false, message: 'No media capacity available' });
    res.json({ success: true, nodeId: owner.nodeId, url: owner.url, self: owner.self });
  } catch (error) {
    console.error('Placement error:', error.message);
    res.status(500).json({ success: false, message: 'Placement failed' });
  }
});

router.get('/:roomId', protect, async (req, res) => {
  try {
    // Breakout rooms present the parent meeting's details
    let lookupRoomId = req.params.roomId;
    if (parseBreakoutRoomId(lookupRoomId)) {
      const access = await resolveBreakoutAccess(lookupRoomId, req.user.id);
      if (!access) {
        return res.status(403).json({ success: false, code: 'BREAKOUT_CLOSED', message: 'Breakout room is closed or not assigned to you' });
      }
      lookupRoomId = access.meeting.roomId;
    }

    const meeting = await Meeting.findOne({
      where: { roomId: lookupRoomId },
      include: [includeHost(), includeTeam()]
    });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const mine = await isInsider(meeting, req.user);
    // Someone with only the link may see what they need to join; strangers to a restricted meeting see nothing
    if (!mine && !canAccessMeeting(meeting, req.user)) {
      return res.status(403).json({ success: false, message: 'This meeting is restricted to invited people' });
    }
    let people = [];
    if (mine && meeting.invitees?.length) {
      const ids = meeting.invitees.map((i) => i.userId).filter(Boolean);
      const users = ids.length ? await User.findAll({ where: { id: ids }, attributes: ['id', 'name', 'avatar'] }) : [];
      const byId = new Map(users.map((u) => [u.id, u]));
      people = meeting.invitees.map((i) => {
        const u = byId.get(i.userId);
        return { id: i.userId, name: u?.name || i.email || 'Guest', avatar: u?.avatar, status: i.status };
      });
    }

    const json = meeting.toJSON();
    if (!mine) {
      for (const key of ['participants', 'participantIds', 'invitees', 'inviteeIds', 'recordings', 'reminders']) json[key] = [];
      delete json.aiSummary;
      delete json.completeTranscript;
      if (json.host) json.host = { id: json.host.id, name: json.host.name, avatar: json.host.avatar };
    }
    res.json({
      success: true,
      data: { meeting: json, people, nextRoomId: mine || canAccessMeeting(meeting, req.user) ? await nextRoomInSeries(meeting) : null }
    });
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching meeting',
      error: error.message
    });
  }
});

router.post('/:roomId/join', protect, requirePermission('meetings.join'), async (req, res) => {
  try {
    // Entering a breakout room doesn't change the parent meeting's attendance
    if (parseBreakoutRoomId(req.params.roomId)) {
      const access = await resolveBreakoutAccess(req.params.roomId, req.user.id);
      if (!access) {
        return res.status(403).json({ success: false, code: 'BREAKOUT_CLOSED', message: 'Breakout room is closed or not assigned to you' });
      }
      return res.json({
        success: true,
        message: 'Joined breakout room successfully',
        data: { meeting: access.meeting.toJSON() }
      });
    }

    const meeting = await Meeting.findOne({
      where: { roomId: req.params.roomId },
      include: [includeHost()]
    });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      console.warn(`Join failed: meeting ${meeting.roomId} has status '${meeting.status}'`);
      return res.status(400).json({
        success: false,
        message: meeting.status === 'cancelled' ? 'This meeting was cancelled' : 'This meeting has ended',
        code: 'MEETING_ENDED'
      });
    }

    if (isOver(meeting) && await nextRoomInSeries(meeting)) {
      return res.status(400).json({ success: false, message: 'This date has passed', code: 'MEETING_ENDED' });
    }

    const manager = canManageMeeting(meeting, req.user.id);
    const returning = hasAttended(meeting, req.user.id);
    const refused = await admissionError(meeting, req.user);
    if (refused) {
      return res.status(refused.status).json({ success: false, message: refused.message, code: refused.code });
    }
    if (!manager && !returning && meeting.settings?.isLocked) {
      return res.status(403).json({ success: false, message: 'This meeting is locked by the host', code: 'MEETING_LOCKED' });
    }
    // In a waiting room nobody is a participant until the host admits them (the socket join records it then)
    if (!manager && !returning && meeting.settings?.waitingRoom) {
      const preview = meeting.toJSON();
      for (const key of ['participants', 'participantIds', 'invitees', 'inviteeIds', 'recordings', 'reminders']) preview[key] = [];
      delete preview.aiSummary;
      delete preview.completeTranscript;
      return res.json({ success: true, message: 'Waiting for the host to let you in', data: { meeting: preview, waiting: true } });
    }

    const updated = await updateLocked(Meeting, meeting.id, async (row) => {
      // checked again on the locked row, so simultaneous joins cannot overfill the meeting
      const others = presentParticipants(row).filter((p) => p.userId !== req.user.id).length;
      if (!manager && others >= maxParticipantsOf(row)) return { full: true };
      const added = addAttendee(row, req.user);
      const started = await startMeeting(row);
      return added || started ? {} : false;
    });
    if (updated?.result?.full) {
      return res.status(400).json({ success: false, message: 'Meeting is full' });
    }
    await meeting.reload();

    res.json({
      success: true,
      message: 'Joined meeting successfully',
      data: { meeting: meeting.toJSON() }
    });
  } catch (error) {
    console.error('Join meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Error joining meeting',
      error: error.message
    });
  }
});

router.post('/:roomId/leave', protect, async (req, res) => {
  try {
    // Leaving a breakout room must never end the parent meeting
    if (parseBreakoutRoomId(req.params.roomId)) {
      return res.json({ success: true, message: 'Left breakout room successfully' });
    }

    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const left = await updateLocked(Meeting, meeting.id, (row) => {
      const mine = (row.participants || []).filter((p) => p.userId === req.user.id && !p.leftAt);
      if (!mine.length) return false;
      for (const entry of mine) entry.leftAt = new Date().toISOString();
      return true;
    });
    // Only someone who was in the meeting can empty it
    if (!left?.result) return res.json({ success: true, message: 'Left meeting successfully' });
    await meeting.reload();

    // The last person leaving ends the meeting, as does the host leaving with no co-host to carry on
    // (once, and it gets billed). Scheduled meetings that haven't really happened stay open.
    let ended = false;
    const outcome = leaveOutcome(meeting, req.user.id);
    if (outcome === 'end') ended = (await endMeeting(meeting)).changed;
    else if (outcome === 'reschedule') await rescheduleMeeting(meeting);
    if (ended) {
      req.app.get('io')?.to(meeting.roomId).emit('meeting:ended', { roomId: meeting.roomId, endedBy: req.user.id });
    }

    res.json({
      success: true,
      message: 'Left meeting successfully'
    });
  } catch (error) {
    console.error('Leave meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Error leaving meeting',
      error: error.message
    });
  }
});

// The dates an edit with scope 'series' would move: this one and every later one
router.get('/:roomId/series', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });
    if (!canManageMeeting(meeting, req.user.id)) {
      return res.status(403).json({ success: false, message: 'Only the host or a co-host can see this' });
    }
    const later = await followingInSeries(meeting);
    res.json({ success: true, data: { dates: [meeting, ...later].map((m) => m.scheduledAt) } });
  } catch (error) {
    console.error('Series dates error:', error);
    res.status(500).json({ success: false, message: 'Error fetching the dates' });
  }
});

// Edit a meeting that has not started: title, description, settings and time, for one date or all later ones
router.put('/:roomId/schedule', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });
    if (!canManageMeeting(meeting, req.user.id)) {
      return res.status(403).json({ success: false, message: 'Only the host or a co-host can edit the meeting' });
    }
    if (meeting.status !== 'scheduled' || !meeting.scheduledAt) {
      return res.status(400).json({ success: false, message: 'Only an upcoming scheduled meeting can be edited' });
    }

    const { title, description, settings, dates, scope } = req.body;
    const targets = [meeting, ...(scope === 'series' ? await followingInSeries(meeting) : [])];
    if (targets.some((t) => !canManageMeeting(t, req.user.id))) {
      return res.status(403).json({ success: false, message: 'Only the host can change every date of this meeting' });
    }

    let times = null;
    if (dates !== undefined) {
      times = Array.isArray(dates) ? dates.map((d) => new Date(d)) : [];
      if (times.length !== targets.length) {
        return res.status(409).json({ success: false, message: 'The dates of this meeting changed. Reload and try again.' });
      }
      if (times.some((d, i) => !(d > Date.now()) || (i > 0 && d <= times[i - 1]))) {
        return res.status(400).json({ success: false, message: 'Pick times in the future' });
      }
    }

    const moved = !!times && times.some((d, i) => d.getTime() !== new Date(targets[i].scheduledAt).getTime());
    for (const [i, target] of targets.entries()) {
      if (title?.trim()) target.title = title.trim();
      if (description !== undefined) target.description = description;
      if (settings) target.settings = { ...(target.settings || {}), ...await cappedSettings(target, settings) };
      if (times && times[i].getTime() !== new Date(target.scheduledAt).getTime()) {
        target.scheduledAt = times[i];
        // the new time needs its own reminders
        target.reminders = (target.reminders || []).map(({ sentAt, ...r }) => ({ ...r, sent: false }));
        target.notificationsSent = {};
      }
      await target.save();
    }

    if (moved) {
      await Promise.all((meeting.inviteeIds || []).map((recipientId) => Notification.create({
        recipientId,
        type: 'meeting_scheduled',
        title: 'Meeting time changed',
        message: `"${meeting.title}" was moved${targets.length > 1 ? ' (this and later dates)' : ''}`,
        data: { meetingId: meeting.id, senderId: req.user.id, link: meeting.meetingLink },
        priority: 'high'
      })));
    }

    res.json({ success: true, message: 'Meeting updated', data: { meeting: meeting.toJSON(), updated: targets.length } });
  } catch (error) {
    console.error('Edit meeting error:', error);
    res.status(500).json({ success: false, message: 'Error editing meeting', error: error.message });
  }
});

router.put('/:roomId/settings', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (!canManageMeeting(meeting, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Only the host or a co-host can update meeting settings'
      });
    }

    const { title, settings } = req.body;

    if (title) meeting.title = title;
    if (settings) {
      meeting.settings = { ...(meeting.settings || {}), ...await cappedSettings(meeting, settings) };
    }

    await meeting.save();

    res.json({
      success: true,
      message: 'Meeting updated successfully',
      data: { meeting: meeting.toJSON() }
    });
  } catch (error) {
    console.error('Update meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating meeting',
      error: error.message
    });
  }
});

router.post('/:roomId/end', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (!canManageMeeting(meeting, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Only the host or a co-host can end the meeting'
      });
    }

    // Idempotent: ending an already-ended meeting succeeds without re-billing or touching endedAt.
    await endMeeting(meeting);

    const io = req.app.get('io');
    io.to(meeting.roomId).emit('meeting:ended', {
      roomId: meeting.roomId,
      endedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Meeting ended successfully'
    });
  } catch (error) {
    console.error('End meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Error ending meeting',
      error: error.message
    });
  }
});

const transcriptionContext = (meeting) => ({
  title: meeting.title,
  description: meeting.description,
  participantNames: [...new Set((meeting.participants || []).map(p => p.user?.name).filter(Boolean))]
});

router.post('/:roomId/recordings/:recordingId/retry-transcription', protect, requirePermission('meetings.transcribe'), enforceTranscriptionAllowed, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const rec = (meeting.recordings || []).find(r => (r.id || path.parse(r.filename || '').name) === req.params.recordingId);
    if (!rec) return res.status(404).json({ success: false, message: 'Recording not found' });
    if (!canManageMeeting(meeting, req.user.id) && rec.recordedBy !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the host, a co-host, or whoever recorded it can retry transcription' });
    }

    try {
      await retryTranscription({
        meeting,
        recordingId: req.params.recordingId,
        language: req.body?.language || process.env.TRANSCRIPTION_LANGUAGE || 'en',
        context: transcriptionContext(meeting)
      });
    } catch (error) {
      if (error instanceof StateTransitionError) {
        return res.status(409).json({ success: false, message: 'Transcription is already running for this recording' });
      }
      throw error;
    }
    res.status(202).json({ success: true, message: 'Transcription queued' });
  } catch (error) {
    console.error('Retry transcription error:', error);
    res.status(500).json({ success: false, message: 'Error retrying transcription', error: error.message });
  }
});

router.post('/:roomId/recordings', protect, requirePermission('meetings.record'), enforceRecordingAllowed, authorizeRecordingUpload, recordingUpload.single('recording'), async (req, res) => {
  try {
    const meeting = req.recordingMeeting;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Recording file is required'
      });
    }

    const refusal = await uploadRefusal(req.file);
    if (refusal) return res.status(refusal.status).json({ success: false, message: refusal.message });

    const duration = Number(req.body.duration);
    const language = req.body.language || process.env.TRANSCRIPTION_LANGUAGE || 'en';

    // Minutes check needs the multipart-parsed duration, so it happens here —
    // after upload, before the recording is persisted. Temp file is removed on reject.
    const minutesCheck = await assertCanRecord(req.user.id, Number.isFinite(duration) ? duration / 60 : 0);
    if (!minutesCheck.allowed) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(403).json({
        success: false,
        message: minutesCheck.reason,
        code: 'PLAN_LIMIT_REACHED',
        data: { plan: minutesCheck.subscription.plan, limits: minutesCheck.limits }
      });
    }

    const result = await saveMeetingRecording({
      roomId: meeting.roomId,
      sourcePath: req.file.path,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      duration: Number.isFinite(duration) ? duration : 0,
      recordedBy: req.user.id
    });

    await appendRecording(meeting.id, result.recording);

    // Transcription runs in the background (queued -> processing -> completed|failed); the response doesn't wait for it.
    enqueueTranscription({
      meetingId: meeting.id,
      roomId: meeting.roomId,
      recording: result.recording,
      language,
      context: transcriptionContext(meeting)
    });

    const recordingMinutes = Number.isFinite(duration) ? duration / 60 : 0;
    await recordUsage(meeting.hostId, 'recording_minutes', recordingMinutes, meeting.id, {
      recordingId: result.recording.id,
      size: req.file.size
    });

    res.status(201).json({
      success: true,
      message: 'Recording uploaded; transcription is processing',
      data: {
        recording: withoutServerPaths(result.recording)
      }
    });
  } catch (error) {
    console.error('Upload recording error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading recording',
      error: error.message
    });
  }
});

router.post('/:roomId/invite', protect, async (req, res) => {
  try {
    const { invitees } = req.body;
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (!canManageMeeting(meeting, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Only the host or a co-host can invite participants'
      });
    }

    const wanted = [];
    for (const inv of Array.isArray(invitees) ? invitees : []) {
      const email = String(inv?.email || '').trim().toLowerCase();
      let userId = inv?.userId;
      if (!userId && email) userId = (await User.findOne({ where: { email }, attributes: ['id'] }))?.id;
      if (userId && !(await User.findByPk(userId, { attributes: ['id'] }))) continue;
      if (userId || email) wanted.push({ userId, email: email || undefined });
    }

    const added = [];
    await updateLocked(Meeting, meeting.id, (row) => {
      const list = [...(row.invitees || [])];
      for (const inv of wanted) {
        if (list.some((e) => (inv.userId && e.userId === inv.userId) || (inv.email && (e.email || '').toLowerCase() === inv.email))) continue;
        const entry = { id: uuidv4(), userId: inv.userId, email: inv.email, status: 'pending' };
        list.push(entry);
        added.push(entry);
      }
      if (!added.length) return false;
      row.invitees = list;
      row.inviteeIds = [...new Set(list.map((e) => e.userId).filter(Boolean))];
    });
    await meeting.reload();

    for (const entry of added.filter((e) => e.userId)) {
      Notification.create({
        recipientId: entry.userId,
        type: 'meeting_scheduled',
        title: 'Meeting Invitation',
        message: `${req.user.name} invited you to "${meeting.title}"`,
        data: { meetingId: meeting.id, senderId: req.user.id, link: meeting.meetingLink },
        priority: 'normal'
      }).catch(err => console.error('Notification error:', err));
    }
    emailMeetingPeople(meeting, { kind: 'invite', from: req.user.name, entries: added });

    for (const later of await followingInSeries(meeting)) {
      const have = later.invitees || [];
      const added = (meeting.invitees || []).filter((i) => !have.some((h) => h.id === i.id
        || (i.userId && h.userId === i.userId)));
      if (!added.length) continue;
      later.invitees = [...have, ...added.map((i) => ({ ...i, status: 'pending', respondedAt: undefined }))];
      later.inviteeIds = later.invitees.map((i) => i.userId).filter(Boolean);
      await later.save();
    }

    res.json({
      success: true,
      message: 'Invitations sent successfully',
      data: { invitees: meeting.invitees || [] }
    });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending invitations',
      error: error.message
    });
  }
});

/** Records an invitee's answer on one meeting. False if they are not invited to it. */
const applyResponse = (meeting, user, status) => {
  const invitees = (meeting.invitees || []).map(i => ({ ...i })); // copy, or the new status is not saved
  const invitee = invitees.find(inv => inv.userId && inv.userId === user.id);
  if (!invitee) return false;
  invitee.status = status;
  invitee.respondedAt = new Date().toISOString();

  if (status === 'accepted') {
    const participants = [...(meeting.participants || [])];
    if (!participants.some(p => p.userId === user.id)) {
      participants.push({
        id: uuidv4(),
        userId: user.id,
        user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
        role: 'participant'
      });
      meeting.participants = participants;
      meeting.participantIds = [...(meeting.participantIds || []), user.id];
    }
  }

  if (status === 'declined') {
    // Changed their mind after accepting: remove the seat they were given (unless they're in the room now)
    // A seat that was only reserved is given back; someone who actually attended keeps their history
    if (!hasAttended(meeting, user.id) && meeting.hostId !== user.id) {
      meeting.participants = (meeting.participants || []).filter(p => p.userId !== user.id);
      meeting.participantIds = (meeting.participantIds || []).filter(id => id !== user.id);
    }
  }

  meeting.invitees = invitees;
  return true;
};

router.put('/:roomId/respond', protect, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'accepted' or 'declined'" });
    }
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const invitees = (meeting.invitees || []).map(i => ({ ...i })); // copy, or the new status is not saved
    const invitee = invitees.find(
      inv => inv.userId && inv.userId === req.user.id
    );

    if (!invitee) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This meeting is over; you can no longer respond' });
    }
    try {
      inviteeMachine.assertTransition(invitee.status || inviteeMachine.initial, status);
    } catch (error) {
      return res.status(409).json({ success: false, message: error.message });
    }
    await updateLocked(Meeting, meeting.id, (row) => applyResponse(row, req.user, status));
    await meeting.reload();

    // One answer covers the later dates of a repeating meeting (reminders only go to people who accepted)
    for (const later of await followingInSeries(meeting)) {
      await updateLocked(Meeting, later.id, (row) => applyResponse(row, req.user, status));
    }

    res.json({
      success: true,
      message: `Invitation ${status}`,
      data: { meeting: meeting.toJSON() }
    });
  } catch (error) {
    console.error('Respond to invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error responding to invitation',
      error: error.message
    });
  }
});

router.put('/:roomId/cancel', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (!canManageMeeting(meeting, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Only the host or a co-host can cancel the meeting'
      });
    }

    // scope 'series' also drops every later date; collect them before this one changes
    const later = req.body?.scope === 'series' ? await followingInSeries(meeting) : [];
    if (later.some((t) => !canManageMeeting(t, req.user.id))) {
      return res.status(403).json({ success: false, message: 'Only the host can cancel every date of this meeting' });
    }

    try {
      await cancelMeeting(meeting);
    } catch (error) {
      if (error instanceof StateTransitionError) {
        return res.status(400).json({ success: false, message: 'Meeting is already ended or cancelled' });
      }
      throw error;
    }

    for (const next of later) {
      await cancelMeeting(next).catch((e) => {
        if (!(e instanceof StateTransitionError)) throw e;
      });
    }

    // Anyone already inside a live room gets the same signal as an ended meeting
    req.app.get('io')?.to(meeting.roomId).emit('meeting:ended', { roomId: meeting.roomId, endedBy: req.user.id, cancelled: true });

    const invitees = meeting.invitees || [];
    const notificationPromises = invitees.map(inv => {
      if (inv.userId) {
        return Notification.create({
          recipientId: inv.userId,
          type: 'meeting_cancelled',
          title: 'Meeting Cancelled',
          message: later.length ? `"${meeting.title}" and its later dates have been cancelled` : `"${meeting.title}" has been cancelled`,
          data: {
            meetingId: meeting.id,
            senderId: req.user.id
          },
          priority: 'high'
        });
      }
    });

    await Promise.all(notificationPromises.filter(Boolean));

    res.json({
      success: true,
      message: 'Meeting cancelled successfully',
      data: { meeting: meeting.toJSON() }
    });
  } catch (error) {
    console.error('Cancel meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling meeting',
      error: error.message
    });
  }
});



// Generate/generate or get complete meeting transcript (merged from all recordings)
router.post('/:roomId/complete-transcript', protect, requirePermission('meetings.transcribe'), enforceTranscriptionAllowed, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const isHost = meeting.hostId === req.user.id;
    const isParticipant = (meeting.participantIds || []).includes(req.user.id);
    const isInvitee = (meeting.inviteeIds || []).includes(req.user.id);
    if (!isHost && !isParticipant && !isInvitee) {
      return res.status(403).json({ success: false, message: 'No access to this meeting' });
    }

    if (meeting.completeTranscript && !req.body.regenerate) {
      return res.json({ success: true, data: { completeTranscript: withoutServerPaths(meeting.completeTranscript), cached: true } });
    }

    const recordings = Array.isArray(meeting.recordings) ? meeting.recordings : [];
    if (recordings.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No recordings found for this meeting. Upload a recording first to generate transcripts.'
      });
    }

    const hasTranscript = recordings.some(r => {
      const t = r && r.transcription;
      if (!t || ['none', 'error'].includes(t.provider)) return false;
      return (Array.isArray(t.segments) && t.segments.length > 0) || Boolean(t.text);
    });
    if (!hasTranscript) {
      return res.status(400).json({
        success: false,
        message: 'No transcript data available in recordings. Complete transcript requires recording transcripts (JSON/TXT/SRT/VTT artifacts present).'
      });
    }

    const transcriptsDir = path.resolve(__dirname, '../../uploads/transcripts', meeting.roomId);
    await fs.mkdir(transcriptsDir, { recursive: true });

    const transcriptBaseName = 'complete-meeting';
    const result = await buildCompleteTranscriptArtifacts({
      recordings,
      transcriptsDir,
      transcriptBaseName
    });

    const toPublicUrl = (...segments) => '/' + path.posix.join(...segments);

    const completeTranscript = {
      status: result.error ? 'failed' : 'completed',
      provider: result.provider,
      text: result.text,
      segments: result.segments,
      duration: result.duration,
      generatedAt: result.generatedAt,
      sources: recordings.length,
      files: {
        json: {
          path: result.files.json,
          url: toPublicUrl('uploads', 'transcripts', meeting.roomId, `${transcriptBaseName}.json`)
        },
        txt: {
          path: result.files.txt,
          url: toPublicUrl('uploads', 'transcripts', meeting.roomId, `${transcriptBaseName}.txt`)
        },
        srt: {
          path: result.files.srt,
          url: toPublicUrl('uploads', 'transcripts', meeting.roomId, `${transcriptBaseName}.srt`)
        },
        vtt: {
          path: result.files.vtt,
          url: toPublicUrl('uploads', 'transcripts', meeting.roomId, `${transcriptBaseName}.vtt`)
        }
      }
    };

    for (const artifact of Object.values(result.files)) await mirrorFile(artifact, 'text/plain'); // other nodes serve it from object storage

    await meeting.update({ completeTranscript });

    res.json({ success: true, data: { completeTranscript: withoutServerPaths(completeTranscript), cached: false } });
  } catch (error) {
    console.error('Generate complete transcript error:', error);
    res.status(500).json({ success: false, message: 'Error generating complete transcript', error: error.message });
  }
});
export default router;
