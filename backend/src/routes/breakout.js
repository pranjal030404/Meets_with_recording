import express from 'express';
import { protect } from '../middleware/auth.js';
import BreakoutRoom from '../models/BreakoutRoom.js';
import Meeting from '../models/Meeting.js';

const router = express.Router();

/**
 * @route   POST /api/breakout
 * @desc    Create breakout rooms
 * @access  Private (host only)
 */
router.post('/', protect, async (req, res) => {
  try {
    const { meetingId, rooms } = req.body; // rooms: [{ name, participantIds }]

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (!meeting.isHost(req.user._id)) {
      return res.status(403).json({ message: 'Only host can create breakout rooms' });
    }

    const breakoutRooms = [];
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      const breakoutRoom = await BreakoutRoom.create({
        parentMeeting: meetingId,
        roomNumber: i + 1,
        name: room.name || `Room ${i + 1}`,
        assignedParticipants: room.participantIds.map(userId => ({ user: userId })),
        createdBy: req.user._id
      });
      breakoutRooms.push(breakoutRoom);
    }

    res.status(201).json({
      success: true,
      data: { breakoutRooms }
    });
  } catch (error) {
    console.error('Create breakout rooms error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/breakout/meeting/:meetingId
 * @desc    Get breakout rooms for a meeting
 * @access  Private
 */
router.get('/meeting/:meetingId', protect, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const breakoutRooms = await BreakoutRoom.find({
      parentMeeting: meetingId,
      status: 'open'
    }).populate('assignedParticipants.user', 'name email avatar');

    res.json({
      success: true,
      data: { breakoutRooms }
    });
  } catch (error) {
    console.error('Get breakout rooms error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   PUT /api/breakout/:breakoutRoomId/assign
 * @desc    Assign participants to breakout room
 * @access  Private (host only)
 */
router.put('/:breakoutRoomId/assign', protect, async (req, res) => {
  try {
    const { breakoutRoomId } = req.params;
    const { participantIds } = req.body;

    const breakoutRoom = await BreakoutRoom.findById(breakoutRoomId);
    if (!breakoutRoom) {
      return res.status(404).json({ message: 'Breakout room not found' });
    }

    const meeting = await Meeting.findById(breakoutRoom.parentMeeting);
    if (!meeting.isHost(req.user._id)) {
      return res.status(403).json({ message: 'Only host can assign participants' });
    }

    // Add new participants
    participantIds.forEach(userId => {
      if (!breakoutRoom.isUserAssigned(userId)) {
        breakoutRoom.assignedParticipants.push({ user: userId });
      }
    });

    await breakoutRoom.save();

    res.json({
      success: true,
      data: { breakoutRoom }
    });
  } catch (error) {
    console.error('Assign participants error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/breakout/:breakoutRoomId/join
 * @desc    Join breakout room
 * @access  Private
 */
router.post('/:breakoutRoomId/join', protect, async (req, res) => {
  try {
    const { breakoutRoomId } = req.params;

    const breakoutRoom = await BreakoutRoom.findById(breakoutRoomId);
    if (!breakoutRoom) {
      return res.status(404).json({ message: 'Breakout room not found' });
    }

    if (breakoutRoom.status !== 'open') {
      return res.status(400).json({ message: 'Breakout room is closed' });
    }

    if (!breakoutRoom.isUserAssigned(req.user._id)) {
      return res.status(403).json({ message: 'You are not assigned to this room' });
    }

    // Update join time
    const participant = breakoutRoom.assignedParticipants.find(
      p => p.user.toString() === req.user._id.toString()
    );
    if (participant) {
      participant.joinedAt = new Date();
      participant.leftAt = null;
    }

    await breakoutRoom.save();

    res.json({
      success: true,
      data: { breakoutRoom }
    });
  } catch (error) {
    console.error('Join breakout room error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/breakout/close-all
 * @desc    Close all breakout rooms and return participants to main meeting
 * @access  Private (host only)
 */
router.post('/close-all', protect, async (req, res) => {
  try {
    const { meetingId } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (!meeting.isHost(req.user._id)) {
      return res.status(403).json({ message: 'Only host can close breakout rooms' });
    }

    await BreakoutRoom.updateMany(
      { parentMeeting: meetingId, status: 'open' },
      { status: 'closed' }
    );

    res.json({
      success: true,
      message: 'All breakout rooms closed'
    });
  } catch (error) {
    console.error('Close breakout rooms error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
