import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true,
    minlength: [2, 'Team name must be at least 2 characters'],
    maxlength: [100, 'Team name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'guest'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    notifications: {
      meetings: { type: Boolean, default: true },
      chat: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true }
    }
  }],
  inviteCode: {
    type: String,
    unique: true,
    default: () => uuidv4().split('-')[0]
  },
  settings: {
    allowMemberInvite: {
      type: Boolean,
      default: false
    },
    allowGuestJoin: {
      type: Boolean,
      default: true
    },
    defaultMeetingSettings: {
      waitingRoom: { type: Boolean, default: false },
      muteOnEntry: { type: Boolean, default: false },
      allowRecording: { type: Boolean, default: true }
    }
  },
  channels: [{
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['general', 'meetings', 'announcements', 'custom'],
      default: 'custom'
    },
    description: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
teamSchema.index({ owner: 1 });
teamSchema.index({ 'members.user': 1 });
teamSchema.index({ inviteCode: 1 });

// Default channels on team creation
teamSchema.pre('save', function(next) {
  if (this.isNew && this.channels.length === 0) {
    this.channels = [
      { name: 'general', type: 'general', description: 'General team discussions' },
      { name: 'meetings', type: 'meetings', description: 'Meeting links and schedules' },
      { name: 'announcements', type: 'announcements', description: 'Important team announcements' }
    ];
  }
  next();
});

// Methods
teamSchema.methods.isMember = function(userId) {
  return this.members.some(member => member.user.toString() === userId.toString());
};

teamSchema.methods.getMemberRole = function(userId) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  return member ? member.role : null;
};

teamSchema.methods.isOwnerOrAdmin = function(userId) {
  const role = this.getMemberRole(userId);
  return role === 'owner' || role === 'admin';
};

teamSchema.methods.addMember = function(userId, role = 'member') {
  if (!this.isMember(userId)) {
    this.members.push({ user: userId, role });
  }
  return this;
};

teamSchema.methods.removeMember = function(userId) {
  this.members = this.members.filter(m => m.user.toString() !== userId.toString());
  return this;
};

// Virtual for member count
teamSchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// Ensure virtuals are serialized
teamSchema.set('toJSON', { virtuals: true });
teamSchema.set('toObject', { virtuals: true });

export default mongoose.model('Team', teamSchema);
