import User from './User.js';
import Meeting from './Meeting.js';
import Team from './Team.js';
import Message from './Message.js';
import Notification from './Notification.js';
import Question from './Question.js';
import Poll from './Poll.js';
import BreakoutRoom from './BreakoutRoom.js';
import SubscriptionPlan from './SubscriptionPlan.js';
import Subscription from './Subscription.js';
import Payment from './Payment.js';
import UsageLog from './UsageLog.js';

User.hasOne(Subscription, { foreignKey: 'userId', as: 'subscription' });
Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

SubscriptionPlan.hasMany(Subscription, { foreignKey: 'planId', as: 'subscriptions' });
Subscription.belongsTo(SubscriptionPlan, { foreignKey: 'planId', as: 'plan' });

User.hasMany(Payment, { foreignKey: 'userId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Payment.belongsTo(SubscriptionPlan, { foreignKey: 'planId', as: 'plan' });
Subscription.hasMany(Payment, { foreignKey: 'subscriptionId', as: 'invoices' });
Payment.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });

User.hasMany(UsageLog, { foreignKey: 'userId', as: 'usageLogs' });
UsageLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Meeting, { foreignKey: 'hostId', as: 'hostedMeetings' });
Meeting.belongsTo(User, { foreignKey: 'hostId', as: 'host' });

User.hasMany(Notification, { foreignKey: 'recipientId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'recipientId', as: 'recipient' });

User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages' });
User.hasMany(Message, { foreignKey: 'recipientId', as: 'receivedMessages' });
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
Message.belongsTo(User, { foreignKey: 'recipientId', as: 'recipient' });

User.hasMany(Team, { foreignKey: 'ownerId', as: 'ownedTeams' });
Team.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

Meeting.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });
Team.hasMany(Meeting, { foreignKey: 'teamId', as: 'meetings' });

Meeting.hasMany(Message, { foreignKey: 'meetingId', as: 'messages' });
Message.belongsTo(Meeting, { foreignKey: 'meetingId', as: 'meeting' });

Team.hasMany(Message, { foreignKey: 'teamId', as: 'teamMessages' });
Message.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

Meeting.hasMany(Question, { foreignKey: 'meetingId', as: 'questions' });
Question.belongsTo(Meeting, { foreignKey: 'meetingId', as: 'meeting' });

Meeting.hasMany(Poll, { foreignKey: 'meetingId', as: 'polls' });
Poll.belongsTo(Meeting, { foreignKey: 'meetingId', as: 'meeting' });

Meeting.hasMany(BreakoutRoom, { foreignKey: 'parentMeetingId', as: 'breakoutRooms' });
BreakoutRoom.belongsTo(Meeting, { foreignKey: 'parentMeetingId', as: 'parentMeeting' });

export { User, Meeting, Team, Message, Notification, Question, Poll, BreakoutRoom, SubscriptionPlan, Subscription, Payment, UsageLog };
