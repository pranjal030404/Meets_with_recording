# Current Architecture (as inspected, not as intended)

Source of truth: `backend/src/index.js`, `backend/src/sockets/index.js`, `backend/src/lib/mediasoup.js`,
`backend/src/config/mediasoup.js`, `backend/src/database/index.js`, `backend/ecosystem.config.cjs`.

## Topology
Single Node.js process (PM2 fork mode, `instances: 1`, deliberately — see ecosystem.config.cjs comment) running:
Express REST + Socket.IO + mediasoup workers (child processes) + node-cron reminders + file/recording handling,
fronted by nginx or Apache (`deploy/`). One MySQL/MariaDB instance. Local disk for uploads/recordings.

## Facts that differ from the project brief
| Brief says | Code says |
|---|---|
| PostgreSQL | **MySQL/MariaDB** (`dialect: 'mysql'`, `mysql2` dependency; no `pg`). All 17 migrations and JSON-column handling (afterFind hook for MariaDB LONGTEXT) are MySQL-specific. |
| Redis not present | `ioredis` + `@socket.io/redis-adapter` are installed and an adapter is *attempted* at startup (see audit, issue S-1). |

## Components
- **HTTP**: 16 route modules under `/api/*`; JWT (7d, HS256, `JWT_SECRET`) validated per request with a **DB lookup** (`User.findByPk`, including password column) in `middleware/auth.js`.
- **Socket.IO** (v4.7): auth in `io.use` via `verifySocketToken` (JWT + DB lookup). ~60 event handlers in one 1,307-line file. Rooms: `roomId`, `user:<id>`, team/conversation rooms.
- **mediasoup** (`lib/mediasoup.js`): `MediasoupService` singleton. N workers (≤8), one Router per meeting `roomId` placed on the worker with the fewest rooms. Maps: `routers`, `transports`, `producers`, `consumers`. Every participant consumes every producer (full mesh of subscriptions through the SFU). One WebRtcTransport (send) + one (recv) per socket. `listenIps` is a single IP with `announcedIp` from env or auto-detected.
- **ICE servers**: static, `stun.l.google.com` + optional single TURN static username/credential from env (`config/mediasoup.js`).
- **Meeting state** (all process-local Maps in `sockets/index.js`): `connectedUsers`, `roomParticipants`, `roomWaiting`, `roomAdmitted`, `roomTimers`, `roomTranscription`, `roomTranscripts`, `roomStreams`, `roomRecorders`, `meetingNotes`, `userTransports`, `userProducers`, `restoredRooms`, `roomClearTimers`.
- **Crash recovery of meeting tools**: `services/roomRuntimeStore.js` snapshots timer/notes/admitted to JSON files in `uploads/runtime/` (local disk, debounced).
- **Persistence**: Sequelize models (22), migrations 001–017 + 999 (no 009), plus `sequelize.sync({alter:false})` at every boot.
- **Background work**: `node-cron` every minute (reminders, meeting start) inside the API process; hourly `setInterval` for subscription expiry; in-process transcription queue (`recordingService.enqueueTranscription`) running local Whisper/Ollama.
- **Files/recordings**: multer `diskStorage` under `backend/uploads/` (files, tmp/recordings, transcripts); served via `express.static('/uploads')` — i.e. through Node, without per-request authorization.
- **Rate limiting**: per-process `Map` of timestamps keyed by IP.
- **Health**: `GET /api/health` (returns 503 while draining; no dependency checks; exposes `memory`, `pid`).
- **Shutdown**: SIGTERM → `io.close()`, `httpServer.close()`, hard exit after 10 s. DB/Redis/mediasoup not closed explicitly.

## Request / media flow today
Browser → nginx → Node (REST + WS, same port). Media: browser ↔ mediasoup UDP/TCP ports 40000–49999 directly on the same host (not via nginx).
