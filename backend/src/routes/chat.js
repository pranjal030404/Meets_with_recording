import express from 'express';
import Message from '../models/Message.js';
import Meeting from '../models/Meeting.js';
import Team from '../models/Team.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   GET /api/chat/:roomId/messages
 * @desc    Get chat messages for a meeting
 * @access  Private
 */
router.get('/:roomId/messages', protect, async (req, res) => {
  try {
    const { limit = 50, before } = req.query;

    // Find meeting by roomId
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Build query
    const query = {
      meeting: meeting._id,
      isDeleted: false,
      $or: [
        { isPrivate: false },
        { sender: req.user._id },
        { recipient: req.user._id }
      ]
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender', 'name email avatar')
      .populate('recipient', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Reverse to get chronological order
    messages.reverse();

    res.json({
      success: true,
      data: { messages }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching messages',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/chat/:roomId/messages
 * @desc    Send a message in meeting chat
 * @access  Private
 */
router.post('/:roomId/messages', protect, async (req, res) => {
  try {
    const { content, recipientId, type = 'text' } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    // Find meeting
    const meeting = await Meeting.findOne({ roomId: req.params.roomId });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Check if chat is allowed
    if (!meeting.settings.allowChat) {
      return res.status(403).json({
        success: false,
        message: 'Chat is disabled for this meeting'
      });
    }

    // Create message
    const messageData = {
      meeting: meeting._id,
      sender: req.user._id,
      content: content.trim(),
      type,
      isPrivate: !!recipientId
    };

    if (recipientId) {
      messageData.recipient = recipientId;
    }

    const message = await Message.create(messageData);
    await message.populate('sender', 'name email avatar');
    
    if (recipientId) {
      await message.populate('recipient', 'name email avatar');
    }

    // Emit via Socket.IO
    const io = req.app.get('io');
    
    if (recipientId) {
      // Private message - emit to sender and recipient only
      io.to(`user:${req.user._id}`).to(`user:${recipientId}`).emit('chat:message', message);
    } else {
      // Public message - emit to entire room
      io.to(meeting.roomId).emit('chat:message', message);
    }

    res.status(201).json({
      success: true,
      data: { message }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/chat/messages/:messageId
 * @desc    Delete a message
 * @access  Private
 */
router.delete('/messages/:messageId', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Only sender can delete their message
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own messages'
      });
    }

    message.isDeleted = true;
    message.content = 'This message was deleted';
    await message.save();

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting message',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/chat/messages/:messageId/react
 * @desc    Add reaction to a message
 * @access  Private
 */
router.post('/messages/:messageId/react', protect, async (req, res) => {
  try {
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji is required'
      });
    }

    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user already reacted with this emoji
    const existingReaction = message.reactions.find(
      r => r.user.toString() === req.user._id.toString() && r.emoji === emoji
    );

    if (existingReaction) {
      // Remove reaction
      message.reactions = message.reactions.filter(
        r => !(r.user.toString() === req.user._id.toString() && r.emoji === emoji)
      );
    } else {
      // Add reaction
      message.reactions.push({
        emoji,
        user: req.user._id
      });
    }

    await message.save();
    await message.populate('sender', 'name email avatar');
    await message.populate('reactions.user', 'name avatar');

    res.json({
      success: true,
      data: { message }
    });
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error reacting to message',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/chat/team/:teamId/messages
 * @desc    Get chat messages for a team channel
 * @access  Private
 */
router.get('/team/:teamId/messages', protect, async (req, res) => {
  try {
    const { limit = 100, before, channelType = 'general' } = req.query;

    // Find team
    const team = await Team.findById(req.params.teamId);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Check membership
    if (!team.isMember(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }

    // Build query
    const query = {
      team: team._id,
      channelType,
      isDeleted: false
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender', 'name email avatar')
      .populate('mentions', 'name email')
      .populate('meetingData.meetingId', 'roomId title scheduledAt')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Reverse to get chronological order
    messages.reverse();

    res.json({
      success: true,
      data: { messages, team: { _id: team._id, name: team.name }, channelType }
    });
  } catch (error) {
    console.error('Get team messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team messages',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/chat/team/:teamId/messages
 * @desc    Send a message in team chat channel
 * @access  Private
 */
router.post('/team/:teamId/messages', protect, async (req, res) => {
  try {
    const { content, channelType = 'general', type = 'text', meetingId } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    // Find team
    const team = await Team.findById(req.params.teamId);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Check membership
    if (!team.isMember(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }

    // Extract mentions from content (@userId or @username)
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      // Find user by name or email in team members
      const mentionedMember = team.members.find(m => {
        // We'd need to populate to check, simplified for now
        return true;
      });
      // mentions.push(mentionedMember.user);
    }

    // Create message
    const messageData = {
      team: team._id,
      channelType,
      sender: req.user._id,
      content: content.trim(),
      type,
      mentions
    };

    // If it's a meeting link message
    if (type === 'meeting_link' && meetingId) {
      const meeting = await Meeting.findById(meetingId);
      if (meeting) {
        messageData.meetingData = {
          meetingId: meeting._id,
          title: meeting.title,
          scheduledAt: meeting.scheduledAt,
          link: meeting.meetingLink
        };
      }
    }

    const message = await Message.create(messageData);
    await message.populate('sender', 'name email avatar');
    await message.populate('mentions', 'name email');
    
    if (messageData.meetingData) {
      await message.populate('meetingData.meetingId', 'roomId title scheduledAt');
    }

    // Emit via Socket.IO to team room
    const io = req.app.get('io');
    io.to(`team:${team._id}`).emit('team:message', {
      message,
      channelType
    });

    // Create notifications for mentions
    if (mentions.length > 0) {
      const notificationPromises = mentions.map(userId => 
        Notification.create({
          recipient: userId,
          type: 'mention',
          title: 'Mentioned in Team Chat',
          message: `${req.user.name} mentioned you in ${team.name}`,
          data: {
            teamId: team._id,
            messageId: message._id,
            senderId: req.user._id,
            link: `/teams/${team._id}?channel=${channelType}`
          },
          priority: 'normal'
        })
      );
      await Promise.all(notificationPromises);
    }

    res.status(201).json({
      success: true,
      data: { message }
    });
  } catch (error) {
    console.error('Send team message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message
    });
  }
});

export default router;
