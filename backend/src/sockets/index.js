import { verifySocketToken } from '../middleware/auth.js';
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
import { endMeeting } from '../services/meetingLifecycle.js';
import { persistLiveTranscript, scheduleTranscriptCheckpoint, cancelTranscriptCheckpoint } from '../services/liveTranscriptStore.js';
import { parseBreakoutRoomId, resolveBreakoutAccess } from '../lib/breakoutRoomId.js';

const connectedUsers = new Map();
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

const MAX_TIMER_SECONDS = 12 * 60 * 60;
const MAX_TRANSCRIPT_LINES = 2000;
const MAX_LINE_CHARS = 500;

const restoredRooms = new Set(); // rooms whose saved state we've already looked for this process

const runtimeSnapshot = (roomId) => ({
  timer: roomTimers.get(roomId) || null,
  transcription: roomTranscription.get(roomId) || null,
  notes: meetingNotes.get(roomId) ?? null,
  stream: roomStreams.get(roomId) || null,
  admitted: [...(roomAdmitted.get(roomId) || [])]
});
const persistRuntime = (roomId) => {
  if (!parseBreakoutRoomId(roomId)) saveRuntime(roomId, () => runtimeSnapshot(roomId));
};

// After a server restart the first person to reconnect brings the room's tools back.
const restoreRuntime = async (roomId) => {
  if (restoredRooms.has(roomId) || parseBreakoutRoomId(roomId)) return;
  restoredRooms.add(roomId);
  const saved = await loadRuntime(roomId);
  if (!saved) return;
  if (saved.timer && saved.timer.endsAt > Date.now() && !roomTimers.has(roomId)) roomTimers.set(roomId, saved.timer);
  if (saved.transcription && !roomTranscription.has(roomId)) roomTranscription.set(roomId, saved.transcription);
  if (typeof saved.notes === 'string' && !meetingNotes.has(roomId)) meetingNotes.set(roomId, saved.notes);
  if (saved.stream && !roomStreams.has(roomId)) roomStreams.set(roomId, saved.stream);
  if (Array.isArray(saved.admitted) && saved.admitted.length && !roomAdmitted.has(roomId)) roomAdmitted.set(roomId, new Set(saved.admitted));
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

const clearRoomTools = (roomId) => {
  cancelRoomClear(roomId);
  restoredRooms.delete(roomId);
  deleteRuntime(roomId);
  // Keep the live captions as the meeting's transcript (main rooms only; breakouts are throwaway)
  cancelTranscriptCheckpoint(roomId);
  if (!parseBreakoutRoomId(roomId)) persistLiveTranscript(roomId, roomTranscripts.get(roomId));
  meetingNotes.delete(roomId);
  roomTimers.delete(roomId);
  roomTranscription.delete(roomId);
  roomTranscripts.delete(roomId);
  roomStreams.delete(roomId);
  roomWaiting.delete(roomId);
  roomAdmitted.delete(roomId);
  roomRecorders.delete(roomId);
};

const emitToolsState = (socket, roomId) => {
  if (!socket.rooms.has(roomId)) return;
  socket.emit('timer:state', { timer: roomTimers.get(roomId) || null, serverNow: Date.now() });
  socket.emit('transcribe:state', roomTranscription.get(roomId) || { enabled: false, by: null });
  socket.emit('stream:state', { stream: roomStreams.get(roomId) || null });
};

// Breakout rooms authorize against their parent meeting
const loadRoomMeeting = (roomId) => {
  const parsed = parseBreakoutRoomId(roomId);
  return Meeting.findOne({ where: { roomId: parsed ? parsed.parentRoomId : roomId } });
};

const userTransports = new Map();
const userProducers = new Map();

export const initializeSocketHandlers = (io) => {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const user = await verifySocketToken(token);

    if (!user) {
      return next(new Error('Invalid token'));
    }

    socket.user = user;
    next();
  });

  // True when host management forbids this user from the given contributor action
  const isBlocked = async (roomId, userId, key) => {
    if (!roomId) return false;
    const meeting = await Meeting.findOne({ where: { roomId }, attributes: ['id', 'hostId', 'settings', 'participants'] });
    return !!meeting && !contributorAllowed(meeting, userId, key);
  };

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.id})`);

    connectedUsers.set(socket.user.id, {
      socketId: socket.id,
      user: socket.user
    });

    socket.join(`user:${socket.user.id}`);

    // Mark user online for the workspace
    User.update({ isOnline: true }, { where: { id: socket.user.id } }).catch(() => {});

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

        if (meeting.status === 'ended' || meeting.status === 'cancelled') {
          socket.emit('error', { message: meeting.status === 'cancelled' ? 'This meeting was cancelled' : 'This meeting has ended' });
          return;
        }

        cancelRoomClear(roomId);
        await restoreRuntime(roomId);

        // Admission gate (main rooms only): locked meeting / waiting room, enforced server-side
        if (!parseBreakoutRoomId(roomId) && !admitted && !canManageMeeting(meeting, socket.user.id)
            && !roomAdmitted.get(roomId)?.has(socket.user.id)) {
          if (meeting.settings?.isLocked) {
            socket.emit('error', { message: 'This meeting is locked by the host' });
            return;
          }
          if (meeting.settings?.waitingRoom) {
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

        socket.join(roomId);
        socket.roomId = roomId;

        if (!roomParticipants.has(roomId)) {
          roomParticipants.set(roomId, new Map());
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

    socket.on('mediasoup:getRouterRtpCapabilities', async ({ roomId }, callback) => {
      try {
        const rtpCapabilities = await mediasoupService.getRouterRtpCapabilities(roomId);
        callback({ success: true, rtpCapabilities });
      } catch (error) {
        console.error('Get RTP capabilities error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('mediasoup:createWebRtcTransport', async ({ roomId, direction }, callback) => {
      try {
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

    socket.on('mediasoup:restartIce', async ({ transportId }, callback) => {
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

    socket.on('mediasoup:connectTransport', async ({ transportId, dtlsParameters }, callback) => {
      try {
        await mediasoupService.connectTransport(transportId, dtlsParameters);
        callback({ success: true });
      } catch (error) {
        console.error('Connect transport error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('mediasoup:produce', async ({ transportId, kind, rtpParameters, appData }, callback) => {
      try {
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

    socket.on('mediasoup:consume', async ({ roomId, producerId, rtpCapabilities }, callback) => {
      try {
        // Only people actually in the room (not waiting, not denied) may receive its media
        if (!socket.rooms.has(roomId)) return callback({ success: false, error: 'Not in this room' });
        const transports = userTransports.get(socket.id);
        if (!transports || !transports.recv) {
          throw new Error('Receive transport not created');
        }

        const consumerParams = await mediasoupService.consume(
          roomId,
          transports.recv,
          producerId,
          rtpCapabilities
        );

        callback({ success: true, consumerParams });
      } catch (error) {
        console.error('Consume error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('mediasoup:resumeConsumer', async ({ consumerId }, callback) => {
      try {
        await mediasoupService.resumeConsumer(consumerId);
        callback({ success: true });
      } catch (error) {
        console.error('Resume consumer error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('mediasoup:pauseProducer', async ({ producerId }, callback) => {
      try {
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

    socket.on('mediasoup:resumeProducer', async ({ producerId }, callback) => {
      try {
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

    socket.on('mediasoup:closeProducer', ({ producerId }, callback) => {
      try {
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
        const meeting = await Meeting.findOne({ where: { roomId } });

        if (meeting && canManageMeeting(meeting, socket.user.id)) {
          io.to(targetSocketId).emit('host:force-mute');
          io.to(roomId).emit('host:user-muted', { targetSocketId });
        }
      } catch (error) {
        console.error('Host mute error:', error);
      }
    });

    socket.on('host:remove-user', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });

        if (meeting && canManageMeeting(meeting, socket.user.id)) {
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
        const meeting = await Meeting.findOne({ where: { roomId } });

        if (meeting && canManageMeeting(meeting, socket.user.id)) {
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
        const meeting = await Meeting.findOne({ where: { roomId } });

        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
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
            attributes: ['id', 'name', 'email', 'avatar']
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

    socket.on('reaction:emoji', async ({ roomId, emoji }) => {
      if (await isBlocked(roomId, socket.user.id, 'allowReactions')) return;
      io.to(roomId).emit('reaction:emoji', {
        userId: socket.user.id,
        userName: socket.user.name,
        emoji
      });
    });

    socket.on('host:force-video-off', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && canManageMeeting(meeting, socket.user.id)) {
          io.to(targetSocketId).emit('host:force-video-off');
        }
      } catch (error) {
        console.error('Host force video off error:', error);
      }
    });

    socket.on('host:request-unmute', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && canManageMeeting(meeting, socket.user.id)) {
          io.to(targetSocketId).emit('host:request-unmute');
        }
      } catch (error) {
        console.error('Host request unmute error:', error);
      }
    });

    socket.on('host:mute-all', async ({ roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && canManageMeeting(meeting, socket.user.id)) {
          socket.to(roomId).emit('host:force-mute');
        }
      } catch (error) {
        console.error('Host mute all error:', error);
      }
    });

    socket.on('host:disable-all-video', async ({ roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && canManageMeeting(meeting, socket.user.id)) {
          socket.to(roomId).emit('host:force-video-off');
        }
      } catch (error) {
        console.error('Host disable all video error:', error);
      }
    });

    socket.on('host:lock-meeting', async ({ roomId, isLocked }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && canManageMeeting(meeting, socket.user.id)) {
          meeting.settings = { ...(meeting.settings || {}), isLocked };
          await meeting.save();
          io.to(roomId).emit('host:meeting-locked', { isLocked });
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
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && canManageMeeting(meeting, socket.user.id)) {
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
        if (meeting && isMeetingHost(meeting, socket.user.id)) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket && targetSocket.user) {
            // Never promote the host itself
            if (isMeetingHost(meeting, targetSocket.user.id)) return;

            const participants = meeting.participants || [];
            const participant = participants.find(
              p => p.userId === targetSocket.user.id
            );
            if (participant) {
              participant.role = 'co-host';
              meeting.participants = participants;
              await meeting.save();

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
        if (meeting && isMeetingHost(meeting, socket.user.id)) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket && targetSocket.user) {
            if (isMeetingHost(meeting, targetSocket.user.id)) return;

            const participants = meeting.participants || [];
            const participant = participants.find(
              p => p.userId === targetSocket.user.id
            );
            if (participant && participant.role === 'co-host') {
              participant.role = 'participant';
              meeting.participants = participants;
              await meeting.save();

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
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && canManageMeeting(meeting, socket.user.id)) {
          meeting.settings = { ...(meeting.settings || {}), ...settings };
          await meeting.save();
          io.to(roomId).emit('meeting:settings-updated', { settings });
        }
      } catch (error) {
        console.error('Host update settings error:', error);
      }
    });

    // Latency probe for the in-call network-quality indicator
    socket.on('net:ping', (ack) => {
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
      socket.to(roomId).emit('caption:text', {
        userId: socket.user.id,
        userName: socket.user.name,
        text
      });
    });

    // ---- Meeting tools: timer, live transcription, live streaming ----

    // Tools panel / badges ask for the current state when they mount
    socket.on('tools:request', ({ roomId }) => emitToolsState(socket, roomId));

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

    // Each client recognises its own mic locally and sends finished phrases here
    socket.on('transcribe:line', ({ roomId, text }) => {
      if (!socket.rooms.has(roomId) || typeof text !== 'string') return;
      if (!roomTranscription.get(roomId)?.enabled) return;
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
      if (!parseBreakoutRoomId(roomId)) scheduleTranscriptCheckpoint(roomId, () => roomTranscripts.get(roomId));

      io.to(roomId).emit('transcript:line', line);
      socket.to(roomId).emit('caption:text', { userId: line.userId, userName: line.userName, text: clean });
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

    socket.on('whiteboard:draw', async ({ roomId, x0, y0, x1, y1, color, width, tool }) => {
      if (await isBlocked(roomId, socket.user.id, 'allowAddOns')) return;
      socket.to(roomId).emit('whiteboard:draw', { x0, y0, x1, y1, color, width, tool });
    });

    socket.on('whiteboard:clear', async ({ roomId }) => {
      if (await isBlocked(roomId, socket.user.id, 'allowAddOns')) return;
      socket.to(roomId).emit('whiteboard:clear');
    });

    socket.on('team:join', async ({ teamId }) => {
      try {
        const team = await Team.findByPk(teamId);

        if (!team) {
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
        const onlineIds = [...connectedUsers.keys()];
        const teamMemberIds = (team.members || []).map(m => m.userId || m.id).filter(Boolean);
        const onlineMembers = teamMemberIds.filter(id => onlineIds.includes(id));

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
      socket.leave(`team:${teamId}`);
      console.log(`${socket.user.name} left team: ${teamId}`);
    });

    socket.on('team:typing', ({ teamId, channelType, isTyping }) => {
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

    socket.on('conversation:join', async ({ conversationId }, callback) => {
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

    socket.on('disconnect', () => {
      for (const waiting of roomWaiting.values()) waiting.delete(socket.id);
      console.log(`User disconnected: ${socket.user.name} (${socket.id})`);

      const producers = userProducers.get(socket.id);
      if (producers) {
        for (const producerId of Object.values(producers)) {
          mediasoupService.closeProducer(producerId);
        }
        userProducers.delete(socket.id);
      }

      const transports = userTransports.get(socket.id);
      if (transports) {
        if (transports.send) mediasoupService.closeTransport(transports.send);
        if (transports.recv) mediasoupService.closeTransport(transports.recv);
        userTransports.delete(socket.id);
      }

      handleRoomLeave(socket, io);

      // Only flip the user offline when their last socket closes
      const stillConnected = Array.from(io.sockets.sockets.values())
        .some(s => s !== socket && s.user && s.user.id === socket.user.id);

      if (!stillConnected) {
        connectedUsers.delete(socket.user.id);
        User.update(
          { isOnline: false, lastSeen: new Date() },
          { where: { id: socket.user.id } }
        ).catch(() => {});

        for (const room of socket.rooms) {
          if (room !== socket.id && room !== `user:${socket.user.id}`) {
            io.to(room).emit('presence:offline', { userId: socket.user.id, name: socket.user.name });
          }
        }
      }
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

    socket.leave(roomId);
    socket.roomId = null;

    console.log(`${socket.user.name} left room: ${roomId}`);
  }
}
