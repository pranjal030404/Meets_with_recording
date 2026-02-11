import { verifySocketToken } from '../middleware/auth.js';
import Meeting from '../models/Meeting.js';
import Message from '../models/Message.js';
import Team from '../models/Team.js';
import mediasoupService from '../lib/mediasoup.js';

// Store connected users and their rooms
const connectedUsers = new Map();
const roomParticipants = new Map();

// Store user transports and producers
const userTransports = new Map(); // Map<socketId, { send: transportId, recv: transportId }>
const userProducers = new Map(); // Map<socketId, { audio: producerId, video: producerId, screen: producerId }>

/**
 * Initialize all Socket.IO event handlers
 */
export const initializeSocketHandlers = (io) => {
  // Authentication middleware
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
    console.log(`✅ User connected: ${socket.user.name} (${socket.id})`);
    
    // Store user connection
    connectedUsers.set(socket.user._id.toString(), {
      socketId: socket.id,
      user: socket.user
    });

    // Join user's personal room for private messages
    socket.join(`user:${socket.user._id}`);

    // ============================================
    // ROOM / MEETING EVENTS
    // ============================================

    /**
     * Join a meeting room
     */
    socket.on('room:join', async ({ roomId }) => {
      try {
        const meeting = await Meeting.findOne({ roomId })
          .populate('participants.user', 'name email avatar');

        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
          return;
        }

        // Join socket room
        socket.join(roomId);
        socket.roomId = roomId;

        // Update room participants map
        if (!roomParticipants.has(roomId)) {
          roomParticipants.set(roomId, new Map());
        }
        
        const roomUsers = roomParticipants.get(roomId);
        roomUsers.set(socket.user._id.toString(), {
          socketId: socket.id,
          user: {
            _id: socket.user._id,
            name: socket.user.name,
            email: socket.user.email,
            avatar: socket.user.avatar
          },
          isMuted: meeting.settings.muteOnEntry,
          isVideoOff: false,
          isScreenSharing: false
        });

        // Get list of other participants in room
        const participants = Array.from(roomUsers.values()).filter(
          p => p.user._id.toString() !== socket.user._id.toString()
        );

        // Send current participants to joining user
        socket.emit('room:participants', {
          participants,
          isHost: meeting.host.toString() === socket.user._id.toString()
        });

        // Send existing producers to joining user
        const existingProducers = [];
        for (const [participantSocketId, participant] of roomUsers) {
          if (participantSocketId !== socket.user._id.toString()) {
            const producers = userProducers.get(participant.socketId);
            if (producers) {
              for (const [mediaType, producerId] of Object.entries(producers)) {
                existingProducers.push({
                  producerId,
                  socketId: participant.socketId,
                  userId: participant.user._id,
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

        // Notify others about new participant
        socket.to(roomId).emit('room:user-joined', {
          user: {
            _id: socket.user._id,
            name: socket.user.name,
            email: socket.user.email,
            avatar: socket.user.avatar
          },
          socketId: socket.id
        });

        console.log(`📍 ${socket.user.name} joined room: ${roomId}`);
      } catch (error) {
        console.error('Room join error:', error);
        socket.emit('error', { message: 'Error joining room' });
      }
    });

    /**
     * Leave a meeting room
     */
    socket.on('room:leave', () => {
      handleRoomLeave(socket, io);
    });

    // ============================================
    // MEDIASOUP SFU SIGNALING EVENTS
    // ============================================

    /**
     * Get router RTP capabilities for a room
     */
    socket.on('mediasoup:getRouterRtpCapabilities', async ({ roomId }, callback) => {
      try {
        const rtpCapabilities = await mediasoupService.getRouterRtpCapabilities(roomId);
        callback({ success: true, rtpCapabilities });
      } catch (error) {
        console.error('Get RTP capabilities error:', error);
        callback({ success: false, error: error.message });
      }
    });

    /**
     * Create WebRTC transport (for sending or receiving media)
     */
    socket.on('mediasoup:createWebRtcTransport', async ({ roomId, direction }, callback) => {
      try {
        const transportParams = await mediasoupService.createWebRtcTransport(roomId, direction);
        
        // Store transport ID for this socket
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

    /**
     * Connect transport with DTLS parameters
     */
    socket.on('mediasoup:connectTransport', async ({ transportId, dtlsParameters }, callback) => {
      try {
        await mediasoupService.connectTransport(transportId, dtlsParameters);
        callback({ success: true });
      } catch (error) {
        console.error('Connect transport error:', error);
        callback({ success: false, error: error.message });
      }
    });

    /**
     * Produce media (start sending audio/video/screen)
     */
    socket.on('mediasoup:produce', async ({ transportId, kind, rtpParameters, appData }, callback) => {
      try {
        const { id: producerId } = await mediasoupService.produce(
          transportId,
          kind,
          rtpParameters,
          { ...appData, socketId: socket.id, userId: socket.user._id }
        );

        // Store producer ID
        if (!userProducers.has(socket.id)) {
          userProducers.set(socket.id, {});
        }
        
        const producers = userProducers.get(socket.id);
        const mediaType = appData.mediaType || kind; // 'audio', 'video', or 'screen'
        producers[mediaType] = producerId;

        // Notify all other users in the room about new producer
        if (socket.roomId) {
          socket.to(socket.roomId).emit('mediasoup:newProducer', {
            producerId,
            socketId: socket.id,
            userId: socket.user._id,
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

    /**
     * Consume media (start receiving from another user)
     */
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

    /**
     * Resume consumer (start receiving media after initial setup)
     */
    socket.on('mediasoup:resumeConsumer', async ({ consumerId }, callback) => {
      try {
        await mediasoupService.resumeConsumer(consumerId);
        callback({ success: true });
      } catch (error) {
        console.error('Resume consumer error:', error);
        callback({ success: false, error: error.message });
      }
    });

    /**
     * Pause/Resume producer
     */
    socket.on('mediasoup:pauseProducer', async ({ producerId }, callback) => {
      try {
        await mediasoupService.pauseProducer(producerId);
        
        // Notify room about paused producer
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
        
        // Notify room about resumed producer
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

    /**
     * Close producer (stop sending media)
     */
    socket.on('mediasoup:closeProducer', ({ producerId }, callback) => {
      try {
        mediasoupService.closeProducer(producerId);
        
        // Remove from user producers
        const producers = userProducers.get(socket.id);
        if (producers) {
          for (const [key, value] of Object.entries(producers)) {
            if (value === producerId) {
              delete producers[key];
              break;
            }
          }
        }

        // Notify room
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

    // ============================================
    // MEDIA CONTROL EVENTS
    // ============================================

    /**
     * Toggle mute status
     */
    socket.on('media:toggle-mute', ({ isMuted }) => {
      if (socket.roomId) {
        const roomUsers = roomParticipants.get(socket.roomId);
        if (roomUsers && roomUsers.has(socket.user._id.toString())) {
          roomUsers.get(socket.user._id.toString()).isMuted = isMuted;
        }

        socket.to(socket.roomId).emit('media:user-muted', {
          socketId: socket.id,
          userId: socket.user._id,
          isMuted
        });
      }
    });

    /**
     * Toggle video status
     */
    socket.on('media:toggle-video', ({ isVideoOff }) => {
      if (socket.roomId) {
        const roomUsers = roomParticipants.get(socket.roomId);
        if (roomUsers && roomUsers.has(socket.user._id.toString())) {
          roomUsers.get(socket.user._id.toString()).isVideoOff = isVideoOff;
        }

        socket.to(socket.roomId).emit('media:user-video', {
          socketId: socket.id,
          userId: socket.user._id,
          isVideoOff
        });
      }
    });

    /**
     * Toggle screen sharing
     */
    socket.on('media:screen-share', ({ isScreenSharing }) => {
      if (socket.roomId) {
        const roomUsers = roomParticipants.get(socket.roomId);
        if (roomUsers && roomUsers.has(socket.user._id.toString())) {
          roomUsers.get(socket.user._id.toString()).isScreenSharing = isScreenSharing;
        }

        socket.to(socket.roomId).emit('media:screen-share', {
          socketId: socket.id,
          userId: socket.user._id,
          userName: socket.user.name,
          isScreenSharing
        });
      }
    });

    // ============================================
    // HOST CONTROL EVENTS
    // ============================================

    /**
     * Host mutes a participant
     */
    socket.on('host:mute-user', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await Meeting.findOne({ roomId });
        
        if (meeting && meeting.host.toString() === socket.user._id.toString()) {
          io.to(targetSocketId).emit('host:force-mute');
          io.to(roomId).emit('host:user-muted', { targetSocketId });
        }
      } catch (error) {
        console.error('Host mute error:', error);
      }
    });

    /**
     * Host removes a participant
     */
    socket.on('host:remove-user', async ({ targetSocketId, roomId }) => {
      try {
        const meeting = await Meeting.findOne({ roomId });
        
        if (meeting && meeting.host.toString() === socket.user._id.toString()) {
          io.to(targetSocketId).emit('host:removed');
          
          // Get target socket and remove from room
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) {
            targetSocket.leave(roomId);
            
            const roomUsers = roomParticipants.get(roomId);
            if (roomUsers && targetSocket.user) {
              roomUsers.delete(targetSocket.user._id.toString());
            }
          }

          io.to(roomId).emit('room:user-left', { socketId: targetSocketId });
        }
      } catch (error) {
        console.error('Host remove error:', error);
      }
    });

    /**
     * Host ends meeting for everyone
     */
    socket.on('host:end-meeting', async ({ roomId }) => {
      try {
        const meeting = await Meeting.findOne({ roomId });
        
        if (meeting && meeting.host.toString() === socket.user._id.toString()) {
          io.to(roomId).emit('meeting:ended', {
            roomId,
            endedBy: socket.user._id
          });

          // Update meeting status
          meeting.status = 'ended';
          meeting.endedAt = new Date();
          await meeting.save();

          // Clear room participants
          roomParticipants.delete(roomId);
        }
      } catch (error) {
        console.error('Host end meeting error:', error);
      }
    });

    // ============================================
    // CHAT EVENTS
    // ============================================

    /**
     * Send chat message
     */
    socket.on('chat:send', async ({ roomId, content, recipientId }) => {
      try {
        const meeting = await Meeting.findOne({ roomId });
        
        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
          return;
        }

        if (!meeting.settings.allowChat) {
          socket.emit('error', { message: 'Chat is disabled' });
          return;
        }

        const messageData = {
          meeting: meeting._id,
          sender: socket.user._id,
          content: content.trim(),
          type: 'text',
          isPrivate: !!recipientId
        };

        if (recipientId) {
          messageData.recipient = recipientId;
        }

        const message = await Message.create(messageData);
        await message.populate('sender', 'name email avatar');
        
        if (recipientId) {
          await message.populate('recipient', 'name email avatar');
          // Private message
          io.to(`user:${socket.user._id}`).to(`user:${recipientId}`).emit('chat:message', message);
        } else {
          // Public message
          io.to(roomId).emit('chat:message', message);
        }
      } catch (error) {
        console.error('Chat send error:', error);
        socket.emit('error', { message: 'Error sending message' });
      }
    });

    /**
     * Typing indicator
     */
    socket.on('chat:typing', ({ roomId, isTyping }) => {
      socket.to(roomId).emit('chat:user-typing', {
        userId: socket.user._id,
        userName: socket.user.name,
        isTyping
      });
    });

    // ============================================
    // RECORDING EVENTS
    // ============================================

    /**
     * Recording started notification
     */
    socket.on('recording:started', ({ roomId }) => {
      socket.to(roomId).emit('recording:started', {
        userId: socket.user._id,
        userName: socket.user.name
      });
    });

    /**
     * Recording stopped notification
     */
    socket.on('recording:stopped', ({ roomId }) => {
      socket.to(roomId).emit('recording:stopped', {
        userId: socket.user._id,
        userName: socket.user.name
      });
    });

    // ============================================
    // HAND RAISE / REACTIONS
    // ============================================

    /**
     * Raise hand
     */
    socket.on('reaction:hand-raise', ({ roomId, isRaised }) => {
      socket.to(roomId).emit('reaction:hand-raise', {
        socketId: socket.id,
        userId: socket.user._id,
        userName: socket.user.name,
        isRaised
      });
    });

    /**
     * Send reaction (emoji)
     */
    socket.on('reaction:emoji', ({ roomId, emoji }) => {
      io.to(roomId).emit('reaction:emoji', {
        userId: socket.user._id,
        userName: socket.user.name,
        emoji
      });
    });

    // ============================================
    // TEAM EVENTS
    // ============================================

    /**
     * Join a team room for team chat
     */
    socket.on('team:join', async ({ teamId }) => {
      try {
        const team = await Team.findById(teamId).populate('members.user', 'name email avatar');

        if (!team) {
          socket.emit('error', { message: 'Team not found' });
          return;
        }

        // Check membership
        if (!team.isMember(socket.user._id)) {
          socket.emit('error', { message: 'You are not a member of this team' });
          return;
        }

        // Join socket room for team
        socket.join(`team:${teamId}`);
        
        console.log(`📍 ${socket.user.name} joined team: ${team.name}`);
        
        socket.emit('team:joined', {
          teamId,
          teamName: team.name
        });
      } catch (error) {
        console.error('Team join error:', error);
        socket.emit('error', { message: 'Error joining team' });
      }
    });

    /**
     * Leave a team room
     */
    socket.on('team:leave', ({ teamId }) => {
      socket.leave(`team:${teamId}`);
      console.log(`📍 ${socket.user.name} left team: ${teamId}`);
    });

    /**
     * User is typing in team chat
     */
    socket.on('team:typing', ({ teamId, channelType, isTyping }) => {
      socket.to(`team:${teamId}`).emit('team:user-typing', {
        userId: socket.user._id,
        userName: socket.user.name,
        channelType,
        isTyping
      });
    });

    // ============================================
    // DISCONNECT
    // ============================================

    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.user.name} (${socket.id})`);
      
      // Clean up mediasoup resources
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
      connectedUsers.delete(socket.user._id.toString());
    });
  });
};

/**
 * Handle user leaving room
 */
function handleRoomLeave(socket, io) {
  if (socket.roomId) {
    const roomId = socket.roomId;
    
    // Remove from room participants
    const roomUsers = roomParticipants.get(roomId);
    if (roomUsers) {
      roomUsers.delete(socket.user._id.toString());
      
      // Clean up empty rooms
      if (roomUsers.size === 0) {
        roomParticipants.delete(roomId);
      }
    }

    // Notify others
    io.to(roomId).emit('room:user-left', {
      socketId: socket.id,
      userId: socket.user._id,
      userName: socket.user.name
    });

    socket.leave(roomId);
    socket.roomId = null;

    console.log(`📍 ${socket.user.name} left room: ${roomId}`);
  }
}

export { connectedUsers, roomParticipants };
