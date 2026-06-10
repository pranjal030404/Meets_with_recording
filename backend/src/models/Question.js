import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const Question = sequelize.define('Question', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  meetingId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  askedById: {
    type: DataTypes.UUID,
    allowNull: false
  },
  question: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  answer: {
    type: DataTypes.TEXT
  },
  answeredById: {
    type: DataTypes.UUID
  },
  answeredAt: {
    type: DataTypes.DATE
  },
  upvotes: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  isAnswered: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isDismissed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'Questions'
});

Question.prototype.hasUserUpvoted = function(userId) {
  const upvotes = this.upvotes || [];
  return upvotes.some(id => id.toString() === userId.toString());
};

Question.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  values.upvoteCount = (values.upvotes || []).length;
  return values;
};

export default Question;
