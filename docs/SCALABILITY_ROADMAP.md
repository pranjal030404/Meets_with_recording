# Scalability Roadmap

Ordered so that every phase leaves the app working and deployable. Status legend: NOT STARTED unless stated. Nothing below is implemented yet.

## Decisions required from the owner before Phase 2/4
1. **Database**: (a) keep MySQL/MariaDB → ProxySQL + read replicas + Sequelize `replication` option; or (b) migrate to PostgreSQL (rewrite 17 migrations, JSON→JSONB, data migration, PgBouncer). Recommendation: **(a) for now** — migration risk is unrelated to scale; revisit with load-test evidence.
2. **Meeting state source of truth**: Redis (fast, TTL, loses data on flush) with periodic DB snapshot for durable bits (admitted list, transcripts). Recommended.
3. **Single-region first**, multi-region later.
4. Cloud target (AWS/GCP/bare-metal) — decides media-node networking (host network + elastic public IPs).

## Phase 2 — Make the API/Socket tier stateless (first real code)
1. `infrastructure/redis/redisClient.js` (ioredis, retry/backoff, health, events) — replaces the fire-and-forget IIFE (S-1).
2. `realtime/socketAdapter.js` — adapter attached **before** `listen`, with reconnect; fail-open for non-meeting features, fail-closed for meeting admission.
3. `realtime/presenceManager.js` — Redis hash/zset with TTL + per-socket heartbeat; multi-tab refcount; DB `isOnline` becomes a lazy mirror (debounced), remove boot-time global reset (G-5).
4. `realtime/roomManager.js` — move G-1 Maps to Redis (hashes per room, TTL); keep local cache only for the sockets on this node.
5. Redis-based rate limiter (G-3) + socket event limiter (S-7); cap `maxHttpBufferSize` (S-6).
6. `/healthz` (liveness), `/readyz` (DB + Redis + draining), proper graceful shutdown order (stop accept → drain → close io → redis → sequelize).
7. Leader election (Redis lock) for cron (G-8); optimistic locking/`SELECT … FOR UPDATE` for `Meeting.recordings` (D-4).
8. nginx upstreams with `least_conn` (REST) and `ip_hash`/cookie stickiness (Socket.IO polling), WS upgrade.
Exit criteria: two API instances + one Redis pass an integration test: user A on node 1 and B on node 2 see each other's presence/typing/chat/room join; kill node 1 → B unaffected.

## Phase 3 — Media scaling
Node registry (Redis, TTL heartbeat) → meeting placement (weighted score, sticky meeting→node) → signaling routing: clients obtain `{sfuNodeId, mediaAddress}` and the **media/control socket connects to the owning node** (or signaling is proxied by an internal RPC) → per-worker load (consumers/producers/CPU via `worker.getResourceUsage()`) → cgroup-aware worker count → selective subscription/last-N/layer selection (M-5) → `pipeToRouter` across workers for large rooms, cross-node only with measured need → worker/node failure notification and client reconnect workflow.
Honest limit: active WebRTC transports cannot migrate; clients must re-join the new node.

## Phase 4 — Data & queues
DB read/write split, index review with `EXPLAIN` on the real schema, cursor pagination for messages, BullMQ for transcription/AI/email/notifications (retries, backoff, idempotency), S3-compatible storage + signed URLs (fixes N-1).

## Phase 5 — Infrastructure
Dockerfiles, compose (redis, db, nginx, 2×api, sfu), K8s: API/socket/worker Deployments + HPA + PDB; **SFU nodes as host-networked DaemonSet/StatefulSet on a dedicated node pool, not behind a ClusterIP**; coturn with REST-style time-limited credentials issued by an authenticated endpoint.

## Phase 6 — Observability
prom-client metrics, `/metrics` on an internal port, Grafana dashboards, alert rules, OpenTelemetry traces, structured JSON logs (pino) to Loki.

## Phase 7 — Load & failure testing
k6 (REST), Artillery (Socket.IO), real-media clients (headless mediasoup-client or `mediasoup-client` in Node w/ werift/wrtc, or Chrome fake-media) — each step 100 → 100K reported separately; failure drills.

