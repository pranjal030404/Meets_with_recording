# Disaster recovery

**Status: DOCUMENTATION ONLY. No backup, restore or failover has been performed by the author. Run the drills in §6 before relying on this.**

## What holds state
| Data | Where | Loss impact | Protection |
|---|---|---|---|
| Users, meetings, messages, tasks, billing, audit | MariaDB | Critical | Nightly logical dump **and** binary backup + binlog for PITR; replica for HA |
| Recordings, transcripts, uploaded files | `backend/uploads/` (local disk) or S3 bucket | High | S3 versioning + lifecycle, or `rsync`/snapshot of `uploads/` |
| Presence, placement, rate limits, runtime snapshots | Redis | Low (rebuilds in ~a minute; meeting tools may reset) | none needed |
| Queued/failed jobs (BullMQ) | Redis | Medium (pending transcriptions/emails) | Redis AOF (`appendonly yes`), replica |
| Secrets (`.env`, JWT_SECRET, TURN_SECRET) | host | Critical | secret manager / encrypted offline copy; **changing JWT_SECRET logs everyone out** |

## 1. MariaDB backup
```bash
# logical, consistent, no table locks for InnoDB (small DBs):
mariadb-dump --single-transaction --routines --triggers --events --databases meetclone | zstd > meetclone-$(date +%F).sql.zst
# physical + point-in-time (larger DBs): mariabackup + enable binlog (log_bin, binlog_expire_logs_seconds=604800)
mariabackup --backup --target-dir=/backups/full-$(date +%F) && mariabackup --prepare --target-dir=...
```
Credentials via `~/.my.cnf` (chmod 600) or a client option file, never on the command line. Ship backups off-host (different failure domain), encrypt them, retain 7 daily / 4 weekly / 6 monthly (adjust to policy).

## 2. Restore
1. Provision a clean MariaDB of the same major version. 2. Restore the last full backup (`zstd -d | mariadb`, or `mariabackup --copy-back`). 3. Replay binlogs to the target time (`mariadb-binlog --stop-datetime=... | mariadb`). 4. `npm run migrate` (idempotent, brings the schema to current). 5. Point `DB_HOST` at it and restart nodes. 6. Flush Redis placement keys (`DEL meeting:node:*`) if node ids changed.

## 3. Database failover (replica promotion) - manual procedure
Stop writes (set `/readyz` unready or stop nodes) → ensure replica caught up (`SHOW SLAVE STATUS`, lag 0) → `STOP SLAVE; RESET SLAVE ALL;` on replica → point `DB_HOST` (or ProxySQL writer hostgroup) at it → start nodes → rebuild the old primary as a replica. Automatic failover (Orchestrator/Galera/MaxScale) is **not configured**. Expect an outage of minutes; connections error until restart (the pool retries 3 times per query, then fails).

## 4. Redis failure
Standalone: restart; presence/rate-limits/placement rebuild; queued jobs survive if AOF was on. Nodes keep running with degraded cross-node features (`app_redis_up == 0` alert). With a replica, promote manually (or Sentinel). **Meetings already in progress keep their node-local media**; new joins on other nodes may land on different owners until Redis is back, so with `REDIS_REQUIRED=true` `/readyz` fails and the LB stops sending traffic.

## 5. Region / host loss
Everything is single-region in this design. Recovery = rebuild hosts from this repo + restore DB + storage in another region + re-point DNS. Realistic RTO/RPO depend on backup freshness; **no multi-region replication is implemented**. Active WebRTC sessions are always lost and must rejoin.

## 6. Drills to perform (record date/result here)
| Drill | Expected | Actual |
|---|---|---|
| Restore last dump into a scratch DB, run `npm run migrate`, boot a node against it | boots, `/readyz` ready | _not run_ |
| Kill one PM2 node during a call | clients reconnect via `recoverMedia` onto another node within ~30 s | _not run_ |
| Stop Redis for 5 min | `app_redis_up=0` alert; chat/REST keep working; recovery on restart without app restart | _not run_ (boot with Redis unreachable was observed to start and report degraded) |
| Promote replica | writes resume after config switch | _not run_ |
