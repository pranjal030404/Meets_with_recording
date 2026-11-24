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
import Role from '../models/Role.js';
import { PERMISSIONS, ALL_PERMISSIONS, ADMIN_PERMISSIONS, ALL_ADMIN_PERMISSIONS, getAdminPermissions } from '../lib/permissions.js';
import { getSubscriptionDetails } from '../services/subscriptionService.js';
import logAudit from '../services/auditService.js';
import Admin from '../models/Admin.js';
import { getSetting, setSetting } from '../services/settingsService.js';
import { isSmtpConfigured, smtpSummary, verifySmtpConnection, sendTestEmail } from '../services/mailService.js';
import { handleAvatarUpload, saveAvatar, clearAvatar, pickProfileFields } from '../services/avatarService.js';
import { protectAdmin, generateAdminToken, requireAdminPermission as need } from '../middleware/adminAuth.js';

const router = express.Router();

// Admin authentication (separate Admins table, separate token type)
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }
    const admin = await Admin.findOne({
      where: { email: String(email).toLowerCase() },
      attributes: { include: ['password'] }
    });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    admin.lastLoginAt = new Date();
    await admin.save();
    res.json({ success: true, data: { admin: admin.toJSON(), permissions: await getAdminPermissions(admin), token: generateAdminToken(admin.id) } });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

router.use(protectAdmin);

router.get('/auth/me', async (req, res) => {
  res.json({ success: true, data: { admin: req.admin.toJSON(), permissions: await getAdminPermissions(req.admin) } });
});

