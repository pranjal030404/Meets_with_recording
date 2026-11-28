import { verifySocketCredential } from '../middleware/auth.js';
import Meeting from '../models/Meeting.js';
import Message from '../models/Message.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import ConversationMember from '../models/ConversationMember.js';
import FileEntry from '../models/FileEntry.js';
import { getPermissions } from '../lib/permissions.js';
import mediasoupService from '../lib/mediasoup.js';
import { canManageMeeting, isMeetingHost, getMeetingRole, contributorAllowed } from '../lib/meetingPermissions.js';
import { saveRuntime, loadRuntime, deleteRuntime } from '../services/roomRuntimeStore.js';
import { endMeeting, isUpcoming } from '../services/meetingLifecycle.js';
import { syncMeetingStatus } from '../services/meetingStatus.js';
import { persistLiveTranscript, scheduleTranscriptCheckpoint, cancelTranscriptCheckpoint } from '../services/liveTranscriptStore.js';
import { socketConnections, socketDisconnects, socketEvents, socketRateLimited } from '../observability/metrics.js';
import { createSocketLimiter } from '../lib/socketLimiter.js';
import { transcribeClip, canTranscribeSpeech, MAX_CLIP_BYTES } from '../services/speechChunks.js';
import { sanitizeSettings } from '../lib/meetingSettings.js';
import { modeFor, limitsFor, decideConsume } from '../media/subscriptionPolicy.js';
import { trackState } from '../lib/stateRegistry.js';
import { ownershipGuard, releaseMeeting } from '../media/sfuManager.js';
import * as presence from '../realtime/presenceManager.js';
import { parseBreakoutRoomId, resolveBreakoutAccess } from '../lib/breakoutRoomId.js';
import { guardSocket } from '../lib/socketGuard.js';
import { admissionError } from '../lib/access.js';
import { updateLocked } from '../lib/locked.js';
import { addAttendee } from '../services/attendance.js';
import { capParticipants } from '../services/subscriptionService.js';
import { roomOfSessionHash, listenForAuthChanges } from '../realtime/sessions.js';

const roomParticipants = new Map();
const meetingNotes = new Map(); // roomId -> shared notes text

// In-meeting tools state (per socket room, so breakout rooms get their own)
const roomTimers = new Map(); // roomId -> { endsAt, duration, label, startedBy }
const roomTranscription = new Map(); // roomId -> { enabled, by }
const roomTranscripts = new Map(); // roomId -> [{ userId, userName, text, timestamp }]
const roomStreams = new Map(); // roomId -> { startedAt, startedBy }

// Admission state machine per (room, user):  (none) -> waiting -> admitted | denied
// Managers (host/co-host) skip it. 'admitted' sticks for the life of the room so rejoining isn't re-gated.
const roomRecorders = new Map(); // roomId -> Map<userId, userName> currently recording locally
const roomWaiting = new Map(); // roomId -> Map<socketId, { user }>
const roomAdmitted = new Map(); // roomId -> Set<userId>
const roomRemoved = new Map(); // roomId -> Set<userId> a host removed: they must knock to come back

const MAX_TIMER_SECONDS = 12 * 60 * 60;
const MAX_TRANSCRIPT_LINES = 2000;
const MAX_LINE_CHARS = 500;
const RUNTIME_TRANSCRIPT_LINES = 500; // tail mirrored to Redis so a failover keeps the captions (full list is checkpointed to the DB)

const restoredRooms = new Map(); // roomId -> Promise: saved state is looked up once per process; concurrent joiners await the same load

const runtimeSnapshot = (roomId) => ({
  timer: roomTimers.get(roomId) || null,
  transcription: roomTranscription.get(roomId) || null,
  notes: meetingNotes.get(roomId) ?? null,
  stream: roomStreams.get(roomId) || null,
  transcript: (roomTranscripts.get(roomId) || []).slice(-RUNTIME_TRANSCRIPT_LINES),
  admitted: [...(roomAdmitted.get(roomId) || [])],
  removed: [...(roomRemoved.get(roomId) || [])]
});
const persistRuntime = (roomId) => {
  if (!parseBreakoutRoomId(roomId)) saveRuntime(roomId, () => runtimeSnapshot(roomId));
};

// After a server restart the first person to reconnect brings the room's tools back.
const restoreRuntime = (roomId) => {
  if (parseBreakoutRoomId(roomId)) return Promise.resolve();
  if (!restoredRooms.has(roomId)) restoredRooms.set(roomId, applyRestore(roomId));
  return restoredRooms.get(roomId);
};
const applyRestore = async (roomId) => {
  const saved = await loadRuntime(roomId);
  if (!saved) return;
  if (Array.isArray(saved.transcript) && saved.transcript.length && !roomTranscripts.has(roomId)) roomTranscripts.set(roomId, saved.transcript);
  if (saved.timer && saved.timer.endsAt > Date.now() && !roomTimers.has(roomId)) roomTimers.set(roomId, saved.timer);
  if (saved.transcription && !roomTranscription.has(roomId)) roomTranscription.set(roomId, saved.transcription);
  if (typeof saved.notes === 'string' && !meetingNotes.has(roomId)) meetingNotes.set(roomId, saved.notes);
  if (saved.stream && !roomStreams.has(roomId)) roomStreams.set(roomId, saved.stream);
  if (Array.isArray(saved.admitted) && saved.admitted.length && !roomAdmitted.has(roomId)) roomAdmitted.set(roomId, new Set(saved.admitted));
  if (Array.isArray(saved.removed) && saved.removed.length && !roomRemoved.has(roomId)) roomRemoved.set(roomId, new Set(saved.removed));
};

// An empty room keeps its tools/admissions for a grace period: a server blip or everyone reloading
// shouldn't reset the timer, notes and waiting-room approvals of a meeting that is still active.
const ROOM_EMPTY_GRACE_MS = 60 * 1000;
const roomClearTimers = new Map(); // roomId -> Timeout
const cancelRoomClear = (roomId) => {
  const t = roomClearTimers.get(roomId);
  if (t) { clearTimeout(t); roomClearTimers.delete(roomId); }
};
const scheduleRoomClear = (roomId) => {
  cancelRoomClear(roomId);
  const t = setTimeout(() => {
    roomClearTimers.delete(roomId);
    if ((roomParticipants.get(roomId)?.size || 0) === 0) {
      roomParticipants.delete(roomId);
      clearRoomTools(roomId);
    }
  }, ROOM_EMPTY_GRACE_MS);
  t.unref?.();
  roomClearTimers.set(roomId, t);
};

// Whiteboard strokes per socket room, replayed to anyone who opens the board later
const roomBoards = new Map();
const MAX_BOARD_STROKES = 20000;

const clearRoomTools = (roomId) => {
  cancelRoomClear(roomId);
  restoredRooms.delete(roomId);
  deleteRuntime(roomId);
  // Keep the live captions as the meeting's transcript (main rooms only; breakouts are throwaway)
  cancelTranscriptCheckpoint(roomId);
  if (!parseBreakoutRoomId(roomId)) persistLiveTranscript(roomId, roomTranscripts.get(roomId));
  meetingNotes.delete(roomId);
  roomBoards.delete(roomId);
  roomTimers.delete(roomId);
  roomTranscription.delete(roomId);
  roomTranscripts.delete(roomId);
  roomStreams.delete(roomId);
  roomWaiting.delete(roomId);
  roomAdmitted.delete(roomId);
  roomRemoved.delete(roomId);
  roomRecorders.delete(roomId);
  roomWebinar.delete(roomId);
  roomMode.delete(roomId);
  if (!parseBreakoutRoomId(roomId)) releaseMeeting(roomId).catch(() => {});
  mediasoupService.closeRouter(roomId); // frees the worker slot; used to leak one router per meeting forever
};

const emitToolsState = (socket, roomId) => {
  if (!socket.rooms.has(roomId)) return;
  socket.emit('timer:state', { timer: roomTimers.get(roomId) || null, serverNow: Date.now() });
  socket.emit('transcribe:state', roomTranscription.get(roomId) || { enabled: false, by: null });
  socket.emit('stream:state', { stream: roomStreams.get(roomId) || null });
};

