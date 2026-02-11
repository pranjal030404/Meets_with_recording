import mongoose from 'mongoose';

const breakoutRoomSchema = new mongoose.Schema({
  parentMeeting: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting',
    required: true
  },
  roomNumber: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  assignedParticipants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date
    },
    leftAt: {
      type: Date
    }
  }],
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  duration: {
    type: Number, // in minutes
    default: 0 // 0 means no auto-close
  },
  autoCloseAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster lookups
breakoutRoomSchema.index({ parentMeeting: 1 });
breakoutRoomSchema.index({ status: 1 });

// Virtual for active participant count
breakoutRoomSchema.virtual('activeParticipantCount').get(function() {
  return this.assignedParticipants.filter(p => p.joinedAt && !p.leftAt).length;
});

// Method to check if user is assigned
breakoutRoomSchema.methods.isUserAssigned = function(userId) {
  return this.assignedParticipants.some(
    p => p.user.toString() === userId.toString()
  );
};

// Method to get active participants
breakoutRoomSchema.methods.getActiveParticipants = function() {
  return this.assignedParticipants.filter(p => p.joinedAt && !p.leftAt);
};

const BreakoutRoom = mongoose.model('BreakoutRoom', breakoutRoomSchema);

export default BreakoutRoom;