// Platform overview
router.get('/overview', need('admin.overview'), async (req, res) => {
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
router.get('/analytics', need('admin.overview'), async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 14, 60);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const dailyCount = (model, extraWhere = {}) => model.findAll({
      where: { createdAt: { [Op.gte]: since }, ...extraWhere },
      attributes: [
        [fn('DATE', col('createdAt')), 'day'],
        [fn('COUNT', col('id')), 'count']
      ],
      group: [literal('day')],
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
router.get('/users', need('admin.users.view'), async (req, res) => {
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
      attributes: ['id', 'name', 'email', 'avatar', 'role', 'roleId', 'isActive', 'isOnline', 'lastSeen', 'title', 'department', 'phone', 'bio', 'location', 'createdAt'],
      include: [{ model: Role, as: 'customRole', attributes: ['id', 'name'] }],
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

const audit = (req, action, entityType, entityId, metadata) =>
  logAudit({ actor: req.admin, actorType: 'admin', action, entityType, entityId, metadata, req });

// ---------- Roles & permissions ----------
router.get('/permissions', (req, res) => {
  const toList = (o) => Object.entries(o).map(([key, label]) => ({ key, label }));
  res.json({ success: true, data: { permissions: toList(PERMISSIONS), adminPermissions: toList(ADMIN_PERMISSIONS) } });
});

router.get('/roles', async (req, res) => {
  try {
    const scope = req.query.scope === 'admin' ? 'admin' : 'user';
    const roles = await Role.findAll({ where: { scope }, order: [['isSystem', 'DESC'], ['name', 'ASC']] });
    const Holder = scope === 'admin' ? Admin : User;
    const counts = await Holder.findAll({
      attributes: ['roleId', [fn('COUNT', col('id')), 'n']], where: { roleId: { [Op.ne]: null } }, group: ['roleId'], raw: true
    });
    const countMap = Object.fromEntries(counts.map(c => [c.roleId, Number(c.n)]));
    const defaultRole = roles.find(r => r.isDefault);
    const unassigned = await Holder.count({ where: { roleId: null, ...(scope === 'admin' ? { role: 'admin' } : {}) } });
    res.json({
      success: true,
      data: {
        roles: roles.map(r => ({
          ...r.toJSON(),
          userCount: (countMap[r.id] || 0) + (defaultRole && r.id === defaultRole.id ? unassigned : 0)
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching roles', error: error.message });
  }
});

const cleanPermissions = (list, scope = 'user') => {
  const allowed = scope === 'admin' ? ALL_ADMIN_PERMISSIONS : ALL_PERMISSIONS;
  return Array.isArray(list) ? list.filter(p => allowed.includes(p)) : [];
};

router.post('/roles', need('admin.roles.manage'), async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const scope = req.body.scope === 'admin' ? 'admin' : 'user';
    if (!name || !String(name).trim()) return res.status(400).json({ success: false, message: 'Role name is required' });
    const exists = await Role.findOne({ where: { name: String(name).trim() } });
    if (exists) return res.status(400).json({ success: false, message: 'A role with this name already exists' });
    const role = await Role.create({ name: String(name).trim(), description, scope, permissions: cleanPermissions(permissions, scope) });
    audit(req, 'role.create', 'Role', role.id, { name: role.name, permissions: role.permissions });
    res.status(201).json({ success: true, data: { role } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error creating role', error: error.message });
  }
});

router.put('/roles/:id', need('admin.roles.manage'), async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    const { name, description, permissions } = req.body;
    if (name && !role.isSystem) role.name = String(name).trim();
    if (description !== undefined) role.description = description;
    if (permissions) role.permissions = cleanPermissions(permissions, role.scope);
    await role.save();
    audit(req, 'role.update', 'Role', role.id, { name: role.name, permissions: role.permissions });
    res.json({ success: true, data: { role } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating role', error: error.message });
  }
});

router.delete('/roles/:id', need('admin.roles.manage'), async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (role.isSystem) return res.status(400).json({ success: false, message: 'System roles cannot be deleted' });
    await (role.scope === 'admin' ? Admin : User).update({ roleId: null }, { where: { roleId: role.id } });
    await role.destroy();
    audit(req, 'role.delete', 'Role', role.id, { name: role.name });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting role', error: error.message });
  }
});

router.put('/users/:id/role', need('admin.users.manage'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const { roleId } = req.body;
    let role = null;
    if (roleId) {
      role = await Role.findByPk(roleId);
      if (!role) return res.status(400).json({ success: false, message: 'Role not found' });
    }
    const before = user.roleId;
    user.roleId = role ? role.id : null;
    await user.save();
    audit(req, 'user.role_change', 'User', user.id, { email: user.email, from: before, to: user.roleId, roleName: role?.name || 'default' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating user role', error: error.message });
  }
});

router.put('/users/:id/status', need('admin.users.manage'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = !!req.body.isActive;
    if (!user.isActive) user.isOnline = false;
    await user.save();
    audit(req, user.isActive ? 'user.reactivate' : 'user.suspend', 'User', user.id, { email: user.email });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating user status', error: error.message });
  }
});

// ---------- Edit any user's profile photo + personal details ----------
router.put('/users/:id/profile', need('admin.users.manage'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const fields = pickProfileFields(req.body);
    await user.update(fields);
    audit(req, 'user.profile_update', 'User', user.id, { email: user.email, fields: Object.keys(fields) });
    res.json({ success: true, data: { user: user.toJSON() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating profile', error: error.message });
  }
});

router.post('/users/:id/avatar', need('admin.users.manage'), handleAvatarUpload, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
    await saveAvatar(user, req.file);
    audit(req, 'user.avatar_update', 'User', user.id, { email: user.email });
    res.json({ success: true, data: { user: user.toJSON() } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Could not save photo' });
  }
});

router.delete('/users/:id/avatar', need('admin.users.manage'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    await clearAvatar(user);
    audit(req, 'user.avatar_remove', 'User', user.id, { email: user.email });
    res.json({ success: true, data: { user: user.toJSON() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not remove photo' });
  }
});

// ---------- Create users ----------
router.post('/users', need('admin.users.manage'), async (req, res) => {
  try {
    const { name, email, password, roleId } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    if (String(password).length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    if (await User.findOne({ where: { email: String(email).toLowerCase() } })) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists' });
    }
    if (roleId) {
      const role = await Role.findOne({ where: { id: roleId, scope: 'user' } });
      if (!role) return res.status(400).json({ success: false, message: 'Role not found' });
    }
    // Admin-created accounts are trusted, so no email verification is needed.
    const user = await User.create({ name, email: String(email).toLowerCase(), password, roleId: roleId || null, isEmailVerified: true });
    await getSubscriptionDetails(user.id);
    audit(req, 'user.create', 'User', user.id, { email: user.email, roleId: user.roleId });
    res.status(201).json({ success: true, data: { user: user.toJSON() } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.errors?.[0]?.message || 'Error creating user', error: error.message });
  }
});

// ---------- Platform settings (SMTP / email verification) ----------
router.get('/settings', need('admin.settings.manage'), async (req, res) => {
  try {
    res.json({ success: true, data: {
      emailVerificationEnabled: (await getSetting('emailVerificationEnabled')) === true,
      smtp: smtpSummary()
    } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error loading settings' });
  }
});

router.put('/settings', need('admin.settings.manage'), async (req, res) => {
  try {
    const { emailVerificationEnabled } = req.body;
    if (typeof emailVerificationEnabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'emailVerificationEnabled must be true or false' });
    }
    if (emailVerificationEnabled) {
      if (!isSmtpConfigured()) {
        return res.status(400).json({ success: false, message: 'SMTP is not configured. Add SMTP_HOST, SMTP_USER and SMTP_PASS to backend/.env and restart the backend.' });
      }
      try {
        await verifySmtpConnection();
      } catch (e) {
        return res.status(400).json({ success: false, message: `Cannot connect to the SMTP server: ${e.message}` });
      }
    }
    await setSetting('emailVerificationEnabled', emailVerificationEnabled);
    audit(req, 'settings.update', 'Setting', 'emailVerificationEnabled', { emailVerificationEnabled });
    res.json({ success: true, data: { emailVerificationEnabled, smtp: smtpSummary() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error saving settings', error: error.message });
  }
});

router.post('/settings/test-email', need('admin.settings.manage'), async (req, res) => {
  try {
    const to = String(req.body.to || req.admin.email || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) return res.status(400).json({ success: false, message: 'Enter a valid recipient email' });
    if (!isSmtpConfigured()) return res.status(400).json({ success: false, message: 'SMTP is not configured in backend/.env' });
    await sendTestEmail(to);
    audit(req, 'settings.test_email', 'Setting', 'smtp', { to });
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (error) {
    res.status(400).json({ success: false, message: `Send failed: ${error.message}` });
  }
});

// ---------- Admin accounts ----------
router.get('/admins', need('admin.admins.manage'), async (req, res) => {
  try {
    const admins = await Admin.findAll({
      order: [['createdAt', 'ASC']]
    });
    const roles = await Role.findAll({ where: { scope: 'admin' } });
    const roleMap = Object.fromEntries(roles.map(r => [r.id, r.name]));
    const def = roles.find(r => r.isDefault);
    res.json({
      success: true,
      data: {
        admins: admins.map(a => ({
          ...a.toJSON(),
          roleName: a.role === 'superadmin' ? 'Super Admin' : roleMap[a.roleId] || def?.name || '—'
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching admins', error: error.message });
  }
});

async function validateAdminRole(req, res, { role, roleId }) {
  if (role === 'superadmin' && req.admin.role !== 'superadmin') {
    res.status(403).json({ success: false, message: 'Only a super admin can grant super admin' });
    return false;
  }
  if (roleId && !(await Role.findOne({ where: { id: roleId, scope: 'admin' } }))) {
    res.status(400).json({ success: false, message: 'Admin role not found' });
    return false;
  }
  return true;
}

router.post('/admins', need('admin.admins.manage'), async (req, res) => {
  try {
    const { name, email, password, roleId } = req.body;
    const role = req.body.role === 'superadmin' ? 'superadmin' : 'admin';
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    if (String(password).length < 8) return res.status(400).json({ success: false, message: 'Admin password must be at least 8 characters' });
    if (await Admin.findOne({ where: { email: String(email).toLowerCase() } })) {
      return res.status(400).json({ success: false, message: 'An admin with this email already exists' });
    }
    if (!(await validateAdminRole(req, res, { role, roleId }))) return;
    const admin = await Admin.create({
      name, email: String(email).toLowerCase(), password, role, roleId: role === 'superadmin' ? null : roleId || null,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
    });
    audit(req, 'admin.create', 'Admin', admin.id, { email: admin.email, role, roleId: admin.roleId });
    res.status(201).json({ success: true, data: { admin: admin.toJSON() } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.errors?.[0]?.message || 'Error creating admin' });
  }
});

router.put('/admins/:id', need('admin.admins.manage'), async (req, res) => {
  try {
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    const { name, password, roleId } = req.body;
    const role = req.body.role === 'superadmin' ? 'superadmin' : req.body.role === 'admin' ? 'admin' : admin.role;
    if (admin.role === 'superadmin' && req.admin.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Only a super admin can modify a super admin' });
    }
    if (role !== admin.role || roleId) {
      if (!(await validateAdminRole(req, res, { role, roleId }))) return;
    }
    if (admin.role === 'superadmin' && role !== 'superadmin') {
      const supers = await Admin.count({ where: { role: 'superadmin' } });
      if (supers <= 1) return res.status(400).json({ success: false, message: 'Cannot demote the last super admin' });
    }
    if (name) admin.name = name;
    admin.role = role;
    if (roleId !== undefined) admin.roleId = role === 'superadmin' ? null : roleId || null;
    if (password) {
      if (String(password).length < 8) return res.status(400).json({ success: false, message: 'Admin password must be at least 8 characters' });
      admin.password = password;
    }
    await admin.save();
    audit(req, 'admin.update', 'Admin', admin.id, { email: admin.email, role, roleId: admin.roleId, passwordChanged: !!password });
    res.json({ success: true, data: { admin: admin.toJSON() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating admin', error: error.message });
  }
});

router.delete('/admins/:id', need('admin.admins.manage'), async (req, res) => {
  try {
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    if (admin.id === req.admin.id) return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    if (admin.role === 'superadmin') {
      if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false, message: 'Only a super admin can delete a super admin' });
      if ((await Admin.count({ where: { role: 'superadmin' } })) <= 1) return res.status(400).json({ success: false, message: 'Cannot delete the last super admin' });
    }
    await admin.destroy();
    audit(req, 'admin.delete', 'Admin', admin.id, { email: admin.email });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting admin', error: error.message });
  }
});

// ---------- Complete application history ----------
router.get('/audit-logs', need('admin.history.view'), async (req, res) => {
  try {
    const { action, entityType, actorType, method, search, userId, from, to, statusClass, page = 1, limit = 50 } = req.query;
    const where = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (actorType) where.actorType = actorType;
    if (method) where.method = method;
    if (userId) where.actorId = userId;
    if (statusClass) {
      const base = parseInt(statusClass) * 100;
      where.statusCode = { [Op.gte]: base, [Op.lt]: base + 100 };
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1);
    }
    if (search) {
      where[Op.or] = [
        { actorName: { [Op.like]: `%${search}%` } },
        { path: { [Op.like]: `%${search}%` } },
        { action: { [Op.like]: `%${search}%` } },
        { entityId: { [Op.like]: `%${search}%` } }
      ];
    }
    const lim = Math.min(parseInt(limit) || 50, 200);
    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: lim,
      offset: (parseInt(page) - 1) * lim
    });
    res.json({ success: true, data: { logs: rows.map(l => l.toJSON()), total: count, page: parseInt(page) } });
  } catch (error) {
    console.error('Admin audit logs error:', error);
    res.status(500).json({ success: false, message: 'Error fetching audit logs', error: error.message });
  }
});

// Meeting history
router.get('/meetings', need('admin.meetings.view'), async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) where[Op.or] = [{ title: { [Op.like]: `%${search}%` } }, { roomId: { [Op.like]: `%${search}%` } }];
    const lim = Math.min(parseInt(limit) || 20, 100);
    const { rows, count } = await Meeting.findAndCountAll({
      where,
      attributes: ['id', 'roomId', 'title', 'status', 'hostId', 'scheduledAt', 'startedAt', 'endedAt', 'createdAt'],
      include: [{ model: User, as: 'host', attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: lim,
      offset: (parseInt(page) - 1) * lim
    });
    res.json({ success: true, data: { meetings: rows.map(m => m.toJSON()), total: count, page: parseInt(page) } });
  } catch (error) {
    console.error('Admin meetings error:', error);
    res.status(500).json({ success: false, message: 'Error fetching meetings', error: error.message });
  }
});

export default router;
