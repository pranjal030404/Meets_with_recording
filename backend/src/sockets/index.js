import { verifySocketToken } from '../middleware/auth.js';
import Meeting from '../models/Meeting.js';
import Message from '../models/Message.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import mediasoupService from '../lib/mediasoup.js';

const connectedUsers = new Map();
const roomParticipants = new Map();

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

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.id})`);

    connectedUsers.set(socket.user.id, {
      socketId: socket.id,
      user: socket.user
    });

    socket.join(`user:${socket.user.id}`);

    socket.on('room:join', async ({ roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });

        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
          return;
        }

        socket.join(roomId);
        socket.roomId = roomId;

        if (!roomParticipants.has(roomId)) {
          roomParticipants.set(roomId, new Map());
        }

        const roomUsers = roomParticipants.get(roomId);
        roomUsers.set(socket.user.id, {
          socketId: socket.id,
          user: {
            id: socket.user.id,
            name: socket.user.name,
            email: socket.user.email,
            avatar: socket.user.avatar
          },
          isMuted: meeting.settings ? meeting.settings.muteOnEntry : false,
          isVideoOff: false,
          isScreenSharing: false
        });

        const participants = Array.from(roomUsers.values()).filter(
          p => p.user.id !== socket.user.id
        );

        socket.emit('room:participants', {
          participants,
          isHost: meeting.hostId === socket.user.id
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
          socketId: socket.id
        });

        console.log(`${socket.user.name} joined room: ${roomId}`);
      } catch (error) {
        console.error('Room join error:', error);
        socket.emit('error', { message: 'Error joining room' });
      }
    });

    socket.on('room:leave', () => {
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

    socket.on('media:screen-share', ({ isScreenSharing }) => {
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

        if (meeting && meeting.hostId === socket.user.id) {
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

        if (meeting && meeting.hostId === socket.user.id) {
          io.to(targetSocketId).emit('host:removed');

          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) {
            targetSocket.leave(roomId);

            const roomUsers = roomParticipants.get(roomId);
            if (roomUsers && targetSocket.user) {
              roomUsers.delete(targetSocket.user.id);
            }
          }

          io.to(roomId).emit('room:user-left', { socketId: targetSocketId });
        }
      } catch (error) {
        console.error('Host remove error:', error);
      }
    });

    socket.on('host:end-meeting', async ({ roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });

        if (meeting && meeting.hostId === socket.user.id) {
          io.to(roomId).emit('meeting:ended', {
            roomId,
            endedBy: socket.user.id
          });

          meeting.status = 'ended';
          meeting.endedAt = new Date();
          await meeting.save();

          roomParticipants.delete(roomId);
        }
      } catch (error) {
        console.error('Host end meeting error:', error);
      }
    });

    socket.on('chat:send', async ({ roomId, content, recipientId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });

        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
          return;
        }

        if (!meeting.settings || !meeting.settings.allowChat) {
          socket.emit('error', { message: 'Chat is disabled' });
          return;
        }

        const messageData = {
          meetingId: meeting.id,
          senderId: socket.user.id,
          content: content.trim(),
          type: 'text',
          isPrivate: !!recipientId
        };

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
      socket.to(roomId).emit('chat:user-typing', {
        userId: socket.user.id,
        userName: socket.user.name,
        isTyping
      });
    });

    socket.on('recording:started', ({ roomId }) => {
      socket.to(roomId).emit('recording:started', {
        userId: socket.user.id,
        userName: socket.user.name
      });
    });

    socket.on('recording:stopped', ({ roomId }) => {
      socket.to(roomId).emit('recording:stopped', {
        userId: socket.user.id,
        userName: socket.user.name
      });
    });

    socket.on('reaction:hand-raise', ({ roomId, isRaised }) => {
      socket.to(roomId).emit('reaction:hand-raise', {
        socketId: socket.id,
        userId: socket.user.id,
        userName: socket.user.name,
        isRaised
      });
    });

    socket.on('reaction:emoji', ({ roomId, emoji }) => {
      io.to(roomId).emit('reaction:emoji', {
        userId: socket.user.id,
        userName: socket.user.name,
        emoji
      });
    });

    socket.on('host:force-video-off', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && meeting.hostId === socket.user.id) {
          io.to(targetSocketId).emit('host:force-video-off');
        }
      } catch (error) {
        console.error('Host force video off error:', error);
      }
    });

    socket.on('host:request-unmute', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && meeting.hostId === socket.user.id) {
          io.to(targetSocketId).emit('host:request-unmute');
        }
      } catch (error) {
        console.error('Host request unmute error:', error);
      }
    });

    socket.on('host:mute-all', async ({ roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && meeting.hostId === socket.user.id) {
          socket.to(roomId).emit('host:force-mute');
        }
      } catch (error) {
        console.error('Host mute all error:', error);
      }
    });

    socket.on('host:disable-all-video', async ({ roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && meeting.hostId === socket.user.id) {
          socket.to(roomId).emit('host:force-video-off');
        }
      } catch (error) {
        console.error('Host disable all video error:', error);
      }
    });

    socket.on('host:lock-meeting', async ({ roomId, isLocked }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && meeting.hostId === socket.user.id) {
          meeting.settings = { ...(meeting.settings || {}), isLocked };
          await meeting.save();
          io.to(roomId).emit('host:meeting-locked', { isLocked });
        }
      } catch (error) {
        console.error('Host lock meeting error:', error);
      }
    });

    socket.on('host:admit-user', async ({ roomId, targetSocketId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && meeting.hostId === socket.user.id) {
          io.to(targetSocketId).emit('room:admitted');
        }
      } catch (error) {
        console.error('Host admit user error:', error);
      }
    });

    socket.on('host:deny-user', async ({ roomId, targetSocketId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && meeting.hostId === socket.user.id) {
          io.to(targetSocketId).emit('room:denied');
        }
      } catch (error) {
        console.error('Host deny user error:', error);
      }
    });

    socket.on('host:spotlight', async ({ roomId, userId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && meeting.hostId === socket.user.id) {
          io.to(roomId).emit('host:spotlight', { userId });
        }
      } catch (error) {
        console.error('Host spotlight error:', error);
      }
    });

    socket.on('host:make-cohost', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });

        if (meeting && meeting.hostId === socket.user.id) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket && targetSocket.user) {
            const participants = meeting.participants || [];
            const participant = participants.find(
              p => p.userId === targetSocket.user.id
            );
            if (participant) {
              participant.role = 'co-host';
              meeting.participants = participants;
              await meeting.save();
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

    socket.on('host:update-settings', async ({ roomId, settings }) => {
      try {
        const meeting = await Meeting.findOne({ where: { roomId } });
        if (meeting && meeting.hostId === socket.user.id) {
          Object.assign(meeting.settings || {}, settings);
          await meeting.save();
          io.to(roomId).emit('meeting:settings-updated', { settings });
        }
      } catch (error) {
        console.error('Host update settings error:', error);
      }
    });

    socket.on('caption:text', ({ roomId, text }) => {
      socket.to(roomId).emit('caption:text', {
        userId: socket.user.id,
        userName: socket.user.name,
        text
      });
    });

    socket.on('whiteboard:draw', ({ roomId, x0, y0, x1, y1, color, width, tool }) => {
      socket.to(roomId).emit('whiteboard:draw', { x0, y0, x1, y1, color, width, tool });
    });

    socket.on('whiteboard:clear', ({ roomId }) => {
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

    socket.on('disconnect', () => {
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
      connectedUsers.delete(socket.user.id);
    });
  });
};

function handleRoomLeave(socket, io) {
  if (socket.roomId) {
    const roomId = socket.roomId;

    const roomUsers = roomParticipants.get(roomId);
    if (roomUsers) {
      roomUsers.delete(socket.user.id);

      if (roomUsers.size === 0) {
        roomParticipants.delete(roomId);
      }
    }

    io.to(roomId).emit('room:user-left', {
      socketId: socket.id,
      userId: socket.user.id,
      userName: socket.user.name
    });

    socket.leave(roomId);
    socket.roomId = null;

    console.log(`${socket.user.name} left room: ${roomId}`);
  }
}

export { connectedUsers, roomParticipants };
