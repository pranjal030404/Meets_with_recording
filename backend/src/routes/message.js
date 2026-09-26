import express from 'express';
import { Op } from 'sequelize';
import Message from '../models/Message.js';
import Meeting from '../models/Meeting.js';
import Team from '../models/Team.js';
import ConversationMember from '../models/ConversationMember.js';
import SavedMessage from '../models/SavedMessage.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import logAudit from '../services/auditService.js';

const router = express.Router();

const USER_ATTRS = ['id', 'name', 'email', 'avatar', 'customStatus', 'statusEmoji'];

const senderInclude = () => ({ model: User, as: 'sender', attributes: USER_ATTRS });

const getFullMessage = (id) => Message.findByPk(id, { include: [senderInclude()] });

// Room this message's context lives in (for socket emit)
const contextRoom = (message, meeting) => {
  if (message.conversationId) return `conversation:${message.conversationId}`;
  if (message.teamId) return `team:${message.teamId}`;
  if (message.meetingId && meeting) return meeting.roomId;
  return null;
};

// Can the user act on this message's context (react/edit/pin)?
const assertContextAccess = async (message, user) => {
  if (message.teamId) {
    const team = await Team.findByPk(message.teamId);
    return { team, allowed: !!team && team.isMember(user.id), isTeamAdmin: !!team && team.isOwnerOrAdmin(user.id) };
  }
  if (message.conversationId) {
    const membership = await ConversationMember.findOne({
      where: { conversationId: message.conversationId, userId: user.id }
    });
    return { membership, allowed: !!membership };
  }
  if (message.meetingId) {
    const meeting = await Meeting.findByPk(message.meetingId);
    const isHost = meeting && meeting.hostId === user.id;
    const isParticipant = meeting && (meeting.participantIds || []).includes(user.id);
    return { meeting, allowed: !!meeting, isHost };
  }
  return { allowed: false };
};

// ---------------------------------------------
// Threads
// ---------------------------------------------

// Get thread (root + replies)
router.get('/messages/:messageId/thread', protect, async (req, res) => {
  try {
    const root = await Message.findByPk(req.params.messageId, { include: [senderInclude()] });
    if (!root || root.isDeleted) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const actualRoot = root.threadRootId ? await getFullMessage(root.threadRootId) : root;
    const { allowed } = await assertContextAccess(actualRoot, req.user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'No access to this thread' });
    }

    const replies = await Message.findAll({
      where: { threadRootId: actualRoot.id, isDeleted: false },
      include: [senderInclude()],
      order: [['createdAt', 'ASC']],
      limit: 200
    });

    res.json({ success: true, data: { root: actualRoot.toJSON(), replies: replies.map(m => m.toJSON()) } });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ success: false, message: 'Error fetching thread', error: error.message });
  }
});

// Reply in thread
router.post('/messages/:messageId/replies', protect, async (req, res) => {
  try {
    const { content, mentions = [] } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).json({ success: false, message: 'Reply content is required' });
    }

    const root = await Message.findByPk(req.params.messageId);
    if (!root || root.isDeleted) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    const actualRoot = root.threadRootId ? await Message.findByPk(root.threadRootId) : root;

    const { allowed, meeting } = await assertContextAccess(actualRoot, req.user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'No access to this thread' });
    }

    const reply = await Message.create({
      meetingId: actualRoot.meetingId,
      teamId: actualRoot.teamId,
      conversationId: actualRoot.conversationId,
      channelType: actualRoot.channelType,
      channelName: actualRoot.channelName,
      senderId: req.user.id,
      content: content.trim(),
      mentions,
      threadRootId: actualRoot.id,
      replyToId: actualRoot.id
    });

    await Message.increment('replyCount', { by: 1, where: { id: actualRoot.id } });

    const fullReply = await getFullMessage(reply.id);
    const io = req.app.get('io');
    const room = contextRoom(actualRoot, meeting);
    if (room) {
      io.to(room).emit('thread:reply', { rootId: actualRoot.id, reply: fullReply.toJSON() });
    }

    // Notify thread root author (and previous participants) outside the room
    if (actualRoot.senderId !== req.user.id) {
      await Notification.create({
        recipientId: actualRoot.senderId,
        type: 'mention',
        title: `${req.user.name} replied to your message`,
        message: content.trim().slice(0, 200),
        data: {
          rootMessageId: actualRoot.id,
          conversationId: actualRoot.conversationId,
          teamId: actualRoot.teamId,
          link: actualRoot.conversationId ? `/chat/${actualRoot.conversationId}?thread=${actualRoot.id}` : null
        },
        priority: 'normal'
      });
    }

    res.status(201).json({ success: true, data: { reply: fullReply.toJSON() } });
  } catch (error) {
    console.error('Thread reply error:', error);
    res.status(500).json({ success: false, message: 'Error replying to thread', error: error.message });
  }
});

