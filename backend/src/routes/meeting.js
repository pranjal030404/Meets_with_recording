import express from 'express';
import { Op, fn, col, where as seqWhere } from 'sequelize';
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
import { recordUsage, assertCanRecord } from '../services/subscriptionService.js';
import { saveMeetingRecording, appendRecording, enqueueTranscription, retryTranscription } from '../services/recordingService.js';
import { buildCompleteTranscriptArtifacts } from '../services/transcriptionService.js';
import { canManageMeeting, canAccessMeeting, hostHasJoined } from '../lib/meetingPermissions.js';
import { requirePermission } from '../lib/permissions.js';
import { inviteeMachine, StateTransitionError } from '../lib/stateMachines.js';
import { startMeeting, endMeeting, cancelMeeting, presentParticipants } from '../services/meetingLifecycle.js';
import { parseBreakoutRoomId, resolveBreakoutAccess } from '../lib/breakoutRoomId.js';
import { sanitizeSettings } from '../lib/meetingSettings.js';
import { resolveOwner } from '../media/meetingPlacementService.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const temporaryRecordingRoot = path.resolve(__dirname, '../../uploads/tmp/recordings');

const recordingUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, callback) => {
      try {
        const roomTempDir = path.join(temporaryRecordingRoot, req.params.roomId);
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
  }
});

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

