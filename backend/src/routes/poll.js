import express from 'express';
import { Op } from 'sequelize';
import { pollMachine } from '../lib/stateMachines.js';
import { v4 as uuidv4 } from 'uuid';
import { protect } from '../middleware/auth.js';
import Poll from '../models/Poll.js';
import Meeting from '../models/Meeting.js';
import { requireInsider } from '../lib/meetingAccess.js';
import { updateLocked } from '../lib/locked.js';
import { assertFeature } from '../services/subscriptionService.js';

// Never ship voter ids to clients: expose counts plus the caller's own votes.
const present = (poll, userId) => {
  const json = poll.toJSON();
  const total = json.totalVotes || 0;
  return {
    id: json.id,
    _id: json.id,
    meetingId: json.meetingId,
    createdById: json.createdById,
    question: json.question,
    allowMultiple: json.allowMultiple,
    isAnonymous: json.isAnonymous,
    status: json.status,
    totalVotes: total,
    createdAt: json.createdAt,
    hasVoted: poll.hasUserVoted(userId),
    options: (json.options || []).map(o => ({
      id: o.id,
      text: o.text,
      votes: (o.votes || []).length,
      percentage: total > 0 ? Math.round(((o.votes || []).length / total) * 100) : 0,
      mine: (o.votes || []).some(v => String(v.user) === String(userId))
    }))
  };
};

// Tell everyone in the meeting room to refetch polls (each client gets its own view).
const notify = async (req, meetingId) => {
  try {
    const meeting = await Meeting.findByPk(meetingId);
    const io = req.app.get('io');
    if (meeting && io) io.to(meeting.roomId).emit('poll:changed', { meetingId });
  } catch (e) {
    console.warn('Poll notify failed:', e.message);
  }
};

const router = express.Router();

router.post('/', protect, async (req, res) => {
  try {
    const { meetingId, question, options, allowMultiple, isAnonymous, draft } = req.body;

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const isHost = meeting.hostId === req.user.id;
    const participants = meeting.participants || [];
    const isCoHost = participants.some(
      p => p.userId === req.user.id && p.role === 'co-host'
    );

    if (!isHost && !isCoHost) {
      return res.status(403).json({ message: 'Only host or co-host can create polls' });
    }
    const allowed = await assertFeature(meeting.hostId, 'canPoll', 'Polls');
    if (!allowed.allowed) return res.status(403).json({ message: allowed.reason, code: 'PLAN_LIMIT_REACHED' });
    if (typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ message: 'A poll needs a question' });
    }
    if (!Array.isArray(options) || !options.length || options.length > 20 || options.some((o) => typeof o !== 'string' || !o.trim() || o.length > 200)) {
      return res.status(400).json({ message: 'Provide between 1 and 20 text options' });
    }

    const poll = await Poll.create({
      meetingId,
      createdById: req.user.id,
      question,
      options: options.map(text => ({
        id: uuidv4(),
        text,
        votes: []
      })),
      allowMultiple,
      isAnonymous,
      status: draft ? 'draft' : 'active'
    });

    if (!draft) notify(req, meetingId); // drafts are private to managers until started
    res.status(201).json({
      success: true,
      data: { poll: present(poll, req.user.id) }
    });
  } catch (error) {
    console.error('Create poll error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/:pollId/vote', protect, async (req, res) => {
  try {
    const { pollId } = req.params;
    const { optionIds } = req.body;

    let poll = await Poll.findByPk(pollId);
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }
    if (!(await requireInsider(req, res, poll.meetingId))) return;
    if (!Array.isArray(optionIds) || optionIds.length === 0) {
      return res.status(400).json({ message: 'Invalid options' });
    }
    const chosen = [...new Set(optionIds)];

    // Counted on the locked row, so simultaneous votes are all kept and nobody votes twice
    const voted = await updateLocked(Poll, poll.id, (row) => {
      if (row.status !== 'active') return { status: 400, message: 'Poll is not active' };
      if (row.hasUserVoted(req.user.id)) return { status: 400, message: 'You have already voted' };
      if (!row.allowMultiple && chosen.length > 1) return { status: 400, message: 'Multiple votes not allowed' };
      const options = row.options || [];
      if (chosen.some((id) => !options.some((o) => o.id === id))) return { status: 400, message: 'Invalid options' };
      for (const option of options) {
        if (chosen.includes(option.id)) option.votes = [...(option.votes || []), { user: req.user.id, votedAt: new Date().toISOString() }];
      }
      row.totalVotes = (row.totalVotes || 0) + 1;
      return null;
    });
    if (voted.result) return res.status(voted.result.status).json({ message: voted.result.message });
    poll = voted.row;

    notify(req, poll.meetingId);
    res.json({
      success: true,
      data: { poll: present(poll, req.user.id) }
    });
  } catch (error) {
    console.error('Vote poll error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:pollId/results', protect, async (req, res) => {
  try {
    const { pollId } = req.params;

    const poll = await Poll.findByPk(pollId);
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }
    if (!(await requireInsider(req, res, poll.meetingId))) return;

    res.json({
      success: true,
      data: { poll: present(poll, req.user.id) }
    });
  } catch (error) {
    console.error('Get poll results error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:pollId/start', protect, async (req, res) => {
  try {
    const poll = await Poll.findByPk(req.params.pollId);
    if (!poll) return res.status(404).json({ message: 'Poll not found' });
    const meeting = await Meeting.findByPk(poll.meetingId);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    const isManager = meeting.hostId === req.user.id ||
      (meeting.participants || []).some(p => p.userId === req.user.id && p.role === 'co-host');
    if (!isManager) return res.status(403).json({ message: 'Only host or co-host can start polls' });
    if (!pollMachine.can(poll.status, 'active')) {
      return res.status(409).json({ message: `A ${poll.status} poll cannot be started` });
    }
    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      return res.status(409).json({ message: 'The meeting is over' });
    }
    poll.status = 'active';
    await poll.save();
    notify(req, poll.meetingId);
    res.json({ success: true, data: { poll: present(poll, req.user.id) } });
  } catch (error) {
    console.error('Start poll error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:pollId/end', protect, async (req, res) => {
  try {
    const { pollId } = req.params;

    const poll = await Poll.findByPk(pollId);
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }

    const meeting = await Meeting.findByPk(poll.meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const isHost = meeting.hostId === req.user.id;
    const participants = meeting.participants || [];
    const isCoHost = participants.some(
      p => p.userId === req.user.id && p.role === 'co-host'
    );

    if (!isHost && !isCoHost) {
      return res.status(403).json({ message: 'Only host or co-host can end polls' });
    }

    if (!pollMachine.can(poll.status, 'ended')) {
      return res.status(409).json({ message: 'Poll has already ended' });
    }
    if (poll.status === 'ended') {
      return res.json({ success: true, data: { poll: present(poll, req.user.id) } });
    }
    poll.status = 'ended';
    poll.endsAt = new Date();
    await poll.save();

    notify(req, poll.meetingId);
    res.json({
      success: true,
      data: { poll: present(poll, req.user.id) }
    });
  } catch (error) {
    console.error('End poll error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/meeting/:meetingId', protect, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const meeting = await requireInsider(req, res, meetingId);
    if (!meeting) return;
    const isManager = (meeting.hostId === req.user.id ||
      (meeting.participants || []).some(p => p.userId === req.user.id && p.role === 'co-host'));

    const polls = await Poll.findAll({
      where: { meetingId, ...(isManager ? {} : { status: { [Op.ne]: 'draft' } }) },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: { polls: polls.map(p => present(p, req.user.id)) }
    });
  } catch (error) {
    console.error('Get meeting polls error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
