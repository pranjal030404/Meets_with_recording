import express from 'express';
import { Op, fn, col, where as seqWhere, cast } from 'sequelize';
import Message from '../models/Message.js';
import Meeting from '../models/Meeting.js';
import Team from '../models/Team.js';
import Task from '../models/Task.js';
import FileEntry from '../models/FileEntry.js';
import User from '../models/User.js';
import ConversationMember from '../models/ConversationMember.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const getMyTeamIds = async (user) => {
  const teams = await Team.findAll({ where: { isActive: true } });
  return teams.filter(t => t.isMember(user.id)).map(t => t.id);
};

const getMyConversationIds = async (userId) => {
  const memberships = await ConversationMember.findAll({ where: { userId }, attributes: ['conversationId'] });
  return memberships.map(m => m.conversationId);
};

const getMyMeetingIds = async (userId) => {
  const meetings = await Meeting.findAll({
    where: {
      [Op.or]: [
        { hostId: userId },
        seqWhere(fn('JSON_CONTAINS', col('participantIds'), cast(JSON.stringify(userId), 'json')), 1),
        seqWhere(fn('JSON_CONTAINS', col('inviteeIds'), cast(JSON.stringify(userId), 'json')), 1)
      ]
    },
    attributes: ['id']
  });
  return meetings.map(m => m.id);
};

const getUsersInMyTeams = async (userId) => {
  const teams = await Team.findAll({ where: { isActive: true } });
  const ids = new Set();
  teams.filter(t => t.isMember(userId)).forEach(team => {
    (team.members || []).forEach(m => {
      const id = m.userId || m.id;
      if (id) ids.add(id);
    });
  });
  return [...ids];
};

const trim = (text, n = 140) => (text || '').slice(0, n);

// Global permission-aware search
router.get('/', protect, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const type = req.query.type || 'all';
    if (q.length < 2) {
      return res.status(400).json({ success: false, message: 'Query must be at least 2 characters' });
    }
    const like = `%${q}%`;
    const results = {};

    const want = (t) => type === 'all' || type === t;

    if (want('messages')) {
      const [teamIds, conversationIds, meetingIds] = await Promise.all([
        getMyTeamIds(req.user),
        getMyConversationIds(req.user.id),
        getMyMeetingIds(req.user.id)
      ]);

      const contexts = [];
      if (teamIds.length > 0) contexts.push({ teamId: { [Op.in]: teamIds } });
      if (conversationIds.length > 0) contexts.push({ conversationId: { [Op.in]: conversationIds } });
      if (meetingIds.length > 0) contexts.push({ meetingId: { [Op.in]: meetingIds } });

      if (contexts.length > 0) {
        const messages = await Message.findAll({
          where: {
            [Op.and]: [
              { [Op.or]: contexts },
              { [Op.or]: [{ content: { [Op.like]: like } }, { fileName: { [Op.like]: like } }] }
            ],
            isDeleted: false
          },
          include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }],
          order: [['createdAt', 'DESC']],
          limit: 30
        });
        results.messages = messages.map(m => {
          const j = m.toJSON();
          return {
            ...j,
            link: j.conversationId
              ? `/chat/${j.conversationId}`
              : j.teamId
                ? `/teams/${j.teamId}?channel=${j.channelType}`
                : j.meetingId ? `/history` : null
          };
        });
      } else {
        results.messages = [];
      }
    }

    if (want('teams')) {
      const myTeamIds = await getMyTeamIds(req.user);
      const teams = await Team.findAll({
        where: {
          id: { [Op.in]: myTeamIds },
          [Op.or]: [{ name: { [Op.like]: like } }, { description: { [Op.like]: like } }]
        },
        limit: 10
      });
      results.teams = teams.map(t => ({ id: t.id, name: t.name, description: t.description, link: `/teams/${t.id}` }));
    }

    if (want('meetings')) {
      const myMeetingIds = await getMyMeetingIds(req.user.id);
      if (myMeetingIds.length > 0) {
        const meetings = await Meeting.findAll({
          where: {
            id: { [Op.in]: myMeetingIds },
            [Op.or]: [{ title: { [Op.like]: like } }, { description: { [Op.like]: like } }]
          },
          include: [{ model: User, as: 'host', attributes: ['id', 'name', 'avatar'] }],
          order: [['createdAt', 'DESC']],
          limit: 10
        });
        results.meetings = meetings.map(m => ({
          id: m.id,
          roomId: m.roomId,
          title: m.title,
          status: m.status,
          scheduledAt: m.scheduledAt,
          recordingCount: (m.recordings || []).length,
          host: m.host,
          link: `/meeting/${m.roomId}`
        }));
      } else {
        results.meetings = [];
      }
    }

    if (want('people')) {
      const userIds = await getUsersInMyTeams(req.user.id);
      const users = userIds.length > 0
        ? await User.findAll({
            where: {
              id: { [Op.in]: userIds },
              [Op.or]: [{ name: { [Op.like]: like } }, { email: { [Op.like]: like } }]
            },
            attributes: ['id', 'name', 'email', 'avatar', 'customStatus', 'statusEmoji', 'isOnline', 'lastSeen'],
            limit: 10
          })
        : [];
      results.people = users.map(u => u.toJSON());
    }

    if (want('files')) {
      const [teamIds] = await Promise.all([getMyTeamIds(req.user)]);
      const contexts = [{ ownerId: req.user.id }];
      if (teamIds.length > 0) contexts.push({ teamId: { [Op.in]: teamIds } });
      const files = await FileEntry.findAll({
        where: {
          [Op.or]: contexts,
          isDeleted: false,
          originalName: { [Op.like]: like }
        },
        include: [{ model: User, as: 'owner', attributes: ['id', 'name', 'avatar'] }],
        order: [['createdAt', 'DESC']],
        limit: 15
      });
      results.files = files.map(f => f.toJSON());
    }

    if (want('tasks')) {
      const [teamIds] = await Promise.all([getMyTeamIds(req.user)]);
      const contexts = [{ assigneeId: req.user.id }, { createdById: req.user.id }];
      if (teamIds.length > 0) contexts.push({ teamId: { [Op.in]: teamIds } });
      const tasks = await Task.findAll({
        where: {
          [Op.and]: [
            { [Op.or]: contexts },
            { [Op.or]: [{ title: { [Op.like]: like } }, { description: { [Op.like]: like } }] }
          ]
        },
        include: [
          { model: User, as: 'assignee', attributes: ['id', 'name', 'avatar'] },
          { model: Team, as: 'team', attributes: ['id', 'name'] }
        ],
        order: [['createdAt', 'DESC']],
        limit: 15
      });
      results.tasks = tasks.map(t => t.toJSON());
    }

    res.json({ success: true, data: { query: q, results } });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, message: 'Error performing search', error: error.message });
  }
});

export default router;
