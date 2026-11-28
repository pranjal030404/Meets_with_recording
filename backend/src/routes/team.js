import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

import { requirePermission } from '../lib/permissions.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { isSmtpConfigured, sendTeamInviteEmail } from '../services/mailService.js';
import { updateLocked } from '../lib/locked.js';
import { removeFromRoom } from '../realtime/sessions.js';
import { assertWithin, withUserLock } from '../services/subscriptionService.js';
import { myTeams } from '../models/membership.js';

const router = express.Router();

router.use(protect);

const addTeamMember = async (team, user, role) => {
  await updateLocked(Team, team.id, (row) => {
    if ((row.members || []).some((m) => m.userId === user.id)) return false;
    row.members = [...(row.members || []), {
      id: uuidv4(),
      userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
      role,
      joinedAt: new Date().toISOString(),
      notifications: { meetings: true, chat: true, mentions: true }
    }];
  });
  await team.reload();
};

router.post('/', requirePermission('teams.create'), async (req, res) => {
  try {
    const { name, description, settings } = req.body;
    if (typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ message: 'Team name needs at least 2 characters' });
    }

    const { team, refused } = await withUserLock(req.user.id, async () => {
    const owned = await Team.count({ where: { ownerId: req.user.id, isActive: true } });
    const quota = await assertWithin(req.user.id, 'maxTeams', owned, 1, 'teams');
    if (!quota.allowed) return { refused: quota.reason };
    return { team: await Team.create({
      name,
      description,
      ownerId: req.user.id,
      settings,
      members: [{
        id: uuidv4(),
        userId: req.user.id,
        user: { id: req.user.id, name: req.user.name, email: req.user.email, avatar: req.user.avatar },
        role: 'owner',
        joinedAt: new Date().toISOString(),
        notifications: { meetings: true, chat: true, mentions: true }
      }],
      channels: [
        { id: uuidv4(), name: 'general', type: 'general', description: 'General team discussions' },
        { id: uuidv4(), name: 'meetings', type: 'meetings', description: 'Meeting links and schedules' },
        { id: uuidv4(), name: 'announcements', type: 'announcements', description: 'Important team announcements' }
      ]
    }) };
    });
    if (refused) return res.status(403).json({ message: refused, code: 'PLAN_LIMIT_REACHED' });

    res.status(201).json(team.toJSON());
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ message: 'Failed to create team', error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const userTeams = await myTeams(req.user.id);

    const usersMap = {};
    const ownerIds = [...new Set(userTeams.map(t => t.ownerId))];
    const owners = await User.findAll({
      where: { id: ownerIds },
      attributes: ['id', 'name', 'email', 'avatar']
    });
    owners.forEach(u => { usersMap[u.id] = u; });

    const result = userTeams.map(t => {
      const json = t.toJSON();
      json.owner = usersMap[t.ownerId] || { id: t.ownerId };
      return json;
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ message: 'Failed to fetch teams', error: error.message });
  }
});

router.get('/:teamId', async (req, res) => {
  try {
    const team = await Team.findByPk(req.params.teamId);

    if (!team || !team.isActive) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isMember(req.user.id)) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }

    const result = team.toJSON();
    const owner = await User.findByPk(team.ownerId, {
      attributes: ['id', 'name', 'email', 'avatar']
    });
    result.owner = owner;
    const memberIds = (team.members || []).map(m => m.userId).filter(Boolean);
    const members = await User.findAll({
      where: { id: memberIds },
      attributes: ['id', 'name', 'email', 'avatar', 'isOnline', 'lastSeen']
    });
    const memberMap = {};
    members.forEach(m => { memberMap[m.id] = m; });
    result.members = (team.members || []).map(m => ({
      ...m,
      user: memberMap[m.userId] || { id: m.userId }
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ message: 'Failed to fetch team', error: error.message });
  }
});

router.put('/:teamId', async (req, res) => {
  try {
    const { name, description, settings } = req.body;
    const team = await Team.findByPk(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user.id)) {
      return res.status(403).json({ message: 'Only team owners and admins can update team' });
    }

    if (name) team.name = name;
    if (description !== undefined) team.description = description;
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      const next = { ...(team.settings || {}) };
      for (const key of ['allowMemberInvite', 'allowGuestJoin']) if (typeof settings[key] === 'boolean') next[key] = settings[key];
      if (settings.defaultMeetingSettings && typeof settings.defaultMeetingSettings === 'object') next.defaultMeetingSettings = settings.defaultMeetingSettings;
      team.settings = next;
    }

    await team.save();

    res.json(team.toJSON());
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ message: 'Failed to update team', error: error.message });
  }
});

