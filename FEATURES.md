# Minutes — Features

A Slack + Zoom/Meet style workspace: video meetings, team chat, tasks, calendar, files and an admin console in one app.
Stack: React + Vite + Tailwind (frontend), Node/Express + Socket.IO + Sequelize/MySQL + mediasoup SFU (backend).

Legend: ✅ available · 🟡 partial / has a known limit

---

## 1. Accounts & access
- ✅ Sign up / log in with email + password
- ✅ **Email verification** (SMTP) for new accounts
- ✅ Profile: name, avatar, title, department, timezone
- ✅ **Custom status** with emoji and expiry; live online/offline presence (multi-tab aware)
- ✅ Role-based permissions (what each user may create/do), enforced on the API
- ✅ Separate **admin login** and admin roles (admin / superadmin)

## 2. Meetings
- ✅ Instant meetings, scheduled meetings, team meetings, recurring options
- ✅ Join by meeting link/code; **pre-join screen** with camera/mic preview
- ✅ Joins with mic/camera **off by default** on direct links (never switched on without you); the mic button pulses and a toast reminds you while you are muted
- ✅ Group audio/video through an **SFU (mediasoup)**: simulcast video (180p/360p/720p), Opus speech audio with FEC
- ✅ Everyone can start camera/mic at the same moment (shared transports, de-duplicated and retried consumers)
- ✅ Automatic **reconnect / ICE restart** after network changes, plus a link-quality indicator and plain-language diagnostics
- ✅ Screen sharing (screen / window / tab, with tab audio) with a dedicated share layout
- 🟡 **On phones** browsers cannot capture the screen, so the share button shares the **rear camera** instead (documents, whiteboards)
- ✅ Layouts: grid, speaker, pinned and spotlighted participant; self-view mirror / hide self; Picture-in-Picture
- ✅ Speaking indicator, live mic-level ring, active-speaker highlight
- ✅ Hand raise and emoji reactions
- ✅ Device settings: choose mic, camera, speaker; noise suppression, echo cancellation, auto-gain; video quality
- ✅ Keyboard shortcuts (e.g. Ctrl+D mute, Ctrl+E camera) with a shortcuts help dialog
- ✅ Meeting details, invite link copy, invite people by email, accept/decline/cancel
- ✅ Reminders sent before scheduled meetings

### Meeting host controls
- ✅ Host, **co-host** promotion/demotion, remove participant, force mute / camera off, request unmute
- ✅ Waiting room (admit / deny), lock meeting, "host must join first"
- ✅ Mute on entry, allow/deny participant mic, camera, screen share, chat, recording
- ✅ Participant list with live mute/video/hand state

### In-meeting tools
- ✅ **Meeting chat** (replies, emoji, file attachments, typing indicator)
- ✅ **Polls** (live results, anonymous) and **Q&A** (upvotes, answers)
- ✅ **Whiteboard** (freehand, shapes, text, real-time sync, export)
- ✅ **Shared notes**
- ✅ **Breakout rooms** (create, auto/manual assign, join, close all)
- ✅ **Timer**
- ✅ **Live captions** and **speech translation** (translate captions/chat to another language)
- ✅ **Live streaming / view-only link** for audiences who only watch
- ✅ **Attendance report** download