const sendBackIfClosed = async (socket, roomId) => {
  const breakout = parseBreakoutRoomId(roomId);
  if (!breakout || await resolveBreakoutAccess(roomId, socket.user.id)) return false;
  socket.emit('breakout:closed', { returnRoomId: breakout.parentRoomId });
  return true;
};

// Breakout rooms authorize against their parent meeting
const loadRoomMeeting = (roomId) => {
  const parsed = parseBreakoutRoomId(roomId);
  return Meeting.findOne({ where: { roomId: parsed ? parsed.parentRoomId : roomId } });
};

const userTransports = new Map();
const userConsumers = new Map(); // socketId -> Map<consumerId, { kind, mediaType }>  (enforces subscription limits)
const roomWebinar = new Map();   // roomId -> boolean (settings.webinar), cached for the owner node
const roomMode = new Map();      // roomId -> last announced subscription mode
const isManagerRole = (r) => r === 'host' || r === 'co-host';

// Webinar switched on: close every non-manager's producers so attendees go view-only immediately
const closeAttendeeProducers = (io, roomId) => {
  for (const [userId, info] of roomParticipants.get(roomId) || []) {
    if (isManagerRole(info.role)) continue;
    const mine = userProducers.get(info.socketId);
    if (!mine) continue;
    for (const [mediaType, producerId] of Object.entries(mine)) {
      mediasoupService.closeProducer(producerId);
      delete mine[mediaType];
      io.to(roomId).emit('mediasoup:producerClosed', { producerId, socketId: info.socketId });
    }
  }
};

const countConsumers = (socketId) => {
  const c = { audio: 0, video: 0, screen: 0 };
  for (const v of userConsumers.get(socketId)?.values() || []) c[v.mediaType === 'screen' ? 'screen' : v.kind]++;
  return c;
};
const currentMode = (roomId) => modeFor({ participantCount: roomParticipants.get(roomId)?.size || 0, webinar: !!roomWebinar.get(roomId) });
const policyPayload = (roomId) => { const mode = currentMode(roomId); return { roomId, mode, ...limitsFor(mode) }; };
// Announce the policy to the room only when the mode actually changes (join/leave/webinar toggle).
const refreshRoomMode = (io, roomId) => {
  const mode = currentMode(roomId);
  if (roomMode.get(roomId) !== mode) { roomMode.set(roomId, mode); io.to(roomId).emit('room:media-policy', policyPayload(roomId)); }
};
const userProducers = new Map();

// Every per-process collection, named and scoped, exported as a gauge (see lib/stateRegistry.js).
[['roomParticipants', roomParticipants, 'room'], ['meetingNotes', meetingNotes, 'room'], ['roomTimers', roomTimers, 'room'],
 ['roomTranscription', roomTranscription, 'room'], ['roomTranscripts', roomTranscripts, 'room'], ['roomStreams', roomStreams, 'room'],
 ['roomRecorders', roomRecorders, 'room'], ['roomWaiting', roomWaiting, 'room'], ['roomAdmitted', roomAdmitted, 'room'], ['roomRemoved', roomRemoved, 'room'],
 ['restoredRooms', restoredRooms, 'room'], ['roomClearTimers', roomClearTimers, 'room'], ['roomWebinar', roomWebinar, 'room'], ['roomMode', roomMode, 'room'],
 ['userTransports', userTransports, 'socket'], ['userConsumers', userConsumers, 'socket'], ['userProducers', userProducers, 'socket']
].forEach(([n, c, sc]) => trackState(n, c, sc));

const recordAttendance = async (meeting, user) => {
  if ((meeting.participants || []).some((p) => p.userId === user.id && p.joinedAt && !p.leftAt)) return;
  await updateLocked(Meeting, meeting.id, (row) => {
    if (!addAttendee(row, user)) return false;
  });
  await meeting.reload();
};

