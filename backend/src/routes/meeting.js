import express from 'express';
import Meeting from '../models/Meeting.js';
import Team from '../models/Team.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/meetings
 * @desc    Create a new meeting
 * @access  Private
 */
router.post('/', protect, async (req, res) => {
  try {
    const { title, description, scheduledAt, settings, teamId, invitees, reminders, recurrence } = req.body;

    // Validate team membership if teamId provided
    if (teamId) {
      const team = await Team.findById(teamId);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }
      if (!team.isMember(req.user._id)) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this team'
        });
      }
    }

    const isInstant = !scheduledAt;
    const meetingData = {
      title: title || 'Untitled Meeting',
      description,
      host: req.user._id,
      team: teamId,
      scheduledAt,
      isInstant,
      settings: settings || {},
      participants: [{
        user: req.user._id,
        role: 'host',
        joinedAt: isInstant ? new Date() : undefined
      }],
      recurrence: recurrence || { enabled: false }
    };

    // Generate meeting link
    const meeting = await Meeting.create(meetingData);
    meeting.meetingLink = `${req.protocol}://${req.get('host')}/meeting/${meeting.roomId}`;
    
    // Add invitees
    if (invitees && Array.isArray(invitees)) {
      meeting.invitees = invitees.map(inv => ({
        user: inv.userId,
        email: inv.email,
        status: 'pending'
      }));
    }

    // Add default reminders for scheduled meetings
    if (scheduledAt) {
      meeting.reminders = reminders || [
        { time: 15, unit: 'minutes' },
        { time: 1, unit: 'hours' },
        { time: 1, unit: 'days' }
      ];
    }

    await meeting.save();
    await meeting.populate('host', 'name email avatar');
    if (teamId) {
      await meeting.populate('team', 'name');
    }

    // Create notifications for invitees
    if (invitees && scheduledAt) {
      const notificationPromises = invitees.map(inv => {
        if (inv.userId) {
          return Notification.create({
            recipient: inv.userId,
            type: 'meeting_scheduled',
            title: 'Meeting Invitation',
            message: `You've been invited to "${meeting.title}"`,
            data: {
              meetingId: meeting._id,
              senderId: req.user._id,
              link: meeting.meetingLink
            },
            priority: 'normal'
          });
        }
      });
      await Promise.all(notificationPromises.filter(Boolean));
    }

    // If instant meeting, activate it
    if (isInstant) {
      meeting.status = 'active';
      meeting.startedAt = new Date();
      await meeting.save();
    }

    res.status(201).json({
      success: true,
      message: 'Meeting created successfully',
      data: { meeting }
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

/**
 * @route   GET /api/meetings
 * @desc    Get user's meetings (hosted + participated)
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const { status, limit = 20, page = 1 } = req.query;
    
    const query = {
      $or: [
        { host: req.user._id },
        { 'participants.user': req.user._id },
        { 'invitees.user': req.user._id }
      ]
    };

    if (status) {
      query.status = status;
    }

    const meetings = await Meeting.find(query)
      .populate('host', 'name email avatar')
      .populate('team', 'name')
      .populate('participants.user', 'name email avatar')
      .populate('invitees.user', 'name email')
      .sort({ scheduledAt: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Meeting.countDocuments(query);

    res.json({
      success: true,
      data: {
        meetings,
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

/**
 * @route   GET /api/meetings/team/:teamId
 * @desc    Get all meetings for a team
 * @access  Private
 */
router.get('/team/:teamId', protect, async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    if (!team.isMember(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }

    const { status, limit = 50, page = 1 } = req.query;
    const query = { team: req.params.teamId };
    
    if (status) {
      query.status = status;
    }

    const meetings = await Meeting.find(query)
      .populate('host', 'name email avatar')
      .populate('participants.user', 'name email avatar')
      .sort({ scheduledAt: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Meeting.countDocuments(query);

    res.json({
      success: true,
      data: {
        meetings,
        team: { _id: team._id, name: team.name },
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

/**
 * @route   GET /api/meetings/:roomId
 * @desc    Get meeting by room ID
 * @access  Private
 */
router.get('/:roomId', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId })
      .populate('host', 'name email avatar')
      .populate('team', 'name description')
      .populate('participants.user', 'name email avatar')
      .populate('invitees.user', 'name email');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    res.json({
      success: true,
      data: { meeting }
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

/**
 * @route   POST /api/meetings/:roomId/join
 * @desc    Join a meeting
 * @access  Private
 */
router.post('/:roomId/join', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Check if meeting has ended
    if (meeting.status === 'ended') {
      return res.status(400).json({
        success: false,
        message: 'This meeting has ended'
      });
    }

    // Check max participants
    const activeParticipants = meeting.participants.filter(p => !p.leftAt).length;
    if (activeParticipants >= meeting.settings.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Meeting is full'
      });
    }

    // Check if user is already in meeting
    const existingParticipant = meeting.participants.find(
      p => p.user.toString() === req.user._id.toString() && !p.leftAt
    );

    if (!existingParticipant) {
      meeting.participants.push({
        user: req.user._id,
        role: 'participant',
        joinedAt: new Date(),
        isMuted: meeting.settings.muteOnEntry
      });
    }

    // Start meeting if not already active
    if (meeting.status === 'scheduled') {
      meeting.status = 'active';
      meeting.startedAt = new Date();
    }

    await meeting.save();
    await meeting.populate('host', 'name email avatar');
    await meeting.populate('participants.user', 'name email avatar');

    res.json({
      success: true,
      message: 'Joined meeting successfully',
      data: { meeting }
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

/**
 * @route   POST /api/meetings/:roomId/leave
 * @desc    Leave a meeting
 * @access  Private
 */
router.post('/:roomId/leave', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Find participant and mark as left
    const participant = meeting.participants.find(
      p => p.user.toString() === req.user._id.toString() && !p.leftAt
    );

    if (participant) {
      participant.leftAt = new Date();
    }

    // If host leaves and no other active participants, end meeting
    const isHost = meeting.host.toString() === req.user._id.toString();
    const activeParticipants = meeting.participants.filter(p => !p.leftAt).length;

    if (isHost || activeParticipants === 0) {
      meeting.status = 'ended';
      meeting.endedAt = new Date();
    }

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

/**
 * @route   PUT /api/meetings/:roomId/settings
 * @desc    Update meeting settings (host only)
 * @access  Private
 */
router.put('/:roomId/settings', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Only host can update settings
    if (meeting.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can update meeting settings'
      });
    }

    const { title, settings } = req.body;

    if (title) meeting.title = title;
    if (settings) {
      meeting.settings = { ...meeting.settings, ...settings };
    }

    await meeting.save();
    await meeting.populate('host', 'name email avatar');

    res.json({
      success: true,
      message: 'Meeting updated successfully',
      data: { meeting }
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

/**
 * @route   POST /api/meetings/:roomId/end
 * @desc    End a meeting (host only)
 * @access  Private
 */
router.post('/:roomId/end', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Only host can end meeting
    if (meeting.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can end the meeting'
      });
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();

    // Mark all participants as left
    meeting.participants.forEach(p => {
      if (!p.leftAt) {
        p.leftAt = new Date();
      }
    });

    await meeting.save();

    // Notify all participants via Socket.IO
    const io = req.app.get('io');
    io.to(meeting.roomId).emit('meeting:ended', {
      roomId: meeting.roomId,
      endedBy: req.user._id
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

/**
 * @route   POST /api/meetings/:roomId/invite
 * @desc    Add invitees to a meeting
 * @access  Private
 */
router.post('/:roomId/invite', protect, async (req, res) => {
  try {
    const { invitees } = req.body;
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Only host can invite
    if (meeting.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can invite participants'
      });
    }

    if (invitees && Array.isArray(invitees)) {
      invitees.forEach(inv => {
        // Check if already invited
        const alreadyInvited = meeting.invitees.some(
          existing => existing.user && existing.user.toString() === inv.userId
        );
        
        if (!alreadyInvited) {
          meeting.invitees.push({
            user: inv.userId,
            email: inv.email,
            status: 'pending'
          });

          // Create notification
          if (inv.userId) {
            Notification.create({
              recipient: inv.userId,
              type: 'meeting_scheduled',
              title: 'Meeting Invitation',
              message: `You've been invited to "${meeting.title}"`,
              data: {
                meetingId: meeting._id,
                senderId: req.user._id,
                link: meeting.meetingLink
              },
              priority: 'normal'
            }).catch(err => console.error('Notification error:', err));
          }
        }
      });
    }

    await meeting.save();
    await meeting.populate('invitees.user', 'name email');

    res.json({
      success: true,
      message: 'Invitations sent successfully',
      data: { invitees: meeting.invitees }
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

/**
 * @route   PUT /api/meetings/:roomId/respond
 * @desc    Respond to meeting invitation (accept/decline)
 * @access  Private
 */
router.put('/:roomId/respond', protect, async (req, res) => {
  try {
    const { status } = req.body; // 'accepted' or 'declined'
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const invitee = meeting.invitees.find(
      inv => inv.user && inv.user.toString() === req.user._id.toString()
    );

    if (!invitee) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    invitee.status = status;
    invitee.respondedAt = new Date();

    // If accepted, add to participants
    if (status === 'accepted') {
      const alreadyParticipant = meeting.participants.some(
        p => p.user.toString() === req.user._id.toString()
      );
      
      if (!alreadyParticipant) {
        meeting.participants.push({
          user: req.user._id,
          role: 'participant'
        });
      }
    }

    await meeting.save();

    res.json({
      success: true,
      message: `Invitation ${status}`,
      data: { meeting }
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

/**
 * @route   PUT /api/meetings/:roomId/cancel
 * @desc    Cancel a scheduled meeting
 * @access  Private
 */
router.put('/:roomId/cancel', protect, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Only host can cancel
    if (meeting.host.toString() !== req.user._id.toString()) {
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

    // Notify all invitees
    const notificationPromises = meeting.invitees.map(inv => {
      if (inv.user) {
        return Notification.create({
          recipient: inv.user,
          type: 'meeting_cancelled',
          title: 'Meeting Cancelled',
          message: `"${meeting.title}" has been cancelled`,
          data: {
            meetingId: meeting._id,
            senderId: req.user._id
          },
          priority: 'high'
        });
      }
    });

    await Promise.all(notificationPromises.filter(Boolean));

    res.json({
      success: true,
      message: 'Meeting cancelled successfully',
      data: { meeting }
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