router.delete('/:teamId', async (req, res) => {
  try {
    const team = await Team.findByPk(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (team.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Only team owner can delete team' });
    }

    team.isActive = false;
    await team.save();
    req.app.get('io')?.socketsLeave(`team:${team.id}`);

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ message: 'Failed to delete team', error: error.message });
  }
});

router.post('/:teamId/invite', async (req, res) => {
  try {
    const { role = 'member' } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();
    const team = await Team.findByPk(req.params.teamId);

    if (!team || !team.isActive) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const userRole = team.getMemberRole(req.user.id);
    if (!userRole || (!team.settings?.allowMemberInvite && !['owner', 'admin'].includes(userRole))) {
      return res.status(403).json({ message: 'You do not have permission to invite members' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' });
    }
    // Never hand out ownership through an invite; only admins/owners can invite admins
    if (!['member', 'admin', 'guest'].includes(role) || (role === 'admin' && !['owner', 'admin'].includes(userRole))) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const userToInvite = await User.findOne({ where: { email } });

    // Email notification: never blocks or fails the invite itself
    const sendInviteEmail = async (joined) => {
      if (!isSmtpConfigured()) return { emailed: false, emailError: 'Email is not configured on the server' };
      try {
        await sendTeamInviteEmail({
          to: email, inviterName: req.user.name, team, role, joined,
          inviteCode: team.inviteCode
        });
        return { emailed: true };
      } catch (err) {
        console.error('Team invite email failed:', err.message);
        return { emailed: false, emailError: 'Could not send the email' };
      }
    };

    // No account yet: email them a sign-up link + the team invite code
    if (!userToInvite) {
      const mail = await sendInviteEmail(false);
      if (!mail.emailed) {
        return res.status(404).json({ message: `No account exists for ${email}. ${mail.emailError}.` });
      }
      return res.json({ message: `Invitation emailed to ${email}`, pending: true, ...mail });
    }

    if (team.isMember(userToInvite.id)) {
      return res.status(400).json({ message: 'User is already a member of this team' });
    }

    await addTeamMember(team, userToInvite, role);

    await Notification.create({
      recipientId: userToInvite.id,
      type: 'team_member_added',
      title: 'Added to Team',
      message: `You have been added to the team "${team.name}"`,
      data: {
        teamId: team.id,
        senderId: req.user.id,
        link: `/teams/${team.id}`
      },
      priority: 'normal'
    });

    const mail = await sendInviteEmail(true);
    res.json({ message: 'Member added successfully', team: team.toJSON(), ...mail });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ message: 'Failed to invite member', error: error.message });
  }
});

// Wrong codes are counted per account, so codes cannot be tried one after another
const wrongCodes = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20, prefix: 'rl:invite', durable: true });

// one attempt at a time per account, so a burst cannot all pass the count before any failure is recorded
router.post('/join/:inviteCode', (req, res) => withUserLock(`invite:${req.user.id}`, async () => {
  try {
    if (await wrongCodes.count(req.user.id) >= 20) {
      return res.status(429).json({ message: 'Too many wrong invite codes. Try again in an hour.' });
    }
    const team = await Team.findOne({ where: { inviteCode: req.params.inviteCode, isActive: true } });

    if (!team) {
      await wrongCodes.hit(req.user.id);
      return res.status(404).json({ message: 'Invalid invite code' });
    }

    if (team.isMember(req.user.id)) {
      return res.status(400).json({ message: 'You are already a member of this team' });
    }

    const role = (team.settings && team.settings.allowGuestJoin) ? 'guest' : 'member';
    await addTeamMember(team, req.user, role);

    res.json({ message: 'Successfully joined team', team: team.toJSON() });
  } catch (error) {
    console.error('Error joining team:', error);
    res.status(500).json({ message: 'Failed to join team', error: error.message });
  }
}).catch((error) => res.status(500).json({ message: 'Failed to join team', error: error.message })));

router.put('/:teamId/members/:userId/role', async (req, res) => {
  try {
    const { role } = req.body;
    const team = await Team.findByPk(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user.id)) {
      return res.status(403).json({ message: 'Only owners and admins can update member roles' });
    }
    if (!['member', 'admin', 'guest'].includes(role)) {
      return res.status(400).json({ message: 'Role must be member, admin or guest' });
    }

    const members = team.members || [];
    const member = members.find(m => m.userId === req.params.userId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (member.role === 'owner') {
      return res.status(403).json({ message: 'Cannot change owner role' });
    }

    await updateLocked(Team, team.id, (row) => {
      for (const m of row.members || []) if (m.userId === req.params.userId && m.role !== 'owner') m.role = role;
    });
    await team.reload();

    res.json({ message: 'Member role updated successfully', team: team.toJSON() });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ message: 'Failed to update member role', error: error.message });
  }
});

