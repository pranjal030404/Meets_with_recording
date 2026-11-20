# Scalability Audit

Method: static reading of the repository on branch `Hello_text` (commit 9f0e676), `npm test` (3/3 pass). **Nothing here was load-tested; all capacity statements are inferences from code unless marked MEASURED (none are).**
Severity: P0 = blocks any horizontal scaling; P1 = major risk at scale; P2 = hygiene.

## 0. Premise correction
The brief assumes PostgreSQL. The code is MySQL/MariaDB. PgBouncer, Postgres read-replica streaming, `EXPLAIN ANALYZE` (Postgres semantics), and partitioning guidance in the brief do not apply as written. **Decision needed from owner** (see ROADMAP §Decisions): stay on MySQL (ProxySQL + replicas) or migrate to PostgreSQL.

## 1. Single-server dependencies / global in-memory state (P0)
| ID | Location | Problem |
|---|---|---|
| G-1 | `sockets/index.js:16-36,65,114-115` | 14 process-local Maps hold authoritative meeting state: participants, waiting room, admissions, timers, transcripts, notes, recorders, per-socket producers/transports. Two instances would each see a different meeting. |
| G-2 | `lib/mediasoup.js` | `routers/transports/producers/consumers` Maps; a roomId's Router exists only in the process that created it. A second API instance receiving `mediasoup:consume` for that room would create a *different* Router → participants split and cannot hear each other (the code comment at `getRouter` already notes this failure mode for workers). |
| G-3 | `index.js` rate-limit Map | Per-process; N instances multiply the limit by N and reset on restart. |
| G-4 | `roomRuntimeStore.js` | Meeting recovery state written to local disk; unavailable to other nodes. |
| G-5 | `index.js` startup | `User.update({isOnline:false}, where isOnline)` at **every boot** — with >1 instance, restarting one node marks every user offline cluster-wide. |
| G-6 | `ecosystem.config.cjs` | Documented single-instance constraint. |
| G-7 | `routes/file.js`, `meeting.js` | Uploads, recordings, transcripts on local disk, served by Express static. A second node cannot serve them. |
| G-8 | `reminderService` cron | Runs in every API instance → duplicate reminders/notifications unless leader-elected. |

## 2. Socket.IO (P0/P1)
- **S-1 (P0) Redis adapter is effectively not wired correctly.** `index.js` creates it in a floating async IIFE with `retryStrategy: null`; if Redis is down at boot the adapter is silently skipped ("running single-instance") and never retried; after a later Redis outage clients do not reconnect (no retry). The IIFE also depends on `io` having been assigned by the time the dynamic imports resolve (race, works by accident). `REDIS_URL` defaults to localhost so a missing Redis is a warning, not a failure. Even when attached, rooms/events propagate but G-1 state does not.
- **S-2 (P0)** Handlers use `io.to(info.socketId)` on socketIds taken from local Maps (waiting-room, host actions). With an adapter this works for emit, but the lookup data is local → other nodes' participants are invisible.
- **S-3 (P1)** `disconnect` handler computes "still connected" via `io.sockets.sockets` — local-only. Multi-tab/multi-instance users flip offline wrongly. Use `fetchSockets()` (adapter-aware, expensive) or a Redis presence counter with TTL.
- **S-4 (P1)** Presence is stored in the DB (`User.isOnline`, `lastSeen`) with a write on every connect/disconnect. Connect storms = DB write storms. Typing indicators are broadcast only (ok), but presence belongs in Redis with TTL.
- **S-5 (P1)** `connectedUsers` keyed by userId stores only the **last** socket → multi-device unaware.
- **S-6 (P1)** `maxHttpBufferSize: 1e8` (100 MB) per message on an authenticated socket: memory-amplification/abuse vector.
- **S-7 (P1)** No per-socket event rate limiting (whiteboard:draw, chat:send, caption:text, notes:update are unthrottled and several write to DB or broadcast).
- **S-8 (P2)** `transports: ['websocket','polling']` with polling fallback requires sticky sessions at the LB; nginx config must provide them or force websocket-only.
- **S-9 (P1)** 39 `console.log` calls in the socket file, including per-join user names (PII in logs; sync stdout cost at scale).

## 3. mediasoup (P0/P1)
- **M-1 (P0)** Router-per-meeting is keyed locally (G-2); no meeting→node assignment exists, no registry, no node ID, no capacity data.
- **M-2 (P1)** Placement within a node uses only `appData.rooms` (meeting count) — ignores per-worker CPU/consumer count, which dominates SFU load.
- **M-3 (P1)** Worker count capped at 8 and `numWorkers` defaults to `os.cpus().length` (reports host cores inside containers, not cgroup quota → over-subscription in Kubernetes).
- **M-4 (P1)** A single Router cannot span workers; a meeting is limited to one core (mediasoup guidance: use `pipeToRouter` for larger rooms). No `pipeToRouter` usage exists.
- **M-5 (P1)** Everyone consumes every producer (no selective subscription, no layer selection, no last-N, no webinar mode) → O(N²) consumers: 100 participants × 99 = ~9,900 video consumers in one meeting. This is the real limit on meeting size, not Socket.IO.
- **M-6 (P1)** Worker death only drops routers locally; participants are not notified to reconnect (sockets stay connected with dead transports); no recovery workflow. Failure of the `process.exit(1)` branch kills all meetings.
- **M-7 (P2)** `listenIps` single IP; `maxIncomingBitrate` 6 Mbps/transport; SCTP enabled on every transport (`enableSctp: true`, 1024 streams) although data channels are not used by Socket.IO path — extra memory per transport. *Verify use before disabling.*
- **M-8 (P1)** `logLevel: 'debug'` + many logTags in non-production; `console.log` per transport/producer/consumer.
- **M-9 (P0 for prod)** TURN: one static shared username/credential from env, returned to clients; no time-limited credentials; Google public STUN dependency.
- **M-10 (P1)** No stats collection (bitrate, packet loss, jitter) from mediasoup, no `consumer.on('score')`/`layerschange` handling — adaptive quality is entirely browser-side.

