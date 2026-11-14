import Role from '../models/Role.js';

export const PERMISSIONS = {
  'meetings.create': 'Create / schedule meetings',
  'meetings.join': 'Join meetings',
  'meetings.record': 'Record meetings',
  'meetings.transcribe': 'Use transcription',
  'teams.create': 'Create teams',
  'chat.send': 'Send messages',
  'files.upload': 'Upload files',
  'tasks.create': 'Create tasks',
  'ai.use': 'Use AI features'
};
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

export const ADMIN_PERMISSIONS = {
  'admin.overview': 'View overview & analytics',
  'admin.users.view': 'View users',
  'admin.users.manage': 'Create / suspend users & assign user roles',
  'admin.meetings.view': 'View meeting history',
  'admin.history.view': 'View activity history',
  'admin.roles.manage': 'Create & edit roles',
  'admin.admins.manage': 'Create & manage admin accounts'
};
export const ALL_ADMIN_PERMISSIONS = Object.keys(ADMIN_PERMISSIONS);

export const SYSTEM_ADMIN_ROLES = [
  { name: 'Manager', scope: 'admin', description: 'Runs day-to-day operations: users, meetings and history',
    permissions: ['admin.overview', 'admin.users.view', 'admin.users.manage', 'admin.meetings.view', 'admin.history.view'], isSystem: true, isDefault: false },
  { name: 'Viewer', scope: 'admin', description: 'Read-only access to the console',
    permissions: ['admin.overview', 'admin.users.view', 'admin.meetings.view', 'admin.history.view'], isSystem: true, isDefault: true }
];

export async function getAdminPermissions(admin) {
  if (admin?.role === 'superadmin') return ALL_ADMIN_PERMISSIONS;
  let role = admin?.roleId ? await Role.findByPk(admin.roleId) : null;
  if (!role) role = await Role.findOne({ where: { scope: 'admin', isDefault: true } });
  return role ? role.permissions || [] : [];
}

export const SYSTEM_ROLES = [
  { name: 'Member', description: 'Standard access to everything', permissions: ALL_PERMISSIONS, isSystem: true, isDefault: true },
  { name: 'Guest', description: 'Can only join meetings', permissions: ['meetings.join'], isSystem: true, isDefault: false }
];

export async function ensureSystemRoles() {
  for (const r of [...SYSTEM_ROLES, ...SYSTEM_ADMIN_ROLES]) {
    await Role.findOrCreate({ where: { name: r.name }, defaults: r });
  }
}

export async function getPermissions(user) {
  let role = user?.roleId ? await Role.findByPk(user.roleId) : null;
  if (!role) role = await Role.findOne({ where: { isDefault: true, scope: 'user' } });
  // If roles were never seeded, don't lock everyone out.
  return role ? role.permissions || [] : ALL_PERMISSIONS;
}

export const requirePermission = (permission) => async (req, res, next) => {
  try {
    const perms = await getPermissions(req.user);
    if (!perms.includes(permission)) {
      return res.status(403).json({ success: false, message: `Your role does not allow: ${PERMISSIONS[permission] || permission}` });
    }
    next();
  } catch (e) {
    next(e);
  }
};