router.post('/', protect, requirePermission('meetings.create'), enforceMeetingQuota, async (req, res) => {
  try {
    const { title, description, scheduledAt, settings, invitees, reminders, recurrence } = req.body;
    const teamId = req.body.teamId || null; // "No team" arrives as an empty string

    if (teamId) {
      const team = await Team.findByPk(teamId);
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

    const isInstant = !scheduledAt;

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
      scheduledAt,
      isInstant,
      settings: sanitizeSettings(settings),
      participants: [participantEntry],
      participantIds: [req.user.id],
      invitees: [],
      inviteeIds: [],
      recordings: [],
      reminders: [],
      recurrence: recurrence || { enabled: false }
    };

    const meeting = await Meeting.create(meetingData);
    await recordUsage(req.user.id, 'meeting_created', 1, meeting.id, { title: meeting.title });
    meeting.meetingLink = `${req.protocol}://${req.get('host')}/meeting/${meeting.roomId}`;

    if (invitees && Array.isArray(invitees)) {
      const inviteeEntries = [];
      const inviteeIdEntries = [];
      for (const inv of invitees) {
        const entry = {
          id: uuidv4(),
          userId: inv.userId,
          email: inv.email,
          status: 'pending'
        };
        inviteeEntries.push(entry);
        if (inv.userId) inviteeIdEntries.push(inv.userId);
      }
      meeting.invitees = inviteeEntries;
      meeting.inviteeIds = inviteeIdEntries;
    }

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

    await meeting.save();

    if (invitees && scheduledAt) {
      const notificationPromises = invitees.map(inv => {
        if (inv.userId) {
          return Notification.create({
            recipientId: inv.userId,
            type: 'meeting_scheduled',
            title: 'Meeting Invitation',
            message: `You've been invited to "${meeting.title}"`,
            data: {
              meetingId: meeting.id,
              senderId: req.user.id,
              link: meeting.meetingLink
            },
            priority: 'normal'
          });
        }
      });
      await Promise.all(notificationPromises.filter(Boolean));
    }

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

    const whereClause = {
      [Op.or]: [
        { hostId: req.user.id },
        seqWhere(fn('JSON_CONTAINS', col('participantIds'), JSON.stringify(req.user.id)), 1),
        seqWhere(fn('JSON_CONTAINS', col('inviteeIds'), JSON.stringify(req.user.id)), 1)
      ]
    };

    if (status) {
      whereClause.status = status;
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
    const meeting = await Meeting.findOne({ where: { roomId }, attributes: ['id', 'status'] });
    if (!meeting || meeting.status === 'ended' || meeting.status === 'cancelled') {
      return res.status(404).json({ success: false, message: 'Meeting not available' });
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
        return res.status(403).json({ success: false, message: 'Breakout room is closed or not assigned to you' });
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

    res.json({
      success: true,
      data: { meeting: meeting.toJSON() }
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
        return res.status(403).json({ success: false, message: 'Breakout room is closed or not assigned to you' });
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
        message: meeting.status === 'cancelled' ? 'This meeting was cancelled' : 'This meeting has ended'
      });
    }

    if (!canAccessMeeting(meeting, req.user)) {
      return res.status(403).json({
        success: false,
        message: 'This meeting is restricted to invited people'
      });
    }

    if (
      meeting.settings?.hostMustJoinFirst &&
      !canManageMeeting(meeting, req.user.id) &&
      !hostHasJoined(meeting)
    ) {
      return res.status(403).json({
        success: false,
        message: 'The host has not joined yet. Please try again shortly.'
      });
    }

    const participants = meeting.participants || [];
    const activeParticipants = presentParticipants(meeting).length;
    const maxParticipants = (meeting.settings && meeting.settings.maxParticipants) || 50;

    if (activeParticipants >= maxParticipants) {
      console.warn(`Join failed: meeting ${meeting.roomId} is full (${activeParticipants}/${maxParticipants})`);
      return res.status(400).json({
        success: false,
        message: 'Meeting is full'
      });
    }

    const existingParticipant = participants.find(
      p => p.userId === req.user.id && !p.leftAt
    );

    if (existingParticipant) {
      // Seeded entries (scheduled host, accepted invitee) only count as present once they really join
      if (!existingParticipant.joinedAt) {
        existingParticipant.joinedAt = new Date().toISOString();
        meeting.participants = [...participants];
      }
    } else {
      const previousEntry = participants.find(
        p => p.userId === req.user.id && p.role === 'co-host'
      );
      meeting.participants = [
        ...participants,
        {
          id: uuidv4(),
          userId: req.user.id,
          user: { id: req.user.id, name: req.user.name, email: req.user.email, avatar: req.user.avatar },
          role: previousEntry ? 'co-host' : 'participant',
          joinedAt: new Date().toISOString(),
          isMuted: meeting.settings && meeting.settings.muteOnEntry
        }
      ];
      meeting.participantIds = [...new Set([...(meeting.participantIds || []), req.user.id])];
    }

    await startMeeting(meeting);

    await meeting.save();

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

    const participants = meeting.participants || [];
    const participant = participants.find(
      p => p.userId === req.user.id && !p.leftAt
    );

    if (participant) {
      participant.leftAt = new Date().toISOString();
    }

    const isHost = meeting.hostId === req.user.id;
    const present = participants.filter(p => p.joinedAt && !p.leftAt);
    const coHostRemains = present.some(p => p.role === 'co-host');

    meeting.participants = participants;
    await meeting.save();

    // The last person leaving ends the meeting, as does the host leaving with no co-host to carry on
    // (once, and it gets billed).
    let ended = false;
    if (present.length === 0 || (isHost && !coHostRemains)) {
      ended = (await endMeeting(meeting)).changed;
    }
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
      meeting.settings = { ...(meeting.settings || {}), ...sanitizeSettings(settings) };
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

router.post('/:roomId/recordings', protect, requirePermission('meetings.record'), enforceRecordingAllowed, recordingUpload.single('recording'), async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const participants = meeting.participants || [];
    const isHost = meeting.hostId === req.user.id;
    // Anyone who took part may upload, even after leftAt is set: the recorder's onstop upload
    // routinely lands after /leave or /end has already closed their participant entry.
    const isParticipant = participants.some(p => p.userId === req.user.id && p.joinedAt);

    if (!isHost && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Only meeting participants can upload recordings'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Recording file is required'
      });
    }

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
        recording: result.recording
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

    if (invitees && Array.isArray(invitees)) {
      // copies: Sequelize does not notice (or save) a JSON array edited in place
      const currentInvitees = [...(meeting.invitees || [])];
      const currentInviteeIds = [...(meeting.inviteeIds || [])];

      for (const inv of invitees) {
        const email = (inv.email || '').trim().toLowerCase();
        if (!inv.userId && email) {
          const account = await User.findOne({ where: { email }, attributes: ['id'] });
          if (account) inv.userId = account.id;
        }
        const alreadyInvited = currentInvitees.some(
          existing => (inv.userId && existing.userId === inv.userId) || (email && (existing.email || '').toLowerCase() === email)
        );

        if (!alreadyInvited) {
          currentInvitees.push({
            id: uuidv4(),
            userId: inv.userId,
            email: inv.email,
            status: 'pending'
          });
          if (inv.userId) currentInviteeIds.push(inv.userId);

          if (inv.userId) {
            Notification.create({
              recipientId: inv.userId,
              type: 'meeting_scheduled',
              title: 'Meeting Invitation',
              message: `You've been invited to "${meeting.title}"`,
              data: {
                meetingId: meeting.id,
                senderId: req.user.id,
                link: meeting.meetingLink
              },
              priority: 'normal'
            }).catch(err => console.error('Notification error:', err));
          }
        }
      }

      meeting.invitees = currentInvitees;
      meeting.inviteeIds = currentInviteeIds;
    }

    await meeting.save();

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
    invitee.status = status;
    invitee.respondedAt = new Date().toISOString();

    if (status === 'accepted') {
      const participants = [...(meeting.participants || [])];
      const alreadyParticipant = participants.some(
        p => p.userId === req.user.id
      );

      if (!alreadyParticipant) {
        participants.push({
          id: uuidv4(),
          userId: req.user.id,
          user: { id: req.user.id, name: req.user.name, email: req.user.email, avatar: req.user.avatar },
          role: 'participant'
        });
        meeting.participants = participants;
        meeting.participantIds = [...(meeting.participantIds || []), req.user.id];
      }
    }

    if (status === 'declined') {
      // Changed their mind after accepting: remove the seat they were given (unless they're in the room now)
      const stillPresent = (meeting.participants || []).some(p => p.userId === req.user.id && !p.leftAt);
      if (!stillPresent) {
        meeting.participants = (meeting.participants || []).filter(p => p.userId !== req.user.id || p.leftAt);
        meeting.participantIds = (meeting.participantIds || []).filter(id => id !== req.user.id);
      }
    }

    meeting.invitees = invitees;
    await meeting.save();

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

    try {
      await cancelMeeting(meeting);
    } catch (error) {
      if (error instanceof StateTransitionError) {
        return res.status(400).json({ success: false, message: 'Meeting is already ended or cancelled' });
      }
      throw error;
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
          message: `"${meeting.title}" has been cancelled`,
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
      return res.json({ success: true, data: { completeTranscript: meeting.completeTranscript, cached: true } });
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

    await meeting.update({ completeTranscript });

    res.json({ success: true, data: { completeTranscript, cached: false } });
  } catch (error) {
    console.error('Generate complete transcript error:', error);
    res.status(500).json({ success: false, message: 'Error generating complete transcript', error: error.message });
  }
});
export default router;
