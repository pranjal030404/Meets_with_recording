import express from 'express';
import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { protect } from '../middleware/auth.js';
import Question from '../models/Question.js';
import Meeting from '../models/Meeting.js';

const router = express.Router();

router.post('/', protect, async (req, res) => {
  try {
    const { meetingId, question } = req.body;

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const newQuestion = await Question.create({
      meetingId,
      askedById: req.user.id,
      question,
      upvotes: []
    });

    res.status(201).json({
      success: true,
      data: { question: newQuestion.toJSON() }
    });
  } catch (error) {
    console.error('Submit question error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/meeting/:meetingId', protect, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const questions = await Question.findAll({
      where: {
        meetingId,
        isDismissed: false
      },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: { questions: questions.map(q => q.toJSON()) }
    });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:questionId/upvote', protect, async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findByPk(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    const upvotes = question.upvotes || [];

    if (question.hasUserUpvoted(req.user.id)) {
      question.upvotes = upvotes.filter(id => id !== req.user.id);
    } else {
      upvotes.push(req.user.id);
      question.upvotes = upvotes;
    }

    await question.save();

    res.json({
      success: true,
      data: { question: question.toJSON() }
    });
  } catch (error) {
    console.error('Upvote question error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:questionId/answer', protect, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { answer } = req.body;

    const question = await Question.findByPk(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    const meeting = await Meeting.findByPk(question.meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const isHost = meeting.hostId === req.user.id;
    const participants = meeting.participants || [];
    const isCoHost = participants.some(
      p => p.userId === req.user.id && p.role === 'co-host'
    );

    if (!isHost && !isCoHost) {
      return res.status(403).json({ message: 'Only host or co-host can answer questions' });
    }

    question.answer = answer;
    question.answeredById = req.user.id;
    question.answeredAt = new Date();
    question.isAnswered = true;

    await question.save();

    res.json({
      success: true,
      data: { question: question.toJSON() }
    });
  } catch (error) {
    console.error('Answer question error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:questionId', protect, async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findByPk(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    const meeting = await Meeting.findByPk(question.meetingId);
    const isHost = meeting && meeting.hostId === req.user.id;
    const participants = meeting ? (meeting.participants || []) : [];
    const isCoHost = participants.some(
      p => p.userId === req.user.id && p.role === 'co-host'
    );

    if (!isHost && !isCoHost && question.askedById !== req.user.id) {
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
