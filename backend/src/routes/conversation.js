import express from 'express';
import { pageNewestFirst, ORDER_NEWEST_FIRST, clampLimit } from '../lib/cursor.js';
import { Op, Sequelize } from 'sequelize';
import Conversation from '../models/Conversation.js';
import ConversationMember from '../models/ConversationMember.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import Team from '../models/Team.js';
import { protect } from '../middleware/auth.js';
import logAudit from '../services/auditService.js';
import { requirePermission } from '../lib/permissions.js';
import { contactIdsOf, maskEmail } from '../lib/access.js';
import { removeFromRoom } from '../realtime/sessions.js';
import FileEntry from '../models/FileEntry.js';
import { myTeams } from '../models/membership.js';

const router = express.Router();

const USER_ATTRS = ['id', 'name', 'email', 'avatar', 'customStatus', 'statusEmoji', 'statusExpiresAt', 'title', 'isOnline', 'lastSeen'];

const SENDER_ATTRS = USER_ATTRS.filter((a) => a !== 'email');

const memberInclude = () => ({
  model: ConversationMember,
  as: 'members',
  include: [{ model: User, as: 'user', attributes: USER_ATTRS }]
});

const getMyConversationIds = async (userId) => {
  const memberships = await ConversationMember.findAll({ where: { userId }, attributes: ['conversationId'] });
  return memberships.map(m => m.conversationId);
};

const isMember = async (conversationId, userId) => {
  const membership = await ConversationMember.findOne({ where: { conversationId, userId } });
  return membership;
};

const hydrateConversation = async (conversation, userId, knownContacts) => {
  const json = conversation.toJSON();
  // Opening a chat with a stranger must not reveal their address
  const contacts = knownContacts || await contactIdsOf(userId);
  json.members = (json.members || []).map((m) => {
    const member = typeof m.toJSON === 'function' ? m.toJSON() : { ...m };
    if (member.user && member.userId !== userId && !contacts.has(member.userId)) {
      const user = typeof member.user.toJSON === 'function' ? member.user.toJSON() : { ...member.user };
      member.user = { ...user, email: maskEmail(user.email) };
    }
    return member;
  });
  const me = (json.members || []).find(m => m.userId === userId);
  const others = (json.members || []).filter(m => m.userId !== userId);
  const unread = await Message.count({
    where: {
      conversationId: conversation.id,
      isDeleted: false,
      senderId: { [Op.ne]: userId },
      ...(me?.lastReadAt ? { createdAt: { [Op.gt]: me.lastReadAt } } : {})
    }
  });
  return {
    ...json,
    unreadCount: unread,
    myRole: me?.role || 'member',
    isMuted: me?.isMuted || false,
    lastReadAt: me?.lastReadAt || null,
    // For DMs expose the partner as the display identity
    title: json.type === 'group' ? (json.name || 'Group chat') : (others[0]?.user?.name || 'Direct message'),
    partner: json.type === 'direct' ? (others[0]?.user || null) : null
  };
};

// List my conversations
router.get('/', protect, async (req, res) => {
  try {
    const ids = await getMyConversationIds(req.user.id);
    if (ids.length === 0) {
      return res.json({ success: true, data: { conversations: [] } });
    }

    const conversations = await Conversation.findAll({
      where: { id: { [Op.in]: ids } },
      include: [memberInclude()],
      order: [['lastMessageAt', 'DESC']],
      limit: 100
    });

    const contacts = await contactIdsOf(req.user.id);
    const hydrated = await Promise.all(conversations.map(c => hydrateConversation(c, req.user.id, contacts)));
    res.json({ success: true, data: { conversations: hydrated } });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ success: false, message: 'Error fetching conversations', error: error.message });
  }
});