// ---------------------------------------------
// Message actions
// ---------------------------------------------

// Edit own message
router.put('/messages/:messageId', protect, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    const message = await Message.findByPk(req.params.messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    if (message.senderId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit your own messages' });
    }

    message.content = content.trim();
    message.editedAt = new Date();
    await message.save();

    const meeting = message.meetingId ? await Meeting.findByPk(message.meetingId) : null;
    const fullMessage = await getFullMessage(message.id);
    const io = req.app.get('io');
    const room = contextRoom(message, meeting);
    if (room) io.to(room).emit('message:updated', fullMessage.toJSON());

    logAudit({ actor: req.user, action: 'message.edit', entityType: 'Message', entityId: message.id, req });

    res.json({ success: true, data: { message: fullMessage.toJSON() } });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ success: false, message: 'Error editing message', error: error.message });
  }
});

// Delete own message (works across all contexts)
router.delete('/messages/:messageId', protect, async (req, res) => {
  try {
    const message = await Message.findByPk(req.params.messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const { allowed, isHost, isTeamAdmin, membership } = await assertContextAccess(message, req.user);
    const isModerator = isHost || isTeamAdmin || membership?.role === 'owner';
    if (message.senderId !== req.user.id && !isModerator) {
      return res.status(403).json({ success: false, message: 'You can only delete your own messages' });
    }

    message.isDeleted = true;
    message.content = 'This message was deleted';
    message.fileUrl = null;
    await message.save();

    // Keep thread counters accurate
    if (message.threadRootId) {
      await Message.decrement('replyCount', { by: 1, where: { id: message.threadRootId } });
    }

    const meeting = message.meetingId ? await Meeting.findByPk(message.meetingId) : null;
    const io = req.app.get('io');
    const room = contextRoom(message, meeting);
    if (room) io.to(room).emit('message:deleted', { messageId: message.id, threadRootId: message.threadRootId });

    logAudit({ actor: req.user, action: 'message.delete', entityType: 'Message', entityId: message.id, req });

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ success: false, message: 'Error deleting message', error: error.message });
  }
});

// Toggle reaction (works across all contexts)
router.post('/messages/:messageId/react', protect, async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) {
      return res.status(400).json({ success: false, message: 'Emoji is required' });
    }

    const message = await Message.findByPk(req.params.messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const { allowed, meeting } = await assertContextAccess(message, req.user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'No access to this message' });
    }

    const reactions = message.reactions || [];
    const existing = reactions.find(r => r.userId === req.user.id && r.emoji === emoji);
    let updated;
    if (existing) {
      updated = reactions.filter(r => !(r.userId === req.user.id && r.emoji === emoji));
    } else {
      updated = [...reactions, { emoji, userId: req.user.id, userName: req.user.name }];
    }
    message.reactions = updated;
    await message.save();

    const fullMessage = await getFullMessage(message.id);
    const io = req.app.get('io');
    const room = contextRoom(message, meeting);
    if (room) io.to(room).emit('message:updated', fullMessage.toJSON());

    res.json({ success: true, data: { message: fullMessage.toJSON() } });
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ success: false, message: 'Error reacting to message', error: error.message });
  }
});

// Toggle pin (moderators only)
router.put('/messages/:messageId/pin', protect, async (req, res) => {
  try {
    const message = await Message.findByPk(req.params.messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const { allowed, isHost, isTeamAdmin, membership } = await assertContextAccess(message, req.user);
    const isModerator = isHost || isTeamAdmin || membership?.role === 'owner';
    if (!allowed || !isModerator) {
      return res.status(403).json({ success: false, message: 'Only moderators can pin messages' });
    }

    message.isPinned = !message.isPinned;
    message.pinnedBy = message.isPinned ? req.user.id : null;
    await message.save();

    const meeting = message.meetingId ? await Meeting.findByPk(message.meetingId) : null;
    const fullMessage = await getFullMessage(message.id);
    const io = req.app.get('io');
    const room = contextRoom(message, meeting);
    if (room) io.to(room).emit('message:updated', fullMessage.toJSON());

    logAudit({ actor: req.user, action: message.isPinned ? 'message.pin' : 'message.unpin', entityType: 'Message', entityId: message.id, req });

    res.json({ success: true, data: { message: fullMessage.toJSON() } });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ success: false, message: 'Error pinning message', error: error.message });
  }
});

