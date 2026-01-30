import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  meeting: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting'
  },
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team'
  },
  channelType: {
    type: String,
    enum: ['general', 'meetings', 'announcements', 'custom'],
    default: 'general'
  },
  channelName: {
    type: String
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  type: {
    type: String,
    enum: ['text', 'file', 'system', 'meeting_link'],
    default: 'text'
  },
  // For private messages within meeting
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  // For meeting link messages
  meetingData: {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting'
    },
    title: String,
    scheduledAt: Date,
    link: String
  },
  // For mentions
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // For file messages
  fileUrl: {
    type: String
  },
  fileName: {
    type: String
  },
  fileType: {
    type: String
  },
  // For reactions
  reactions: [{
    emoji: String,
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for faster message retrieval
messageSchema.index({ meeting: 1, createdAt: 1 });
messageSchema.index({ team: 1, channelType: 1, createdAt: 1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ mentions: 1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;