// Start (or fetch existing) direct conversation, or create a group chat
router.post('/', protect, async (req, res) => {
  try {
    const { type = 'direct', userId, userIds = [], name, teamId } = req.body;

    if (type === 'direct') {
      if (!userId || userId === req.user.id) {
        return res.status(400).json({ success: false, message: 'A valid userId is required' });
      }

      const partner = await User.findByPk(userId);
      if (!partner) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Reuse an existing direct conversation between the two users
      const myIds = await getMyConversationIds(req.user.id);
      if (myIds.length > 0) {
        const directConvs = await Conversation.findAll({
          where: { id: { [Op.in]: myIds }, type: 'direct' },
          include: [memberInclude()]
        });
        const existing = directConvs.find(c =>
          c.members.length === 2 && c.members.some(m => m.userId === userId)
        );
        if (existing) {
          return res.json({ success: true, data: { conversation: await hydrateConversation(existing, req.user.id) } });
        }
      }

      const conversation = await Conversation.create({
        type: 'direct',
        createdById: req.user.id,
        teamId: teamId || null,
        lastMessageAt: new Date()
      });
      await ConversationMember.bulkCreate([
        { conversationId: conversation.id, userId: req.user.id, role: 'member', lastReadAt: new Date() },
        { conversationId: conversation.id, userId, role: 'member' }
      ]);

      logAudit({ actor: req.user, action: 'conversation.create', entityType: 'Conversation', entityId: conversation.id, metadata: { kind: 'direct', with: userId }, req });

      const full = await Conversation.findByPk(conversation.id, { include: [memberInclude()] });
      const io = req.app.get('io');
      io.to(`user:${userId}`).emit('conversation:new', { conversationId: conversation.id });

      return res.status(201).json({ success: true, data: { conversation: await hydrateConversation(full, req.user.id) } });
    }

    // Group chat
    const uniqueIds = [...new Set(userIds.filter(id => id && id !== req.user.id))];
    if (uniqueIds.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one other member is required' });
    }

    const validUsers = await User.findAll({ where: { id: { [Op.in]: uniqueIds } }, attributes: ['id'] });
    if (validUsers.length !== uniqueIds.length) {
      return res.status(400).json({ success: false, message: 'One or more members were not found' });
    }

    const conversation = await Conversation.create({
      type: 'group',
      name: (name || '').trim() || 'Group chat',
      createdById: req.user.id,
      teamId: teamId || null,
      lastMessageAt: new Date()
    });
    await ConversationMember.bulkCreate([
      { conversationId: conversation.id, userId: req.user.id, role: 'owner', lastReadAt: new Date() },
      ...uniqueIds.map(id => ({ conversationId: conversation.id, userId: id, role: 'member' }))
    ]);

    await Message.create({
      conversationId: conversation.id,
      senderId: req.user.id,
      content: `${req.user.name} created the group "${conversation.name}"`,
      type: 'system'
    });

    const notifications = uniqueIds.map(id => Notification.create({
      recipientId: id,
      type: 'group_added',
      title: 'Added to a group chat',
      message: `${req.user.name} added you to "${conversation.name}"`,
      data: { conversationId: conversation.id, link: `/chat/${conversation.id}` },
      priority: 'normal'
    }));
    await Promise.all(notifications);

    const io = req.app.get('io');
    uniqueIds.forEach(id => io.to(`user:${id}`).emit('conversation:new', { conversationId: conversation.id }));

    logAudit({ actor: req.user, action: 'conversation.create', entityType: 'Conversation', entityId: conversation.id, metadata: { kind: 'group', name: conversation.name, members: uniqueIds.length + 1 }, req });

    const full = await Conversation.findByPk(conversation.id, { include: [memberInclude()] });
    res.status(201).json({ success: true, data: { conversation: await hydrateConversation(full, req.user.id) } });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ success: false, message: 'Error creating conversation', error: error.message });
  }
});

