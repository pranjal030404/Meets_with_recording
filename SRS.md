# Software Requirements Specification (SRS)

## MeetClone — Enterprise-Grade Video Collaboration Platform

| | |
|---|---|
| **Document Version** | 1.0 |
| **Date** | September 14, 2026 |
| **Project Status** | Phase 1 & 2 Implemented, Production Ready |
| **Compliance Basis** | ISO/IEC/IEEE 29148:2018 structure |
| **Repository** | Meets_with_recording |

---

## Table of Contents

1. [Introduction](#1-introduction)
   - 1.1 Purpose
   - 1.2 Scope
   - 1.3 Product Overview
   - 1.4 Definitions, Acronyms, and Abbreviations
   - 1.5 References
   - 1.6 Document Overview
2. [Overall Description](#2-overall-description)
   - 2.1 Product Perspective
   - 2.2 Product Functions
   - 2.3 User Classes and Characteristics
   - 2.4 Operating Environment
   - 2.5 Design and Implementation Constraints
   - 2.6 Assumptions and Dependencies
   - 2.7 System Architecture Overview
3. [Functional Requirements](#3-functional-requirements)
   - 3.1 Authentication and Authorization (FR-AUTH)
   - 3.2 Meeting Lifecycle (FR-MEET)
   - 3.3 WebRTC Media Pipeline / SFU (FR-MEDIA)
   - 3.4 Host Controls (FR-HOST)
   - 3.5 Real-Time Collaboration (FR-RT)
   - 3.6 Teams and Channels (FR-TEAM)
   - 3.7 Scheduling, Calendar, and Reminders (FR-SCHED)
   - 3.8 Notifications (FR-NOTIF)
   - 3.9 Recording and Transcription (FR-REC)
   - 3.10 Security, Rate Limiting, and Compliance (FR-SEC)
4. [External Interface Requirements](#4-external-interface-requirements)
   - 4.1 User Interfaces
   - 4.2 Software Interfaces
   - 4.3 Communication Interfaces
   - 4.4 REST API Endpoints
   - 4.5 Socket.IO Event Protocol
5. [Data Requirements](#5-data-requirements)
   - 5.1 Entity-Relationship Overview
   - 5.2 Data Entities and Attributes
   - 5.3 Data Validation Rules
   - 5.4 File Storage Requirements
6. [Non-Functional Requirements](#6-non-functional-requirements)
   - 6.1 Performance Requirements
   - 6.2 Reliability and Availability
   - 6.3 Security Requirements
   - 6.4 Scalability Requirements
   - 6.5 Maintainability
   - 6.6 Portability and Browser Support
   - 6.7 Usability
7. [Verification and Acceptance Criteria](#7-verification-and-acceptance-criteria)
8. [Out-of-Scope and Future Requirements](#8-out-of-scope-and-future-requirements)
9. [Appendix A — Data Flow Walkthroughs](#appendix-a--data-flow-walkthroughs)
10. [Appendix B — Configuration Reference](#appendix-b--configuration-reference)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the functional and non-functional requirements for **MeetClone**, a self-hosted, enterprise-grade video conferencing and team collaboration platform. The document is intended for:

- **Product owners and stakeholders** — to confirm scope and prioritization.
- **Software engineers** — to guide design, implementation, and unit/integration test creation.
- **QA engineers** — to derive test cases and acceptance criteria.
- **DevOps / infrastructure teams** — to plan deployment capacity, networking, and scaling.

The SRS describes what the system shall do, the constraints under which it operates, and the criteria against which it will be verified. It is not a design document; where design references exist (e.g., mediasoup SFU), they describe architecture constraints that requirements depend on.

### 1.2 Scope

MeetClone is a full-stack video collaboration platform delivering feature parity with Google Meet and Microsoft Teams while providing complete organizational ownership of data and infrastructure. The system is built as three cooperating software services:

1. **MeetClone Frontend** — React single-page application (SPA).
2. **MeetClone Backend** — Node.js/Express REST API, Socket.IO real-time server, and mediasoup Selective Forwarding Unit (SFU).
3. **MeetClone Data & Infrastructure** — MySQL (persistence), optional Redis (Socket.IO scaling adapter), optional TURN/STUN (NAT traversal), optional OpenAI API (transcription).

**In scope:**

- User registration, login, and profile management.
- Instant and scheduled meetings, meeting lifecycle (create, join, leave, end, cancel, invite, respond).
- WebRTC audio/video with SFU routing, simulcast, screen sharing, and active-speaker detection.
- Host controls: mute, remove, lock, waiting room, spotlight, co-host, end meeting.
- Real-time collaboration: chat, whiteboard, polls, Q&A, emoji reactions, hand raise, live captions.
- Team workspaces: teams, channels, member roles, invite codes, member management.
- Meeting scheduling with calendar view and cron-based automated reminders.
- Recording (WebM upload) and AI transcription artifacts (JSON, TXT, SRT, VTT).
- Notification system (in-app, browser push, Socket.IO push).
- Security controls: JWT, bcrypt, CORS, rate limiting, role-based access.

**Out of scope** (deferred to future phases; see [Section 8](#8-out-of-scope-and-future-requirements)): background blur, file upload, composite server-side recording, RTMP live streaming, cloud recording storage, external calendar sync, SSO/SAML/LDAP, analytics dashboards.

### 1.3 Product Overview

The product addresses the drawbacks of mainstream video platforms (per-seat licensing, data-residency concerns, limited customization, vendor lock-in, and privacy/compliance exposure) by providing a self-hostable alternative. It combines:

- HD video conferencing with up to 49 visible participant tiles.
- SFU-based media routing for scalable, low-latency multi-party calls.
- Persistent team workspaces with channel chat and role-based access.
- Meeting scheduling, calendar view, and automated reminders.
- Recording with AI-powered transcription.
- Real-time collaboration tools throughout the meeting experience.

### 1.4 Definitions, Acronyms, and Abbreviations

| Term | Definition |
|---|---|
| **API** | Application Programming Interface |
| **CORS** | Cross-Origin Resource Sharing |
| **DTLS-SRTP** | Datagram Transport Layer Security / Secure Real-Time Transport Protocol — standard WebRTC media encryption |
| **HD** | High Definition (720p/1080p video) |
| **ICE** | Interactive Connectivity Establishment — NAT traversal mechanism |
| **JWT** | JSON Web Token — stateless authentication token |
| **MCU** | Multipoint Control Unit — media compositing approach (rejected in favor of SFU) |
| **NAT** | Network Address Translation |
| **P2P** | Peer-to-Peer — direct client-to-client WebRTC (used only as fallback) |
| **PiP** | Picture-in-Picture — floating video window |
| **REST** | Representational State Transfer |
| **RTC / WebRTC** | Real-Time Communication — browser media APIs |
| **RTP** | Real-Time Transport Protocol |
| **SFU** | Selective Forwarding Unit — server relays selected media streams to each participant |
| **SRS** | Software Requirements Specification |
| **STUN** | Session Traversal Utilities for NAT |
| **TURN** | Traversal Using Relays around NAT |
| **SIMD-l / simulcast** | Sending multiple quality layers (low/medium/high) of one stream |
| **SPA** | Single-Page Application |
| **UUID** | Universally Unique Identifier |
| **VPS** | Virtual Private Server |

### 1.5 References

| Reference | Location |
|---|---|
| Project README (features, architecture, deployment, scaling) | `README.md` |
| Phase 1 & 2 Implementation Notes | `IMPLEMENTATION_COMPLETE.md` |
| Backend environment configuration | `backend/.env.example` |
| Backend package manifest | `backend/package.json` |
| Frontend package manifest | `frontend/package.json` |
| Mediasoup worker/router configuration | `backend/src/config/mediasoup.js` |
| Server entry point (middleware, routes, Socket.IO, startup) | `backend/src/index.js` |
| Socket.IO event handlers | `backend/src/sockets/index.js` |
| Recording orchestration | `backend/src/services/recordingService.js` |
| Transcription engine | `backend/src/services/transcriptionService.js` |
| Cron reminder service | `backend/src/services/reminderService.js` |
| Sequelize data models | `backend/src/models/*.js` |

### 1.6 Document Overview

This document is organized into nine major sections. Sections 1 and 2 are the introduction and overall description. Section 3 contains the functional requirements grouped by subsystem. Section 4 specifies external interfaces. Section 5 describes data requirements. Section 6 covers non-functional requirements. Sections 7 and 8 define acceptance criteria and future work. Appendices A and B provide walkthroughs and configuration references.

---

## 2. Overall Description

### 2.1 Product Perspective

MeetClone is a new, standalone product (not a component of a larger system), though it interoperates with optional external services:

- **OpenAI Speech-to-Text API** — optional; produces transcripts for meeting recordings.
- **Google STUN server** — always configured; optional **TURN** server for restrictive networks.
- **Redis** — optional; enables Socket.IO horizontal scaling across multiple processes/servers.

The system runs in two deployment topologies: a single-instance development/dev mode and a clustered production mode (PM2 cluster, optional Redis, optional TURN for NAT).

### 2.2 Product Functions

The principal functions of MeetClone are:

1. **User management** — registration, login/logout, profile, roles (`user`, `admin`, `superadmin`).
2. **Meeting management** — create instant/scheduled meetings, join, leave, end, cancel, invite attendees, respond to invitations, meeting history and filters.
3. **Real-time media** — SFU-backed audio/video with simulcast quality layers, screen sharing, active-speaker detection, mute/video state sync.
4. **Meeting collaboration** — in-meeting chat (public and private), whiteboard, polls, Q&A board, emoji reactions, hand raise, live captions.
5. **Host/moderation controls** — force mute, force video off, remove participant, lock meeting, waiting room admit/deny, spotlight/pin, promote co-host, end meeting, lower all hands.
6. **Team workspaces** — create teams, auto-provision channels (`general`, `meetings`, `announcements`), role management (owner/admin/member/guest), invite by email or code, real-time channel chat.
7. **Scheduling & calendar** — schedule meetings with team association, invitees, reminders, recurrence flag; monthly calendar view with meeting badges.
8. **Reminders** — cron-based notification dispatch at 15 minutes, 1 hour, and 1 day before scheduled meetings, plus meeting-start notifications.
9. **Recording & transcription** — receive uploaded WebM recording, persist to room-specific storage, generate transcription artifacts (JSON/TXT/SRT/VTT) via OpenAI.
10. **Notifications** — typed, prioritized, per-recipient notifications with read/unread state delivered via REST read + Socket.IO push + optional browser Notification API.

### 2.3 User Classes and Characteristics

| User Class | Characteristics | Primary Needs | Typical Rights |
|---|---|---|---|
| **Guest (unauthenticated)** | Visits `/login`, `/signup`; may enter team via invite code notionally | Register or log in | None until authenticated |
| **Registered User** | Authenticated; can host/join meetings, chat, create teams | Meeting join, chat, team participation | Own meetings; member-level team rights |
| **Meeting Host** | Creator of a meeting; also any participant the host promotes | Moderation and control | Full meeting controls, settings, invite, recording, end meeting |
| **Co-Host** | Promoted by host | Shared moderation | Mute/remove (via socket path) as delegated |
| **Team Owner / Admin** | Creator or elevated member of a team | Manage team, members, roles | Invite/remove members, assign roles, delete team |
| **Team Member / Guest** | Belongs to a team | Channel chat, join team meetings | Read/chat in channels; no admin rights |
| **Platform Admin / Superadmin** | Seeded via `createSuperAdmin` script | Platform oversight | Highest platform role (`superadmin`) |

The system must not require an account to be provisioned by an administrator for basic usage; signup is open by default.

### 2.4 Operating Environment

#### 2.4.1 Host Runtime

| Component | Requirement |
|---|---|
| Node.js | 18+ (backend and build tooling) |
| MySQL | 8+ |
| Redis | Optional; required only for multi-instance Socket.IO scaling |
| PM2 | Recommended for production cluster mode |
| Coturn (optional) | For TURN relay behind restrictive firewalls |

#### 2.4.2 Browser Support

| Browser | Version | HD Video | PiP | Screen Share | Whiteboard |
|---|---|---|---|---|---|
| Chrome | 80+ | Supported | Supported | Supported | Supported |
| Edge | 80+ | Supported | Supported | Supported | Supported |
| Opera | 67+ | Supported | Supported | Supported | Supported |
| Firefox | 75+ | Supported | Limited / unsupported | Supported | Supported |
| Safari | 14+ | Supported | Limited / unsupported | Supported | Supported |

#### 2.4.3 Network

- WebRTC DTLS-SRTP-encrypted media between browser and SFU.
- RTP/ICE UDP ports `40000–49999` must be open on the backend host.
- TCP (WebSocket) and UDP (WebRTC) transport both supported; UDP preferred.
- Google STUN (`stun:stun.l.google.com:19302`) always used; TURN optional.
- Bandwidth guidance (720p HD): ~1.5 Mbps upload per transmitting participant; each participant downloads N−1 streams.

### 2.5 Design and Implementation Constraints

The following constraints shape the requirements and their verification:

1. **SFU over mesh/P2P.** Media routing must use a mediasoup SFU for groups; `simple-peer` P2P may be used only as a degraded fallback path. This bounds concurrent participants (see 6.1.5).
2. **Browser-native media.** Video processing (noise suppression, echo cancellation, auto gain) relies on browser `getUserMedia` constraints; no server-side DSP is performed.
3. **Whiteboard is ephemeral.** Whiteboard strokes are broadcast in real time but intentionally **not persisted**.
4. **Recording is client-captured.** The recording file is captured in-browser and uploaded to the backend; the backend does not composite streams. Therefore recording comprehensiveness is bounded by what the individual recorder's device submits.
5. **Migrations are the schema source of truth.** `sequelize.sync({ alter: false })` runs at startup; migrations under `backend/src/database/migrations/` and the superadmin seed define schema.
6. **Mediasoup is non-fatal.** If mediasoup initialization fails, the server logs a warning and continues to run without the SFU (media features degrade).
7. **Single-process in-memory gauntlets.** Participant presence maps and rate-limiting windows are in-memory by default; Redis is used only for the Socket.IO adapter, not for shared media presence state.
8. **JSON-typed flexible fields.** Meeting settings, participants, invitees, recordings, reminders, recurrence, and notification payloads are stored as JSON columns.

### 2.6 Assumptions and Dependencies

- **OpenAI API availability** — transcription features function fully only when `OPENAI_API_KEY` is set. Without it, the system must still record successfully and store an explicit `provider: 'none'`/`'error'` transcript placeholder (FR-REC-005).
- **Public/announced IP** — in production, `MEDIASOUP_ANNOUNCED_IP` must be set to a reachable IP/domain; otherwise remote clients cannot establish media transport.
- **NAT traversal** — clients on restrictive corporate/guest networks may require a configured TURN server.
- **Matching frontend origin** — `CLIENT_URL` must exactly match the frontend origin for CORS; in production, the backend serves the built frontend from `frontend/dist`.
- **Clock skew tolerance** — reminder windows allow a ±1 minute tolerance band to account for scheduled-time drift.
- **MySQL JSON functions** — the meetings list query uses `JSON_CONTAINS` on `participantIds`/`inviteeIds`; this requires MySQL 5.7+/8+ JSON support.
- **Environment variable availability** — all secrets and configuration are externalized via environment variables; none are stored in source code.

### 2.7 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Frontend)                   │
│  React App → Zustand Stores → mediasoup-client             │
│       │              │                      │               │
│       ▼              ▼                      ▼               │
│  Axios (REST)   Socket.IO Client     WebRTC (SFU Client)   │
└───────┼──────────────┼──────────────────────┼──────────────┘
        │              │                      │
        ▼              ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend Server                          │
│                                                             │
│  Express Routes     Socket.IO Server     mediasoup Workers  │
│  ┌──────────┐     ┌──────────────┐     ┌────────────────┐  │
│  │ Auth     │     │ Room Events  │     │ Worker Pool    │  │
│  │ Meetings │◄───►│ Chat Events  │◄───►│ (CPU cores,≤8) │  │
│  │ Teams    │     │ Media Events │     │ ┌────┐┌────┐   │  │
│  │ Chat     │     │ Whiteboard   │     │ │ W1 ││ W2 │   │  │
│  │ Notif.   │     │ Notifications│     │ └────┘└────┘   │  │
│  └────┬─────┘     └──────┬───────┘     └────────┬───────┘  │
│       │                  │                       │          │
│       ▼                  ▼                       ▼          │
│  ┌──────────┐      ┌──────────┐      ┌──────────────────┐  │
│  │ Sequelize│      │ Redis    │      │ RTP/ICE Ports    │  │
│  │ (MySQL)  │      │ (Adapter)│      │ (40000-49999)    │  │
│  └──────────┘      └──────────┘      └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Key architectural decisions:

- **Mediasoup worker pool** — one worker per CPU core (capped at 8) to avoid port exhaustion. Routers are created per meeting room on the least-loaded worker for isolation.
- **Simulcast** — layers at 180p/150 kbps (low), 360–540p/500 kbps (medium), 720–1080p/2.5 Mbps (high); each consumer selects layers based on network conditions and element size.
- **Socket.IO rooms** — presence, chat, whiteboard, and media state sync are distributed via `room:*` and `team:*` room channels.
- **Redis adapter** — applied only when a connection to Redis succeeds; otherwise the system gracefully falls back to single-instance with a warning.

---

## 3. Functional Requirements

Each requirement is identified by a stable code and uses the keywords **shall** (mandatory), **should** (recommended), and **may** (optional) per RFC 2119.

### 3.1 Authentication and Authorization (FR-AUTH)

| ID | Requirement |
|---|---|
| FR-AUTH-001 | The system shall allow a user to register with a name (2–100 chars), a unique valid email, and a password. |
| FR-AUTH-002 | The system shall hash passwords before persistence using bcrypt with salt rounds (12 rounds configured) and shall never store plaintext passwords. |
| FR-AUTH-003 | The system shall expose login that verifies credentials and returns a signed JWT. |
| FR-AUTH-004 | The system shall verify the JWT on every protected REST request via the `Authorization: Bearer <token>` header and reject invalid/expired tokens with HTTP 401. |
| FR-AUTH-005 | The system shall verify Socket.IO connections using the JWT from `socket.handshake.auth.token`; unauthenticated or invalid sockets shall be rejected at handshake with `Authentication required` / `Invalid token`. |
| FR-AUTH-006 | The system shall support fetching the current authenticated user profile (`GET /api/auth/me`). |
| FR-AUTH-007 | The system shall allow a user to update their own profile (name, avatar, etc.). The system shall not allow changing another user's profile. |
| FR-AUTH-008 | The system shall support logout by invalidating the client session (client-side token discard). |
| FR-AUTH-009 | The system shall assign each user a platform role from `user`, `admin`, `superadmin` (default `user`). |
| FR-AUTH-010 | The system shall provide a script (`createSuperAdmin`) that seeds a superadmin account from environment variables (`SUPERADMIN_*`). |
| FR-AUTH-011 | The system's default `User` scope shall exclude the password hash from API responses; passwords shall never be returned by any endpoint. |

### 3.2 Meeting Lifecycle (FR-MEET)

| ID | Requirement |
|---|---|
| FR-MEET-001 | The system shall create an **instant meeting** when a user requests a new meeting with no schedule; instant meetings shall be created in `active` status with `startedAt` set and `isInstant = true`. |
| FR-MEET-002 | The system shall create a **scheduled meeting** when a user provides a `scheduledAt` time; scheduled meetings shall be created in `scheduled` status and may include a team association, invitees, reminders, and recurrence metadata. |
| FR-MEET-003 | Each meeting shall be assigned a unique `roomId` used for both the Socket.IO room and the shareable route `/meeting/{roomId}`. |
| FR-MEET-004 | Upon creation, the system shall generate and store the meeting's shareable `meetingLink` based on the current request host. |
| FR-MEET-005 | When creating a meeting with a `teamId`, the system shall verify the creator is a team member (HTTP 403 otherwise) and the team exists (HTTP 404 otherwise). |
| FR-MEET-006 | The meeting creator shall be recorded as `hostId` and added as the first participant with role `host`. |
| FR-MEET-007 | For scheduled meetings, the system shall persist invitees with status `pending` and, by default, provision reminders at 15 minutes, 1 hour, and 1 day before the scheduled time. |
| FR-MEET-008 | The system shall allow the host to invite additional attendees by user ID or email; each invitation produces a `meeting_scheduled` notification to existing-user invitees. |
| FR-MEET-009 | The system shall allow invitees to respond to an invitation with `accepted` or `declined`; acceptance shall add the user as a participant. |
| FR-MEET-010 | The system shall list meetings relevant to a user (host, participant in `participantIds`, or invitee in `inviteeIds`), supporting pagination (`page`, `limit`, default 20) and an optional `status` filter (`scheduled`, `active`, `ended`, `cancelled`). |
| FR-MEET-011 | The system shall list meetings for a team (`GET /api/meetings/team/:teamId`) only to team members, with pagination and status filtering. |
| FR-MEET-012 | The system shall fetch a single meeting's detail by `roomId` (including host and team). |
| FR-MEET-013 | A user shall be able to join an `active` or `scheduled` meeting by `roomId`; joining a meeting with status `ended` shall be rejected (HTTP 400). |
| FR-MEET-014 | Joining shall re-join a user if they already have an active participant entry (no duplicate participant records). |
| FR-MEET-015 | The system shall enforce `maxParticipants` (default 50) — if the number of active participants equals the maximum, new joins shall be rejected with HTTP 400 "Meeting is full". |
| FR-MEET-016 | When a `scheduled` meeting is first joined, the system shall transition its status to `active` and set `startedAt`. |
| FR-MEET-017 | The system shall support leaving a meeting; the leaving participant's `leftAt` shall be recorded. If the leaving user is the host or the last active participant, the meeting shall transition to `ended` with `endedAt` set. |
| FR-MEET-018 | A host shall be able to end a meeting explicitly (REST and/or Socket.IO); ending shall mark status `ended`, set `endedAt`, stamp `leftAt` on remaining participants, and broadcast `meeting:ended` to all room members. |
| FR-MEET-019 | A host shall be able to cancel a scheduled meeting; cancel shall mark status `cancelled` and notify all invitees with a `meeting_cancelled` (priority `high`) notification. Meetings already ended or cancelled shall not be cancelled again (HTTP 400). |
| FR-MEET-020 | Only the host shall be able to update meeting settings/title and cancel/end meetings; non-host attempts shall be rejected with HTTP 403. |

### 3.3 WebRTC Media Pipeline / SFU (FR-MEDIA)

| ID | Requirement |
|---|---|
| FR-MEDIA-001 | On startup, the system shall initialize a mediasoup worker pool with `min(env config or CPU count, 8)` workers listening on RTC ports `40000–49999`. |
| FR-MEDIA-002 | The SFU shall support codecs: Opus (48 kHz, 2ch) audio; VP8, VP9 (profile-id 2), and H264 (high `4d0032`, constrained baseline `42e01f`) video. |
| FR-MEDIA-003 | The system shall expose a router per meeting room; router RTP capabilities shall be retrievable via `mediasoup:getRouterRtpCapabilities`. |
| FR-MEDIA-004 | The system shall create WebRTC send and receive transports per participant via `mediasoup:createWebRtcTransport`; both UDP and TCP shall be enabled with UDP preferred. |
| FR-MEDIA-005 | Transports shall be configured with initial outgoing bitrate 1 Mbps, minimum outgoing 600 kbps, maximum incoming 1.5 Mbps, and SCTP message size 256 KB. |
| FR-MEDIA-006 | The system shall connect a created transport with client DTLS parameters via `mediasoup:connectTransport`. |
| FR-MEDIA-007 | Participants shall produce audio/video/screen streams via `mediasoup:produce`; each producer is associated with the sending socket and user ID and broadcast to the room as `mediasoup:newProducer`. |
| FR-MEDIA-008 | Video shall be produced with **simulcast** three layers: low (180p / ~150 kbps), medium (360–540p / ~500 kbps), high (720–1080p / ~2.5 Mbps). |
| FR-MEDIA-009 | Consumers shall be created via `mediasoup:consume` per producer, restricted to the client's RTP capabilities; consumption resumes via `mediasoup:resumeConsumer`. |
| FR-MEDIA-010 | Producers shall be paused/resumed via `mediasoup:pauseProducer` / `mediasoup:resumeProducer`, with room broadcast of pause/resume state. Producers may be closed via `mediasoup:closeProducer` with a `mediasoup:producerClosed` broadcast. |
| FR-MEDIA-011 | On socket disconnect, the system shall close all of that socket's producers and transports to free SFU resources. |
| FR-MEDIA-012 | A newly joined participant shall receive the list of existing producers via `mediasoup:existingProducers` so they can consume active media immediately. |
| FR-MEDIA-013 | The system shall synchronize mute state via `media:toggle-mute` → `media:user-muted`, video state via `media:toggle-video` → `media:user-video`, and screen-share state via `media:screen-share`, broadcasting to the meeting room. |
| FR-MEDIA-014 | The system shall apply browser-native `echoCancellation`, `noiseSuppression`, and `autoGainControl` in all `getUserMedia` acquisition points (join, unmute, device switch). |
| FR-MEDIA-015 | The user shall be able to select video quality (360p / 720p / 1080p) in device settings; the default shall be 720p. |
| FR-MEDIA-016 | The system shall provide Picture-in-Picture mode using the HTML5 PiP API; on browsers without PiP support, the feature shall be hidden or gracefully degrade with a clear message. |
| FR-MEDIA-017 | The video grid shall support dynamic layouts from 1 up to 49+ participants (2x2 → 7x7 progression, auto-fit beyond 49) with responsive styling. |
| FR-MEDIA-018 | The system shall detect the active speaker and focus the layout accordingly. |
| FR-MEDIA-019 | The system shall support screen sharing of the full screen, an application window, or a browser tab. |

### 3.4 Host Controls (FR-HOST)

| ID | Requirement |
|---|---|
| FR-HOST-001 | The system shall allow a **host** (meeting creator, `hostId` match) to force-mute a participant (`host:mute-user` → `host:force-mute` to target; `host:user-muted` to room). |
| FR-HOST-002 | The system shall allow a host to mute all participants (`host:mute-all`). |
| FR-HOST-003 | The system shall allow a host to force a participant's video off (`host:force-video-off` → `host:force-video-off` to target), including all participants (`host:disable-all-video`). |
| FR-HOST-004 | The system shall allow a host to request a participant unmute (`host:request-unmute`). |
| FR-HOST-005 | The system shall allow a host to remove a participant (`host:remove-user`), which: sends `host:removed` to the target, removes the target from the Socket.IO room and participant registry, and broadcasts `room:user-left`. |
| FR-HOST-006 | The system shall allow a host to end the meeting for all (`host:end-meeting`), which broadcasts `meeting:ended`, persists `status = 'ended'` with `endedAt`, and clears the room participant registry. |
| FR-HOST-007 | The system shall support a **waiting room**: when enabled, joiners are placed in a wait state and the host admits (`host:admit-user` → `room:admitted`) or denies (`host:deny-user` → `room:denied`) entry. |
| FR-HOST-008 | The system shall allow a host to lock/unlock the meeting (`host:lock-meeting`), persisting `settings.isLocked` and broadcasting `host:meeting-locked`. |
| FR-HOST-009 | The system shall allow a host to spotlight/pin a participant (`host:spotlight` → `host:spotlight` broadcast). |
| FR-HOST-010 | The system shall allow a host to promote a participant to co-host (`host:make-cohost`), persisting role `co-host` in participant data and broadcasting promotion events (`host:promoted`, `room:role-changed`). |
| FR-HOST-011 | The system shall allow a host to update meeting settings live (`host:update-settings`), merging provided settings and broadcasting `meeting:settings-updated`. |
| FR-HOST-012 | All host-control socket events shall verify the sender is the meeting host (`meeting.hostId === socket.user.id`) before applying the action; otherwise the action shall be ignored. |

### 3.5 Real-Time Collaboration (FR-RT)

#### 3.5.1 Chat

| ID | Requirement |
|---|---|
| FR-RT-001 | Participants shall send public in-meeting messages (`chat:send` → `chat:message` to room) when the meeting setting `allowChat` is enabled. |
| FR-RT-002 | Participants shall send private (1:1) in-meeting messages addressed to `recipientId`; delivery shall be routed only to sender and recipient via `user:{id}` rooms. |
| FR-RT-003 | Chat messages shall persist to the `Messages` table with meeting association, sender, content (≤2000 chars), type (`text`), and private flag. |
| FR-RT-004 | When a user sends a message, the response payload to recipients shall include sender metadata (`id`, `name`, `email`, `avatar`) for rendering. |
| FR-RT-005 | The system shall broadcast typing indicators (`chat:typing` → `chat:user-typing`) to the room without persisting them. |
| FR-RT-006 | The system shall provide REST retrieval and creation of meeting chat history, team-channel messages, message deletion (soft-delete `isDeleted`), and message reactions via `/api/chat/*`. |

#### 3.5.2 Whiteboard

| ID | Requirement |
|---|---|
| FR-RT-007 | The system shall provide a collaborative HTML5 Canvas whiteboard with pen, eraser, an 8-color palette, and line-width control (1–20 px). |
| FR-RT-008 | Drawing strokes shall be broadcast to all room participants in real time via `whiteboard:draw`; clearing shall broadcast `whiteboard:clear`. |
| FR-RT-009 | The whiteboard shall support touch input (tablets/mobile) and export to PNG (client-side download). |
| FR-RT-010 | Whiteboard content shall be ephemeral (not persisted on the server). |

#### 3.5.3 Polls

| ID | Requirement |
|---|---|
| FR-RT-011 | The system shall allow creation of in-meeting polls (question, options, optional multiple-choice, optional anonymity) via `POST /api/polls`. |
| FR-RT-012 | The system shall record votes (`POST /api/polls/:id/vote`), preventing duplicate votes per user by default and counting anonymous votes without attributing voter identity. |
| FR-RT-013 | The system shall compute live results (per-option vote counts and percentages) and allow the host to close a poll (`PUT /api/polls/:id/close`). |

#### 3.5.4 Q&A

| ID | Requirement |
|---|---|
| FR-RT-014 | The system shall allow meeting participants to post questions (`POST /api/qa`) to the meeting Q&A board. |
| FR-RT-015 | The system shall support upvoting questions (`POST /api/qa/:id/upvote`) with one upvote per user. |
| FR-RT-016 | The system shall allow hosts to answer (`PUT /api/qa/:id/answer`) and dismiss (`PUT /api/qa/:id/dismiss`) questions. |

#### 3.5.5 Reactions, Hand Raise, Captions

| ID | Requirement |
|---|---|
| FR-RT-017 | The system shall broadcast emoji reactions as floating on-screen animations (`reaction:emoji`). |
| FR-RT-018 | The system shall broadcast hand-raise state (`reaction:hand-raise`) so participants/host can see raised hands; hosts shall be able to lower all hands. |
| FR-RT-019 | The system shall support live captions overlay (`caption:text` broadcast) driven by current/real-time text source; captions are session-only, not persisted. |

#### 3.5.6 Breakout Rooms

| ID | Requirement |
|---|---|
| FR-RT-020 | The system shall allow the host to create breakout rooms under a meeting (`POST /api/breakout`), each with a number, name, duration, and optional auto-close time. |
| FR-RT-021 | The system shall allow participants to join (`POST /api/breakout/:id/join`) and leave (`POST /api/breakout/:id/leave`) breakout rooms, tracking active participants. |
| FR-RT-022 | The system shall allow closing a breakout room (`PUT /api/breakout/:id/close`). |

### 3.6 Teams and Channels (FR-TEAM)

| ID | Requirement |
|---|---|
| FR-TEAM-001 | A registered user shall be able to create a team with a name (2–100 chars), optional description, and a unique auto-generated invite code. |
| FR-TEAM-002 | Upon creation, the system shall auto-provision channels `general`, `meetings`, and `announcements` (represented via `channelType` on messages) and assign the creator role `owner`. |
| FR-TEAM-003 | The system shall list a user's teams (`GET /api/teams`). |
| FR-TEAM-004 | The system shall fetch team details (`GET /api/teams/:teamId`) only for members. |
| FR-TEAM-005 | The system shall allow owners/admins to update team profile and settings, and owners to delete a team. |
| FR-TEAM-006 | The system shall invite members by email (`POST /api/teams/:teamId/invite`) and support joining via the shareable invite code (`POST /api/teams/join/:inviteCode`). |
| FR-TEAM-007 | The system shall enforce team roles: `owner`, `admin`, `member`, `guest`, with helper authorizations (`isMember`, `getMemberRole`, `isOwnerOrAdmin`). |
| FR-TEAM-008 | The system shall allow owners/admins to assign/change member roles and remove members. |
| FR-TEAM-009 | The system shall provide real-time channel chat via Socket.IO: users join their team room (`team:join` → `team:joined`), exchange messages associated with `teamId` + `channelType`, and send typing indicators (`team:typing` → `team:user-typing`). |
| FR-TEAM-010 | The system shall verify team membership on `team:join` (error otherwise) before assigning the user to the team's socket room. |
| FR-TEAM-011 | The system shall persist team channel messages to the `Messages` table with `teamId` and `channelType`. |
| FR-TEAM-012 | The system shall allow member online status visibility and support member self-removal in addition to owner/admin removal. |

### 3.7 Scheduling, Calendar, and Reminders (FR-SCHED)

| ID | Requirement |
|---|---|
| FR-SCHED-001 | The system shall persist `scheduledAt` and `recurrence` metadata (`{ enabled: boolean, ... }`) for scheduled meetings. |
| FR-SCHED-002 | The system shall provide a calendar view (monthly) showing scheduled meetings with visual badges (`GET` via meetings API, consumed by the Calendar page). |
| FR-SCHED-003 | A cron-based reminder service shall run every minute while the server is up. |
| FR-SCHED-004 | The system shall dispatch a reminder to the host and accepted-invitees, and opted-in team members, when a scheduled meeting is within the reminder window (15 min, 1 hour, 1 day), tolerating a ±1 minute window to avoid double-send. |
| FR-SCHED-005 | Each reminder instance shall be marked `sent` with a `sentAt` timestamp and persisted on the meeting record to prevent duplicate sends across restarts. |
| FR-SCHED-006 | Reminder notifications shall be created as `meeting_reminder` (priority `high` for ≤15-minute reminders, else `normal`) and pushed to recipients via Socket.IO (`notification:new` to `user:{id}`). |
| FR-SCHED-007 | The service shall notify recipients (`meeting_started`, priority `urgent`) when a scheduled meeting's start time arrives (within the last minute), guarded by the `notificationsSent.started` flag. |
| FR-SCHED-008 | Notification send failures in the reminder service shall be logged and must not crash the cron tick. |

### 3.8 Notifications (FR-NOTIF)

| ID | Requirement |
|---|---|
| FR-NOTIF-001 | The system shall support notification types: `meeting_scheduled`, `meeting_reminder`, `meeting_started`, `meeting_cancelled`, `team_invite`, `team_member_added`, `mention`, `chat_message`. |
| FR-NOTIF-002 | The system shall support priorities: `low`, `normal`, `high`, `urgent` (default `normal`). |
| FR-NOTIF-003 | Each notification shall be addressed to a single recipient (`recipientId`), with title, message body, optional JSON `data` payload, read state (`isRead`), `readAt`, and optional `expiresAt`. |
| FR-NOTIF-004 | The system shall list a user's notifications (`GET /api/notifications`), mark one as read (`PUT /api/notifications/:id/read`), mark all as read (`PUT /api/notifications/read-all`), and delete (`DELETE /api/notifications/:id`). |
| FR-NOTIF-005 | The system shall push notifications to connected clients in real time via Socket.IO to the `user:{id}` room (`notification:new`). |
| FR-NOTIF-006 | The system shall surface an unread-count badge in the UI (bell icon) and support browser desktop notifications via the Notification API. |

### 3.9 Recording and Transcription (FR-REC)

| ID | Requirement |
|---|---|
| FR-REC-001 | The system shall accept a recording upload from a host or active participant via `POST /api/meetings/:roomId/recordings` (multipart field `recording`), with a maximum file size of 512 MB. |
| FR-REC-002 | The upload handler shall stage files in `uploads/tmp/recordings/{roomId}` before processing. |
| FR-REC-003 | The system shall store the recording persistently under `uploads/recordings/{roomId}/{timestamp}-{random}.{ext}` and serve it publicly over HTTP via the `/uploads` static route (with 1-day cache). |
| FR-REC-004 | The system shall persist recording metadata (filename, original name, URL, duration, MIME type, size, recorded-by user) onto the meeting's `recordings` JSON array. |
| FR-REC-005 | After storage, the system shall generate transcription artifacts — `.json` (full verbose payload), `.txt`, `.srt`, `.vtt` — under `uploads/transcripts/{roomId}/`. If `OPENAI_API_KEY` is absent, the system shall store an explicit placeholder transcript (`provider: 'none'`) with a user-facing note; on API error it shall store `provider: 'error'` with the error message. Transcription failures shall not prevent recording success. |
| FR-REC-006 | Transcription shall use the configured OpenAI model (`OPENAI_TRANSCRIPTION_MODEL`, default `gpt-4o-mini-transcribe`, `whisper-1` supported) with `verbose_json` response format and configurable language (`TRANSCRIPTION_LANGUAGE`, default `en`). |
| FR-REC-007 | The system shall normalize transcript segments (numeric fallback for `start`/`end`, filtering empty text) and generate correctly formatted SRT and VTT timestamps (`HH:MM:SS,mmm` / `HH:MM:SS.mmm`). |
| FR-REC-008 | Recording and transcript file URLs shall be returned in the upload response for immediate client use. |
| FR-REC-009 | Meeting participants (and host) may upload recordings; non-participants shall be rejected with HTTP 403. |
| FR-REC-010 | Live recording state (start/stop) shall be broadcast to the room so all participants see a recording indicator (`recording:started` / `recording:stopped`). |

### 3.10 Security, Rate Limiting, and Compliance (FR-SEC)

| ID | Requirement |
|---|---|
| FR-SEC-001 | The system shall implement JWT-based authentication with a server-side signing secret (`JWT_SECRET`), configurable expiry, verified on REST and socket layers. |
| FR-SEC-002 | The system shall restrict CORS to the configured `CLIENT_URL` origin. |
| FR-SEC-003 | The system shall rate-limit `/api` requests per IP using a 60-second sliding window (default max 100 requests/minute), responding HTTP 429 "Too many requests" on exceed. |
| FR-SEC-004 | The system shall restrict request body size to 10 MB (`express.json` limit) for non-recording endpoints. |
| FR-SEC-005 | All host-only actions (meeting settings, end, cancel, invite) and team-admin actions shall enforce server-side authorization checks; client-side hiding is insufficient. |
| FR-SEC-006 | The system shall not expose passwords or JWT secrets in any response or log; environment variables shall carry all secrets. |
| FR-SEC-007 | WebRTC media shall be encrypted in transit via DTLS-SRTP. |
| FR-SEC-008 | The production health endpoint (`GET /api/health`) shall expose process metadata (pid, memory, uptime, mediasoup stats) only to authorized consumers (deployment-scoped). |
| FR-SEC-009 | The system shall sanitize/validate user-supplied string lengths and formats at the model layer (Sequelize validators: name length, email format, message length ≤ 2000, etc.). |
| FR-SEC-010 | The system shall provide role-based authorization at both the platform level (`user`/`admin`/`superadmin`) and team level (`owner`/`admin`/`member`/`guest`). |
| FR-SEC-011 | The system shall support self-hosted deployment so that no meeting media, chat, or recording data need traverse third-party servers (except optional OpenAI transcription and STUN/TURN). |
| FR-SEC-012 | Meeting, chat, notification, and recording history shall be persisted for audit/retroactive review (unless server-side deletion requested). |

---

## 4. External Interface Requirements

### 4.1 User Interfaces

The frontend is a React SPA with the following routed views:

| Route | View | Access |
|---|---|---|
| `/login`, `/signup` | Authentication screens | Public (redirect if authenticated) |
| `/` | Home (create/join meetings, navigation) | Protected |
| `/meeting/:roomId` | Live meeting room (video grid, controls, chat, panels) | Protected |
| `/join`, `/join/:roomId` | Pre-join device preview & room entry | Protected |
| `/history` | Meeting history with filters (all/active/ended/scheduled) | Protected |
| `/teams` | Team list/creation | Protected |
| `/teams/:teamId` | Team detail, channels, members, roles | Protected |
| `/calendar` | Monthly calendar with meeting badges | Protected |
| `*` | Redirect to `/` | Public |

UI design conventions: dark theme (Tailwind), reusable UI primitives (`Button`, `Card`, `Input`, `Modal`, `Badge`, `LoadingSpinner`), toast notifications (`react-hot-toast`), Lucide iconography, ARIA accessibility labels, responsive layouts.

Key UI components: `VideoGrid`, `MeetingControls`, `MeetingHeader`, `ChatPanel`, `ParticipantsList`, `DeviceSettings`, `MeetingSettingsPanel`, `WaitingRoom`, `EmojiReactions`, `CaptionsOverlay`, `Whiteboard`, `NotificationBell`.

### 4.2 Software Interfaces

| Interface | Technology | Direction |
|---|---|---|
| REST API | Axios (frontend) ↔ Express (backend) | Bidirectional |
| Real-time events | socket.io-client ↔ socket.io-server | Bidirectional |
| SFU signaling | mediasoup-client ↔ mediasoup (server SDK) | Bidirectional |
| Database | Sequelize ↔ MySQL (mysql2) | Backend → DB |
| Redis socket adapter | ioredis + `@socket.io/redis-adapter` | Backend → Redis |
| Transcription | OpenAI Node SDK | Backend → OpenAI |
| Static assets | Express `express.static` for `/uploads` (1-day cache) and `frontend/dist` (1-year cache, SPA fallback) | Backend → Client |
| PM2 | `ecosystem.config.cjs` (cluster mode, max-memory restart 1 GB, log rotation) | Ops |

### 4.3 Communication Interfaces

- **HTTP/HTTPS (port 5000 default)** — REST API, static files, Socket.IO polling transport.
- **WebSocket** — Socket.IO real-time channel (also polling with `allowEIO3`).
- **UDP/TCP RTP (ports 40000–49999)** — mediasoup media plane.
- **DTLS-SRTP** — encrypted media sessions.
- **STUN/TURN (UDP 3478)** — ICE candidates; Google STUN by default, optional Coturn relay.
- Socket.IO server configuration: ping interval 25s, ping timeout 20s, `maxHttpBufferSize` 100 MB (accommodates uploads safely above the socket path as well).

### 4.4 REST API Endpoints

All `/api/*` endpoints (except signup/login/health) require `Authorization: Bearer <JWT>`. Responses use the envelope `{ success: boolean, message?, data?, error? }`.

#### 4.4.1 Authentication — `/api/auth`

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Authenticate and return JWT |
| GET | `/api/auth/me` | Current authenticated user |
| PUT | `/api/auth/profile` | Update profile |
| POST | `/api/auth/logout` | Logout (client token discard) |

#### 4.4.2 Meetings — `/api/meetings`

| Method | Path | Description |
|---|---|---|
| POST | `/api/meetings` | Create instant/scheduled meeting |
| GET | `/api/meetings` | List user's meetings (filter + pagination) |
| GET | `/api/meetings/team/:teamId` | List team meetings |
| GET | `/api/meetings/:roomId` | Get meeting details |
| POST | `/api/meetings/:roomId/join` | Join meeting |
| POST | `/api/meetings/:roomId/leave` | Leave meeting |
| PUT | `/api/meetings/:roomId/settings` | Update title/settings (host) |
| POST | `/api/meetings/:roomId/end` | End meeting (host) |
| POST | `/api/meetings/:roomId/recordings` | Upload recording (multipart ≤ 512 MB) |
| POST | `/api/meetings/:roomId/invite` | Invite attendees (host) |
| PUT | `/api/meetings/:roomId/respond` | Accept/decline invitation |
| PUT | `/api/meetings/:roomId/cancel` | Cancel scheduled meeting (host) |

#### 4.4.3 Chat — `/api/chat`

| Method | Path | Description |
|---|---|---|
| GET | `/api/chat/:roomId/messages` | Meeting messages history |
| POST | `/api/chat/:roomId/messages` | Send meeting message |
| GET | `/api/chat/team/:teamId/messages` | Team channel messages |
| POST | `/api/chat/team/:teamId/messages` | Send team channel message |
| DELETE | `/api/chat/messages/:messageId` | Delete (soft) message |
| POST | `/api/chat/messages/:messageId/react` | React to message |

#### 4.4.4 Teams — `/api/teams`

| Method | Path | Description |
|---|---|---|
| POST | `/api/teams` | Create team |
| GET | `/api/teams` | List user's teams |
| GET | `/api/teams/:teamId` | Team details |
| PUT | `/api/teams/:teamId` | Update team |
| DELETE | `/api/teams/:teamId` | Delete team |
| POST | `/api/teams/:teamId/invite` | Invite member |
| POST | `/api/teams/join/:inviteCode` | Join by invite code |
| PUT | `/api/teams/:teamId/members/:userId/role` | Assign member role |
| DELETE | `/api/teams/:teamId/members/:userId` | Remove member |

#### 4.4.5 Notifications — `/api/notifications`

| Method | Path | Description |
|---|---|---|
| GET | `/api/notifications` | List notifications |
| PUT | `/api/notifications/:id/read` | Mark single read |
| PUT | `/api/notifications/read-all` | Mark all read |
| DELETE | `/api/notifications/:id` | Delete notification |

#### 4.4.6 Polls / Q&A / Breakout — `/api/*`

| Method | Path | Description |
|---|---|---|
| POST | `/api/polls` | Create poll |
| POST | `/api/polls/:id/vote` | Vote on poll |
| PUT | `/api/polls/:id/close` | Close poll |
| POST | `/api/qa` | Ask question |
| PUT | `/api/qa/:id/answer` | Answer question |
| POST | `/api/qa/:id/upvote` | Upvote question |
| PUT | `/api/qa/:id/dismiss` | Dismiss question |
| POST | `/api/breakout` | Create breakout room(s) |
| POST | `/api/breakout/:id/join` | Join breakout room |
| POST | `/api/breakout/:id/leave` | Leave breakout room |
| PUT | `/api/breakout/:id/close` | Close breakout room |

#### 4.4.7 System

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health/heartbeat with process + mediasoup stats |
| GET | `/uploads/...` | Static recording/transcript files |

### 4.5 Socket.IO Event Protocol

#### 4.5.1 Authentication

- Handshake requires `auth.token` (JWT). Failure → `Authentication required` / `Invalid token`.

#### 4.5.2 Room & Presence

| Event | Direction | Payload (subset) | Notes |
|---|---|---|---|
| `room:join` | C→S | `{ roomId }` | Validates meeting exists, adds membership |
| `room:leave` | C→S | — | Removes membership, broadcasts `room:user-left` |
| `room:participants` | S→C | participants array, `isHost` | Initial state to joiner |
| `room:user-joined` | S→C | `{ user, socketId }` | Broadcast to room |
| `room:user-left` | S→C | `{ socketId, userId, userName }` | Broadcast to room |
| `mediasoup:existingProducers` | S→C | `{ producers }` | Existing media to consume |

#### 4.5.3 SFU Media Signaling

| Event | Direction | Description |
|---|---|---|
| `mediasoup:getRouterRtpCapabilities` | C→S (ack) | Router capabilities |
| `mediasoup:createWebRtcTransport` | C→S (ack) | `direction: send/recv` |
| `mediasoup:connectTransport` | C→S (ack) | DTLS params |
| `mediasoup:produce` | C→S (ack) | Produce audio/video/screen |
| `mediasoup:newProducer` | S→C | New producer announcement |
| `mediasoup:consume` | C→S (ack) | Create consumer |
| `mediasoup:resumeConsumer` | C→S (ack) | Resume consumer |
| `mediasoup:pauseProducer` / `resumeProducer` / `closeProducer` | C→S (ack) | Producer lifecycle; broadcasts `producerPaused`/`producerResumed`/`producerClosed` |
| `media:toggle-mute` → `media:user-muted` | C→S→C | Mute state sync |
| `media:toggle-video` → `media:user-video` | C→S→C | Video state sync |
| `media:screen-share` | C→S→C | Screen share state |

#### 4.5.4 Host Controls

`host:mute-user`, `host:mute-all`, `host:remove-user`, `host:end-meeting`, `host:force-video-off`, `host:disable-all-video`, `host:request-unmute`, `host:lock-meeting`, `host:admit-user`, `host:deny-user`, `host:spotlight`, `host:make-cohost`, `host:update-settings` — all require sender = meeting host; result events: `host:force-mute`, `host:force-video-off`, `host:removed`, `meeting:ended`, `host:user-muted`, `host:promoted`, `room:admitted`, `room:denied`, `room:role-changed`, `host:meeting-locked`, `meeting:settings-updated`.

#### 4.5.5 Collaboration

| Event | Description |
|---|---|
| `chat:send` → `chat:message` | Meeting chat (public/private) |
| `chat:typing` → `chat:user-typing` | Typing indicator |
| `whiteboard:draw` / `whiteboard:clear` | Collaborative canvas sync |
| `caption:text` | Live caption broadcast |
| `reaction:emoji` / `reaction:hand-raise` | Floating emojis / hand raise |
| `recording:started` / `recording:stopped` | Recording indicator |
| `team:join` / `team:leave` / `team:typing` → `team:joined` / `team:user-typing` | Team rooms and typing |
| `notification:new` | Push to `user:{id}` room |
| `meeting:ended` | Room-wide meeting end |

---

## 5. Data Requirements

### 5.1 Entity-Relationship Overview

```
Users ──hasMany──► Meetings (as host)
Users ──hasMany──► Notifications (as recipient)
Users ──hasMany──► Messages (as sender / recipient)
Users ──hasMany──► Teams (as owner)
Users ──belongsToMany◄──Teams (membership via Team.members JSON array)

Meetings ──belongsTo──► Teams (teamId)
Meetings ──hasMany──► Messages (meetingId)
Meetings ──hasMany──► Notifications (referenced in data JSON)
Meetings ──hasMany──► Polls
Meetings ──hasMany──► Questions
Meetings ──hasMany──► BreakoutRooms
```

Full associations are defined in `backend/src/models/associations.js`.

### 5.2 Data Entities and Attributes

#### 5.2.1 Users

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID (PK) | default `UUIDV4` |
| `name` | STRING(100) | not null, len 2–100 |
| `email` | STRING(255) | not null, unique, isEmail |
| `password` | STRING(255) | not null, bcrypt-hashed (12 rounds) |
| `avatar` | STRING(500) | null |
| `isOnline` | BOOLEAN | default false |
| `lastSeen` | DATE | default now |
| `role` | ENUM(`user`,`admin`,`superadmin`) | default `user` |

#### 5.2.2 Teams

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID (PK) | default `UUIDV4` |
| `name` | STRING(100) | not null, len 2–100 |
| `description` | STRING(500) | null |
| `ownerId` | UUID | not null |
| `inviteCode` | STRING(50) | unique, auto-generated (first UUID segment) |
| `settings` | JSON | `{ allowMemberInvite, allowGuestJoin, defaultMeetingSettings }` |
| `isActive` | BOOLEAN | default true |
| `members` | JSON | `[{ userId, role, joinedAt, notifications? }]` (array embedded on instance/`toJSON`) |

#### 5.2.3 Meetings

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID (PK) | default `UUIDV4` |
| `roomId` | STRING(50) | unique, auto `xxxxxxxx-xx-xx` |
| `title` | STRING(255) | default `Untitled Meeting` |
| `description` | TEXT | null |
| `hostId` | UUID | not null |
| `teamId` | UUID | null |
| `meetingLink` | STRING(500) | generated from host |
| `status` | ENUM(`scheduled`,`active`,`ended`,`cancelled`) | default `scheduled` |
| `scheduledAt` | DATE | null (instant meetings) |
| `startedAt` / `endedAt` | DATE | null |
| `settings` | JSON | `{ waitingRoom, allowScreenShare, allowChat, allowRecording, muteOnEntry, isLocked, maxParticipants:50 }` |
| `isInstant` | BOOLEAN | default true |
| `recurrence` | JSON | `{ enabled: false }` |
| `participants` | JSON | `[{ id, userId, user:{...}, role, joinedAt, leftAt, isMuted }]` |
| `participantIds` | JSON | `[userId,...]` (for `JSON_CONTAINS` queries) |
| `invitees` | JSON | `[{ id, userId?, email, status: pending/accepted/declined, respondedAt }]` |
| `inviteeIds` | JSON | `[userId,...]` |
| `recordings` | JSON | `[{ filename, originalName, url, path, duration, mimeType, size, recordedBy, transcription:{...files} }]` |
| `reminders` | JSON | `[{ id, time, unit: minutes/hours/days, sent, sentAt }]` |
| `notificationsSent` | JSON | `{ scheduled, reminder15min, reminder1hour, reminder1day, started }` |

#### 5.2.4 Messages

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID (PK) | |
| `meetingId` | UUID | null (meeting chats) |
| `teamId` | UUID | null (team channels) |
| `channelType` | ENUM(`general`,`meetings`,`announcements`,`custom`) | default `general` |
| `channelName` | STRING(100) | null |
| `senderId` | UUID | not null |
| `content` | STRING(2000) | not null |
| `type` | ENUM(`text`,`file`,`system`,`meeting_link`) | default `text` |
| `recipientId` | UUID | null (private chat) |
| `isPrivate` | BOOLEAN | default false |
| `meetingData` | JSON | null |
| `mentions` | JSON | null |
| `fileUrl` / `fileName` / `fileType` | STRING | null (future file uploads) |
| `isDeleted` | BOOLEAN | default false |

#### 5.2.5 Notifications

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID (PK) | |
| `recipientId` | UUID | not null |
| `type` | ENUM(`meeting_scheduled`,`meeting_reminder`,`meeting_started`,`meeting_cancelled`,`team_invite`,`team_member_added`,`mention`,`chat_message`) | not null |
| `title` | STRING(255) | not null |
| `message` | TEXT | not null |
| `data` | JSON | null |
| `isRead` | BOOLEAN | default false |
| `readAt` | DATE | null |
| `priority` | ENUM(`low`,`normal`,`high`,`urgent`) | default `normal` |
| `expiresAt` | DATE | null |

#### 5.2.6 Polls / Questions / BreakoutRooms

| Entity | Key Columns |
|---|---|
| **Poll** | `meetingId`, `createdById`, `question` (TEXT, not null), `options` (JSON with votes arrays), `allowMultiple`, `isAnonymous`, `status` ENUM(`draft`,`active`,`ended`), `endsAt`, `totalVotes` |
| **Question** | `meetingId`, `askedById`, `question` (TEXT), `answer`, `answeredById`, `answeredAt`, `upvotes` (JSON array of user IDs), `isAnswered`, `isDismissed` |
| **BreakoutRoom** | `parentMeetingId`, `roomNumber`, `name`, `status` ENUM(`open`,`closed`), `duration`, `autoCloseAt`, `createdById`, `assignedParticipants` (JSON: `[{ userId, joinedAt, leftAt }]`) |

### 5.3 Data Validation Rules

1. `User.name` length between 2 and 100; format errors fail at model layer.
2. `User.email` must be a valid email and unique.
3. `Message.content` length ≤ 2000 and not null.
4. `Team.name` length between 2 and 100.
5. `Meeting.roomId` unique; generated `uuid`-based.
6. Poll vote de-duplication: one vote per user (unless anonymous model permits re-vote, per `hasUserVoted`).
7. Question up-votes: one per user per `upvotes` array membership.
8. File upload limit: 512 MB for recordings; body limit 10 MB for JSON APIs.
9. Role values constrained by ENUM types at DB and model level.

### 5.4 File Storage Requirements

| Path | Purpose | Access |
|---|---|---|
| `uploads/tmp/recordings/{roomId}/` | Staging for uploads before transcription | Internal |
| `uploads/recordings/{roomId}/` | Final WebM/media recordings | Public via `/uploads` (1-day cache) |
| `uploads/transcripts/{roomId}/` | Transcription artifacts (`.json`, `.txt`, `.srt`, `.vtt`) | Public via `/uploads` |
| `frontend/dist/` | Production SPA build | Served at root (1-year cache) |

Storage sizing guidance: at ~1.5 Mbps (720p), a 60-minute recording is roughly 675 MB before compression; plan disk capacity accordingly per expected recording volume.

---

## 6. Non-Functional Requirements

### 6.1 Performance Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-PERF-001 | Whiteboard stroke broadcast latency | < 50 ms on local network; near-real-time over WAN |
| NFR-PERF-002 | Media path latency (SFU) | Low-latency Opus audio; sub-second E2E video on healthy networks |
| NFR-PERF-003 | Socket.IO heartbeat/metadata overhead | Ping 25s / timeout 20s, no reconnection storms |
| NFR-PERF-004 | Simulcast layer adaptation | Downscale on degraded bandwidth; upscale for full-screen/active speaker |
| NFR-PERF-005 | Concurrent capacity (per single server) | 10–50 concurrent meetings of 10–20 participants; ≥49 visible tiles per room |
| NFR-PERF-006 | Grid reflow | Immediate grid class change on participant count change (no jank) |
| NFR-PERF-007 | Reminder cron tick | Complete within 1-minute cadence; per-meeting processing bounded |
| NFR-PERF-008 | REST list queries | Paginated; meetings list default page size 20, team meetings page size 50 |
| NFR-PERF-009 | Recording ingest | Accept uploads up to 512 MB; staging→final move then transcription |

**Bandwidth math (for capacity planning):**

```
Per participant upload:     1 stream × ~1.5 Mbps (720p)
Per participant download:   (N − 1) × ~1.5 Mbps
Server aggregate:           ~N × 1.5 Mbps × 2 (up + down)
Example 10 participants:    ~30 Mbps server bandwidth
Example 20 participants:    ~60 Mbps server bandwidth
```

### 6.2 Reliability and Availability

- **NFR-REL-001:** Mediasoup startup failure shall be non-fatal (server continues, SFU-dependent features report inactive).
- **NFR-REL-002:** Redis adapter failure shall not crash the server; the system shall fall back to single-instance operation with a logged warning.
- **NFR-REL-003:** Transcription provider failure shall be isolated from recording persistence (recordings always saved; transcript marked failed).
- **NFR-REL-004:** Scheduler/reminder failures shall be caught and logged per tick without terminating the process.
- **NFR-REL-005:** PM2 production config shall auto-restart on crash and on memory exceeding 1 GB.
- **NFR-REL-006:** The `/api/health` endpoint shall report status/uptime/memory/mediasoup state for monitoring.
- **NFR-REL-007:** Socket.IO should support re-connection (transports `websocket` + `polling`) and recover room state on rejoin.

### 6.3 Security Requirements

- **NFR-SEC-001:** All passwords bcrypt-hashed (12 salt rounds); never stored or returned in plaintext.
- **NFR-SEC-002:** JWT signed with server secret; configurable expiry; verified on HTTP and Socket.IO.
- **NFR-SEC-003:** CORS restricted to configured `CLIENT_URL`.
- **NFR-SEC-004:** Per-IP rate limiting (100 req/min default) with 429 responses.
- **NFR-SEC-005:** Media encrypted with DTLS-SRTP; server-side secrets only via environment variables.
- **NFR-SEC-006:** Authorization enforced server-side for all host/team-admin actions.
- **NFR-SEC-007:** Input validation at model layer (length/format/unique constraints).
- **NFR-SEC-008:** Self-hosted deployment option so media/chat/recordings stay within organizational infrastructure.
- **NFR-SEC-009:** Rate-limit store cleanup runs periodically to bound memory.

### 6.4 Scalability Requirements

- **NFR-SCALE-001:** Mediasoup workers scale to number of CPU cores, capped at 8 per process to avoid port exhaustion.
- **NFR-SCALE-002:** Socket.IO supports horizontal scaling via Redis adapter (enabled when Redis reachable).
- **NFR-SCALE-003:** PM2 cluster mode supports multiple Node.js processes on one host.
- **NFR-SCALE-004:** MySQL connection pooling configurable (`DB_POOL_MAX` default 50) for high-concurrency production.
- **NFR-SCALE-005:** Rooms are isolated per mediasoup router on round-robin workers; meetings do not share media state.
- **NFR-SCALE-006:** Documented vertical scaling tiers (10/25/50 concurrent meetings) and horizontal scaling path (MySQL replication, Redis cluster, load balancer, consistent room-to-server pinning).
- **NFR-SCALE-007:** Video quality selection (360p/720p/1080p) lets users trade fidelity for bandwidth to preserve capacity under load.

### 6.5 Maintainability

- Modular layered backend (routes / services / models / sockets / lib / config / middleware) with ES modules.
- Migrations as schema source of truth; `sync({ alter: false })` startup.
- Centralized configuration via environment variables (`backend/.env.example` documents all knobs).
- Componentized frontend with Zustand stores isolating state (auth/meeting/chat/team/notification).
- Monorepo split into `backend/` and `frontend/` with independent package manifests.

### 6.6 Portability and Browser Support

- Runs on Linux (production VPS), macOS/Windows (development) with Node 18+ and MySQL 8+.
- Browsers: Chrome/Edge/Opera 80+/67+ full support; Firefox 75+ and Safari 14+ support except PiP.
- Graceful degradation: PiP hidden when API unavailable; mediasoup client feature detection for codecs.
- Deployment: bare VPS, PM2, docker-able (README notes Docker Compose as roadmap).

### 6.7 Usability

- One-click "New Meeting" for instant rooms; shareable `/meeting/{roomId}` links.
- Pre-join device preview with camera/mic selection and quality setting.
- Dark themed, responsive UI with keyboard navigation and ARIA labels.
- Toast feedback for async operations; empty/loading states.
- Self-documenting helper text (e.g., whiteboard tips, bandwidth notes).

---

## 7. Verification and Acceptance Criteria

### 7.1 Test Strategy

The repository currently verifies quality via a documented manual testing checklist (`IMPLEMENTATION_COMPLETE.md`). Automated unit/integration/E2E suites are future work. Verification levels below describe what must be demonstrated.

### 7.2 Acceptance Criteria by Area

| Area | Acceptance Criteria |
|---|---|
| **Authentication** | User can register, log in, and access protected routes; invalid/expired tokens receive 401; socket handshake rejects missing/invalid tokens. |
| **Meetings** | Instant meeting created active; scheduled meeting created with reminders/invitees; join enforces maxParticipants and blocked `ended` meetings; host-only actions rejected for non-hosts (403). |
| **Media** | Two+ browsers can join a room and exchange audio/video via SFU; simulcast quality selector changes bitrate/layer; screen share visible to all; mute/video states sync to all participants; disconnect releases SFU resources (producers/transports closed). |
| **Host controls** | Host can mute/remove/lock/admit/spotlight/co-host/end; removed user is dropped; end meeting transitions all to ended and broadcasts. |
| **Collaboration** | Chat persists and syncs publicly/privately; typing indicators appear; whiteboard strokes sync live (and clear globally); polls vote and tally; questions upvote/answer/dismiss; reactions and hand raise broadcast; captions overlay updates. |
| **Teams** | Creating a team provisions general/meetings/announcements channels and owner role; invite-by-code adds a member; role assignment enforced; channel messages persist and sync in real time. |
| **Scheduling** | Scheduled meeting appears on calendar; reminders arrive at ~15min/1h/1d windows (idempotent — no duplicate send after restart); meeting-start notification fires within the minute. |
| **Recording/transcription** | Upload succeeds (≤512 MB); recording URL fetchable; transcripts generated in JSON/TXT/SRT/VTT; missing API key still yields recording with `provider:'none'` note; API failure marks transcript `provider:'error'` without breaking recording. |
| **Notifications** | Types/priorities persisted; unread badge counts; mark-read/read-all work; Socket.IO push received by connected client; browser notifications appear when permitted. |
| **Security** | Rate limit returns 429 after threshold; CORS blocks foreign origins; no passwords/hashes in any response; host/team-authorization bypass attempts fail. |
| **Performance** | Grid supports 1–49+ tiles; whiteboard <50 ms latency locally; simulcast downscales on constrained bandwidth; server sustains target concurrent-meeting tier. |
| **Browser matrix** | Chrome/Edge full features; Firefox/Safari HD video, screen share, whiteboard; PiP degrades gracefully where unsupported. |
| **Deployment** | `npm run db:create`, `npm run migrate`, `npm run create-admin` succeed on a fresh MySQL; dev servers boot; PM2 cluster starts; SPA served in production with API passthrough and uploads static route. |

### 7.3 Key Regression Baseline (must remain true)

- `npm run` scripts for backend (`start`, `dev`, `db:create`, `migrate`, `db:setup`, `create-admin`) are executable without error.
- Frontend `npm run build` completes with zero errors.
- No plaintext secrets in repositories (checked via `.gitignore` and env examples).

---

## 8. Out-of-Scope and Future Requirements

The following are intentionally deferred and tracked in the product roadmap (`README.md` phases 3–5):

**Phase 3 (Next):**
- Background blur / virtual backgrounds (TensorFlow.js BodyPix).
- Together Mode (fixed participant grid layout).
- File upload system (drag-and-drop, 50 MB limit).
- Advanced recording (composite video with audio mixing).
- Live streaming (RTMP output).

**Phase 4 (External integrations):**
- Cloud recording storage (AWS S3 / Azure Blob).
- External calendar sync (Google Calendar, Outlook).
- Improved speech-to-text (Google Cloud Speech).
- AI meeting summaries (OpenAI GPT-4).
- Analytics dashboard (attendance, duration, engagement).

**Phase 5 (Enterprise):**
- SSO / SAML / OAuth2 identity provider integration.
- LDAP / Active Directory sync.
- End-to-end encryption option for media.
- Custom branding / white-labeling.
- Admin dashboard with usage analytics.
- SLA monitoring and alerting.

**Also deferred:** Docker Compose one-command setup, automated test suites (unit/integration/E2E), whiteboard shape tools (circle/rectangle/text), whiteboard cloud persistence, and recording retention policies.

---

## Appendix A — Data Flow Walkthroughs

### A.1 Instant Meeting Flow

1. User clicks **New Meeting** on Home page.
2. Frontend POSTs `/api/meetings` with no `scheduledAt`.
3. Backend creates `Meeting` with `isInstant=true`, `status='active'`, `startedAt=now`, host participant entry, and generates `roomId` + `meetingLink`.
4. Frontend navigates to `/meeting/{roomId}`.
5. Socket connects with JWT; client emits `room:join`; server validates meeting and broadcasts `room:user-joined`.
6. Client requests router capabilities, creates transports, produces audio/video (720p default, simulcast), and consumes existing producers.
7. Each joining participant triggers `existingProducers` → consume → resume → live grid.

### A.2 Scheduled Meeting with Reminder Flow

1. Host POSTs `/api/meetings` with `scheduledAt`, `invitees[]`, optional `teamId`.
2. Backend persists invitees (pending) and default reminders (15 min / 1 h / 1 d).
3. Notification service creates `meeting_scheduled` notifications and Socket.IO pushes to invitees.
4. The cron reminder service (every minute) compares `scheduledAt`; at each window it sends `meeting_reminder` notifications to host + accepted invitees + opted-in team members, persists `sent` flags.
5. At start time, `checkMeetingStarts` issues `meeting_started` (urgent) once, guarded by `notificationsSent.started`.
6. Invitees who accepted are added to participants and can join normally.

### A.3 Recording & Transcription Flow

1. Participant starts recording in-browser (MediaRecorder → WebM) and stops; frontend emits `recording:started`/`recording:stopped` for the room indicator.
2. Frontend uploads the file (multipart `recording`, plus `duration` and `language`) to `POST /api/meetings/:roomId/recordings`.
3. Multer stages the file in `uploads/tmp/recordings/{roomId}/`.
4. `saveMeetingRecording` copies the file to `uploads/recordings/{roomId}/` and triggers transcription.
5. Transcription service (OpenAI, `gpt-4o-mini-transcribe`/`whisper-1`, `verbose_json`) writes `.json`, `.txt`, `.srt`, `.vtt` to `uploads/transcripts/{roomId}/`; temp file is deleted in `finally`.
6. Recording metadata (URLs + transcript refs) is pushed to `meeting.recordings` and returned to the client.

### A.4 Host Moderation Flow

1. Host selects participant → emits `host:mute-user {targetSocketId, roomId}`.
2. Server verifies `meeting.hostId === socket.user.id`.
3. On success: `host:force-mute` to the target socket; `host:user-muted` broadcast to room so all UIs reflect muted state.
4. Remove: `host:removed` to target; target leaves room; `room:user-left` broadcast; participant registry cleaned.
5. End: `meeting:ended` broadcast; status/endedAt persisted; room participant map cleared.

### A.5 Team Channel Chat Flow

1. User opens team detail; socket emits `team:join {teamId}`; server verifies membership; user joins `team:{teamId}` room.
2. User sends message → REST `POST /api/chat/team/:teamId/messages` (persists to Messages with `channelType`) — synchronized via Socket.IO `team:typing`/message room broadcasts.
3. Typing indicator emitted via `team:typing` and broadcast to `team:{teamId}` as `team:user-typing`.

---

## Appendix B — Configuration Reference

### B.1 Backend Environment Variables (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `meetclone` | Database name |
| `DB_USER` / `DB_PASSWORD` | — | MySQL credentials |
| `DB_POOL_MAX` / `MIN` | 50 / 5 | Connection pool sizing |
| `DB_POOL_ACQUIRE` / `IDLE` | 30000 / 10000 | Pool timeouts (ms) |
| `SUPERADMIN_NAME/EMAIL/PASSWORD` | admin@meetclone.com | Superadmin seed |
| `JWT_SECRET` | — | JWT signing secret (strong random) |
| `JWT_EXPIRES_IN` | 7d | Token lifetime |
| `PORT` | 5000 | HTTP/Socket.IO port |
| `CLIENT_URL` | `http://localhost:5173` | CORS origin (must match frontend) |
| `NODE_ENV` | `development` | `development`/`production` |
| `MEDIASOUP_LISTEN_IP` | `0.0.0.0` | Bind address |
| `MEDIASOUP_ANNOUNCED_IP` | blank | Public IP/domain (production) |
| `MEDIASOUP_MIN_PORT` / `MAX_PORT` | 40000 / 49999 | RTC range |
| `MEDIASOUP_NUM_WORKERS` | CPU count | Worker pool (≤8) |
| `TURN_SERVER_URL` / `USERNAME` / `CREDENTIAL` | blank | Optional TURN relay |
| `OPENAI_API_KEY` | blank | Transcripts (absent = placeholder) |
| `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` | Model (`whisper-1` supported) |
| `TRANSCRIPTION_LANGUAGE` | `en` | ISO 639-1 language |
| `REDIS_URL` | `redis://localhost:6379` | Socket.IO scaling |
| `RATE_LIMIT_MAX` | 100 | Req/min/IP |
| `CLUSTER_ENABLED` | `false` | Fork per core |

### B.2 Frontend Environment Variables (`frontend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000` | REST base URL |
| `VITE_SOCKET_URL` | `http://localhost:5000` | Socket.IO server URL |

### B.3 PM2 (`backend/ecosystem.config.cjs`)

- Cluster mode across CPU cores.
- Auto-restart on memory limit (~1 GB).
- Log rotation enabled; watch disabled in production.

---

*End of SRS. Version 1.0 — aligns with the as-built implementation of MeetClone (Phases 1–2), April 2026 build, currently rated ~85% feature parity with Google Meet / Microsoft Teams.*