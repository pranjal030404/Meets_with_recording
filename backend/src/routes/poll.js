import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { protect } from '../middleware/auth.js';
import Poll from '../models/Poll.js';
import Meeting from '../models/Meeting.js';

const router = express.Router();

router.post('/', protect, async (req, res) => {
  try {
    const { meetingId, question, options, allowMultiple, isAnonymous } = req.body;

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
      status: 'active'
    });

    res.status(201).json({
      success: true,
      data: { poll: poll.toJSON() }
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

    const poll = await Poll.findByPk(pollId);
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }

    if (poll.status !== 'active') {
      return res.status(400).json({ message: 'Poll is not active' });
    }

    if (poll.hasUserVoted(req.user.id)) {
      return res.status(400).json({ message: 'You have already voted' });
    }

    if (!Array.isArray(optionIds) || optionIds.length === 0) {
      return res.status(400).json({ message: 'Invalid options' });
    }

    if (!poll.allowMultiple && optionIds.length > 1) {
      return res.status(400).json({ message: 'Multiple votes not allowed' });
    }

    const options = poll.options || [];

    let votesAdded = 0;
    optionIds.forEach(optionId => {
      const option = options.find(o => o.id === optionId);
      if (option) {
        option.votes = option.votes || [];
        option.votes.push({ user: req.user.id, votedAt: new Date().toISOString() });
        votesAdded++;
      }
    });

    poll.options = options;
    poll.totalVotes = (poll.totalVotes || 0) + 1;
    await poll.save();

    res.json({
      success: true,
      data: {
        poll: poll.toJSON(),
        results: poll.getResults()
      }
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

    res.json({
      success: true,
      data: {
        poll: poll.toJSON(),
        results: poll.getResults()
      }
    });
  } catch (error) {
    console.error('Get poll results error:', error);
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

    poll.status = 'ended';
    poll.endsAt = new Date();
    await poll.save();

    res.json({
      success: true,
      data: {
        poll: poll.toJSON(),
        results: poll.getResults()
      }
    });
  } catch (error) {
    console.error('End poll error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/meeting/:meetingId', protect, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const polls = await Poll.findAll({
      where: { meetingId },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: { polls: polls.map(p => p.toJSON()) }
    });
  } catch (error) {
    console.error('Get meeting polls error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