// People I can chat with: users sharing a team with me
router.get('/people/contacts', protect, async (req, res) => {
  try {
    const contactIds = new Set();
    (await myTeams(req.user.id)).forEach(team => {
      (team.members || []).forEach(m => {
        const id = m.userId || m.id;
        if (id && id !== req.user.id) contactIds.add(id);
      });
    });

    if (contactIds.size === 0) {
      return res.json({ success: true, data: { contacts: [] } });
    }

    const contacts = await User.findAll({
      where: { id: { [Op.in]: [...contactIds] } },
      attributes: USER_ATTRS,
      order: [['name', 'ASC']]
    });

    res.json({ success: true, data: { contacts: contacts.map(u => u.toJSON()) } });
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ success: false, message: 'Error fetching contacts', error: error.message });
  }
});

// Anyone on the platform, by name. "Contacts" (teammates and people I already chat with) come first.
// Only contacts' addresses are shown in full; others are masked so the search can't harvest emails.

router.get('/people/search', protect, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.json({ success: true, data: { people: [] } });

    const contactIds = await contactIdsOf(req.user.id);

    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const matches = { isActive: true, id: { [Op.ne]: req.user.id }, [Op.or]: [{ name: { [Op.like]: like } }, { email: q.toLowerCase() }] };
    const find = (where) => User.findAll({ where, attributes: ['id', 'name', 'email', 'avatar'], order: [['name', 'ASC']], limit: 8 });
    const known = contactIds.size ? await find({ [Op.and]: [matches, { id: [...contactIds] }] }) : [];
    const others = known.length < 8 ? await find(matches) : [];

    const people = [...known, ...others.filter(u => !contactIds.has(u.id))].slice(0, 8).map(u => {
      const isContact = contactIds.has(u.id);
      return { id: u.id, name: u.name, avatar: u.avatar, email: isContact ? u.email : maskEmail(u.email), isContact };
    });
    res.json({ success: true, data: { people } });
  } catch (error) {
    console.error('People search error:', error);
    res.status(500).json({ success: false, message: 'Error searching people' });
  }
});

// Conversation detail (members)
router.get('/:conversationId', protect, async (req, res) => {
  try {
    if (!(await isMember(req.params.conversationId, req.user.id))) {
      return res.status(403).json({ success: false, message: 'Not a member of this conversation' });
    }
    const conversation = await Conversation.findByPk(req.params.conversationId, { include: [memberInclude()] });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }
    res.json({ success: true, data: { conversation: await hydrateConversation(conversation, req.user.id) } });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ success: false, message: 'Error fetching conversation', error: error.message });
  }
});