## Phase 8 — Production readiness
Security review, backup/restore drill, DR runbooks, deployment docs.

## Implementation-status ledger
Decisions taken (defaults, change if you disagree): keep MySQL/MariaDB; Redis for live state; single region; cloud-agnostic.

### Phase 2 (partially done)
| Item | Status |
|---|---|
| Redis client (backoff, no silent localhost default, `REDIS_REQUIRED`) | IMPLEMENTED AND TESTED (mock) |
| Socket.IO Redis adapter attached before listen, auto-reconnect | IMPLEMENTED; cross-node delivery test written (`tests/adapter.integration.test.js`) but **NOT RUN** – no Redis server in this environment |
| Presence (TTL, multi-tab/device, stale cleanup, local fallback) | IMPLEMENTED AND TESTED (mock); DB `isOnline` now written only on transitions; global boot reset removed when Redis enabled; leader-elected reconcile of stale flags |
| Redis rate limiter (shared, degrades to local) | IMPLEMENTED AND TESTED (mock) |
| Leader election for cron/expiry; cross-instance lock for `Meeting.recordings` | IMPLEMENTED AND TESTED (mock) |
| `/healthz`, `/readyz` (DB, Redis, adapter, draining) | IMPLEMENTED; smoke-tested on a real boot |
| Ordered graceful shutdown (drain delay → http/socket → mediasoup → redis → db) | IMPLEMENTED; verified by real SIGTERM |
| `maxHttpBufferSize` 100MB → 1MB | IMPLEMENTED (check no client sends >1MB over sockets) |
| Fixed pre-existing bug: `presence:offline` was never sent (rooms empty at `disconnect`) | FIXED |
| nginx configs (least_conn API, ip_hash WS, limits, timeouts) | CONFIGURATION PROVIDED, not run (nginx not installed) |
| **roomManager: in-meeting state (participants, waiting room, admissions, timers, notes, producers) in Redis** | **NOT IMPLEMENTED** – deliberately deferred to Phase 3 |
| Socket per-event rate limiting; per-handler room-membership checks on `mediasoup:*` | NOT IMPLEMENTED |

**What this means today:** chat, presence, typing, notifications, team/conversation events work across API instances (once Redis is running and the integration test passes). **A single meeting must still live on one node** – its mediasoup router and waiting-room/admission state are local. Do not run >1 instance for meetings until Phase 3 provides meeting→node affinity.

### Phase 3 (partially done) - media scaling
Model: **each API process is also a meeting-owner/SFU node.** A meeting is owned by exactly one node (signaling, in-meeting state, mediasoup router together); other nodes redirect. This removes the need to move all 14 in-memory Maps to Redis for correctness, because a meeting's state is only ever touched by its owner.