### Recording, transcript & AI
- ✅ Record the meeting (one mixed track with everyone's audio) and download
- ✅ **Automatic transcription** (local Whisper or API) with retry; export TXT / JSON / SRT / VTT
- ✅ **AI meeting summary**: summary, key points, decisions, action items; cached and regenerable
- ✅ Turn AI action items into **tasks** in one click
- ✅ Meeting history page (recordings, transcripts, summaries)

## 3. Teams
- ✅ Create teams; join with an **invite code** (regenerate any time)
- ✅ **Invite by email**: existing users are added and emailed; people without an account get a sign-up link + the team code by email
- ✅ Roles: owner, admin, member, guest; change role, remove member; invites can't grant ownership
- ✅ **Channels**: built-in general / meetings / announcements, plus **custom channels** (owners/admins create and delete; each has its own chat)
- ✅ Team chat with file attachments, live updates, no duplicate messages
- ✅ Per-team **Tasks** tab (shared board for the team)
- ✅ Per-team **Calendar** tab (month view, day list, join / schedule meetings)
- ✅ **Delete team** (owner only, type-the-name confirmation; deleted teams disappear everywhere)

## 4. Chat (direct & group)
- ✅ Persistent **direct messages** and **group chats**
- ✅ Typing indicators, unread counts, mute conversation
- ✅ **Threads** on any message, with reply counts and deep links
- ✅ Edit (marked "edited"), delete, **forward**, **pin**, **save/bookmark**, emoji reactions
- ✅ File attachments and meeting-link cards; start a **huddle** from a DM
- ✅ Create a **task from any message**

## 5. Tasks
- ✅ Personal and team tasks, **subtasks**
- ✅ Board: To do / In progress / Done, priorities (low → urgent), due dates, overdue tracking, stats
- ✅ Assign to any team member; assignee gets an **in-app notification and an email** (title, description, priority, due date, link); reassigning notifies the new person
- ✅ Move between statuses with enforced valid transitions; delete; task detail view

## 6. Calendar
- ✅ Month calendar of scheduled meetings, scheduling with invitees and reminders
- ✅ Team-scoped calendar inside each team

## 7. Files & search
- ✅ Workspace **files**: drag-and-drop upload (50 MB), personal and team scope, permission-checked download, trash + restore, storage usage
- ✅ **Global search** across messages, people, teams, meetings, files and tasks (permission-aware, with deep links)

## 8. Notifications
- ✅ In-app notification bell with priorities, plus browser notifications
- ✅ Alerts for mentions, team events, meetings, task assignments, group adds
- ✅ **Email** for verification, team invites, task assignments and meeting invites/reminders (configured SMTP)

## 9. Billing & plans
- ✅ Free / Pro / Business / Enterprise plans, monthly or yearly
- ✅ Subscribe, upgrade/downgrade, cancel, resume, payment history, usage and plan-limit enforcement
- ✅ Public pricing page

## 10. Admin console
- ✅ Platform overview and activity analytics
- ✅ User directory with search, create user, enable/disable, change role
- ✅ **Roles & permissions** editor, admin accounts management
- ✅ Meetings overview, **audit log** (logins, team/channel/message/task/file/AI actions with actor, IP, user-agent)
- ✅ Platform settings, including an **SMTP test email**

## 11. Reliability & operations
- ✅ **Error boundary**: a UI crash shows a recovery screen instead of a black page
- ✅ Health endpoint (`/api/health`, returns 503 while draining) and graceful shutdown for rolling restarts
- ✅ Reverse-proxy ready: **nginx** and Apache configs in `deploy/`, `TRUST_PROXY` for real client IPs, sticky routing for Socket.IO
- ✅ Redis adapter for Socket.IO when `REDIS_URL` is set
- 🟡 **Single backend instance by design**: mediasoup rooms live in one process, so scale up with more mediasoup workers; multi-node needs Redis + room-pinned routing (see `deploy/DEPLOY.md`)
- ✅ Responsive layout: works on phones, tablets and desktop; dark UI

---

## Known limits
- Phones can't share their own screen from a web page (rear-camera share is offered instead).
- Media needs UDP/TCP ports 40000–49999 open and `MEDIASOUP_ANNOUNCED_IP` set to the server's public IP.
- Emails require SMTP settings in `backend/.env`; without them invites still work but nothing is mailed.

## Roadmap ideas
Channel membership and archive, projects/milestones, webinars, workflow automation, webhooks/bots, SSO/MFA, multi-node scaling.

See also: `SUPERPOWER_FEATURES.md` (spec coverage map), `deploy/DEPLOY.md` (deployment), `README.md` (setup).
