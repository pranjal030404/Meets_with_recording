import express from 'express';
import { Op } from 'sequelize';
import Message from '../models/Message.js';
import Meeting from '../models/Meeting.js';
import Team from '../models/Team.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import FileEntry from '../models/FileEntry.js';
import { protect } from '../middleware/auth.js';
import { parseBreakoutRoomId } from '../lib/breakoutRoomId.js';
import { isInsider, canReadMessage } from '../lib/access.js';
import { updateLocked } from '../lib/locked.js';
import { requirePermission } from '../lib/permissions.js';

const router = express.Router();

const senderInclude = () => ({
  model: User,
  as: 'sender',
  attributes: ['id', 'name', 'email', 'avatar']
});

const recipientInclude = () => ({
  model: User,
  as: 'recipient',
  attributes: ['id', 'name', 'avatar']
});

router.get('/:roomId/messages', protect, async (req, res) => {
  try {
    const { limit = 50, before } = req.query;

    // Breakout chat is live only (see chat:send), so there is no history to load
    if (parseBreakoutRoomId(req.params.roomId)) {
      return res.json({ success: true, data: { messages: [] } });
    }

    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }
    if (!(await isInsider(meeting, req.user))) {
      return res.status(403).json({ success: false, message: 'Join the meeting to see its chat' });
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

router.post('/:roomId/messages', protect, requirePermission('chat.send'), async (req, res) => {
  try {
    const { content, recipientId, type = 'text', attachment } = req.body;

    // Optional file attachment — must reference a file this user uploaded
    // to this meeting (avoids forging attachments to arbitrary files).
    let file = null;
    if (attachment && attachment.fileId) {
      const meetingForFile = await Meeting.findOne({ where: { roomId: req.params.roomId } });
      file = meetingForFile
        ? await FileEntry.findOne({
            where: {
              id: attachment.fileId,
              ownerId: req.user.id,
              meetingId: meetingForFile.id,
              isDeleted: false
            }
          })
        : null;
      if (!file) {
        return res.status(403).json({ success: false, message: 'Attachment not found or not yours' });
      }
    }

    if ((!content || content.trim() === '') && !file) {
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

    if (!(await isInsider(meeting, req.user))) {
      return res.status(403).json({ success: false, message: 'Join the meeting to send messages' });
    }
    if (recipientId && !(await isInsider(meeting, await User.findByPk(recipientId, { attributes: ['id', 'email'] })))) {
      return res.status(400).json({ success: false, message: 'That person is not in this meeting' });
    }

    if (meeting.settings?.allowChat === false) {
      return res.status(403).json({
        success: false,
        message: 'Chat is disabled for this meeting'
      });
    }

    const messageData = {
      meetingId: meeting.id,
      senderId: req.user.id,
      content: (content || '').trim() || (file ? file.originalName : ''),
      type: file ? 'file' : type === 'meeting_link' ? 'meeting_link' : 'text',
      isPrivate: !!recipientId
    };

    if (file) {
      messageData.fileUrl = file.url;
      messageData.fileName = file.originalName;
      messageData.fileType = file.mimeType;
      messageData.fileSize = file.size;
    }

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

    if (!message || message.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    if (!(await canReadMessage(message, req.user))) {
      return res.status(403).json({ success: false, message: 'No access to this message' });
    }
    if (typeof emoji !== 'string' || emoji.length > 16) {
      return res.status(400).json({ success: false, message: 'Invalid emoji' });
    }

    await updateLocked(Message, message.id, (row) => {
      const reactions = row.reactions || [];
      const mine = (r) => r.userId === req.user.id && r.emoji === emoji;
      row.reactions = reactions.some(mine)
        ? reactions.filter((r) => !mine(r))
        : [...reactions, { id: String(reactions.length + 1), emoji, userId: req.user.id }];
    });

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

// Channel keys: 'general' | 'meetings' | 'announcements' | 'custom:<channelId>'.
// Custom channels share the 'custom' enum value in the DB and are told apart by channelName (= channel id).
function resolveChannel(team, key) {
  const raw = String(key || 'general');
  if (raw.startsWith('custom:')) {
    const id = raw.slice(7);
    const ch = (team.channels || []).find(c => c.id === id);
    if (!ch) return null;
    return { channelType: 'custom', channelName: id, key: raw };
  }
  if (!['general', 'meetings', 'announcements'].includes(raw)) return null;
  return { channelType: raw, channelName: null, key: raw };
}

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

    const channel = resolveChannel(team, channelType);
    if (!channel) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }

    const whereClause = {
      teamId: team.id,
      channelType: channel.channelType,
      isDeleted: false
    };
    if (channel.channelName) whereClause.channelName = channel.channelName;

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

router.post('/team/:teamId/messages', protect, requirePermission('chat.send'), async (req, res) => {
  try {
    const { content, channelType = 'general', type = 'text', meetingId, attachment } = req.body;

    // Optional file attachment — must reference a file this user uploaded
    // to this team (avoids forging attachments to arbitrary files).
    let file = null;
    if (attachment && attachment.fileId) {
      file = await FileEntry.findOne({
        where: {
          id: attachment.fileId,
          ownerId: req.user.id,
          teamId: req.params.teamId,
          isDeleted: false
        }
      });
      if (!file) {
        return res.status(403).json({ success: false, message: 'Attachment not found or not yours' });
      }
    }

    if ((!content || content.trim() === '') && !file) {
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

    // Only real teammates can be tagged
    const mentions = Array.isArray(req.body.mentions)
      ? [...new Set(req.body.mentions)].filter((id) => id !== req.user.id && team.isMember(id))
      : [];

    const channel = resolveChannel(team, channelType);
    if (!channel) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }

    const messageData = {
      teamId: team.id,
      channelType: channel.channelType,
      ...(channel.channelName ? { channelName: channel.channelName } : {}),
      senderId: req.user.id,
      content: (content || '').trim() || (file ? file.originalName : ''),
      type: file ? 'file' : type === 'meeting_link' ? 'meeting_link' : 'text',
      mentions
    };

    if (file) {
      messageData.fileUrl = file.url;
      messageData.fileName = file.originalName;
      messageData.fileType = file.mimeType;
      messageData.fileSize = file.size;
    }

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
