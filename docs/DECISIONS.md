# Decisions and deliberate non-goals

## Kafka / durable event streaming - not adopted (evaluated)
Redis pub/sub is used only for ephemeral fan-out (Socket.IO adapter); durable work goes through BullMQ (Redis, AOF). Nothing in the current
product requires replayable ordered event logs across services (no analytics pipeline, no cross-service consumers). Adopt Kafka (or Redpanda/NATS JetStream) only when
one of these appears: an analytics/audit stream with replay, multiple independent consumers of the same events, or queue volumes beyond what one Redis can hold.
Until then it is operational cost without a consumer. Audit logs already persist in the database (`AuditLogs`).

## Table partitioning - not done
No table is large enough to justify it (dev DB: Messages 0 rows, AuditLogs 146). Partitioning adds constraints (the partition key must be in every unique key) and migration risk.
Revisit `Messages`, `AuditLogs`, `UsageLogs`, `Notifications` around 50M rows, using `RANGE` on `createdAt` with a rolling-window job, after measuring query plans with the 018 indexes.

## MeetingMembers join table - designed, not implemented
Problem: `GET /api/meetings` scans `Meetings` with `JSON_CONTAINS(participantIds / inviteeIds)`; no index can serve it.
Plan: table `MeetingMembers(userId, meetingId, role, PRIMARY KEY(userId, meetingId), INDEX(meetingId))`; a Sequelize `afterSave`/`afterCreate`/`afterBulkUpdate` hook on `Meeting`
recomputes members from `hostId`+`participantIds`+`inviteeIds` (central dual-write); a one-off backfill; flag `MEETING_MEMBERS_READ` switches the list query to
`WHERE id IN (SELECT meetingId FROM MeetingMembers WHERE userId = ?) ORDER BY ...`; remove JSON reads after one release.
Not implemented because the change cannot be verified here (needs a schema migration and backfill on the real database, which this environment may not run), and a wrong guess affects every user's meeting list.

## Docker / Kubernetes / Helm - excluded by the owner (PM2 + systemd deployment)

## Multi-region, autoscaling, CDN, HLS for very large webinars - not implemented
A single SFU node serves a webinar by fan-out; >1-2K viewers per room needs HLS/CDN or cascading SFUs across nodes (cross-node piping is not built).