| Item | Status |
|---|---|
| Node registry (Redis hash + TTL heartbeat, id/host/region/zone/media address/load/status) | IMPLEMENTED AND TESTED (mock Redis) |
| Load snapshot (CPU, memory, NIC Mbps from /proc/net/dev, workers, meetings, transports, producers, consumers) | IMPLEMENTED; not load tested |
| Weighted capacity-aware placement (unlimited dims ignored, hard exclusion of unhealthy/draining/stale/full nodes, region penalty; CPU and memory readings only steer: when every node is over them the least loaded one still takes the meeting) | IMPLEMENTED AND TESTED (pure function). **Weights are a heuristic, not benchmark-derived; limits (`SFU_MAX_*`) must come from load tests – unset means unconstrained** |
| Meeting affinity (atomic SET NX, breakouts co-locate with parent, concurrent first joins converge on one owner) | IMPLEMENTED AND TESTED (mock Redis) |
| Ownership guard on `room:join`, `mediasoup:getRouterRtpCapabilities`, `mediasoup:createWebRtcTransport`; `room:redirect` event; `GET /api/meetings/:roomId/placement` | IMPLEMENTED; a call ran on the second of 2 real nodes (one machine, `tests/e2e/two-node.mjs`); the redirect event itself was not forced |
| Media ops now require an existing, non-ended meeting (previously any socket could create routers for arbitrary roomIds) | IMPLEMENTED |
| Frontend: ask placement before connecting, connect socket to owner node | IMPLEMENTED; exercised in Chromium with 2 nodes on one machine |
| Per-worker consumer/producer tracking; worker choice by consumers+producers then rooms (was rooms only) | IMPLEMENTED; not load tested |
| Worker death notifies the room (`media:reconnect-required`) | IMPLEMENTED; server side tested with a real mediasoup worker (SIGKILL → rooms reported lost, worker replaced); client handler written, **not run in a browser** |
| Node failure: expiry detection, leader-elected sweep, meeting release, CAS reassignment, fail-closed when no capacity | IMPLEMENTED AND TESTED (mock Redis) |
| Meeting tools (timer/notes/admitted) mirrored to Redis so a new owner can restore them | IMPLEMENTED; not tested end to end |
| Controlled drain (`sfu-drain` stage: no new meetings, existing keep running) | IMPLEMENTED |
| Frontend failover (`recoverMedia`): on `media:reconnect-required`, `room:redirect`, redirect from a media call, or 3 failed socket reconnects → re-resolve placement, switch socket if the owner moved, rebuild transports, republish mic/cam/screen, re-join; backoff up to 8 tries | IMPLEMENTED; node SIGKILL exercised in Chromium: both people on the other node after about 20 s, video and chat resumed. Worker death and redirect triggers not exercised in a browser |
| Multi-worker meetings via `pipeToRouter`; cross-node piping | **NOT IMPLEMENTED** (one meeting = one worker = one core) |
| Selective subscription: modes small/medium/large/webinar, server-enforced video/audio/screen budgets with bounded priority extras (pinned, active speaker), denial counters in `getStats().subscriptions` | IMPLEMENTED AND TESTED (policy unit tests; real-worker test for observer/stats). **Budgets are heuristics, not benchmarks** |
| Active-speaker detection (mediasoup AudioLevelObserver per router) → `media:active-speakers` | IMPLEMENTED; observer attach tested on a real worker, speaking behaviour not tested |
| Layer selection (`mediasoup:setConsumerLayers`, ownership-checked, clamped): thumbnails layer 0, speaker/pinned higher | IMPLEMENTED; not tested with real media |
| Frontend reconciler (catalog, pinned/spotlight/speaker priority, drop/start consumers, deny cool-down, layer requests) | IMPLEMENTED (builds); **not run in a browser** |
| Webinar mode toggle UI / attendee publish restrictions | NOT IMPLEMENTED (server honours `settings.webinar`; no UI; attendees can still publish) |
| `sfuMetrics`, `transportManager/routerManager/workerManager` split (logic remains in `lib/mediasoup.js`) | NOT IMPLEMENTED (metrics = Phase 6) |

Failure semantics (explicit): after an owner-node failure, **every participant's WebRTC transports are lost and must be rebuilt**; the meeting is re-placed on the next join; waiting-room queue and uncheckpointed state are lost; timer/notes/admitted are restored from Redis (up to ~1s stale).
Required for multi-node: set `NODE_ID`, `NODE_PUBLIC_URL` (reachable by browsers, with CORS allowing the app origin), `NODE_REGION`, and `MEDIASOUP_ANNOUNCED_IP` per node; run Redis with `REDIS_REQUIRED=true`.