export const initializeSocketHandlers = (io) => {
  listenForAuthChanges(io);
  // A dead worker takes its routers' transports with it; they cannot migrate. Tell the room so clients rebuild media.
  mediasoupService.onActiveSpeakers = (roomId, speakers) => {
    io.to(roomId).emit('media:active-speakers', { roomId, userIds: speakers.map((x) => x.userId).filter(Boolean), producerIds: speakers.map((x) => x.producerId) });
  };
  mediasoupService.onRoomsLost = (roomIds, reason) => {
    for (const roomId of roomIds) io.to(roomId).emit('media:reconnect-required', { roomId, reason });
  };

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const verified = await verifySocketCredential(token);

    if (!verified) {
      return next(new Error('Invalid token'));
    }

    socket.user = verified.user;
    socket.data.sessionRoom = roomOfSessionHash(verified.session);
    next();
  });

  // True when host management forbids this user from the given contributor action
  const isBlocked = async (roomId, userId, key) => {
    if (!roomId) return false;
    const meeting = await Meeting.findOne({ where: { roomId }, attributes: ['id', 'hostId', 'settings', 'participants'] });
    return !!meeting && !contributorAllowed(meeting, userId, key);
  };

  // People who are in the meeting: both ids must be socket ids sitting in this room
  const inRoom = (socketId, roomId) => typeof socketId === 'string' && !!io.sockets.adapter.rooms.get(roomId)?.has(socketId);

  io.on('connection', (socket) => {
    socketConnections.inc();
    guardSocket(socket); // must come before any socket.on below
    // The host (or co-host) of the meeting whose room this socket is actually in, or null
    const managedMeeting = async (roomId) => {
      if (typeof roomId !== 'string' || !socket.rooms.has(roomId)) return null;
      const meeting = await Meeting.findOne({ where: { roomId } });
      return meeting && canManageMeeting(meeting, socket.user.id) ? meeting : null;
    };
    const limiter = createSocketLimiter();
    socket.use(([event, ...args], next) => {
      socketEvents.inc({ event: typeof event === 'string' && event.length < 40 ? event : 'other' });
      const verdict = limiter.take();
      if (verdict === 'ok') return next();
      socketRateLimited.inc({ event: typeof event === 'string' && event.length < 40 ? event : 'other' });
      const ack = args[args.length - 1];
      if (typeof ack === 'function') ack({ success: false, error: 'Rate limit exceeded' });
      if (verdict === 'kick') socket.disconnect(true);
      // dropped: intentionally no next() => handler never runs
    });
    console.log(`User connected: ${socket.user.name} (${socket.id})`);

    socket.join(`user:${socket.user.id}`);
    socket.join(socket.data.sessionRoom);

    // Cluster-wide presence (Redis, TTL'd, multi-tab aware). The DB flag is only a mirror, written on
    // transitions (first socket in / last socket out), not on every connect.
    presence.connect(socket.user.id, socket.id).then(({ wasOffline }) => {
      if (wasOffline) User.update({ isOnline: true }, { where: { id: socket.user.id } }).catch(() => {});
    });
    const presenceTimer = setInterval(() => presence.heartbeat(socket.user.id, socket.id), 20000);
    presenceTimer.unref?.();
    socket.once('disconnect', () => clearInterval(presenceTimer));

    const handleRoomJoin = async ({ roomId }, { admitted = false } = {}) => {
      try {
        let meeting;
        if (parseBreakoutRoomId(roomId)) {
          const access = await resolveBreakoutAccess(roomId, socket.user.id);
          if (!access) {
            socket.emit('error', { message: 'Breakout room is closed or not assigned to you' });
            return;
          }
          meeting = access.meeting;
        } else {
          meeting = await Meeting.findOne({ where: { roomId } });
        }

        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
          return;
        }

        if (!parseBreakoutRoomId(roomId)) {
          const present = [...(roomParticipants.get(roomId)?.keys() || [])].filter((id) => id !== socket.user.id).length;
          const refused = await admissionError(meeting, socket.user, { present });
          if (refused) {
            socket.emit('error', { message: refused.message, code: refused.code });
            return;
          }
        } else if (meeting.status === 'ended' || meeting.status === 'cancelled') {
          socket.emit('error', { message: 'This meeting has ended' });
          return;
        }

        // Meeting affinity: this meeting's state + media live on exactly one node. Anyone else is redirected.
        const guard = await ownershipGuard(roomId);
        if (guard?.redirect) { socket.emit('room:redirect', { roomId, ...guard.redirect }); return; }
        if (guard?.error) { socket.emit('error', { message: guard.error, code: guard.code }); return; }

        cancelRoomClear(roomId);
        await restoreRuntime(roomId);

        // Admission gate (main rooms only): locked meeting / waiting room, enforced server-side
        if (!parseBreakoutRoomId(roomId) && !admitted && !canManageMeeting(meeting, socket.user.id)
            && !roomAdmitted.get(roomId)?.has(socket.user.id)) {
          if (meeting.settings?.isLocked) {
            socket.emit('error', { message: 'This meeting is locked by the host' });
            return;
          }
          if (meeting.settings?.waitingRoom || roomRemoved.get(roomId)?.has(socket.user.id)) {
            if (!roomWaiting.has(roomId)) roomWaiting.set(roomId, new Map());
            const queue = roomWaiting.get(roomId);
            // waiting -> waiting is a no-op: a repeated knock (double click / reload) must not re-notify the hosts.
            if (queue.has(socket.id)) { socket.emit('room:waiting-for-host', { roomId }); return; }
            // Same person on a stale socket (old tab / reconnect): that earlier knock is superseded, so the
            // hosts see one entry per user and admitting a dead socket can't strand the real one.
            for (const [staleId, entry] of [...queue]) {
              if (entry.user.id === socket.user.id) {
                queue.delete(staleId);
                for (const [, info] of roomParticipants.get(roomId) || []) {
                  if (info.role === 'host' || info.role === 'co-host') io.to(info.socketId).emit('room:waiting-left', { socketId: staleId });
                }
              }
            }
            roomWaiting.get(roomId).set(socket.id, { user: { id: socket.user.id, name: socket.user.name, email: socket.user.email, avatar: socket.user.avatar } });
            socket.emit('room:waiting-for-host', { roomId });
            // Tell the room's managers (they're in the socket room) that someone is at the door
            for (const [userId, info] of roomParticipants.get(roomId) || []) {
              if (info.role === 'host' || info.role === 'co-host') {
                io.to(info.socketId).emit('room:waiting', { user: { id: socket.user.id, name: socket.user.name, email: socket.user.email, avatar: socket.user.avatar }, socketId: socket.id });
              }
            }
            return;
          }
        }

        // Attendance is recorded on whichever path actually let the person in
        if (!parseBreakoutRoomId(roomId)) await recordAttendance(meeting, socket.user);

        socket.join(roomId);
        socket.roomId = roomId;
        // closed while this person was on the way in: they were not in the room to hear it
        await sendBackIfClosed(socket, roomId);
        if (socket.connected) {
          socket.data.inMeeting = true;
          syncMeetingStatus(io, socket.user.id);
        }

        if (!roomParticipants.has(roomId)) {
          roomParticipants.set(roomId, new Map());
        }

        // "Take notes": transcription starts with the meeting (once; a host who stops it stays stopped)
        if (meeting.settings?.takeNotes && !parseBreakoutRoomId(roomId) && !roomTranscription.has(roomId)) {
          roomTranscription.set(roomId, { enabled: true, by: 'meeting settings' });
          persistRuntime(roomId);
        }

        const roomUsers = roomParticipants.get(roomId);
        const role = getMeetingRole(meeting, socket.user.id);
        roomUsers.set(socket.user.id, {
          socketId: socket.id,
          user: {
            id: socket.user.id,
            name: socket.user.name,
            email: socket.user.email,
            avatar: socket.user.avatar
          },
          role,
          isMuted: meeting.settings ? meeting.settings.muteOnEntry : false,
          isVideoOff: false,
          isScreenSharing: false
        });

        const participants = Array.from(roomUsers.values()).filter(
          p => p.user.id !== socket.user.id
        );

        roomWebinar.set(roomId, !!meeting.settings?.webinar);
        socket.emit('room:media-policy', policyPayload(roomId));
        refreshRoomMode(io, roomId);

        socket.emit('room:participants', {
          participants,
          isHost: role === 'host',
          isCoHost: role === 'co-host',
          role
        });

        const existingProducers = [];
        for (const [participantSocketId, participant] of roomUsers) {
          if (participantSocketId !== socket.user.id) {
            const producers = userProducers.get(participant.socketId);
            if (producers) {
              for (const [mediaType, producerId] of Object.entries(producers)) {
                existingProducers.push({
                  producerId,
                  socketId: participant.socketId,
                  userId: participant.user.id,
                  userName: participant.user.name,
                  kind: mediaType === 'screen' ? 'video' : mediaType,
                  mediaType,
                });
              }
            }
          }
        }

        if (existingProducers.length > 0) {
          socket.emit('mediasoup:existingProducers', { producers: existingProducers });
        }
        // A share that started before this person joined: the layout switches on this event, not on the track
        for (const p of existingProducers.filter((x) => x.mediaType === 'screen' && x.userId !== socket.user.id)) {
          socket.emit('media:screen-share', { socketId: p.socketId, userId: p.userId, userName: p.userName, isScreenSharing: true });
        }

        // The client publishes its tracks BEFORE room:join (so the SFU is ready), at which point
        // socket.roomId wasn't set and 'mediasoup:newProducer' went nowhere. Announce them now, otherwise
        // the joiner can see everyone while nobody can see the joiner.
        for (const [mediaType, producerId] of Object.entries(userProducers.get(socket.id) || {})) {
          socket.to(roomId).emit('mediasoup:newProducer', {
            producerId,
            socketId: socket.id,
            userId: socket.user.id,
            userName: socket.user.name,
            kind: mediaType === 'screen' ? 'video' : mediaType,
            mediaType,
          });
        }

        socket.to(roomId).emit('room:user-joined', {
          user: {
            id: socket.user.id,
            name: socket.user.name,
            email: socket.user.email,
            avatar: socket.user.avatar
          },
          role,
          socketId: socket.id
        });

        // Late joiners pick up any running timer / transcription / live stream / recording
        emitToolsState(socket, roomId);
        for (const [userId, userName] of roomRecorders.get(roomId) || []) {
          if (userId !== socket.user.id) socket.emit('recording:started', { userId, userName });
        }

        // A manager arriving after guests are already waiting still needs to see them
        if (canManageMeeting(meeting, socket.user.id)) {
          for (const [waitingSocketId, entry] of roomWaiting.get(roomId) || []) {
            socket.emit('room:waiting', { user: entry.user, socketId: waitingSocketId });
          }
        }

        console.log(`${socket.user.name} joined room: ${roomId}`);
      } catch (error) {
        console.error('Room join error:', error);
        socket.emit('error', { message: 'Error joining room' });
      }
    };
    socket.data.joinRoom = handleRoomJoin;
    socket.on('room:join', (payload) => handleRoomJoin(payload));

    socket.on('room:leave', () => {
      // A guest cancelling from the waiting screen has no socket.roomId: drop them from the queue
      for (const [waitRoomId, waiting] of roomWaiting) {
        if (waiting.delete(socket.id)) {
          for (const [, info] of roomParticipants.get(waitRoomId) || []) {
            if (info.role === 'host' || info.role === 'co-host') io.to(info.socketId).emit('room:waiting-left', { socketId: socket.id });
          }
        }
      }
      handleRoomLeave(socket, io);
    });

    // Media operations are only valid on the owner node, for a meeting that exists and is not over.
    // (Previously any authenticated socket could create a router/transport for an arbitrary roomId.)
    const mediaGate = async (roomId) => {
      if (typeof roomId !== 'string') return { error: 'roomId required' };
      const meeting = await loadRoomMeeting(roomId);
      if (!meeting || meeting.status === 'ended' || meeting.status === 'cancelled') return { error: 'Meeting not available' };
      if (parseBreakoutRoomId(roomId)) {
        if (!(await resolveBreakoutAccess(roomId, socket.user.id))) return { error: 'Breakout room is closed or not assigned to you' };
      } else if (!socket.rooms.has(roomId)) {
        const present = [...(roomParticipants.get(roomId)?.keys() || [])].filter((id) => id !== socket.user.id).length;
        const refused = await admissionError(meeting, socket.user, { present });
        if (refused) return { error: refused.message };
        const let_in = canManageMeeting(meeting, socket.user.id) || roomAdmitted.get(roomId)?.has(socket.user.id);
        if (meeting.settings?.isLocked && !let_in) return { error: 'This meeting is locked by the host' };
      }
      return ownershipGuard(roomId);
    };

    // Replies are optional: a client that emits without an ack (or without data) must not crash the process
    socket.on('mediasoup:getRouterRtpCapabilities', async ({ roomId } = {}, callback = () => {}) => {
      try {
        const gate = await mediaGate(roomId);
        if (gate?.redirect) return callback({ success: false, redirect: gate.redirect });
        if (gate?.error) return callback({ success: false, error: gate.error });
        const rtpCapabilities = await mediasoupService.getRouterRtpCapabilities(roomId);
        callback({ success: true, rtpCapabilities });
      } catch (error) {
        console.error('Get RTP capabilities error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('mediasoup:createWebRtcTransport', async ({ roomId, direction } = {}, callback = () => {}) => {
      try {
        const gate = await mediaGate(roomId);
        if (gate?.redirect) return callback({ success: false, redirect: gate.redirect });
        if (gate?.error) return callback({ success: false, error: gate.error });
        const transportParams = await mediasoupService.createWebRtcTransport(roomId, direction);

        if (!userTransports.has(socket.id)) {
          userTransports.set(socket.id, {});
        }

        const transports = userTransports.get(socket.id);
        if (direction === 'send') {
          transports.send = transportParams.id;
        } else {
          transports.recv = transportParams.id;
        }

        callback({ success: true, transportParams });
      } catch (error) {
        console.error('Create transport error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('mediasoup:restartIce', async ({ transportId } = {}, callback = () => {}) => {
      try {
        // Only the owner of a transport may restart it
        const mine = userTransports.get(socket.id) || {};
        if (transportId !== mine.send && transportId !== mine.recv) throw new Error('Not your transport');
        const iceParameters = await mediasoupService.restartIce(transportId);
        callback({ success: true, iceParameters });
      } catch (error) {
        console.error('Restart ICE error:', error);
        callback({ success: false, error: error.message });
      }
    });

    const ownsTransport = (transportId) => { const m = userTransports.get(socket.id) || {}; return transportId === m.send || transportId === m.recv; };

    socket.on('mediasoup:connectTransport', async ({ transportId, dtlsParameters } = {}, callback = () => {}) => {
      try {
        if (!ownsTransport(transportId)) throw new Error('Not your transport');
        await mediasoupService.connectTransport(transportId, dtlsParameters);
        callback({ success: true });
      } catch (error) {
        console.error('Connect transport error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('mediasoup:produce', async ({ transportId, kind, rtpParameters, appData } = {}, callback = () => {}) => {
      try {
        if (!ownsTransport(transportId)) throw new Error('Not your transport');
        if (roomWebinar.get(socket.roomId) && !isManagerRole(roomParticipants.get(socket.roomId)?.get(socket.user.id)?.role)) {
          return callback({ success: false, code: 'WEBINAR_VIEW_ONLY', error: 'Webinar mode: only hosts and co-hosts can present' });
        }
        const produceKey = { audio: 'allowMic', video: 'allowVideo', screen: 'allowScreenShare' }[appData?.mediaType || kind];
        if (produceKey && await isBlocked(socket.roomId, socket.user.id, produceKey)) {
          return callback({ success: false, error: 'The host has turned this off for participants' });
        }
        const { id: producerId } = await mediasoupService.produce(
          transportId,
          kind,
          rtpParameters,
          { ...appData, socketId: socket.id, userId: socket.user.id }
        );

        if (!userProducers.has(socket.id)) {
          userProducers.set(socket.id, {});
        }

        const producers = userProducers.get(socket.id);
        const mediaType = appData.mediaType || kind;
        producers[mediaType] = producerId;

        if (socket.roomId) {
          socket.to(socket.roomId).emit('mediasoup:newProducer', {
            producerId,
            socketId: socket.id,
            userId: socket.user.id,
            userName: socket.user.name,
            kind,
            mediaType,
          });
        }

        callback({ success: true, producerId });
      } catch (error) {
        console.error('Produce error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('mediasoup:consume', async ({ roomId, producerId, rtpCapabilities, priority } = {}, callback = () => {}) => {
      try {
        // Only people actually in the room (not waiting, not denied) may receive its media
        if (!socket.rooms.has(roomId)) return callback({ success: false, error: 'Not in this room' });
        const transports = userTransports.get(socket.id);
        if (!transports || !transports.recv) {
          throw new Error('Receive transport not created');
        }

        // Selective subscription: server-side enforcement so a modified client can't pull N^2 streams
        const producer = mediasoupService.producers.get(producerId);
        if (!producer) throw new Error('Producer not found');
        const mediaType = producer.appData?.mediaType || producer.kind;
        const roster = roomParticipants.get(roomId);
        const ownerEntry = roster?.get(producer.appData?.userId);
        const decision = decideConsume({
          mode: currentMode(roomId), kind: producer.kind, mediaType,
          current: countConsumers(socket.id),
          requesterIsManager: isManagerRole(roster?.get(socket.user.id)?.role),
          ownerIsManager: isManagerRole(ownerEntry?.role),
          priority: priority === 'pinned' || mediasoupService.isActiveSpeaker(roomId, producerId),
        });
        if (!decision.allow) {
          mediasoupService.subStats.denied[decision.reason] = (mediasoupService.subStats.denied[decision.reason] || 0) + 1;
          return callback({ success: false, code: 'SUBSCRIPTION_LIMIT', reason: decision.reason, error: `Subscription not allowed: ${decision.reason}` });
        }
        mediasoupService.subStats.allowed++;

        const consumerParams = await mediasoupService.consume(
          roomId,
          transports.recv,
          producerId,
          rtpCapabilities
        );
        if (!userConsumers.has(socket.id)) userConsumers.set(socket.id, new Map());
        const mine = userConsumers.get(socket.id);
        mine.set(consumerParams.id, { kind: producer.kind, mediaType });
        mediasoupService.consumers.get(consumerParams.id)?.observer.once('close', () => mine.delete(consumerParams.id));

        callback({ success: true, consumerParams });
      } catch (error) {
        console.error('Consume error:', error);
        callback({ success: false, error: error.message });
      }
    });

    const ownsProducer = (producerId) => Object.values(userProducers.get(socket.id) || {}).includes(producerId);

    socket.on('mediasoup:resumeConsumer', async ({ consumerId } = {}, callback = () => {}) => {
      try {
        if (!userConsumers.get(socket.id)?.has(consumerId)) throw new Error('Not your consumer');
        await mediasoupService.resumeConsumer(consumerId);
        callback({ success: true });
      } catch (error) {
        console.error('Resume consumer error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Drop a subscription (tile scrolled away / over the video budget) - frees SFU CPU + egress
    socket.on('mediasoup:closeConsumer', ({ consumerId } = {}, callback = () => {}) => {
      try {
        if (!userConsumers.get(socket.id)?.has(consumerId)) throw new Error('Not your consumer');
        mediasoupService.closeConsumer(consumerId);
        userConsumers.get(socket.id)?.delete(consumerId);
        callback?.({ success: true });
      } catch (error) { callback?.({ success: false, error: error.message }); }
    });

    // Thumbnails ask for the low simulcast layer; pinned/speaker ask for high
    socket.on('mediasoup:setConsumerLayers', async ({ consumerId, spatialLayer, temporalLayer } = {}, callback = () => {}) => {
      try {
        if (!userConsumers.get(socket.id)?.has(consumerId)) throw new Error('Not your consumer');
        await mediasoupService.setConsumerLayers(consumerId, spatialLayer, temporalLayer);
        callback?.({ success: true });
      } catch (error) { callback?.({ success: false, error: error.message }); }
    });

    socket.on('mediasoup:pauseProducer', async ({ producerId } = {}, callback = () => {}) => {
      try {
        if (!ownsProducer(producerId)) throw new Error('Not your producer');
        await mediasoupService.pauseProducer(producerId);

        if (socket.roomId) {
          socket.to(socket.roomId).emit('mediasoup:producerPaused', {
            producerId,
            socketId: socket.id,
          });
        }

        callback({ success: true });
      } catch (error) {
        console.error('Pause producer error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('mediasoup:resumeProducer', async ({ producerId } = {}, callback = () => {}) => {
      try {
        if (!ownsProducer(producerId)) throw new Error('Not your producer');
        await mediasoupService.resumeProducer(producerId);

        if (socket.roomId) {
          socket.to(socket.roomId).emit('mediasoup:producerResumed', {
            producerId,
            socketId: socket.id,
          });
        }

        callback({ success: true });
      } catch (error) {
        console.error('Resume producer error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('mediasoup:closeProducer', ({ producerId } = {}, callback = () => {}) => {
      try {
        if (!ownsProducer(producerId)) throw new Error('Not your producer');
        mediasoupService.closeProducer(producerId);

        const producers = userProducers.get(socket.id);
        if (producers) {
          for (const [key, value] of Object.entries(producers)) {
            if (value === producerId) {
              delete producers[key];
              break;
            }
          }
        }

        if (socket.roomId) {
          socket.to(socket.roomId).emit('mediasoup:producerClosed', {
            producerId,
            socketId: socket.id,
          });
        }

        callback({ success: true });
      } catch (error) {
        console.error('Close producer error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('media:toggle-mute', ({ isMuted }) => {
      if (socket.roomId) {
        const roomUsers = roomParticipants.get(socket.roomId);
        if (roomUsers && roomUsers.has(socket.user.id)) {
          roomUsers.get(socket.user.id).isMuted = isMuted;
        }

        socket.to(socket.roomId).emit('media:user-muted', {
          socketId: socket.id,
          userId: socket.user.id,
          isMuted
        });
      }
    });

    socket.on('media:toggle-video', ({ isVideoOff }) => {
      if (socket.roomId) {
        const roomUsers = roomParticipants.get(socket.roomId);
        if (roomUsers && roomUsers.has(socket.user.id)) {
          roomUsers.get(socket.user.id).isVideoOff = isVideoOff;
        }

        socket.to(socket.roomId).emit('media:user-video', {
          socketId: socket.id,
          userId: socket.user.id,
          isVideoOff
        });
      }
    });

    socket.on('media:screen-share', async ({ isScreenSharing }) => {
      if (isScreenSharing && await isBlocked(socket.roomId, socket.user.id, 'allowScreenShare')) return;
      if (socket.roomId) {
        const roomUsers = roomParticipants.get(socket.roomId);
        if (roomUsers && roomUsers.has(socket.user.id)) {
          roomUsers.get(socket.user.id).isScreenSharing = isScreenSharing;
        }

        socket.to(socket.roomId).emit('media:screen-share', {
          socketId: socket.id,
          userId: socket.user.id,
          userName: socket.user.name,
          isScreenSharing
        });
      }
    });

    socket.on('host:mute-user', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await managedMeeting(roomId);

        if (meeting && inRoom(targetSocketId, roomId)) {
          io.to(targetSocketId).emit('host:force-mute');
          io.to(roomId).emit('host:user-muted', { targetSocketId });
        }
      } catch (error) {
        console.error('Host mute error:', error);
      }
    });

    socket.on('host:remove-user', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await managedMeeting(roomId);

        if (meeting && inRoom(targetSocketId, roomId)) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          const targetUserId = targetSocket?.user?.id;
          const callerIsHost = isMeetingHost(meeting, socket.user.id);

          // Co-hosts cannot remove the host or other co-hosts
          if (targetUserId) {
            const targetIsHost = isMeetingHost(meeting, targetUserId);
            const targetIsCoHost = getMeetingRole(meeting, targetUserId) === 'co-host';
            if (targetIsHost || (targetIsCoHost && !callerIsHost)) {
              return;
            }
          }

          if (targetUserId) {
            if (!roomRemoved.has(roomId)) roomRemoved.set(roomId, new Set());
            roomRemoved.get(roomId).add(targetUserId);
            roomAdmitted.get(roomId)?.delete(targetUserId);
            persistRuntime(roomId);
          }

          io.to(targetSocketId).emit('host:removed');

          if (targetSocket) {
            targetSocket.leave(roomId);

            const roomUsers = roomParticipants.get(roomId);
            if (roomUsers && targetUserId) {
              roomUsers.delete(targetUserId);
            }
          }

          io.to(roomId).emit('room:user-left', { socketId: targetSocketId, userId: targetUserId });
        }
      } catch (error) {
        console.error('Host remove error:', error);
      }
    });

    socket.on('host:end-meeting', async ({ roomId }) => {
      try {
        const meeting = await managedMeeting(roomId);

        if (meeting) {
          await endMeeting(meeting); // idempotent, bills minutes once
          io.to(roomId).emit('meeting:ended', {
            roomId,
            endedBy: socket.user.id
          });

          // People still at the door learn the meeting is over too
          for (const waitingSocketId of roomWaiting.get(roomId)?.keys() || []) {
            io.to(waitingSocketId).emit('meeting:ended', { roomId, endedBy: socket.user.id });
          }
          roomParticipants.delete(roomId);
          clearRoomTools(roomId);

          // Pull anyone sitting in a breakout room out as well
          for (const name of io.sockets.adapter.rooms.keys()) {
            const parsed = parseBreakoutRoomId(name);
            if (parsed && parsed.parentRoomId === roomId) {
              io.to(name).emit('meeting:ended', { roomId: name, endedBy: socket.user.id });
              roomParticipants.delete(name);
              clearRoomTools(name);
            }
          }
        }
      } catch (error) {
        console.error('Host end meeting error:', error);
      }
    });

    socket.on('chat:send', async ({ roomId, content, recipientId, attachment }) => {
      try {
        if (!(await getPermissions(socket.user)).includes('chat.send')) {
          socket.emit('error', { message: 'Your role does not allow sending messages' });
          return;
        }
        // Breakout rooms have no meeting row of their own: their chat is relayed to the room and not saved
        if (parseBreakoutRoomId(roomId)) {
          const text = (content || '').trim();
          if (!socket.rooms.has(roomId) || !text) return;
          const id = `br-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          io.to(roomId).emit('chat:message', {
            id, _id: id, content: text, type: 'text', senderId: socket.user.id,
            sender: { id: socket.user.id, name: socket.user.name, avatar: socket.user.avatar },
            createdAt: new Date().toISOString()
          });
          return;
        }

        const meeting = await Meeting.findOne({ where: { roomId } });

        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
          return;
        }

        if (!socket.rooms.has(roomId)) {
          socket.emit('error', { message: 'Join the meeting to send messages' });
          return;
        }

        // A private message can only go to someone who is part of this meeting
        if (recipientId && !(roomParticipants.get(roomId)?.has(recipientId) || (meeting.participantIds || []).includes(recipientId))) {
          socket.emit('error', { message: 'That person is not in this meeting' });
          return;
        }

        if (meeting.settings?.allowChat === false) {
          socket.emit('error', { message: 'Chat is disabled' });
          return;
        }

        // Optional file attachment — must reference a file this user uploaded
        // to this meeting (avoids forging attachments to arbitrary files).
        let file = null;
        if (attachment && attachment.fileId) {
          file = await FileEntry.findOne({
            where: {
              id: attachment.fileId,
              ownerId: socket.user.id,
              meetingId: meeting.id,
              isDeleted: false
            }
          });
          if (!file) {
            socket.emit('error', { message: 'Attachment not found or not yours' });
            return;
          }
        }

        const text = (content || '').trim();
        if (!text && !file) {
          socket.emit('error', { message: 'Message content is required' });
          return;
        }

        const messageData = {
          meetingId: meeting.id,
          senderId: socket.user.id,
          content: text || (file ? file.originalName : ''),
          type: file ? 'file' : 'text',
          isPrivate: !!recipientId
        };

        if (file) {
          messageData.fileUrl = file.url;
          messageData.fileName = file.originalName;
          messageData.fileType = file.mimeType;
          messageData.fileSize = file.size;
        }

        if (recipientId) {
          messageData.recipientId = recipientId;
        }

        const message = await Message.create(messageData);

        const sender = await User.findByPk(socket.user.id, {
          attributes: ['id', 'name', 'email', 'avatar']
        });

        const messageJson = message.toJSON();
        messageJson.sender = sender;
        messageJson._id = messageJson.id;

        if (recipientId) {
          const recipient = await User.findByPk(recipientId, {
            attributes: ['id', 'name', 'avatar']
          });
          messageJson.recipient = recipient;
          io.to(`user:${socket.user.id}`).to(`user:${recipientId}`).emit('chat:message', messageJson);
        } else {
          io.to(roomId).emit('chat:message', messageJson);
        }
      } catch (error) {
        console.error('Chat send error:', error);
        socket.emit('error', { message: 'Error sending message' });
      }
    });

    socket.on('chat:typing', ({ roomId, isTyping }) => {
      if (!socket.rooms.has(roomId)) return;
      socket.to(roomId).emit('chat:user-typing', {
        userId: socket.user.id,
        userName: socket.user.name,
        isTyping
      });
    });

    // Recording indicator is server-tracked so late joiners see it and several recorders don't clobber each other
    socket.on('recording:started', ({ roomId }) => {
      if (!socket.rooms.has(roomId)) return;
      if (!roomRecorders.has(roomId)) roomRecorders.set(roomId, new Map());
      roomRecorders.get(roomId).set(socket.user.id, socket.user.name);
      socket.to(roomId).emit('recording:started', {
        userId: socket.user.id,
        userName: socket.user.name
      });
    });

    socket.on('recording:stopped', ({ roomId }) => {
      if (!socket.rooms.has(roomId)) return;
      stopRecorder(io, socket, roomId);
    });

    socket.on('reaction:hand-raise', ({ roomId, isRaised }) => {
      if (!socket.rooms.has(roomId)) return;
      socket.to(roomId).emit('reaction:hand-raise', {
        socketId: socket.id,
        userId: socket.user.id,
        userName: socket.user.name,
        isRaised
      });
    });

    // Host lowers one person's hand, or everyone's. Each client lowers its own and announces it as usual.
    socket.on('host:lower-hand', async ({ roomId, targetSocketId } = {}) => {
      try {
        if (!socket.rooms.has(roomId)) return;
        const meeting = await loadRoomMeeting(roomId);
        if (!meeting || !canManageMeeting(meeting, socket.user.id)) return;
        // only someone who is actually in this room can be targeted
        if (targetSocketId && !io.sockets.adapter.rooms.get(roomId)?.has(targetSocketId)) return;
        socket.to(targetSocketId || roomId).emit('host:lower-hand');
      } catch (error) {
        console.error('Host lower hand error:', error);
      }
    });

    socket.on('reaction:emoji', async ({ roomId, emoji }) => {
      if (!socket.rooms.has(roomId)) return;
      if (await isBlocked(roomId, socket.user.id, 'allowReactions')) return;
      io.to(roomId).emit('reaction:emoji', {
        userId: socket.user.id,
        userName: socket.user.name,
        emoji
      });
    });

    socket.on('host:force-video-off', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await managedMeeting(roomId);
        if (meeting && inRoom(targetSocketId, roomId)) {
          io.to(targetSocketId).emit('host:force-video-off');
        }
      } catch (error) {
        console.error('Host force video off error:', error);
      }
    });

    socket.on('host:request-unmute', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await managedMeeting(roomId);
        if (meeting && inRoom(targetSocketId, roomId)) {
          io.to(targetSocketId).emit('host:request-unmute');
        }
      } catch (error) {
        console.error('Host request unmute error:', error);
      }
    });

    socket.on('host:mute-all', async ({ roomId }) => {
      try {
        const meeting = await managedMeeting(roomId);
        if (meeting) {
          socket.to(roomId).emit('host:force-mute');
        }
      } catch (error) {
        console.error('Host mute all error:', error);
      }
    });

    socket.on('host:disable-all-video', async ({ roomId }) => {
      try {
        const meeting = await managedMeeting(roomId);
        if (meeting) {
          socket.to(roomId).emit('host:force-video-off');
        }
      } catch (error) {
        console.error('Host disable all video error:', error);
      }
    });

    socket.on('host:lock-meeting', async ({ roomId, isLocked }) => {
      try {
        const meeting = await managedMeeting(roomId);
        if (meeting) {
          meeting.settings = { ...(meeting.settings || {}), isLocked: !!isLocked };
          await meeting.save();
          io.to(roomId).emit('host:meeting-locked', { isLocked: !!isLocked });
        }
      } catch (error) {
        console.error('Host lock meeting error:', error);
      }
    });

    // Resolve a waiting socket for this room. Only sockets actually waiting here can be admitted/denied,
    // so a host can't act on an arbitrary socket id from another room.
    const takeWaiting = async (roomId, targetSocketId) => {
      const meeting = await Meeting.findOne({ where: { roomId } });
      if (!meeting || !canManageMeeting(meeting, socket.user.id)) return null;
      const waiting = roomWaiting.get(roomId);
      const entry = waiting?.get(targetSocketId);
      if (!entry) return null;
      waiting.delete(targetSocketId);
      return entry;
    };

    socket.on('host:admit-user', async ({ roomId, targetSocketId }) => {
      try {
        const entry = await takeWaiting(roomId, targetSocketId);
        if (!entry) return;
        const target = io.sockets.sockets.get(targetSocketId);
        if (!target) return; // they left while waiting: don't pre-admit them
        if (!roomAdmitted.has(roomId)) roomAdmitted.set(roomId, new Set());
        roomAdmitted.get(roomId).add(entry.user.id);
        roomRemoved.get(roomId)?.delete(entry.user.id);
        persistRuntime(roomId);
        target.emit('room:admitted');
        await target.data.joinRoom?.({ roomId }, { admitted: true });
      } catch (error) {
        console.error('Host admit user error:', error);
      }
    });

    socket.on('host:deny-user', async ({ roomId, targetSocketId }) => {
      try {
        if (await takeWaiting(roomId, targetSocketId)) io.to(targetSocketId).emit('room:denied');
      } catch (error) {
        console.error('Host deny user error:', error);
      }
    });

    socket.on('host:spotlight', async ({ roomId, userId }) => {
      try {
        const meeting = await managedMeeting(roomId);
        if (meeting) {
          io.to(roomId).emit('host:spotlight', { userId });
        }
      } catch (error) {
        console.error('Host spotlight error:', error);
      }
    });

    socket.on('host:make-cohost', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });

        // Only the actual host can promote co-hosts
        if (meeting && socket.rooms.has(roomId) && inRoom(targetSocketId, roomId) && isMeetingHost(meeting, socket.user.id)) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket && targetSocket.user) {
            // Never promote the host itself
            if (isMeetingHost(meeting, targetSocket.user.id)) return;

            const changed = await updateLocked(Meeting, meeting.id, (row) => {
              const entries = (row.participants || []).filter((p) => p.userId === targetSocket.user.id);
              if (!entries.length) return false;
              for (const entry of entries) entry.role = 'co-host';
              return true;
            });
            if (changed?.result) {

              const roomUsers = roomParticipants.get(roomId);
              if (roomUsers && roomUsers.has(targetSocket.user.id)) {
                roomUsers.get(targetSocket.user.id).role = 'co-host';
              }

              io.to(targetSocketId).emit('host:promoted', { role: 'co-host' });
              io.to(roomId).emit('room:role-changed', {
                userId: targetSocket.user.id,
                role: 'co-host'
              });
            }
          }
        }
      } catch (error) {
        console.error('Host make cohost error:', error);
      }
    });

    socket.on('host:remove-cohost', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });

        // Only the actual host can demote co-hosts
        if (meeting && socket.rooms.has(roomId) && inRoom(targetSocketId, roomId) && isMeetingHost(meeting, socket.user.id)) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket && targetSocket.user) {
            if (isMeetingHost(meeting, targetSocket.user.id)) return;

            const changed = await updateLocked(Meeting, meeting.id, (row) => {
              const entries = (row.participants || []).filter((p) => p.userId === targetSocket.user.id && p.role === 'co-host');
              if (!entries.length) return false;
              for (const entry of entries) entry.role = 'participant';
              return true;
            });
            if (changed?.result) {

              const roomUsers = roomParticipants.get(roomId);
              if (roomUsers && roomUsers.has(targetSocket.user.id)) {
                roomUsers.get(targetSocket.user.id).role = 'participant';
              }

              io.to(targetSocketId).emit('host:demoted', { role: 'participant' });
              io.to(roomId).emit('room:role-changed', {
                userId: targetSocket.user.id,
                role: 'participant'
              });
            }
          }
        }
      } catch (error) {
        console.error('Host remove cohost error:', error);
      }
    });

    socket.on('host:update-settings', async ({ roomId, settings }) => {
      try {
        const clean = sanitizeSettings(settings); // unknown keys / wrong types are dropped
        if (!Object.keys(clean).length) return;
        const meeting = await managedMeeting(roomId);
        if (meeting) {
          if ('maxParticipants' in clean) clean.maxParticipants = await capParticipants(meeting.hostId, clean.maxParticipants);
          meeting.settings = { ...(meeting.settings || {}), ...clean };
          await meeting.save();
          io.to(roomId).emit('meeting:settings-updated', { settings: clean });
          if ('webinar' in clean) {
            roomWebinar.set(roomId, !!clean.webinar);
            refreshRoomMode(io, roomId);
            if (clean.webinar) closeAttendeeProducers(io, roomId); // attendees can no longer publish: stop what they already send
          }
        }
      } catch (error) {
        console.error('Host update settings error:', error);
      }
    });

    // Latency probe for the in-call network-quality indicator
    socket.on('net:ping', (ack) => {
      presence.heartbeat(socket.user.id, socket.id);
      if (typeof ack === 'function') ack();
    });

    // Shared meeting notes (last-writer-wins; kept in memory for late joiners)
    socket.on('notes:request', ({ roomId }) => {
      if (!socket.rooms.has(roomId)) return;
      socket.emit('notes:update', { text: meetingNotes.get(roomId) || '', userName: null });
    });

    socket.on('notes:update', async ({ roomId, text }) => {
      if (!socket.rooms.has(roomId) || typeof text !== 'string') return;
      if (await isBlocked(roomId, socket.user.id, 'allowAddOns')) return;
      const clipped = text.slice(0, 20000);
      meetingNotes.set(roomId, clipped);
      persistRuntime(roomId);
      socket.to(roomId).emit('notes:update', { text: clipped, userName: socket.user.name });
    });

    socket.on('caption:text', ({ roomId, text }) => {
      if (!socket.rooms.has(roomId) || typeof text !== 'string') return;
      socket.to(roomId).emit('caption:text', {
        userId: socket.user.id,
        userName: socket.user.name,
        text
      });
    });

    // ---- Meeting tools: timer, live transcription, live streaming ----

    // Tools panel / badges ask for the current state when they mount
    // A page asks for this once it is listening. For a breakout room that has closed meanwhile, the answer is
    // "go back": the announcement itself may have been sent while the page was still loading.
    socket.on('tools:request', async ({ roomId }) => {
      if (!(await sendBackIfClosed(socket, roomId))) emitToolsState(socket, roomId);
    });

    const requireManager = async (roomId) => {
      if (!socket.rooms.has(roomId)) return false;
      const meeting = await loadRoomMeeting(roomId);
      return !!meeting && canManageMeeting(meeting, socket.user.id);
    };

    socket.on('timer:start', async ({ roomId, seconds, label }) => {
      try {
        const duration = Math.floor(Number(seconds));
        if (!Number.isFinite(duration) || duration < 1 || duration > MAX_TIMER_SECONDS) return;
        if (!(await requireManager(roomId))) return;
        const timer = {
          duration,
          endsAt: Date.now() + duration * 1000,
          label: typeof label === 'string' ? label.slice(0, 60) : '',
          startedBy: socket.user.name
        };
        roomTimers.set(roomId, timer);
        persistRuntime(roomId);
        io.to(roomId).emit('timer:state', { timer, serverNow: Date.now() });
      } catch (error) {
        console.error('Timer start error:', error);
      }
    });

    socket.on('timer:stop', async ({ roomId }) => {
      try {
        if (!(await requireManager(roomId))) return;
        roomTimers.delete(roomId);
        persistRuntime(roomId);
        io.to(roomId).emit('timer:state', { timer: null, serverNow: Date.now() });
      } catch (error) {
        console.error('Timer stop error:', error);
      }
    });

    socket.on('transcribe:set', async ({ roomId, enabled }) => {
      try {
        if (!(await requireManager(roomId))) return;
        const state = { enabled: !!enabled, by: socket.user.name };
        roomTranscription.set(roomId, state);
        persistRuntime(roomId);
        io.to(roomId).emit('transcribe:state', state);
      } catch (error) {
        console.error('Transcribe set error:', error);
      }
    });

    const addTranscriptLine = (roomId, text) => {
      const clean = text.trim().slice(0, MAX_LINE_CHARS);
      if (!clean) return;

      const line = {
        userId: socket.user.id,
        userName: socket.user.name,
        text: clean,
        timestamp: Date.now()
      };
      const lines = roomTranscripts.get(roomId) || [];
      lines.push(line);
      if (lines.length > MAX_TRANSCRIPT_LINES) lines.shift();
      roomTranscripts.set(roomId, lines);
      if (!parseBreakoutRoomId(roomId)) { scheduleTranscriptCheckpoint(roomId, () => roomTranscripts.get(roomId)); persistRuntime(roomId); }

      io.to(roomId).emit('transcript:line', line);
      socket.to(roomId).emit('caption:text', { userId: line.userId, userName: line.userName, text: clean });
    };

    // Each client recognises its own mic locally and sends finished phrases here
    socket.on('transcribe:line', ({ roomId, text }) => {
      if (!socket.rooms.has(roomId) || typeof text !== 'string') return;
      if (!roomTranscription.get(roomId)?.enabled) return;
      addTranscriptLine(roomId, text);
    });

    // The phone app has no recogniser: it sends short clips of its own mic and the server transcribes them
    socket.on('transcribe:audio', async ({ roomId, audio } = {}) => {
      if (!socket.rooms.has(roomId) || !Buffer.isBuffer(audio)) return;
      if (!roomTranscription.get(roomId)?.enabled) return;
      if (audio.length < 2 || audio.length > MAX_CLIP_BYTES || audio.length % 2) return;
      if (!canTranscribeSpeech()) {
        socket.emit('transcribe:unavailable');
        return;
      }
      try {
        const text = await transcribeClip(audio, { language: process.env.TRANSCRIPTION_LANGUAGE });
        // the meeting may have closed, or transcription stopped, while Whisper was working
        if (text && socket.rooms.has(roomId) && roomTranscription.get(roomId)?.enabled) addTranscriptLine(roomId, text);
      } catch (error) {
        console.error('Speech transcription failed:', error.message);
      }
    });

    socket.on('transcript:request', ({ roomId }) => {
      if (!socket.rooms.has(roomId)) return;
      socket.emit('transcript:history', { lines: roomTranscripts.get(roomId) || [] });
    });

    socket.on('stream:set', async ({ roomId, enabled }) => {
      try {
        if (!(await requireManager(roomId))) return;
        if (enabled) {
          if (!roomStreams.has(roomId)) {
            roomStreams.set(roomId, { startedAt: Date.now(), startedBy: socket.user.name });
            persistRuntime(roomId);
          }
        } else {
          roomStreams.delete(roomId);
          persistRuntime(roomId);
        }
        io.to(roomId).emit('stream:state', { stream: roomStreams.get(roomId) || null });
      } catch (error) {
        console.error('Stream set error:', error);
      }
    });

    socket.on('whiteboard:draw', async ({ roomId, x0, y0, x1, y1, color, width, tool, text }) => {
      if (!socket.rooms.has(roomId)) return;
      if (await isBlocked(roomId, socket.user.id, 'allowAddOns')) return;
      const stroke = { x0, y0, x1, y1, color, width, tool };
      if (tool === 'text') {
        if (typeof text !== 'string' || !text.trim()) return;
        stroke.text = text.slice(0, 200);
      }
      const board = roomBoards.get(roomId) || [];
      board.push(stroke);
      if (board.length > MAX_BOARD_STROKES) board.shift();
      roomBoards.set(roomId, board);
      socket.to(roomId).emit('whiteboard:draw', stroke);
    });

    socket.on('whiteboard:request', ({ roomId } = {}) => {
      if (!socket.rooms.has(roomId)) return;
      socket.emit('whiteboard:history', { strokes: roomBoards.get(roomId) || [] });
    });

    socket.on('whiteboard:clear', async ({ roomId }) => {
      if (!socket.rooms.has(roomId)) return;
      if (await isBlocked(roomId, socket.user.id, 'allowAddOns')) return;
      roomBoards.delete(roomId);
      socket.to(roomId).emit('whiteboard:clear');
    });

    socket.on('team:join', async ({ teamId }) => {
      try {
        const team = await Team.findByPk(teamId);

        if (!team || !team.isActive) {
          socket.emit('error', { message: 'Team not found' });
          return;
        }

        if (!team.isMember(socket.user.id)) {
          socket.emit('error', { message: 'You are not a member of this team' });
          return;
        }

        socket.join(`team:${teamId}`);

        console.log(`${socket.user.name} joined team: ${team.name}`);

        // Share presence with the team
        const teamMemberIds = (team.members || []).map(m => m.userId || m.id).filter(Boolean);
        const onlineMembers = [...await presence.onlineUserIds(teamMemberIds)];

        socket.to(`team:${teamId}`).emit('presence:online', {
          userId: socket.user.id,
          name: socket.user.name
        });
        socket.emit('presence:list', { teamId, onlineUserIds: onlineMembers });

        socket.emit('team:joined', {
          teamId,
          teamName: team.name
        });
      } catch (error) {
        console.error('Team join error:', error);
        socket.emit('error', { message: 'Error joining team' });
      }
    });

    socket.on('team:leave', ({ teamId }) => {
      if (!teamId) return;
      socket.leave(`team:${teamId}`);
      console.log(`${socket.user.name} left team: ${teamId}`);
    });

    socket.on('team:typing', ({ teamId, channelType, isTyping }) => {
      if (!socket.rooms.has(`team:${teamId}`)) return;
      socket.to(`team:${teamId}`).emit('team:user-typing', {
        userId: socket.user.id,
        userName: socket.user.name,
        channelType,
        isTyping
      });
    });

    // =============================================
    // WORKSPACE CHAT (DMs & group conversations)
    // =============================================

    socket.on('conversation:join', async ({ conversationId } = {}, callback = () => {}) => {
      try {
        const membership = await ConversationMember.findOne({
          where: { conversationId, userId: socket.user.id }
        });
        if (!membership) {
          callback?.({ success: false, error: 'Not a member of this conversation' });
          return;
        }
        await socket.join(`conversation:${conversationId}`);
        callback?.({ success: true });
      } catch (error) {
        console.error('Conversation join error:', error);
        callback?.({ success: false, error: 'Error joining conversation' });
      }
    });

    socket.on('conversation:leave', ({ conversationId }) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('conversation:typing', ({ conversationId, isTyping }) => {
      if (!socket.rooms.has(`conversation:${conversationId}`)) return;
      socket.to(`conversation:${conversationId}`).emit('conversation:user-typing', {
        userId: socket.user.id,
        userName: socket.user.name,
        isTyping
      });
    });

    // =============================================
    // PRESENCE & CUSTOM STATUS
    // =============================================

    socket.on('presence:status-update', async ({ customStatus, statusEmoji, statusExpiresAt }) => {
      try {
        await User.update(
          {
            customStatus: customStatus || null,
            statusEmoji: statusEmoji || null,
            statusExpiresAt: statusExpiresAt ? new Date(statusExpiresAt) : null
          },
          { where: { id: socket.user.id } }
        );

        const payload = {
          userId: socket.user.id,
          customStatus: customStatus || null,
          statusEmoji: statusEmoji || null,
          statusExpiresAt: statusExpiresAt || null
        };
        for (const room of socket.rooms) {
          if (room !== socket.id && room !== `user:${socket.user.id}`) {
            io.to(room).emit('presence:status', payload);
          }
        }
      } catch (error) {
        console.error('Presence status update error:', error);
      }
    });

    socket.on('disconnecting', () => { socket.data.leavingRooms = [...socket.rooms]; });
    socket.on('disconnect', (reason) => {
      socketDisconnects.inc({ reason: String(reason).slice(0, 40) });
      for (const waiting of roomWaiting.values()) waiting.delete(socket.id);
      console.log(`User disconnected: ${socket.user.name} (${socket.id})`);

      const producers = userProducers.get(socket.id);
      if (producers) {
        for (const producerId of Object.values(producers)) {
          mediasoupService.closeProducer(producerId);
        }
        userProducers.delete(socket.id);
      }

      userConsumers.delete(socket.id);
      const transports = userTransports.get(socket.id);
      if (transports) {
        if (transports.send) mediasoupService.closeTransport(transports.send);
        if (transports.recv) mediasoupService.closeTransport(transports.recv);
        userTransports.delete(socket.id);
      }

      handleRoomLeave(socket, io);

      // Only flip the user offline when their last socket (on ANY instance) is gone
      const { id: userId, name: userName } = socket.user;
      // socket.rooms is already empty by 'disconnect'; it is captured in 'disconnecting'
      const rooms = (socket.data.leavingRooms || []).filter((room) => room !== socket.id && room !== `user:${userId}`);
      presence.disconnect(userId, socket.id).then(({ nowOffline }) => {
        if (!nowOffline) return;
        User.update({ isOnline: false, lastSeen: new Date() }, { where: { id: userId } }).catch(() => {});
        for (const room of rooms) io.to(room).emit('presence:offline', { userId, name: userName });
      });
    });
  });
};

function stopRecorder(io, socket, roomId) {
  const recorders = roomRecorders.get(roomId);
  if (!recorders?.delete(socket.user.id)) return;
  if (recorders.size === 0) roomRecorders.delete(roomId);
  socket.to(roomId).emit('recording:stopped', {
    userId: socket.user.id,
    userName: socket.user.name,
    stillRecording: [...(recorders || [])].map(([userId, userName]) => ({ userId, userName }))
  });
}

function handleRoomLeave(socket, io) {
  if (socket.roomId) {
    const roomId = socket.roomId;

    const roomUsers = roomParticipants.get(roomId);
    // The entry is keyed by userId: after a reconnect or in a second tab it may belong to a newer
    // socket, and a stale socket leaving must not evict (or announce the departure of) that user.
    const entry = roomUsers?.get(socket.user.id);
    const ownsEntry = !!entry && entry.socketId === socket.id;
    if (ownsEntry) stopRecorder(io, socket, roomId);
    if (ownsEntry) {
      roomUsers.delete(socket.user.id);
      io.to(roomId).emit('room:user-left', {
        socketId: socket.id,
        userId: socket.user.id,
        userName: socket.user.name
      });
    }

    if (roomUsers && roomUsers.size === 0) scheduleRoomClear(roomId);
    else refreshRoomMode(io, roomId);

    socket.leave(roomId);
    socket.roomId = null;
    socket.data.inMeeting = false;
    syncMeetingStatus(io, socket.user.id);

    console.log(`${socket.user.name} left room: ${roomId}`);
  }
}
