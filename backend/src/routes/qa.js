import express from 'express';
import { protect } from '../middleware/auth.js';
import Question from '../models/Question.js';
import Meeting from '../models/Meeting.js';

const router = express.Router();

/**
 * @route   POST /api/qa
 * @desc    Submit a question in Q&A
 * @access  Private
 */
router.post('/', protect, async (req, res) => {
  try {
    const { meetingId, question } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const newQuestion = await Question.create({
      meeting: meetingId,
      askedBy: req.user._id,
      question
    });

    await newQuestion.populate('askedBy', 'name email avatar');

    res.status(201).json({
      success: true,
      data: { question: newQuestion }
    });
  } catch (error) {
    console.error('Submit question error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/qa/meeting/:meetingId
 * @desc    Get all questions for a meeting
 * @access  Private
 */
router.get('/meeting/:meetingId', protect, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const questions = await Question.find({
      meeting: meetingId,
      isDismissed: false
    })
      .populate('askedBy', 'name email avatar')
      .populate('answeredBy', 'name email avatar')
      .sort({ upvotes: -1, createdAt: -1 }); // Sort by upvotes first, then by time

    res.json({
      success: true,
      data: { questions }
    });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   PUT /api/qa/:questionId/upvote
 * @desc    Upvote a question
 * @access  Private
 */
router.put('/:questionId/upvote', protect, async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    // Toggle upvote
    if (question.hasUserUpvoted(req.user._id)) {
      question.upvotes = question.upvotes.filter(
        id => id.toString() !== req.user._id.toString()
      );
    } else {
      question.upvotes.push(req.user._id);
    }

    await question.save();
    await question.populate('askedBy', 'name email avatar');
    await question.populate('answeredBy', 'name email avatar');

    res.json({
      success: true,
      data: { question }
    });
  } catch (error) {
    console.error('Upvote question error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   PUT /api/qa/:questionId/answer
 * @desc    Answer a question (host/co-host only)
 * @access  Private
 */
router.put('/:questionId/answer', protect, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { answer } = req.body;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    // Verify permission
    const meeting = await Meeting.findById(question.meeting);
    const isHostOrCoHost = meeting.isHost(req.user._id) || 
      meeting.participants.some(p => 
        p.user.toString() === req.user._id.toString() && p.role === 'co-host'
      );

    if (!isHostOrCoHost) {
      return res.status(403).json({ message: 'Only host or co-host can answer questions' });
    }

    question.answer = answer;
    question.answeredBy = req.user._id;
    question.answeredAt = new Date();
    question.isAnswered = true;

    await question.save();
    await question.populate('askedBy', 'name email avatar');
    await question.populate('answeredBy', 'name email avatar');

    res.json({
      success: true,
      data: { question }
    });
  } catch (error) {
    console.error('Answer question error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   DELETE /api/qa/:questionId
 * @desc    Dismiss a question (host/co-host only)
 * @access  Private
 */
router.delete('/:questionId', protect, async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    // Verify permission
    const meeting = await Meeting.findById(question.meeting);
    const isHostOrCoHost = meeting.isHost(req.user._id) || 
      meeting.participants.some(p => 
        p.user.toString() === req.user._id.toString() && p.role === 'co-host'
      );

    if (!isHostOrCoHost && question.askedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to dismiss this question' });
    }

    question.isDismissed = true;
    await question.save();

    res.json({
      success: true,
      message: 'Question dismissed'
    });
  } catch (error) {
    console.error('Dismiss question error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