### Phase 4 (partially done) - data, queues, storage
| Item | Status |
|---|---|
| DB pool/replica/slow-query/pool-stats; cursor pagination; migration 018 | see `docs/DATABASE_SCALING.md` (indexes **not run / not EXPLAIN-verified**; replicas untested) |
| BullMQ queues + workers (`src/queues`, `src/workers`): retries, exponential backoff, per-job timeout, concurrency limits, idempotent jobId, failed-set as dead-letter, graceful close, dedicated entry `src/workers/main.js` | IMPLEMENTED; see test status in the final report |
| Queues migrated: transcription (replaces in-process queue when Redis is on), non-critical email (team invite, task assigned) | IMPLEMENTED |
| Queues NOT migrated: AI summaries, notifications fan-out, file processing, analytics, reminders (still node-cron, now leader-elected) | NOT IMPLEMENTED |
| Queue metrics (`queueCounts()`) | IMPLEMENTED, not yet exposed via HTTP/Prometheus |
| Storage abstraction (local + S3 drivers), presigned download/upload/multipart URL generation, HMAC-signed local URLs, `POST /api/storage/recordings/:roomId/:recordingId/download-url` with meeting authorization | IMPLEMENTED AND TESTED offline (signing/validation); **never run against a real S3/MinIO bucket** |
| `/uploads` access control: authenticated + per-path authorization (cookie/bearer), no frontend URL changes | **DONE** (tested with a real Express server; not yet exercised in a browser). Files still live on local disk (not yet moved to S3) |
| Storage usage tracking, expiration/lifecycle policies, CDN | NOT IMPLEMENTED (bucket lifecycle rules + CDN are deployment config) |
| Durable event streaming (Kafka) | NOT EVALUATED/IMPLEMENTED |

### Phase 5 (adapted: PM2 + systemd, NO Docker/Kubernetes by decision)
| Item | Status |
|---|---|
| Docker / Docker Compose / Kubernetes / Helm / HPA / PDB | **NOT DONE BY DECISION** (not using containers) |
| PM2 multi-node ecosystem (`backend/ecosystem.multinode.config.cjs`): per-node PORT/NODE_ID/NODE_PUBLIC_URL, disjoint mediasoup port slices, cores split across nodes, dedicated worker processes, 30 s kill timeout | IMPLEMENTED AND TESTED (config generation); **not started under real PM2** |
| nginx per-node vhost generator (`gen-node-vhosts.mjs`) + shared `nginx.conf` | IMPLEMENTED (generator output checked); nginx config **never loaded by nginx** |
| `GET /api/webrtc/ice-servers`: authenticated, per-user time-limited TURN credentials (coturn REST HMAC), secret never sent to clients; frontend consumes it | IMPLEMENTED AND TESTED (credential math); frontend builds, **not run in a browser; no coturn host exists to test relay** |
| coturn config template + README (systemd, ports, TLS, denied private peers, metrics, regional notes) | CONFIGURATION PROVIDED, not deployed |
| Redis config guidance | CONFIGURATION PROVIDED |
| Autoscaling | **NOT IMPLEMENTED** (PM2 cannot add hosts; manual or cloud instance groups) |
| Cloud networking, firewall, announced-IP guidance, rolling restart procedure | DOCUMENTATION ONLY (`docs/PRODUCTION_DEPLOYMENT.md`) |
| Object storage/CDN deployment | see Phase 4 (driver exists, not wired into upload routes) |

### Phase 6 - observability
See `docs/MONITORING.md`. IMPLEMENTED: prom-client metrics + internal listener (verified on a live boot, including with Redis down), JSON logs, per-socket limiter metrics. CONFIGURATION PROVIDED (never loaded into the real tools): Prometheus config, 14 alert rules, 8 Grafana dashboards, promtail/Loki. OpenTelemetry: `tracing.mjs` + PM2 `node_args` (status in final report).

### Phase 7 - performance
Load scripts written (k6 REST, Artillery Socket.IO, Playwright fake-media Chrome bots, ladder + gates, capacity calculator): **NONE EXECUTED**, so there are zero measured performance numbers. `docs/LOAD_TESTING.md`, `docs/100K_CAPACITY_PLAN.md` (arithmetic estimates only; CPU capacity deliberately left unknown).

### Phase 8 - production readiness
`docs/SECURITY_REVIEW.md` (fixes + open risks; **`/uploads` still public**), `docs/DISASTER_RECOVERY.md` (DOCUMENTATION ONLY, no drill run), `docs/FAILURE_TESTING.md` (expected vs what was actually executed), `docs/PRODUCTION_DEPLOYMENT.md`.

