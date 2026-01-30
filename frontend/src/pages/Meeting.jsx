import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SimplePeer from 'simple-peer'
import toast from 'react-hot-toast'
import { useMeetingStore } from '../store/meetingStore'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { getSocket, initSocket } from '../lib/socket'

// Components
import MeetingControls from '../components/MeetingControls'
import VideoGrid from '../components/VideoGrid'
import ChatPanel from '../components/ChatPanel'
import ParticipantsList from '../components/ParticipantsList'
import MeetingHeader from '../components/MeetingHeader'

export default function Meeting() {
  const navigate = useNavigate()
  const { roomId } = useParams()
  const { user, token } = useAuthStore()
  const { 
    currentMeeting,
    participants,
    localStream,
    isHost,
    isMuted,
    isVideoOff,
    isScreenSharing,
    isRecording,
    peers,
    joinMeeting,
    leaveMeeting,
    setLocalStream,
    setParticipants,
    setIsHost,
    addParticipant,
    removeParticipant,
    updateParticipant,
    addPeer,
    removePeer,
    toggleMute,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    startRecording,
    stopRecording
  } = useMeetingStore()
  const { addMessage, loadMessages, clearMessages } = useChatStore()

  const [showChat, setShowChat] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [isJoining, setIsJoining] = useState(true)
  const [peerStreams, setPeerStreams] = useState(new Map())
  const [screenShareStream, setScreenShareStream] = useState(null)
  const [screenShareUser, setScreenShareUser] = useState(null)

  const localVideoRef = useRef(null)
  const socketRef = useRef(null)
  const peersRef = useRef(new Map())

  // Initialize socket and join room
  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize socket
        const socket = initSocket(token)
        socketRef.current = socket

        // Get local media stream if not already obtained
        let stream = localStream
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: true
          })
          setLocalStream(stream)
        }

        // Set local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

        // Join meeting via API
        const result = await joinMeeting(roomId)
        if (!result.success) {
          toast.error(result.message || 'Failed to join meeting')
          navigate('/')
          return
        }

        // Check if current user is host
        const meeting = result.meeting
        setIsHost(meeting.host._id === user._id || meeting.host === user._id)

        // Load chat messages
        loadMessages(roomId)

        // Join socket room
        socket.emit('room:join', { roomId })

        setIsJoining(false)
      } catch (error) {
        console.error('Failed to initialize meeting:', error)
        toast.error('Failed to access camera/microphone')
        navigate('/')
      }
    }

    initialize()

    return () => {
      handleCleanup()
    }
  }, [roomId])

  // Socket event handlers
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    // Receive current participants when joining
    socket.on('room:participants', ({ participants: existingParticipants, isHost: hostStatus }) => {
      setParticipants(existingParticipants)
      setIsHost(hostStatus)

      // Create peer connections with existing participants
      existingParticipants.forEach((participant) => {
        createPeer(participant.socketId, participant.user, true)
      })
    })

    // New user joined
    socket.on('room:user-joined', ({ user: joinedUser, socketId }) => {
      toast(`${joinedUser.name} joined the meeting`)
      addParticipant({ user: joinedUser, socketId })
    })

    // User left
    socket.on('room:user-left', ({ socketId, userId, userName }) => {
      toast(`${userName || 'Someone'} left the meeting`)
      removeParticipant(userId)
      removePeerConnection(socketId)
    })

    // WebRTC signaling
    socket.on('webrtc:offer', async ({ offer, fromSocketId, fromUser }) => {
      const peer = createPeer(fromSocketId, fromUser, false)
      await peer.signal(offer)
    })

    socket.on('webrtc:answer', async ({ answer, fromSocketId }) => {
      const peer = peersRef.current.get(fromSocketId)
      if (peer) {
        peer.signal(answer)
      }
    })

    socket.on('webrtc:ice-candidate', ({ candidate, fromSocketId }) => {
      const peer = peersRef.current.get(fromSocketId)
      if (peer) {
        peer.signal(candidate)
      }
    })

    // Media state updates
    socket.on('media:user-muted', ({ socketId, userId, isMuted }) => {
      updateParticipant(userId, { isMuted })
    })

    socket.on('media:user-video', ({ socketId, userId, isVideoOff }) => {
      updateParticipant(userId, { isVideoOff })
    })

    socket.on('media:screen-share', ({ socketId, userId, userName, isScreenSharing }) => {
      if (isScreenSharing) {
        toast(`${userName} started screen sharing`)
        setScreenShareUser({ id: userId, name: userName, socketId })
      } else {
        toast(`${userName} stopped screen sharing`)
        setScreenShareStream(null)
        setScreenShareUser(null)
      }
    })

    // Host controls
    socket.on('host:force-mute', () => {
      if (!isMuted) {
        toggleMute()
        toast('You have been muted by the host')
      }
    })

    socket.on('host:removed', () => {
      toast.error('You have been removed from the meeting')
      handleLeave()
    })

    socket.on('meeting:ended', () => {
      toast('The meeting has ended')
      handleLeave()
    })

    // Chat messages
    socket.on('chat:message', (message) => {
      addMessage(message)
    })

    socket.on('chat:user-typing', ({ userId, userName, isTyping }) => {
      // Handle typing indicator
    })

    // Recording notifications
    socket.on('recording:started', ({ userName }) => {
      toast(`${userName} started recording`)
    })

    socket.on('recording:stopped', ({ userName }) => {
      toast(`${userName} stopped recording`)
    })

    // Reactions
    socket.on('reaction:hand-raise', ({ userName, isRaised }) => {
      if (isRaised) {
        toast(`${userName} raised their hand`)
      }
    })

    socket.on('reaction:emoji', ({ userName, emoji }) => {
      toast(`${userName}: ${emoji}`)
    })

    // Errors
    socket.on('error', ({ message }) => {
      toast.error(message)
    })

    return () => {
      socket.off('room:participants')
      socket.off('room:user-joined')
      socket.off('room:user-left')
      socket.off('webrtc:offer')
      socket.off('webrtc:answer')
      socket.off('webrtc:ice-candidate')
      socket.off('media:user-muted')
      socket.off('media:user-video')
      socket.off('media:screen-share')
      socket.off('host:force-mute')
      socket.off('host:removed')
      socket.off('meeting:ended')
      socket.off('chat:message')
      socket.off('chat:user-typing')
      socket.off('recording:started')
      socket.off('recording:stopped')
      socket.off('reaction:hand-raise')
      socket.off('reaction:emoji')
      socket.off('error')
    }
  }, [socketRef.current])

  // Create peer connection
  const createPeer = useCallback((targetSocketId, targetUser, initiator) => {
    if (peersRef.current.has(targetSocketId)) {
      return peersRef.current.get(targetSocketId)
    }

    const peer = new SimplePeer({
      initiator,
      trickle: true,
      stream: localStream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    })

    peer.on('signal', (data) => {
      const socket = socketRef.current
      if (!socket) return

      if (data.type === 'offer') {
        socket.emit('webrtc:offer', { targetSocketId, offer: data })
      } else if (data.type === 'answer') {
        socket.emit('webrtc:answer', { targetSocketId, answer: data })
      } else if (data.candidate) {
        socket.emit('webrtc:ice-candidate', { targetSocketId, candidate: data })
      }
    })

    peer.on('stream', (remoteStream) => {
      setPeerStreams((prev) => {
        const newMap = new Map(prev)
        newMap.set(targetSocketId, { stream: remoteStream, user: targetUser })
        return newMap
      })
    })

    peer.on('close', () => {
      removePeerConnection(targetSocketId)
    })

    peer.on('error', (error) => {
      console.error('Peer error:', error)
      removePeerConnection(targetSocketId)
    })

    peersRef.current.set(targetSocketId, peer)
    addPeer(targetSocketId, peer)

    return peer
  }, [localStream])

  // Remove peer connection
  const removePeerConnection = useCallback((socketId) => {
    const peer = peersRef.current.get(socketId)
    if (peer) {
      peer.destroy()
      peersRef.current.delete(socketId)
      removePeer(socketId)
    }

    setPeerStreams((prev) => {
      const newMap = new Map(prev)
      newMap.delete(socketId)
      return newMap
    })
  }, [])

  // Cleanup on unmount
  const handleCleanup = useCallback(() => {
    // Close all peer connections
    peersRef.current.forEach((peer) => peer.destroy())
    peersRef.current.clear()

    // Clear chat
    clearMessages()
  }, [])

  // Leave meeting
  const handleLeave = useCallback(async () => {
    await leaveMeeting()
    navigate('/')
  }, [])

  // Toggle screen share
  const handleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare()
      
      // Replace screen stream with camera stream in all peer connections
      peersRef.current.forEach((peer) => {
        if (localStream) {
          const videoTrack = localStream.getVideoTracks()[0]
          const sender = peer._pc?.getSenders()?.find(s => s.track?.kind === 'video')
          if (sender && videoTrack) {
            sender.replaceTrack(videoTrack)
          }
        }
      })
    } else {
      const result = await startScreenShare()
      if (result.success) {
        // Replace camera stream with screen stream in all peer connections
        peersRef.current.forEach((peer) => {
          const screenTrack = result.stream.getVideoTracks()[0]
          const sender = peer._pc?.getSenders()?.find(s => s.track?.kind === 'video')
          if (sender && screenTrack) {
            sender.replaceTrack(screenTrack)
          }
        })
      } else {
        toast.error('Failed to share screen')
      }
    }
  }, [isScreenSharing, localStream])

  // Toggle recording
  const handleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
      toast.success('Recording saved')
    } else {
      const result = startRecording()
      if (result.success) {
        toast.success('Recording started')
      } else {
        toast.error(result.message || 'Failed to start recording')
      }
    }
  }, [isRecording])

  // Copy meeting link
  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/meeting/${roomId}`
    navigator.clipboard.writeText(link)
    toast.success('Meeting link copied!')
  }, [roomId])

  // Loading state
  if (isJoining) {
    return (
      <div className="min-h-screen bg-dark-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-500 mx-auto mb-4" />
          <p className="text-gray-400">Joining meeting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-dark-100 flex flex-col overflow-hidden">
      {/* Header */}
      <MeetingHeader 
        roomId={roomId}
        title={currentMeeting?.title}
        onCopyLink={handleCopyLink}
        participantCount={participants.length + 1}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 relative">
          <VideoGrid
            localStream={localStream}
            localVideoRef={localVideoRef}
            peerStreams={peerStreams}
            user={user}
            participants={participants}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            screenShareStream={screenShareStream}
            screenShareUser={screenShareUser}
          />
        </div>

        {/* Side Panels */}
        {showChat && (
          <ChatPanel 
            roomId={roomId}
            onClose={() => setShowChat(false)}
          />
        )}

        {showParticipants && (
          <ParticipantsList
            participants={participants}
            user={user}
            isHost={isHost}
            onClose={() => setShowParticipants(false)}
          />
        )}
      </div>

      {/* Controls */}
      <MeetingControls
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        isRecording={isRecording}
        isHost={isHost}
        showChat={showChat}
        showParticipants={showParticipants}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={handleScreenShare}
        onToggleRecording={handleRecording}
        onToggleChat={() => setShowChat(!showChat)}
        onToggleParticipants={() => setShowParticipants(!showParticipants)}
        onLeave={handleLeave}
      />
    </div>
  )
}
