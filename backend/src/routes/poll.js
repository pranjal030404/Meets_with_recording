import express from 'express';
import { protect } from '../middleware/auth.js';
import Poll from '../models/Poll.js';
import Meeting from '../models/Meeting.js';

const router = express.Router();

/**
 * @route   POST /api/polls
 * @desc    Create a new poll
 * @access  Private (host/co-host only)
 */
router.post('/', protect, async (req, res) => {
  try {
    const { meetingId, question, options, allowMultiple, isAnonymous } = req.body;

    // Verify user is host or co-host
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const isHostOrCoHost = meeting.isHost(req.user._id) || 
      meeting.participants.some(p => 
        p.user.toString() === req.user._id.toString() && p.role === 'co-host'
      );

    if (!isHostOrCoHost) {
      return res.status(403).json({ message: 'Only host or co-host can create polls' });
    }

    // Create poll
    const poll = await Poll.create({
      meeting: meetingId,
      createdBy: req.user._id,
      question,
      options: options.map(text => ({ text, votes: [] })),
      allowMultiple,
      isAnonymous,
      status: 'active'
    });

    await poll.populate('createdBy', 'name email avatar');

    res.status(201).json({
      success: true,
      data: { poll }
    });
  } catch (error) {
    console.error('Create poll error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/polls/:pollId/vote
 * @desc    Vote on a poll
 * @access  Private
 */
router.post('/:pollId/vote', protect, async (req, res) => {
  try {
    const { pollId } = req.params;
    const { optionIds } = req.body; // Array of option IDs

    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }

    if (poll.status !== 'active') {
      return res.status(400).json({ message: 'Poll is not active' });
    }

    // Check if user already voted
    if (poll.hasUserVoted(req.user._id)) {
      return res.status(400).json({ message: 'You have already voted' });
    }

    // Validate option IDs
    if (!Array.isArray(optionIds) || optionIds.length === 0) {
      return res.status(400).json({ message: 'Invalid options' });
    }

    if (!poll.allowMultiple && optionIds.length > 1) {
      return res.status(400).json({ message: 'Multiple votes not allowed' });
    }

    // Add votes
    let votesAdded = 0;
    optionIds.forEach(optionId => {
      const option = poll.options.id(optionId);
      if (option) {
        option.votes.push({ user: req.user._id });
        votesAdded++;
      }
    });

    poll.totalVotes += 1;
    await poll.save();

    res.json({
      success: true,
      data: {
        poll,
        results: poll.getResults()
      }
    });
  } catch (error) {
    console.error('Vote poll error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/polls/:pollId/results
 * @desc    Get poll results
 * @access  Private
 */
router.get('/:pollId/results', protect, async (req, res) => {
  try {
    const { pollId } = req.params;

    const poll = await Poll.findById(pollId).populate('createdBy', 'name email avatar');
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }

    res.json({
      success: true,
      data: {
        poll,
        results: poll.getResults()
      }
    });
  } catch (error) {
    console.error('Get poll results error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   PUT /api/polls/:pollId/end
 * @desc    End a poll
 * @access  Private (host/co-host only)
 */
router.put('/:pollId/end', protect, async (req, res) => {
  try {
    const { pollId } = req.params;

    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }

    // Verify permission
    const meeting = await Meeting.findById(poll.meeting);
    const isHostOrCoHost = meeting.isHost(req.user._id) || 
      meeting.participants.some(p => 
        p.user.toString() === req.user._id.toString() && p.role === 'co-host'
      );

    if (!isHostOrCoHost) {
      return res.status(403).json({ message: 'Only host or co-host can end polls' });
    }

    poll.status = 'ended';
    poll.endsAt = new Date();
    await poll.save();

    res.json({
      success: true,
      data: {
        poll,
        results: poll.getResults()
      }
    });
  } catch (error) {
    console.error('End poll error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/polls/meeting/:meetingId
 * @desc    Get all polls for a meeting
 * @access  Private
 */
router.get('/meeting/:meetingId', protect, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const polls = await Poll.find({ meeting: meetingId })
      .populate('createdBy', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { polls }
    });
  } catch (error) {
    console.error('Get meeting polls error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
