import express from 'express';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Create a new team
router.post('/', async (req, res) => {
  try {
    const { name, description, settings } = req.body;

    const team = await Team.create({
      name,
      description,
      owner: req.user._id,
      settings,
      members: [{
        user: req.user._id,
        role: 'owner'
      }]
    });

    await team.populate('members.user', 'name email avatar');
    
    res.status(201).json(team);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ message: 'Failed to create team', error: error.message });
  }
});

// Get all teams for current user
router.get('/', async (req, res) => {
  try {
    const teams = await Team.find({
      'members.user': req.user._id,
      isActive: true
    })
    .populate('owner', 'name email avatar')
    .populate('members.user', 'name email avatar isOnline')
    .sort({ createdAt: -1 });

    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ message: 'Failed to fetch teams', error: error.message });
  }
});

// Get team by ID
router.get('/:teamId', async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId)
      .populate('owner', 'name email avatar')
      .populate('members.user', 'name email avatar isOnline lastSeen');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isMember(req.user._id)) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }

    res.json(team);
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ message: 'Failed to fetch team', error: error.message });
  }
});

// Update team
router.put('/:teamId', async (req, res) => {
  try {
    const { name, description, settings } = req.body;
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user._id)) {
      return res.status(403).json({ message: 'Only team owners and admins can update team' });
    }

    if (name) team.name = name;
    if (description !== undefined) team.description = description;
    if (settings) team.settings = { ...team.settings, ...settings };

    await team.save();
    await team.populate('members.user', 'name email avatar');

    res.json(team);
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ message: 'Failed to update team', error: error.message });
  }
});

// Delete team (owner only)
router.delete('/:teamId', async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (team.owner.toString() !== req.user._id.toString()) {
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

// Invite member by email
router.post('/:teamId/invite', async (req, res) => {
  try {
    const { email, role = 'member' } = req.body;
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check permissions
    const userRole = team.getMemberRole(req.user._id);
    if (!team.settings.allowMemberInvite && !['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ message: 'You do not have permission to invite members' });
    }

    // Find user by email
    const userToInvite = await User.findOne({ email: email.toLowerCase() });

    if (!userToInvite) {
      return res.status(404).json({ message: 'User not found with this email' });
    }

    if (team.isMember(userToInvite._id)) {
      return res.status(400).json({ message: 'User is already a member of this team' });
    }

    // Add member
    team.addMember(userToInvite._id, role);
    await team.save();
    await team.populate('members.user', 'name email avatar');

    // Create notification
    await Notification.create({
      recipient: userToInvite._id,
      type: 'team_member_added',
      title: 'Added to Team',
      message: `You have been added to the team "${team.name}"`,
      data: {
        teamId: team._id,
        senderId: req.user._id,
        link: `/teams/${team._id}`
      },
      priority: 'normal'
    });

    res.json({ message: 'Member added successfully', team });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ message: 'Failed to invite member', error: error.message });
  }
});

// Join team by invite code
router.post('/join/:inviteCode', async (req, res) => {
  try {
    const team = await Team.findOne({ inviteCode: req.params.inviteCode, isActive: true });

    if (!team) {
      return res.status(404).json({ message: 'Invalid invite code' });
    }

    if (team.isMember(req.user._id)) {
      return res.status(400).json({ message: 'You are already a member of this team' });
    }

    const role = team.settings.allowGuestJoin ? 'guest' : 'member';
    team.addMember(req.user._id, role);
    await team.save();
    await team.populate('members.user', 'name email avatar');

    res.json({ message: 'Successfully joined team', team });
  } catch (error) {
    console.error('Error joining team:', error);
    res.status(500).json({ message: 'Failed to join team', error: error.message });
  }
});

// Update member role
router.put('/:teamId/members/:userId/role', async (req, res) => {
  try {
    const { role } = req.body;
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user._id)) {
      return res.status(403).json({ message: 'Only owners and admins can update member roles' });
    }

    const member = team.members.find(m => m.user.toString() === req.params.userId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    // Cannot change owner role
    if (member.role === 'owner') {
      return res.status(403).json({ message: 'Cannot change owner role' });
    }

    member.role = role;
    await team.save();
    await team.populate('members.user', 'name email avatar');

    res.json({ message: 'Member role updated successfully', team });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ message: 'Failed to update member role', error: error.message });
  }
});

// Remove member from team
router.delete('/:teamId/members/:userId', async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Owner or admin can remove, or user can leave
    const canRemove = team.isOwnerOrAdmin(req.user._id) || req.params.userId === req.user._id.toString();
    
    if (!canRemove) {
      return res.status(403).json({ message: 'You do not have permission to remove this member' });
    }

    // Cannot remove owner
    const member = team.members.find(m => m.user.toString() === req.params.userId);
    if (member && member.role === 'owner') {
      return res.status(403).json({ message: 'Cannot remove team owner' });
    }

    team.removeMember(req.params.userId);
    await team.save();
    await team.populate('members.user', 'name email avatar');

    res.json({ message: 'Member removed successfully', team });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ message: 'Failed to remove member', error: error.message });
  }
});

// Update member notification preferences
router.put('/:teamId/members/:userId/notifications', async (req, res) => {
  try {
    const { notifications } = req.body;
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Can only update own notifications
    if (req.params.userId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Can only update your own notification preferences' });
    }

    const member = team.members.find(m => m.user.toString() === req.params.userId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    member.notifications = { ...member.notifications, ...notifications };
    await team.save();

    res.json({ message: 'Notification preferences updated', notifications: member.notifications });
  } catch (error) {
    console.error('Error updating notifications:', error);
    res.status(500).json({ message: 'Failed to update notification preferences', error: error.message });
  }
});

// Create custom channel
router.post('/:teamId/channels', async (req, res) => {
  try {
    const { name, description } = req.body;
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user._id)) {
      return res.status(403).json({ message: 'Only owners and admins can create channels' });
    }

    // Check if channel name already exists
    if (team.channels.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ message: 'Channel with this name already exists' });
    }

    team.channels.push({
      name,
      type: 'custom',
      description
    });

    await team.save();
    res.json({ message: 'Channel created successfully', channels: team.channels });
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ message: 'Failed to create channel', error: error.message });
  }
});

// Delete custom channel
router.delete('/:teamId/channels/:channelId', async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user._id)) {
      return res.status(403).json({ message: 'Only owners and admins can delete channels' });
    }

    const channel = team.channels.id(req.params.channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Cannot delete default channels
    if (['general', 'meetings', 'announcements'].includes(channel.type)) {
      return res.status(403).json({ message: 'Cannot delete default channels' });
    }

    team.channels.pull(req.params.channelId);
    await team.save();

    res.json({ message: 'Channel deleted successfully', channels: team.channels });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ message: 'Failed to delete channel', error: error.message });
  }
});

// Regenerate invite code
router.post('/:teamId/regenerate-code', async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (!team.isOwnerOrAdmin(req.user._id)) {
      return res.status(403).json({ message: 'Only owners and admins can regenerate invite code' });
    }

    const { v4: uuidv4 } = await import('uuid');
    team.inviteCode = uuidv4().split('-')[0];
    await team.save();

    res.json({ message: 'Invite code regenerated', inviteCode: team.inviteCode });
  } catch (error) {
    console.error('Error regenerating invite code:', error);
    res.status(500).json({ message: 'Failed to regenerate invite code', error: error.message });
  }
});

export default router;
