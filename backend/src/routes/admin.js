import express from 'express';
import { Op, fn, col, literal } from 'sequelize';
import User from '../models/User.js';
import Team from '../models/Team.js';
import Meeting from '../models/Meeting.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Task from '../models/Task.js';
import FileEntry from '../models/FileEntry.js';
import AuditLog from '../models/AuditLog.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

router.use(protect);
router.use(requireAdmin);

// Platform overview
router.get('/overview', async (req, res) => {
  try {
    const [
      totalUsers, onlineUsers, totalTeams, totalMeetings, activeMeetings,
      totalMessages, totalConversations, totalTasks, openTasks
    ] = await Promise.all([
      User.count(),
      User.count({ where: { isOnline: true } }),
      Team.count({ where: { isActive: true } }),
      Meeting.count(),
      Meeting.count({ where: { status: 'active' } }),
      Message.count({ where: { isDeleted: false } }),
      Conversation.count(),
      Task.count(),
      Task.count({ where: { status: { [Op.ne]: 'done' } } })
    ]);

    const storage = await FileEntry.findAll({
      where: { isDeleted: false },
      attributes: [[fn('COALESCE', fn('SUM', col('size')), 0), 'bytes']],
      raw: true
    });
    const totalFiles = await FileEntry.count({ where: { isDeleted: false } });

    const recentUsers = await User.findAll({
      attributes: ['id', 'name', 'email', 'avatar', 'role', 'isOnline', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 8
    });

    const recentAudit = await AuditLog.findAll({ order: [['createdAt', 'DESC']], limit: 20 });

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, online: onlineUsers },
        teams: totalTeams,
        meetings: { total: totalMeetings, active: activeMeetings },
        messages: totalMessages,
        conversations: totalConversations,
        tasks: { total: totalTasks, open: openTasks },
        files: { count: totalFiles, storageBytes: Number(storage[0]?.bytes || 0) },
        recentUsers: recentUsers.map(u => u.toJSON()),
        recentAudit: recentAudit.map(a => a.toJSON())
      }
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ success: false, message: 'Error fetching overview', error: error.message });
  }
});

// Daily activity analytics (last N days)
router.get('/analytics', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 14, 60);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const dailyCount = (model, extraWhere = {}) => model.findAll({
      where: { createdAt: { [Op.gte]: since }, ...extraWhere },
      attributes: [
        [fn('DATE', col('createdAt')), 'day'],
        [fn('COUNT', col('id')), 'count']
      ],
      group: [literal('DATE(`' + model.getTableName() + '`.`createdAt`)')],
      order: [[literal('day'), 'ASC']],
      raw: true
    });

    const [meetingsPerDay, messagesPerDay, signupsPerDay] = await Promise.all([
      dailyCount(Meeting),
      dailyCount(Message, { isDeleted: false }),
      dailyCount(User)
    ]);

    // Top teams by message volume
    const topTeams = await Message.findAll({
      where: { teamId: { [Op.ne]: null }, isDeleted: false },
      attributes: [
        ['teamId', 'teamId'],
        [fn('COUNT', col('Message.id')), 'messageCount']
      ],
      group: [col('Message.teamId')],
      order: [[literal('messageCount'), 'DESC']],
      limit: 5,
      raw: true
    });
    const teamIds = topTeams.map(t => t.teamId).filter(Boolean);
    const teams = teamIds.length > 0
      ? await Team.findAll({ where: { id: { [Op.in]: teamIds } }, attributes: ['id', 'name'] })
      : [];
    const teamMap = Object.fromEntries(teams.map(t => [t.id, t.name]));

    res.json({
      success: true,
      data: {
        meetingsPerDay,
        messagesPerDay,
        signupsPerDay,
        topTeams: topTeams.map(t => ({ teamId: t.teamId, teamName: teamMap[t.teamId] || 'Unknown', messageCount: Number(t.messageCount) }))
      }
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({ success: false, message: 'Error fetching analytics', error: error.message });
  }
});

// User management list
router.get('/users', async (req, res) => {
  try {
    const { search, page = 1, limit = 25 } = req.query;
    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: ['id', 'name', 'email', 'avatar', 'role', 'isOnline', 'lastSeen', 'title', 'department', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({ success: true, data: { users: rows.map(u => u.toJSON()), total: count, page: parseInt(page) } });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
  }
});

// Audit logs
router.get('/audit-logs', async (req, res) => {
  try {
    const { action, entityType, page = 1, limit = 50 } = req.query;
    const where = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(parseInt(limit), 200),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({ success: true, data: { logs: rows.map(l => l.toJSON()), total: count, page: parseInt(page) } });
  } catch (error) {
    console.error('Admin audit logs error:', error);
    res.status(500).json({ success: false, message: 'Error fetching audit logs', error: error.message });
  }
});

export default router;
