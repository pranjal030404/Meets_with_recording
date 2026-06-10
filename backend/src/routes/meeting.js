import express from 'express';
import { Op, fn, col, where as seqWhere, cast } from 'sequelize';
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
import { saveMeetingRecording } from '../services/recordingService.js';

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

router.post('/', protect, async (req, res) => {
  try {
    const { title, description, scheduledAt, settings, teamId, invitees, reminders, recurrence } = req.body;

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
      settings: settings || {},
      participants: [participantEntry],
      participantIds: [req.user.id],
      invitees: [],
      inviteeIds: [],
      recordings: [],
      reminders: [],
      recurrence: recurrence || { enabled: false }
    };

    const meeting = await Meeting.create(meetingData);
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
        seqWhere(fn('JSON_CONTAINS', col('participantIds'), cast(JSON.stringify(req.user.id), 'json')), 1),
        seqWhere(fn('JSON_CONTAINS', col('inviteeIds'), cast(JSON.stringify(req.user.id), 'json')), 1)
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

router.get('/:roomId', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({
      where: { roomId: req.params.roomId },
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

router.post('/:roomId/join', protect, async (req, res) => {
  try {
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

    if (meeting.status === 'ended') {
      return res.status(400).json({
        success: false,
        message: 'This meeting has ended'
      });
    }

    const participants = meeting.participants || [];
    const activeParticipants = participants.filter(p => !p.leftAt).length;
    const maxParticipants = (meeting.settings && meeting.settings.maxParticipants) || 50;

    if (activeParticipants >= maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Meeting is full'
      });
    }

    const existingParticipant = participants.find(
      p => p.userId === req.user.id && !p.leftAt
    );

    if (!existingParticipant) {
      meeting.participants = [
        ...participants,
        {
          id: uuidv4(),
          userId: req.user.id,
          user: { id: req.user.id, name: req.user.name, email: req.user.email, avatar: req.user.avatar },
          role: 'participant',
          joinedAt: new Date().toISOString(),
          isMuted: meeting.settings && meeting.settings.muteOnEntry
        }
      ];
      meeting.participantIds = [...(meeting.participantIds || []), req.user.id];
    }

    if (meeting.status === 'scheduled') {
      meeting.status = 'active';
      meeting.startedAt = new Date();
    }

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
    const activeParticipants = participants.filter(p => !p.leftAt).length;

    if (isHost || activeParticipants === 0) {
      meeting.status = 'ended';
      meeting.endedAt = new Date();
    }

    meeting.participants = participants;
    await meeting.save();

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

    if (meeting.hostId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can update meeting settings'
      });
    }

    const { title, settings } = req.body;

    if (title) meeting.title = title;
    if (settings) {
      meeting.settings = { ...(meeting.settings || {}), ...settings };
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

    if (meeting.hostId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can end the meeting'
      });
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();

    const participants = (meeting.participants || []).map(p => ({
      ...p,
      leftAt: p.leftAt || new Date().toISOString()
    }));
    meeting.participants = participants;

    await meeting.save();

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

router.post('/:roomId/recordings', protect, recordingUpload.single('recording'), async (req, res) => {
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
    const isParticipant = participants.some(p => p.userId === req.user.id && !p.leftAt);

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

    const result = await saveMeetingRecording({
      roomId: meeting.roomId,
      sourcePath: req.file.path,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      duration: Number.isFinite(duration) ? duration : 0,
      recordedBy: req.user.id,
      language
    });

    const recordings = meeting.recordings || [];
    recordings.push(result.recording);
    meeting.recordings = recordings;
    await meeting.save();

    res.status(201).json({
      success: true,
      message: 'Recording uploaded and transcribed successfully',
      data: {
        recording: result.recording,
        transcript: result.transcript
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

    if (meeting.hostId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can invite participants'
      });
    }

    if (invitees && Array.isArray(invitees)) {
      const currentInvitees = meeting.invitees || [];
      const currentInviteeIds = meeting.inviteeIds || [];

      for (const inv of invitees) {
        const alreadyInvited = currentInvitees.some(
          existing => existing.userId && existing.userId === inv.userId
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
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const invitees = meeting.invitees || [];
    const invitee = invitees.find(
      inv => inv.userId && inv.userId === req.user.id
    );

    if (!invitee) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    invitee.status = status;
    invitee.respondedAt = new Date().toISOString();

    if (status === 'accepted') {
      const participants = meeting.participants || [];
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

    if (meeting.hostId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can cancel the meeting'
      });
    }

    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Meeting is already ended or cancelled'
      });
    }

    meeting.status = 'cancelled';
    await meeting.save();

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

export default router;
