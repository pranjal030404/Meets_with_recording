import express from 'express';
import { Op } from 'sequelize';
import Message from '../models/Message.js';
import Meeting from '../models/Meeting.js';
import Team from '../models/Team.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const senderInclude = () => ({
  model: User,
  as: 'sender',
  attributes: ['id', 'name', 'email', 'avatar']
});

const recipientInclude = () => ({
  model: User,
  as: 'recipient',
  attributes: ['id', 'name', 'email', 'avatar']
});

router.get('/:roomId/messages', protect, async (req, res) => {
  try {
    const { limit = 50, before } = req.query;

    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const whereClause = {
      meetingId: meeting.id,
      isDeleted: false,
      [Op.or]: [
        { isPrivate: false },
        { senderId: req.user.id },
        { recipientId: req.user.id }
      ]
    };

    if (before) {
      whereClause.createdAt = { [Op.lt]: new Date(before) };
    }

    const messages = await Message.findAll({
      where: whereClause,
      include: [senderInclude(), recipientInclude()],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    messages.reverse();

    res.json({
      success: true,
      data: { messages: messages.map(m => m.toJSON()) }
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

router.post('/:roomId/messages', protect, async (req, res) => {
  try {
    const { content, recipientId, type = 'text' } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (!meeting.settings || !meeting.settings.allowChat) {
      return res.status(403).json({
        success: false,
        message: 'Chat is disabled for this meeting'
      });
    }

    const messageData = {
      meetingId: meeting.id,
      senderId: req.user.id,
      content: content.trim(),
      type,
      isPrivate: !!recipientId
    };

    if (recipientId) {
      messageData.recipientId = recipientId;
    }

    const message = await Message.create(messageData);

    const fullMessage = await Message.findByPk(message.id, {
      include: [senderInclude(), recipientId ? recipientInclude() : null].filter(Boolean)
    });

    const io = req.app.get('io');

    if (recipientId) {
      io.to(`user:${req.user.id}`).to(`user:${recipientId}`).emit('chat:message', fullMessage.toJSON());
    } else {
      io.to(meeting.roomId).emit('chat:message', fullMessage.toJSON());
    }

    res.status(201).json({
      success: true,
      data: { message: fullMessage.toJSON() }
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

router.delete('/messages/:messageId', protect, async (req, res) => {
  try {
    const message = await Message.findByPk(req.params.messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    if (message.senderId !== req.user.id) {
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

router.post('/messages/:messageId/react', protect, async (req, res) => {
  try {
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji is required'
      });
    }

    const message = await Message.findByPk(req.params.messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    const reactions = message.reactions || [];
    const existingReaction = reactions.find(
      r => r.userId === req.user.id && r.emoji === emoji
    );

    if (existingReaction) {
      message.reactions = reactions.filter(
        r => !(r.userId === req.user.id && r.emoji === emoji)
      );
    } else {
      reactions.push({
        id: (reactions.length + 1).toString(),
        emoji,
        userId: req.user.id
      });
      message.reactions = reactions;
    }

    await message.save();

    const fullMessage = await Message.findByPk(message.id, {
      include: [senderInclude(), { model: User, as: 'recipient', attributes: ['id', 'name', 'avatar'] }]
    });

    res.json({
      success: true,
      data: { message: fullMessage.toJSON() }
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

router.get('/team/:teamId/messages', protect, async (req, res) => {
  try {
    const { limit = 100, before, channelType = 'general' } = req.query;

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

    const whereClause = {
      teamId: team.id,
      channelType,
      isDeleted: false
    };

    if (before) {
      whereClause.createdAt = { [Op.lt]: new Date(before) };
    }

    const messages = await Message.findAll({
      where: whereClause,
      include: [senderInclude()],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    messages.reverse();

    res.json({
      success: true,
      data: {
        messages: messages.map(m => m.toJSON()),
        team: { id: team.id, name: team.name },
        channelType
      }
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

router.post('/team/:teamId/messages', protect, async (req, res) => {
  try {
    const { content, channelType = 'general', type = 'text', meetingId } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

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

    const mentions = [];

    const messageData = {
      teamId: team.id,
      channelType,
      senderId: req.user.id,
      content: content.trim(),
      type,
      mentions
    };

    if (type === 'meeting_link' && meetingId) {
      const meeting = await Meeting.findByPk(meetingId);
      if (meeting) {
        messageData.meetingData = {
          meetingId: meeting.id,
          title: meeting.title,
          scheduledAt: meeting.scheduledAt,
          link: meeting.meetingLink
        };
      }
    }

    const message = await Message.create(messageData);

    const fullMessage = await Message.findByPk(message.id, {
      include: [senderInclude()]
    });

    const io = req.app.get('io');
    io.to(`team:${team.id}`).emit('team:message', {
      message: fullMessage.toJSON(),
      channelType
    });

    if (mentions.length > 0) {
      const notificationPromises = mentions.map(userId =>
        Notification.create({
          recipientId: userId,
          type: 'mention',
          title: 'Mentioned in Team Chat',
          message: `${req.user.name} mentioned you in ${team.name}`,
          data: {
            teamId: team.id,
            messageId: message.id,
            senderId: req.user.id,
            link: `/teams/${team.id}?channel=${channelType}`
          },
          priority: 'normal'
        })
      );
      await Promise.all(notificationPromises);
    }

    res.status(201).json({
      success: true,
      data: { message: fullMessage.toJSON() }
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
