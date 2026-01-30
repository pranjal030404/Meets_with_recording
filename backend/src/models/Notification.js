import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'meeting_scheduled',
      'meeting_reminder',
      'meeting_started',
      'meeting_cancelled',
      'team_invite',
      'team_member_added',
      'mention',
      'chat_message'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    link: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  expiresAt: Date
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

export default mongoose.model('Notification', notificationSchema);
