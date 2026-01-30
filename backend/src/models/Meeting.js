import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const participantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['host', 'co-host', 'participant'],
    default: 'participant'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  leftAt: {
    type: Date
  },
  isMuted: {
    type: Boolean,
    default: false
  },
  isVideoOff: {
    type: Boolean,
    default: false
  },
  isScreenSharing: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const meetingSchema = new mongoose.Schema({
  roomId: {
    type: String,
    unique: true,
    default: () => uuidv4().substring(0, 8) + '-' + uuidv4().substring(0, 4) + '-' + uuidv4().substring(0, 4)
  },
  title: {
    type: String,
    default: 'Untitled Meeting',
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team'
  },
  meetingLink: {
    type: String
  },
  participants: [participantSchema],
  invitees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    email: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    },
    respondedAt: Date
  }],
  status: {
    type: String,
    enum: ['scheduled', 'active', 'ended', 'cancelled'],
    default: 'scheduled'
  },
  scheduledAt: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  settings: {
    waitingRoom: {
      type: Boolean,
      default: false
    },
    allowScreenShare: {
      type: Boolean,
      default: true
    },
    allowChat: {
      type: Boolean,
      default: true
    },
    allowRecording: {
      type: Boolean,
      default: true
    },
    muteOnEntry: {
      type: Boolean,
      default: false
    },
    maxParticipants: {
      type: Number,
      default: 50
    }
  },
  recordings: [{
    filename: String,
    url: String,
    duration: Number,
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isInstant: {
    type: Boolean,
    default: true
  },
  recurrence: {
    enabled: {
      type: Boolean,
      default: false
    },
    pattern: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'custom'],
      default: 'weekly'
    },
    interval: {
      type: Number,
      default: 1
    },
    daysOfWeek: [Number],
    endDate: Date,
    maxOccurrences: Number
  },
  reminders: [{
    time: {
      type: Number,
      required: true
    },
    unit: {
      type: String,
      enum: ['minutes', 'hours', 'days'],
      default: 'minutes'
    },
    sent: {
      type: Boolean,
      default: false
    },
    sentAt: Date
  }],
  notificationsSent: {
    scheduled: { type: Boolean, default: false },
    reminder15min: { type: Boolean, default: false },
    reminder1hour: { type: Boolean, default: false },
    reminder1day: { type: Boolean, default: false },
    started: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Index for faster room lookups
meetingSchema.index({ host: 1 });
meetingSchema.index({ status: 1 });
meetingSchema.index({ team: 1 });
meetingSchema.index({ scheduledAt: 1 });
meetingSchema.index({ 'invitees.user': 1 });

// Virtual for participant count
meetingSchema.virtual('participantCount').get(function() {
  return this.participants.filter(p => !p.leftAt).length;
});

// Method to check if user is host
meetingSchema.methods.isHost = function(userId) {
  return this.host.toString() === userId.toString();
};

// Method to check if user is in meeting
meetingSchema.methods.hasParticipant = function(userId) {
  return this.participants.some(
    p => p.user.toString() === userId.toString() && !p.leftAt
  );
};

const Meeting = mongoose.model('Meeting', meetingSchema);

export default Meeting;
