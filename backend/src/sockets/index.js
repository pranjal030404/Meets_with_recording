import { verifySocketToken } from '../middleware/auth.js';
import Meeting from '../models/Meeting.js';
import Message from '../models/Message.js';
import Team from '../models/Team.js';

// Store connected users and their rooms
const connectedUsers = new Map();
const roomParticipants = new Map();

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
    // WEBRTC SIGNALING EVENTS
    // ============================================

    /**
     * Send WebRTC offer to specific peer
     */
    socket.on('webrtc:offer', ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit('webrtc:offer', {
        offer,
        fromSocketId: socket.id,
        fromUser: {
          _id: socket.user._id,
          name: socket.user.name,
          avatar: socket.user.avatar
        }
      });
    });

    /**
     * Send WebRTC answer to specific peer
     */
    socket.on('webrtc:answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('webrtc:answer', {
        answer,
        fromSocketId: socket.id
      });
    });

    /**
     * Send ICE candidate to specific peer
     */
    socket.on('webrtc:ice-candidate', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc:ice-candidate', {
        candidate,
        fromSocketId: socket.id
      });
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