// Forward a message to a conversation or team channel
router.post('/messages/:messageId/forward', protect, async (req, res) => {
  try {
    const { conversationId, teamId, channelType = 'general' } = req.body;
    const source = await Message.findByPk(req.params.messageId, { include: [senderInclude()] });
    if (!source || source.isDeleted) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    let target;
    if (conversationId) {
      const membership = await ConversationMember.findOne({
        where: { conversationId, userId: req.user.id }
      });
      if (!membership) return res.status(403).json({ success: false, message: 'No access to target conversation' });
      target = { conversationId };
    } else if (teamId) {
      const team = await Team.findByPk(teamId);
      if (!team || !team.isMember(req.user.id)) {
        return res.status(403).json({ success: false, message: 'No access to target team channel' });
      }
      target = { teamId, channelType, channelName: channelType };
    } else {
      return res.status(400).json({ success: false, message: 'conversationId or teamId is required' });
    }

    const forwarded = await Message.create({
      ...target,
      senderId: req.user.id,
      content: source.content,
      type: source.type,
      fileUrl: source.fileUrl,
      fileName: source.fileName,
      fileType: source.fileType,
      fileSize: source.fileSize,
      forwardedFromId: source.id
    });

    const fullForwarded = await getFullMessage(forwarded.id);
    const io = req.app.get('io');
    if (conversationId) {
      io.to(`conversation:${conversationId}`).emit('conversation:message', fullForwarded.toJSON());
    } else {
      io.to(`team:${teamId}`).emit('team:message', { message: fullForwarded.toJSON(), channelType });
    }

    logAudit({ actor: req.user, action: 'message.forward', entityType: 'Message', entityId: forwarded.id, metadata: { from: source.id }, req });

    res.status(201).json({ success: true, data: { message: fullForwarded.toJSON() } });
  } catch (error) {
    console.error('Forward message error:', error);
    res.status(500).json({ success: false, message: 'Error forwarding message', error: error.message });
  }
});

// ---------------------------------------------
// Saved messages (bookmarks)
// ---------------------------------------------

router.post('/messages/:messageId/save', protect, async (req, res) => {
  try {
    const message = await Message.findByPk(req.params.messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const existing = await SavedMessage.findOne({ where: { userId: req.user.id, messageId: message.id } });
    if (existing) {
      await existing.destroy();
      return res.json({ success: true, data: { saved: false } });
    }

    await SavedMessage.create({ userId: req.user.id, messageId: message.id });
    res.json({ success: true, data: { saved: true } });
  } catch (error) {
    console.error('Save message error:', error);
    res.status(500).json({ success: false, message: 'Error saving message', error: error.message });
  }
});

router.get('/saved', protect, async (req, res) => {
  try {
    const saved = await SavedMessage.findAll({
      where: { userId: req.user.id },
      include: [{
        model: Message,
        as: 'message',
        where: { isDeleted: false },
        include: [senderInclude()]
      }],
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    res.json({
      success: true,
      data: { saved: saved.filter(s => s.message).map(s => ({ savedId: s.id, savedAt: s.createdAt, message: s.message.toJSON() })) }
    });
  } catch (error) {
    console.error('List saved messages error:', error);
    res.status(500).json({ success: false, message: 'Error fetching saved messages', error: error.message });
  }
});

// Pinned messages of a context
router.get('/pinned', protect, async (req, res) => {
  try {
    const { conversationId, teamId, channelType = 'general' } = req.query;
    const where = { isPinned: true, isDeleted: false };

    if (conversationId) {
      const membership = await ConversationMember.findOne({ where: { conversationId, userId: req.user.id } });
      if (!membership) return res.status(403).json({ success: false, message: 'No access' });
      where.conversationId = conversationId;
    } else if (teamId) {
      const team = await Team.findByPk(teamId);
      if (!team || !team.isMember(req.user.id)) return res.status(403).json({ success: false, message: 'No access' });
      where.teamId = teamId;
      where.channelType = channelType;
    } else {
      return res.status(400).json({ success: false, message: 'conversationId or teamId is required' });
    }

    const messages = await Message.findAll({
      where,
      include: [senderInclude()],
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.json({ success: true, data: { messages: messages.map(m => m.toJSON()) } });
  } catch (error) {
    console.error('List pinned messages error:', error);
    res.status(500).json({ success: false, message: 'Error fetching pinned messages', error: error.message });
  }
});

export default router;
