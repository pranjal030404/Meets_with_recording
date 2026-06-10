import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const Poll = sequelize.define('Poll', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  meetingId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false
  },
  question: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  allowMultiple: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isAnonymous: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'ended'),
    defaultValue: 'draft'
  },
  endsAt: {
    type: DataTypes.DATE
  },
  totalVotes: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'Polls'
});

Poll.prototype.hasUserVoted = function(userId) {
  if (!this.options) return false;
  return this.options.some(option =>
    option.votes && option.votes.some(vote => vote.user.toString() === userId.toString())
  );
};

Poll.prototype.getResults = function() {
  return (this.options || []).map(option => ({
    text: option.text,
    votes: (option.votes || []).length,
    percentage: this.totalVotes > 0
      ? ((option.votes || []).length / this.totalVotes * 100).toFixed(1)
      : 0
  }));
};

Poll.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  values.voteCount = (values.options || []).reduce((total, opt) => total + (opt.votes || []).length, 0);
  return values;
};

export default Poll;
