import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', async (req, res) => {
  try {
    const { name, description, settings } = req.body;

    const team = await Team.create({
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
    });

    res.status(201).json(team.toJSON());
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ message: 'Failed to create team', error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const teams = await Team.findAll({
      where: { isActive: true }
    });

    const userTeams = teams.filter(t => t.isMember(req.user.id));

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

    if (!team) {
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
    if (settings) team.settings = { ...(team.settings || {}), ...settings };

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

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ message: 'Failed to delete team', error: error.message });
  }
});

router.post('/:teamId/invite', async (req, res) => {
  try {
    const { email, role = 'member' } = req.body;
    const team = await Team.findByPk(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const userRole = team.getMemberRole(req.user.id);
    if (!team.settings || (!team.settings.allowMemberInvite && !['owner', 'admin'].includes(userRole))) {
      return res.status(403).json({ message: 'You do not have permission to invite members' });
    }

    const userToInvite = await User.findOne({ where: { email: email.toLowerCase() } });

    if (!userToInvite) {
      return res.status(404).json({ message: 'User not found with this email' });
    }

    if (team.isMember(userToInvite.id)) {
      return res.status(400).json({ message: 'User is already a member of this team' });
    }

    const members = team.members || [];
    members.push({
      id: uuidv4(),
      userId: userToInvite.id,
      user: { id: userToInvite.id, name: userToInvite.name, email: userToInvite.email, avatar: userToInvite.avatar },
      role,
      joinedAt: new Date().toISOString(),
      notifications: { meetings: true, chat: true, mentions: true }
    });
    team.members = members;
    await team.save();

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

    res.json({ message: 'Member added successfully', team: team.toJSON() });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ message: 'Failed to invite member', error: error.message });
  }
});

router.post('/join/:inviteCode', async (req, res) => {
  try {
    const team = await Team.findOne({ where: { inviteCode: req.params.inviteCode, isActive: true } });

    if (!team) {
      return res.status(404).json({ message: 'Invalid invite code' });
    }

    if (team.isMember(req.user.id)) {
      return res.status(400).json({ message: 'You are already a member of this team' });
    }

    const role = (team.settings && team.settings.allowGuestJoin) ? 'guest' : 'member';
    const members = team.members || [];
    members.push({
      id: uuidv4(),
      userId: req.user.id,
      user: { id: req.user.id, name: req.user.name, email: req.user.email, avatar: req.user.avatar },
      role,
      joinedAt: new Date().toISOString(),
      notifications: { meetings: true, chat: true, mentions: true }
    });
    team.members = members;
    await team.save();

    res.json({ message: 'Successfully joined team', team: team.toJSON() });
  } catch (error) {
    console.error('Error joining team:', error);
    res.status(500).json({ message: 'Failed to join team', error: error.message });
  }
});

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

    const members = team.members || [];
    const member = members.find(m => m.userId === req.params.userId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (member.role === 'owner') {
      return res.status(403).json({ message: 'Cannot change owner role' });
    }

    member.role = role;
    team.members = members;
    await team.save();

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

    team.members = members.filter(m => m.userId !== req.params.userId);
    await team.save();

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

    member.notifications = { ...(member.notifications || {}), ...notifications };
    team.members = members;
    await team.save();

    res.json({ message: 'Notification preferences updated', notifications: member.notifications });
  } catch (error) {
    console.error('Error updating notifications:', error);
    res.status(500).json({ message: 'Failed to update notification preferences', error: error.message });
  }
});

router.post('/:teamId/channels', async (req, res) => {
  try {
    const { name, description } = req.body;
    const team = await Team.findByPk(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user.id)) {
      return res.status(403).json({ message: 'Only owners and admins can create channels' });
    }

    const channels = team.channels || [];
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

    team.inviteCode = uuidv4().split('-')[0];
    await team.save();

    res.json({ message: 'Invite code regenerated', inviteCode: team.inviteCode });
  } catch (error) {
    console.error('Error regenerating invite code:', error);
    res.status(500).json({ message: 'Failed to regenerate invite code', error: error.message });
  }
});

export default router;