// Messages of a conversation
router.get('/:conversationId/messages', protect, async (req, res) => {
  try {
    if (!(await isMember(req.params.conversationId, req.user.id))) {
      return res.status(403).json({ success: false, message: 'Not a member of this conversation' });
    }

    const { limit = 50, before, cursor } = req.query;
    const whereClause = {
      conversationId: req.params.conversationId,
      isDeleted: false,
      // Only root messages; threads are fetched on demand
      threadRootId: null
    };
    // ?cursor= (keyset, tie-safe) is preferred; ?before=<ISO> keeps working for existing clients.
    if (cursor !== undefined) {
      const { rows, nextCursor } = await pageNewestFirst({
        cursor: cursor === 'start' ? null : cursor,
        limit: clampLimit(limit),
        query: (extra, n) => Message.findAll({
          where: extra ? { [Op.and]: [whereClause, extra] } : whereClause,
          include: [{ model: User, as: 'sender', attributes: SENDER_ATTRS }],
          order: ORDER_NEWEST_FIRST,
          limit: n,
        }),
      });
      rows.reverse();
      return res.json({ success: true, data: { messages: rows.map(m => m.toJSON()), nextCursor } });
    }

    if (before) whereClause.createdAt = { [Op.lt]: new Date(before) };

    const messages = await Message.findAll({
      where: whereClause,
      include: [{ model: User, as: 'sender', attributes: SENDER_ATTRS }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });
    messages.reverse();

    res.json({ success: true, data: { messages: messages.map(m => m.toJSON()) } });
  } catch (error) {
    console.error('Get conversation messages error:', error);
    res.status(500).json({ success: false, message: 'Error fetching messages', error: error.message });
  }
});

// Send a message to a conversation
router.post('/:conversationId/messages', protect, requirePermission('chat.send'), async (req, res) => {
  try {
    const membership = await isMember(req.params.conversationId, req.user.id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not a member of this conversation' });
    }

    const conversation = await Conversation.findByPk(req.params.conversationId, { include: [memberInclude()] });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const { content, type = 'text', fileUrl, replyToId } = req.body;
    let { fileName, fileType, fileSize } = req.body;
    const mentions = Array.isArray(req.body.mentions) ? req.body.mentions.filter((id) => (conversation.members || []).some((m) => m.userId === id)) : [];
    // "system" notices are written by the server only
    if (!['text', 'file', 'meeting_link'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Unknown message type' });
    }
    if (replyToId && !(await Message.findOne({ where: { id: replyToId, conversationId: conversation.id }, attributes: ['id'] }))) {
      return res.status(400).json({ success: false, message: 'That message is not part of this conversation' });
    }
    // An attachment must be a file this person uploaded: never a URL of their choosing
    if (type === 'file' || fileUrl) {
      const file = typeof fileUrl === 'string' ? await FileEntry.findOne({ where: { url: fileUrl, ownerId: req.user.id, isDeleted: false } }) : null;
      if (!file) return res.status(400).json({ success: false, message: 'Attach a file you have uploaded' });
      fileName = file.originalName;
      fileType = file.mimeType;
      fileSize = file.size;
    }
    if ((!content || content.trim() === '') && type !== 'file') {
      return res.status(400).json({ success: false, message: 'Message content is required' });
    }

    const message = await Message.create({
      conversationId: conversation.id,
      teamId: conversation.teamId || null,
      senderId: req.user.id,
      content: (content || '').trim() || (fileName || 'Attachment'),
      type,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      fileType: fileType || null,
      fileSize: fileSize || null,
      replyToId: replyToId || null,
      mentions
    });

    await conversation.update({
      lastMessageAt: new Date(),
      lastMessagePreview: (content || fileName || '').slice(0, 190)
    });

    await membership.update({ lastReadAt: new Date() });

    const fullMessage = await Message.findByPk(message.id, {
      include: [{ model: User, as: 'sender', attributes: SENDER_ATTRS }]
    });

    const io = req.app.get('io');
    io.to(`conversation:${conversation.id}`).emit('conversation:message', fullMessage.toJSON());

    // Notify members who are not in the room right now
    const others = (conversation.members || []).filter(m => m.userId !== req.user.id);
    for (const member of others) {
      io.to(`user:${member.userId}`).emit('conversation:activity', {
        conversationId: conversation.id,
        lastMessagePreview: conversation.lastMessagePreview,
        lastMessageAt: conversation.lastMessageAt,
        senderId: req.user.id
      });
    }

    // Notifications: always for DMs, only for mentions in groups
    const shouldNotify = conversation.type === 'direct' || mentions.length > 0;
    if (shouldNotify) {
      const targets = conversation.type === 'direct'
        ? others.filter(m => !m.isMuted).map(m => m.userId)
        : mentions.filter(id => id !== req.user.id);
      const uniqueTargets = [...new Set(targets)];
      await Promise.all(uniqueTargets.map(userId => Notification.create({
        recipientId: userId,
        type: conversation.type === 'direct' ? 'dm_message' : 'mention',
        title: conversation.type === 'direct' ? `New message from ${req.user.name}` : `Mentioned in ${conversation.name}`,
        message: ((content || '').trim() || 'Sent an attachment').slice(0, 200),
        data: { conversationId: conversation.id, messageId: message.id, senderId: req.user.id, link: `/chat/${conversation.id}` },
        priority: conversation.type === 'direct' ? 'high' : 'normal'
      })));
    }

    logAudit({ actor: req.user, action: 'message.send', entityType: 'Message', entityId: message.id, metadata: { conversationId: conversation.id, type }, req });

    res.status(201).json({ success: true, data: { message: fullMessage.toJSON() } });
  } catch (error) {
    console.error('Send conversation message error:', error);
    res.status(500).json({ success: false, message: 'Error sending message', error: error.message });
  }
});

// Mark conversation as read
router.put('/:conversationId/read', protect, async (req, res) => {
  try {
    const membership = await isMember(req.params.conversationId, req.user.id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not a member of this conversation' });
    }
    await membership.update({ lastReadAt: new Date() });
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: 'Error marking conversation read', error: error.message });
  }
});

