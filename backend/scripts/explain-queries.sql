-- Run ONLY against a scratch copy of the schema loaded with representative volumes (e.g. 1M messages),
-- before and after `npm run migrate` (migration 018). Compare `type`, `key`, `rows` and the absence of "Using filesort".
-- Replace the placeholders with real ids from your scratch data.
SET @conv = '<conversation uuid>', @meeting = '<meeting uuid>', @team = '<team uuid>', @user = '<user uuid>';

EXPLAIN SELECT * FROM Messages WHERE conversationId=@conv AND threadRootId IS NULL AND isDeleted=0 ORDER BY createdAt DESC, id DESC LIMIT 51;
EXPLAIN SELECT * FROM Messages WHERE meetingId=@meeting AND isDeleted=0 ORDER BY createdAt DESC LIMIT 50;
EXPLAIN SELECT * FROM Messages WHERE teamId=@team AND channelType='general' AND isDeleted=0 ORDER BY createdAt DESC LIMIT 50;
EXPLAIN SELECT * FROM Messages WHERE threadRootId='<root uuid>' ORDER BY createdAt ASC LIMIT 200;
EXPLAIN SELECT * FROM Notifications WHERE recipientId=@user ORDER BY createdAt DESC, id DESC LIMIT 51;
EXPLAIN SELECT COUNT(*) FROM Notifications WHERE recipientId=@user AND isRead=0;
EXPLAIN SELECT * FROM Meetings WHERE status='scheduled' AND scheduledAt IS NOT NULL;
-- Known unfixable by indexes (full scan): the meeting list uses JSON_CONTAINS on participantIds/inviteeIds
EXPLAIN SELECT * FROM Meetings WHERE hostId=@user OR JSON_CONTAINS(participantIds, JSON_QUOTE(@user)) OR JSON_CONTAINS(inviteeIds, JSON_QUOTE(@user)) ORDER BY scheduledAt DESC LIMIT 20;
