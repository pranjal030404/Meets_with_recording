import express from 'express';
import { Op } from 'sequelize';
import Task from '../models/Task.js';
import Team from '../models/Team.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';
import logAudit from '../services/auditService.js';
import { Sequelize } from 'sequelize';

const router = express.Router();

const taskInclude = () => ([
  { model: User, as: 'assignee', attributes: ['id', 'name', 'email', 'avatar'] },
  { model: User, as: 'creator', attributes: ['id', 'name', 'email', 'avatar'] },
  { model: Team, as: 'team', attributes: ['id', 'name'] },
  { model: Task, as: 'parent', attributes: ['id', 'title'] }
]);

const visibleTo = async (task, user) => {
  if (task.assigneeId === user.id || task.createdById === user.id) return true;
  if (task.teamId) {
    const team = await Team.findByPk(task.teamId);
    return !!team && team.isMember(user.id);
  }
  return false;
};

const canManage = async (task, user) => {
  if (task.createdById === user.id || task.assigneeId === user.id) return true;
  if (task.teamId) {
    const team = await Team.findByPk(task.teamId);
    return !!team && team.isOwnerOrAdmin(user.id);
  }
  return false;
};

const notifyAssignee = async (task, actor, isNew) => {
  if (!task.assigneeId || task.assigneeId === actor.id) return;
  await Notification.create({
    recipientId: task.assigneeId,
    type: isNew ? 'task_assigned' : 'task_assigned',
    title: isNew ? `New task: ${task.title}` : `Task reassigned to you: ${task.title}`,
    message: `${actor.name} ${isNew ? 'assigned you a task' : 'reassigned a task to you'}`,
    data: { taskId: task.id, teamId: task.teamId, link: '/tasks' },
    priority: task.priority === 'urgent' ? 'urgent' : task.priority === 'high' ? 'high' : 'normal'
  });
};

// List tasks
router.get('/', protect, async (req, res) => {
  try {
    const { scope = 'mine', teamId, status, priority } = req.query;
    const where = { parentId: null };

    if (scope === 'team') {
      if (!teamId) return res.status(400).json({ success: false, message: 'teamId is required for team scope' });
      const team = await Team.findByPk(teamId);
      if (!team || !team.isMember(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Not a member of this team' });
      }
      where.teamId = teamId;
    } else {
      where[Op.or] = [{ assigneeId: req.user.id }, { createdById: req.user.id }];
    }

    if (status && status !== 'all') where.status = status;
    if (priority && priority !== 'all') where.priority = priority;

    const tasks = await Task.findAll({
      where,
      include: taskInclude(),
      order: [
        ['status', 'ASC'],
        [Sequelize.literal("CASE `Task`.`priority` WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"), 'ASC'],
        [Sequelize.literal('`Task`.`dueDate` IS NULL'), 'ASC'],
        ['dueDate', 'ASC'],
        ['createdAt', 'DESC']
      ],
      limit: 300
    });

    res.json({ success: true, data: { tasks: tasks.map(t => t.toJSON()) } });
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ success: false, message: 'Error fetching tasks', error: error.message });
  }
});

// Create task
router.post('/', protect, async (req, res) => {
  try {
    const { title, description, assigneeId, dueDate, priority = 'medium', teamId, messageId, meetingId, labels = [], parentId } = req.body;
    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Task title is required' });
    }

    if (teamId) {
      const team = await Team.findByPk(teamId);
      if (!team || !team.isMember(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Not a member of this team' });
      }
      if (assigneeId) {
        if (!team.isMember(assigneeId)) {
          return res.status(400).json({ success: false, message: 'Assignee is not a member of this team' });
        }
      }
    }

    if (parentId) {
      const parent = await Task.findByPk(parentId);
      if (!parent) return res.status(404).json({ success: false, message: 'Parent task not found' });
    }

    if (messageId) {
      const sourceMessage = await Message.findByPk(messageId);
      if (!sourceMessage) return res.status(404).json({ success: false, message: 'Source message not found' });
    }

    const task = await Task.create({
      title: title.trim(),
      description: description || null,
      assigneeId: assigneeId || req.user.id,
      createdById: req.user.id,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority,
      teamId: teamId || null,
      parentId: parentId || null,
      messageId: messageId || null,
      meetingId: meetingId || null,
      labels
    });

    await notifyAssignee(task, req.user, true);
    logAudit({ actor: req.user, action: 'task.create', entityType: 'Task', entityId: task.id, metadata: { title: task.title, teamId }, req });

    const full = await Task.findByPk(task.id, { include: taskInclude() });
    res.status(201).json({ success: true, data: { task: full.toJSON() } });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ success: false, message: 'Error creating task', error: error.message });
  }
});