// Toggle mute
router.put('/:conversationId/mute', protect, async (req, res) => {
  try {
    const membership = await isMember(req.params.conversationId, req.user.id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not a member of this conversation' });
    }
    await membership.update({ isMuted: !membership.isMuted });
    res.json({ success: true, data: { isMuted: membership.isMuted } });
  } catch (error) {
    console.error('Toggle mute error:', error);
    res.status(500).json({ success: false, message: 'Error updating mute', error: error.message });
  }
});

// Add members to a group
router.post('/:conversationId/members', protect, async (req, res) => {
  try {
    const conversation = await Conversation.findByPk(req.params.conversationId);
    if (!conversation || conversation.type !== 'group') {
      return res.status(404).json({ success: false, message: 'Group conversation not found' });
    }
    const me = await ConversationMember.findOne({ where: { conversationId: conversation.id, userId: req.user.id } });
    if (!me || (me.role !== 'owner' && conversation.createdById !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Only the group owner can add members' });
    }

    const { userIds = [] } = req.body;
    const existing = await ConversationMember.findAll({ where: { conversationId: conversation.id } });
    const existingIds = existing.map(m => m.userId);
    const toAdd = userIds.filter(id => !existingIds.includes(id));
    if (toAdd.length === 0) {
      return res.json({ success: true, data: { added: 0 } });
    }

    await ConversationMember.bulkCreate(toAdd.map(id => ({ conversationId: conversation.id, userId: id, role: 'member' })));
    const io = req.app.get('io');
    toAdd.forEach(id => {
      io.to(`user:${id}`).emit('conversation:new', { conversationId: conversation.id });
      Notification.create({
        recipientId: id,
        type: 'group_added',
        title: 'Added to a group chat',
        message: `${req.user.name} added you to "${conversation.name}"`,
        data: { conversationId: conversation.id, link: `/chat/${conversation.id}` },
        priority: 'normal'
      }).catch(() => {});
    });

    const full = await Conversation.findByPk(conversation.id, { include: [memberInclude()] });
    res.json({ success: true, data: { conversation: await hydrateConversation(full, req.user.id) } });
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ success: false, message: 'Error adding members', error: error.message });
  }
});

// Leave group / remove member
router.delete('/:conversationId/members/:userId', protect, async (req, res) => {
  try {
    const conversation = await Conversation.findByPk(req.params.conversationId);
    if (!conversation || conversation.type !== 'group') {
      return res.status(404).json({ success: false, message: 'Group conversation not found' });
    }
    const isSelf = req.params.userId === req.user.id;
    const isOwner = conversation.createdById === req.user.id;
    if (!isSelf && !isOwner) {
      return res.status(403).json({ success: false, message: 'You can only remove yourself' });
    }
    if (isOwner && isSelf) {
      return res.status(400).json({ success: false, message: 'Owner cannot leave; delete the group instead' });
    }
    await ConversationMember.destroy({ where: { conversationId: conversation.id, userId: req.params.userId } });
    removeFromRoom(req.app.get('io'), req.params.userId, `conversation:${conversation.id}`);
    const io = req.app.get('io');
    io.to(`conversation:${conversation.id}`).emit('conversation:member-removed', { userId: req.params.userId });
    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ success: false, message: 'Error removing member', error: error.message });
  }
});

export default router;