### Completion pass (after Phase 8)
| Item | Status |
|---|---|
| Real-Redis verification: Socket.IO adapter cross-node delivery; BullMQ retries/backoff/dead-letter/idempotent jobId/concurrency; presence, locks, rate limiter, placement (Lua compare-and-set), dead-node recovery | **TESTED against redis-server on localhost** (64/64 tests with `REDIS_TEST_URL`) |
| Two real app processes on one Redis: both register, `/readyz` fully green (redis+adapter), SIGKILL of one -> survivor's sweep removes it | **VERIFIED live** |
| Multi-worker meetings (`MEDIASOUP_SHARD_TRANSPORTS=N`): room spreads over several workers, producers piped once per target shard, worker death on any shard = room-lost notification, all shards closed with the room | **IMPLEMENTED AND TESTED on real mediasoup workers** (signalling-level; no real RTP). Off by default: the threshold must come from load tests. Still limited to ONE node |
| Webinar mode: toggle in the settings panel, server-side view-only attendees (produce rejected, existing attendee producers closed on enable), policy limits | IMPLEMENTED (server tested via policy unit tests; UI builds; not exercised in a browser) |
| Meeting settings whitelist/type-check (create, REST update, socket update) | IMPLEMENTED AND TESTED |
| Session revocation: logout revokes the token on all nodes (Redis denylist, TTL = token lifetime), `revokeUserSessions()` for sign-out-everywhere; fail-open by default, `SESSION_REVOCATION_FAIL_CLOSED=true` to fail closed | IMPLEMENTED AND TESTED (mock + real Redis). No "change password" route exists to call it from |
| Socket handshake auth cache (`SOCKET_AUTH_CACHE_MS`, default 10 s; revocation never cached) | IMPLEMENTED AND TESTED |
| Object storage wiring: workspace/chat file uploads move to S3 after save (local copy kept if upload fails); `/uploads` and the file download route redirect to presigned URLs for objects not on local disk | IMPLEMENTED AND TESTED with a fake driver; **never run against a real bucket**. Recordings/transcripts remain on local disk (transcription reads local files) |
| AI summary / notification fan-out / analytics queues | **NOT DONE**: summary endpoint is synchronous by contract (client expects the result in the response); the LLM call is network-bound and does not block the event loop. Converting needs an API+frontend change (202 + polling) |
| `MeetingMembers` join table (fix for the JSON_CONTAINS meeting-list scan) | **NOT DONE**: needs a schema migration + backfill that cannot be verified without database access (see `docs/DECISIONS.md`) |
| Index migration 018 / EXPLAIN on real data | **NOT DONE**: needs database admin access to a scratch DB (blocked by the permission classifier; not worked around) |
| Browser verification of failover/subscriptions/webinar/uploads cookie | **NOT DONE**: no test accounts/browser session available |
| Load ladder, TURN relay test, Grafana/Prometheus loading, nginx/PM2 under real services | **NOT DONE**: need infrastructure that does not exist in this environment |

### Later phases
All **NOT IMPLEMENTED**.

## Final pass (state audit + remaining code items)

| Item | Status |
|---|---|
| Registry of every per-process collection, exported as `inmemory_state_entries{store,scope}` | IMPLEMENTED AND TESTED (unit) |
| Live transcript tail (500 lines) mirrored to Redis runtime snapshot; restored on failover | IMPLEMENTED AND TESTED (unit; failover not exercised end-to-end) |
| Room restore race (concurrent joiners share one restore promise) | IMPLEMENTED, covered only by registry test |
| Async AI summary: `POST /ai/meetings/:roomId/summary?async=1` -> 202, `GET` to poll; BullMQ `summary` queue | IMPLEMENTED AND TESTED (generation + queue def); NOT TESTED over HTTP/real Redis; frontend still uses the sync call |
| Recordings and transcript artifacts mirrored to S3; worker on any node downloads the recording on demand | IMPLEMENTED, TESTED WITH FAKE DRIVER ONLY (no real bucket) |
| Migration 018 + EXPLAIN | NOT RUN (DB writes blocked by the permission classifier; run `npm run migrate` and `backend/scripts/explain-queries.sql` yourself) |
| MeetingMembers table | NOT IMPLEMENTED (design in DECISIONS.md; needs schema change + backfill verified against a real DB) |
| Browser checks, load ladder, TURN relay, Grafana/Prometheus/nginx/PM2 loading | NOT DONE (need real infra/browser) |