// Task detail (with subtasks)
router.get('/:taskId', protect, async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.taskId, { include: taskInclude() });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (!(await visibleTo(task, req.user))) {
      return res.status(403).json({ success: false, message: 'No access to this task' });
    }

    const subtasks = await Task.findAll({
      where: { parentId: task.id },
      include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'avatar'] }],
      order: [['createdAt', 'ASC']]
    });

    res.json({ success: true, data: { task: task.toJSON(), subtasks: subtasks.map(t => t.toJSON()) } });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ success: false, message: 'Error fetching task', error: error.message });
  }
});

// Update task
router.put('/:taskId', protect, async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.taskId);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    if (!(await canManage(task, req.user))) {
      return res.status(403).json({ success: false, message: 'No permission to update this task' });
    }

    const { title, description, assigneeId, dueDate, priority, status, labels } = req.body;
    const prevAssignee = task.assigneeId;

    if (title !== undefined) task.title = title.trim();
    if (description !== undefined) task.description = description;
    if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority !== undefined) task.priority = priority;
    if (status !== undefined && ['todo', 'in_progress', 'done'].includes(status)) task.status = status;
    if (labels !== undefined) task.labels = labels;
    if (assigneeId !== undefined) {
      if (assigneeId === null || assigneeId === '') {
        task.assigneeId = null;
      } else {
        task.assigneeId = assigneeId;
      }
    }

    await task.save();

    if (task.assigneeId && task.assigneeId !== prevAssignee) {
      await notifyAssignee(task, req.user, true);
    }

    logAudit({ actor: req.user, action: 'task.update', entityType: 'Task', entityId: task.id, metadata: { status: task.status, priority: task.priority }, req });

    const full = await Task.findByPk(task.id, { include: taskInclude() });
    res.json({ success: true, data: { task: full.toJSON() } });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ success: false, message: 'Error updating task', error: error.message });
  }
});

// Delete task
router.delete('/:taskId', protect, async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.taskId);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const isTeamAdmin = task.teamId
      ? (await Team.findByPk(task.teamId))?.isOwnerOrAdmin(req.user.id)
      : false;
    if (task.createdById !== req.user.id && !isTeamAdmin) {
      return res.status(403).json({ success: false, message: 'Only the creator or a team admin can delete this task' });
    }

    await Task.destroy({ where: { parentId: task.id } });
    await task.destroy();

    logAudit({ actor: req.user, action: 'task.delete', entityType: 'Task', entityId: req.params.taskId, req });
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ success: false, message: 'Error deleting task', error: error.message });
  }
});

// Subtasks
router.post('/:taskId/subtasks', protect, async (req, res) => {
  try {
    const parent = await Task.findByPk(req.params.taskId);
    if (!parent) return res.status(404).json({ success: false, message: 'Parent task not found' });
    if (!(await visibleTo(parent, req.user))) {
      return res.status(403).json({ success: false, message: 'No access to this task' });
    }

    const { title } = req.body;
    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Subtask title is required' });
    }

    const subtask = await Task.create({
      title: title.trim(),
      createdById: req.user.id,
      assigneeId: req.user.id,
      parentId: parent.id,
      teamId: parent.teamId
    });

    const full = await Task.findByPk(subtask.id, { include: [{ model: User, as: 'assignee', attributes: ['id', 'name', 'avatar'] }] });
    res.status(201).json({ success: true, data: { subtask: full.toJSON() } });
  } catch (error) {
    console.error('Create subtask error:', error);
    res.status(500).json({ success: false, message: 'Error creating subtask', error: error.message });
  }
});

// Summary stats for my tasks
router.get('/stats/summary', protect, async (req, res) => {
  try {
    const mine = { [Op.or]: [{ assigneeId: req.user.id }, { createdById: req.user.id }] };
    const [todo, inProgress, done, overdue] = await Promise.all([
      Task.count({ where: { ...mine, status: 'todo', parentId: null } }),
      Task.count({ where: { ...mine, status: 'in_progress', parentId: null } }),
      Task.count({ where: { ...mine, status: 'done', parentId: null } }),
      Task.count({
        where: {
          assigneeId: req.user.id,
          status: { [Op.ne]: 'done' },
          dueDate: { [Op.lt]: new Date() },
          parentId: null
        }
      })
    ]);

    res.json({ success: true, data: { todo, inProgress, done, overdue } });
  } catch (error) {
    console.error('Task stats error:', error);
    res.status(500).json({ success: false, message: 'Error fetching task stats', error: error.message });
  }
});

export default router;
