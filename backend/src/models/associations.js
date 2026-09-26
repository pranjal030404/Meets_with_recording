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
import Conversation from './Conversation.js';
import ConversationMember from './ConversationMember.js';
import Task from './Task.js';
import FileEntry from './FileEntry.js';
import SavedMessage from './SavedMessage.js';
import AuditLog from './AuditLog.js';

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

// Conversations (DMs & group chats)
User.hasMany(Conversation, { foreignKey: 'createdById', as: 'createdConversations' });
Conversation.belongsTo(User, { foreignKey: 'createdById', as: 'creator' });
Conversation.hasMany(ConversationMember, { foreignKey: 'conversationId', as: 'members' });
ConversationMember.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
ConversationMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(ConversationMember, { foreignKey: 'userId', as: 'conversationMemberships' });
Conversation.hasMany(Message, { foreignKey: 'conversationId', as: 'messages' });
Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });

// Tasks
Task.belongsTo(User, { foreignKey: 'assigneeId', as: 'assignee' });
Task.belongsTo(User, { foreignKey: 'createdById', as: 'creator' });
Task.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });
Task.belongsTo(Meeting, { foreignKey: 'meetingId', as: 'meeting' });
Task.belongsTo(Message, { foreignKey: 'messageId', as: 'sourceMessage' });
Task.belongsTo(Task, { foreignKey: 'parentId', as: 'parent' });
User.hasMany(Task, { foreignKey: 'assigneeId', as: 'assignedTasks' });

// Files
FileEntry.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
FileEntry.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });
User.hasMany(FileEntry, { foreignKey: 'ownerId', as: 'files' });

// Saved (bookmarked) messages
SavedMessage.belongsTo(User, { foreignKey: 'userId', as: 'user' });
SavedMessage.belongsTo(Message, { foreignKey: 'messageId', as: 'message' });
User.hasMany(SavedMessage, { foreignKey: 'userId', as: 'savedMessages' });

// Audit logs
User.hasMany(AuditLog, { foreignKey: 'actorId', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'actorId', as: 'actor' });

export {
  User, Meeting, Team, Message, Notification, Question, Poll, BreakoutRoom,
  SubscriptionPlan, Subscription, Payment, UsageLog,
  Conversation, ConversationMember, Task, FileEntry, SavedMessage
};
