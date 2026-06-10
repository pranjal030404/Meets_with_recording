import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { protect } from '../middleware/auth.js';
import BreakoutRoom from '../models/BreakoutRoom.js';
import Meeting from '../models/Meeting.js';

const router = express.Router();

router.post('/', protect, async (req, res) => {
  try {
    const { meetingId, rooms } = req.body;

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (meeting.hostId !== req.user.id) {
      return res.status(403).json({ message: 'Only host can create breakout rooms' });
    }

    const breakoutRooms = [];
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      const breakoutRoom = await BreakoutRoom.create({
        parentMeetingId: meetingId,
        roomNumber: i + 1,
        name: room.name || `Room ${i + 1}`,
        assignedParticipants: (room.participantIds || []).map(userId => ({
          id: uuidv4(),
          userId
        })),
        createdById: req.user.id
      });
      breakoutRooms.push(breakoutRoom);
    }

    res.status(201).json({
      success: true,
      data: { breakoutRooms: breakoutRooms.map(b => b.toJSON()) }
    });
  } catch (error) {
    console.error('Create breakout rooms error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/meeting/:meetingId', protect, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const breakoutRooms = await BreakoutRoom.findAll({
      where: { parentMeetingId: meetingId, status: 'open' }
    });

    res.json({
      success: true,
      data: { breakoutRooms: breakoutRooms.map(b => b.toJSON()) }
    });
  } catch (error) {
    console.error('Get breakout rooms error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:breakoutRoomId/assign', protect, async (req, res) => {
  try {
    const { breakoutRoomId } = req.params;
    const { participantIds } = req.body;

    const breakoutRoom = await BreakoutRoom.findByPk(breakoutRoomId);
    if (!breakoutRoom) {
      return res.status(404).json({ message: 'Breakout room not found' });
    }

    const meeting = await Meeting.findByPk(breakoutRoom.parentMeetingId);
    if (meeting.hostId !== req.user.id) {
      return res.status(403).json({ message: 'Only host can assign participants' });
    }

    const assignedParticipants = breakoutRoom.assignedParticipants || [];

    participantIds.forEach(userId => {
      if (!assignedParticipants.some(p => p.userId === userId)) {
        assignedParticipants.push({ id: uuidv4(), userId });
      }
    });

    breakoutRoom.assignedParticipants = assignedParticipants;
    await breakoutRoom.save();

    res.json({
      success: true,
      data: { breakoutRoom: breakoutRoom.toJSON() }
    });
  } catch (error) {
    console.error('Assign participants error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/:breakoutRoomId/join', protect, async (req, res) => {
  try {
    const { breakoutRoomId } = req.params;

    const breakoutRoom = await BreakoutRoom.findByPk(breakoutRoomId);
    if (!breakoutRoom) {
      return res.status(404).json({ message: 'Breakout room not found' });
    }

    if (breakoutRoom.status !== 'open') {
      return res.status(400).json({ message: 'Breakout room is closed' });
    }

    const assignedParticipants = breakoutRoom.assignedParticipants || [];
    if (!assignedParticipants.some(p => p.userId === req.user.id)) {
      return res.status(403).json({ message: 'You are not assigned to this room' });
    }

    const participant = assignedParticipants.find(
      p => p.userId === req.user.id
    );
    if (participant) {
      participant.joinedAt = new Date().toISOString();
      participant.leftAt = null;
    }

    breakoutRoom.assignedParticipants = assignedParticipants;
    await breakoutRoom.save();

    res.json({
      success: true,
      data: { breakoutRoom: breakoutRoom.toJSON() }
    });
  } catch (error) {
    console.error('Join breakout room error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/close-all', protect, async (req, res) => {
  try {
    const { meetingId } = req.body;

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (meeting.hostId !== req.user.id) {
      return res.status(403).json({ message: 'Only host can close breakout rooms' });
    }

    await BreakoutRoom.update(
      { status: 'closed' },
      { where: { parentMeetingId: meetingId, status: 'open' } }
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