## 4. Database (MySQL/MariaDB) (P1)
- **D-1** Single instance; no replica routing; pool max 50 per process (×N instances may exceed `max_connections`).
- **D-2** Auth does a DB read on **every** REST request and socket handshake (`User.findByPk`; REST also loads the password hash). At 100K sockets reconnecting this is the first thing to melt. Mitigation: short-TTL Redis cache of user-status (isActive, role) or embed claims in JWT with revocation list.
- **D-3** `Message`, `Meeting`, `Notification` define **no secondary indexes** in the models (only `ConversationMember` has one; migrations not yet checked line by line for others — *to verify with `SHOW INDEX`*). Message history queries (`routes/message.js`, `chat.js`) use `limit` but no cursor pagination; thread replies hard-capped at 200.
- **D-4** `Meeting.participants`, `Meeting.recordings`, `Meeting.settings` are JSON blobs mutated by read-modify-write (`appendRecording` uses an in-process `withMeetingLock` — **not safe across instances**, lost updates).
- **D-5** `sequelize.sync()` on every boot alongside migrations: schema drift risk, startup contention with N instances.
- **D-6** No slow-query logging (`logging: false`), no pool metrics.
- **D-7** Transient presence written to DB (see S-4) — brief forbids.

## 5. Network / storage (P1)
- **N-1** Recordings/files go through Node (multer disk, express.static) — bandwidth and disk bound to the API node; no signed URLs, `/uploads` is served statically so authorization depends on unguessable filenames (**verify**: private recordings may be fetchable by URL without auth).
- **N-2** `express.json({limit:'10mb'})` globally.
- **N-3** No CDN; frontend static assets served by Node in production.
- **N-4** All media ports (40000–49999 ×1 host) = single NIC bottleneck; no bandwidth accounting.

## 6. Authentication / authorization
- JWT 7-day, no refresh/revocation list, same `JWT_SECRET` for all (fine for multi-instance if shared via secret store).
- Socket auth is at handshake only; `mediasoup:*` handlers take `roomId` from the client payload — **verify each handler checks the socket is actually in that room** (to audit in Phase 2).
- Positive: breakout rooms authorize against parent meeting; waiting-room and lock enforced server-side.

## 7. Background jobs
In-process cron (G-8) and in-process transcription queue (local Whisper CPU-bound work in the API process → event-loop and CPU contention with the SFU's host). No retries/backoff/DLQ, state in memory, `recoverStuckTranscriptions` marks interrupted jobs failed at boot.

## 8. Observability (absent)
No metrics endpoint, no tracing, unstructured `console.*` logs, health endpoint without dependency checks, no event-loop lag, no SFU stats.

## 9. Failure recovery (absent)
Redis down → silent single-instance mode; DB down at boot → `process.exit(1)`; worker death → partial loss without client notification; process restart → all sockets reconnect, meeting tools restored from local disk only on the same host; `isOnline` reset for everyone (G-5).

## 10. Memory-leak candidates
`restoredRooms` (cleared in `clearRoomTools` only), `roomTranscripts` (2000 lines/room cap OK), `userProducers/userTransports` (cleaned at disconnect), `rateLimits` (pruned), `connectedUsers` (deleted only when last socket closes — stale if disconnect throws before). `mediasoupService.transports/producers/consumers` maps rely on events to prune; consumer maps on `producerclose` pruned. **No leak was reproduced; these need a soak test.**

## 11. What is already good (keep)
Graceful `draining` health flag; worker-death replacement; ICE restart support; per-room Router de-dupe of concurrent joins; server-side admission gating; Opus FEC; TRUST_PROXY handling; breakout authorization; adapter dependencies already installed.

## 12. Status update (end of Phase 8) - see SCALABILITY_ROADMAP.md ledger for details
Addressed in code: G-1/G-2 (meeting ownership per node instead of shared state), G-3, G-4 (partly), G-5, G-8, D-4, S-1…S-7, S-9 (JSON logs), M-1…M-3, M-5, M-6, M-9, M-10 (partly), D-1 (pool/replica opt-in), D-6, N-1 (driver + signed URLs exist, not wired), observability and health endpoints.
Still open: N-1 (files still on local disk; `/uploads` access control now DONE), D-2 (auth DB lookup per request, no cache), D-3 (index migration written, not run/verified), meeting-list JSON_CONTAINS scan, M-4 (`pipeToRouter`), D-5 (`sync()` at boot), JWT revocation, multi-region, autoscaling.
Correction to the original audit: FK columns already had single-column indexes; the gap is composite indexes (migration 018).
