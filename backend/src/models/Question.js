import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  meeting: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting',
    required: true
  },
  askedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  question: {
    type: String,
    required: true,
    trim: true
  },
  answer: {
    type: String,
    trim: true
  },
  answeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  answeredAt: {
    type: Date
  },
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isAnswered: {
    type: Boolean,
    default: false
  },
  isDismissed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for faster lookups
questionSchema.index({ meeting: 1 });
questionSchema.index({ askedBy: 1 });
questionSchema.index({ isAnswered: 1 });

// Virtual for upvote count
questionSchema.virtual('upvoteCount').get(function() {
  return this.upvotes.length;
});

// Method to check if user upvoted
questionSchema.methods.hasUserUpvoted = function(userId) {
  return this.upvotes.some(id => id.toString() === userId.toString());
};

const Question = mongoose.model('Question', questionSchema);

export default Question;