router.delete('/:teamId/members/:userId', async (req, res) => {
  try {
    const team = await Team.findByPk(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const canRemove = team.isOwnerOrAdmin(req.user.id) || req.params.userId === req.user.id;

    if (!canRemove) {
      return res.status(403).json({ message: 'You do not have permission to remove this member' });
    }

    const members = team.members || [];
    const member = members.find(m => m.userId === req.params.userId);
    if (member && member.role === 'owner') {
      return res.status(403).json({ message: 'Cannot remove team owner' });
    }

    await updateLocked(Team, team.id, (row) => {
      row.members = (row.members || []).filter(m => m.userId !== req.params.userId);
    });
    await team.reload();
    removeFromRoom(req.app.get('io'), req.params.userId, `team:${team.id}`);

    res.json({ message: 'Member removed successfully', team: team.toJSON() });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ message: 'Failed to remove member', error: error.message });
  }
});

router.put('/:teamId/members/:userId/notifications', async (req, res) => {
  try {
    const { notifications } = req.body;
    const team = await Team.findByPk(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ message: 'Can only update your own notification preferences' });
    }

    const members = team.members || [];
    const member = members.find(m => m.userId === req.params.userId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    const prefs = {};
    for (const key of ['meetings', 'chat', 'mentions']) if (typeof notifications?.[key] === 'boolean') prefs[key] = notifications[key];
    const updated = await updateLocked(Team, team.id, (row) => {
      const mine = (row.members || []).find((m) => m.userId === req.user.id);
      mine.notifications = { ...(mine.notifications || {}), ...prefs };
      return mine.notifications;
    });

    res.json({ message: 'Notification preferences updated', notifications: updated.result });
  } catch (error) {
    console.error('Error updating notifications:', error);
    res.status(500).json({ message: 'Failed to update notification preferences', error: error.message });
  }
});

router.post('/:teamId/channels', async (req, res) => {
  try {
    const team = await Team.findByPk(req.params.teamId);
    const name = String(req.body.name || '').trim().replace(/^#+/, '').trim();
    const description = req.body.description ? String(req.body.description).trim().slice(0, 200) : undefined;

    if (!team || !team.isActive) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user.id)) {
      return res.status(403).json({ message: 'Only owners and admins can create channels' });
    }

    if (!name || name.length > 40) {
      return res.status(400).json({ message: 'Channel name is required (max 40 characters)' });
    }

    const channels = [...(team.channels || [])];
    if (channels.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ message: 'Channel with this name already exists' });
    }

    channels.push({
      id: uuidv4(),
      name,
      type: 'custom',
      description,
      createdAt: new Date().toISOString()
    });
    team.channels = channels;
    await team.save();

    res.json({ message: 'Channel created successfully', channels: team.channels });
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ message: 'Failed to create channel', error: error.message });
  }
});

router.delete('/:teamId/channels/:channelId', async (req, res) => {
  try {
    const team = await Team.findByPk(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user.id)) {
      return res.status(403).json({ message: 'Only owners and admins can delete channels' });
    }

    const channels = team.channels || [];
    const channel = channels.find(c => c.id === req.params.channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (['general', 'meetings', 'announcements'].includes(channel.type)) {
      return res.status(403).json({ message: 'Cannot delete default channels' });
    }

    team.channels = channels.filter(c => c.id !== req.params.channelId);
    await team.save();

    res.json({ message: 'Channel deleted successfully', channels: team.channels });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ message: 'Failed to delete channel', error: error.message });
  }
});

router.post('/:teamId/regenerate-code', async (req, res) => {
  try {
    const team = await Team.findByPk(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user.id)) {
      return res.status(403).json({ message: 'Only owners and admins can regenerate invite code' });
    }

    team.inviteCode = uuidv4().replace(/-/g, '').slice(0, 16);
    await team.save();

    res.json({ message: 'Invite code regenerated', inviteCode: team.inviteCode });
  } catch (error) {
    console.error('Error regenerating invite code:', error);
    res.status(500).json({ message: 'Failed to regenerate invite code', error: error.message });
  }
});

export default router;
