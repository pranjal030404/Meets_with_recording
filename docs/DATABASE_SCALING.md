# Database scaling (MySQL/MariaDB)

The system runs on MariaDB (11.8 locally); this document is for that engine, not PostgreSQL (see SCALABILITY_AUDIT §0).

## What is implemented
| Item | Status |
|---|---|
| Pool config per process (`DB_POOL_*`) + `poolStats()` in `/readyz` | IMPLEMENTED (smoke-tested) |
| Read replicas, opt-in: `DB_READ_HOSTS=host[:port],...` → Sequelize replication; SELECTs spread over replicas, writes to `DB_HOST` | IMPLEMENTED, **not tested against a real replica** |
| Auth lookups (`protect`, socket handshake) pinned to primary (`useMaster`) so suspensions apply immediately | IMPLEMENTED |
| Slow-query log (`DB_SLOW_QUERY_MS`, default 500 ms; statements only, no parameters) + counters (`dbStats`) | IMPLEMENTED (not yet exported to Prometheus – Phase 6) |
| Migration 018: 7 composite indexes (idempotent, reversible `down`) | WRITTEN, **NOT RUN, NOT EXPLAIN-VERIFIED** (see below) |
| Keyset (cursor) pagination: `GET /api/notifications?cursor=start|<c>`, `GET /api/conversations/:id/messages?cursor=…` returning `nextCursor`; tie-safe (createdAt,id); legacy `page`/`before` unchanged | IMPLEMENTED AND TESTED (logic); SQL path not run against data |
| ProxySQL/connection multiplexing config | DOCUMENTATION ONLY (below) |
| Table partitioning | NOT IMPLEMENTED (not justified yet: no table is large; revisit Messages/AuditLogs/UsageLogs at >~50M rows) |
| Backups / PITR docs | NOT WRITTEN (Phase 8: DISASTER_RECOVERY.md) |

## Index justification (from query shapes, not from measurements)
The earlier audit claim "no secondary indexes" was too strong: Sequelize FK columns already have single-column indexes
(`SHOW INDEX` on the dev DB). The real gap is composite indexes matching `WHERE … ORDER BY createdAt DESC LIMIT n`,
which with single-column indexes needs a filesort over every row of the conversation/user. Index → query mapping is in the
header of `migrations/018-scaling-indexes.js`. **The dev database has 0 messages/notifications, so EXPLAIN there proves nothing.**
Required validation: load a scratch DB (not production, not your dev DB) with realistic volumes and run
`backend/scripts/explain-queries.sql` before/after the migration; keep an index only if `key` switches to it and filesort disappears.
(Creating a scratch DB from this session was blocked by the permission classifier, so it was not done.)

## The real bottleneck: meeting lists
`GET /api/meetings` filters `hostId = ? OR JSON_CONTAINS(participantIds, ?) OR JSON_CONTAINS(inviteeIds, ?)`.
No B-tree index can serve JSON_CONTAINS: it is a full scan of Meetings per request, per user. Plan (NOT implemented; touches every
place that mutates participants/invitees):
1. `MeetingMembers(meetingId, userId, role, PRIMARY KEY(userId, meetingId))` with `INDEX(meetingId)`.
2. Backfill from the JSON columns; dual-write in lifecycle/meeting routes; switch reads; drop JSON reads after one release.
Similarly `Meeting.recordings` / `participants` JSON blobs are read-modify-write (now serialized by a Redis lock) and should become rows at scale.

## Replica caveats
- Replication lag: a read right after a write can be stale. Only auth is pinned to primary today; add `useMaster: true` to any new read-your-writes path (e.g. fetch-after-create).
- Sequelize replication picks a replica per query, not per request. Cache/consistency-sensitive code must opt out explicitly.

## ProxySQL (guidance)
Run ProxySQL between apps and MariaDB: hostgroup 10 = primary (writes), 20 = replicas (reads); `mysql_query_rules` routing is optional
because the app already splits reads/writes. Its value is connection multiplexing: set app `DB_POOL_MAX` so that
`instances × DB_POOL_MAX` stays under ProxySQL `max_connections`, and ProxySQL's backend pool under MariaDB `max_connections`.
Do not size pools from guesses: measure with the load tests (`poolStats().waiting` > 0 under load = pool too small).
