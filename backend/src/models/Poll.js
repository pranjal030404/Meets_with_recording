import mongoose from 'mongoose';

const pollOptionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  votes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    votedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { _id: true });

const pollSchema = new mongoose.Schema({
  meeting: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  question: {
    type: String,
    required: true,
    trim: true
  },
  options: [pollOptionSchema],
  allowMultiple: {
    type: Boolean,
    default: false
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'ended'],
    default: 'draft'
  },
  endsAt: {
    type: Date
  },
  totalVotes: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for faster lookups
pollSchema.index({ meeting: 1 });
pollSchema.index({ createdBy: 1 });
pollSchema.index({ status: 1 });

// Virtual for vote count
pollSchema.virtual('voteCount').get(function() {
  return this.options.reduce((total, option) => total + option.votes.length, 0);
});

// Method to check if user has voted
pollSchema.methods.hasUserVoted = function(userId) {
  return this.options.some(option => 
    option.votes.some(vote => vote.user.toString() === userId.toString())
  );
};

// Method to get results
pollSchema.methods.getResults = function() {
  return this.options.map(option => ({
    text: option.text,
    votes: option.votes.length,
    percentage: this.totalVotes > 0 ? (option.votes.length / this.totalVotes * 100).toFixed(1) : 0
  }));
};

const Poll = mongoose.model('Poll', pollSchema);

export default Poll;
