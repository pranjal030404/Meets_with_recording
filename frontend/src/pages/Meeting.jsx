import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useMeetingStore } from '../store/meetingStore'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { getSocket, initSocket, waitForSocket, isSocketConnected } from '../lib/socket'

// Components
import MeetingControls from '../components/MeetingControls'
import VideoGrid from '../components/VideoGrid'
import ChatPanel from '../components/ChatPanel'
import ParticipantsList from '../components/ParticipantsList'
import MeetingHeader from '../components/MeetingHeader'
import EmojiReactions from '../components/EmojiReactions'
import CaptionsOverlay from '../components/CaptionsOverlay'
import WaitingRoom from '../components/WaitingRoom'
import DeviceSettings from '../components/DeviceSettings'
import MeetingSettingsPanel from '../components/MeetingSettingsPanel'
import Whiteboard from '../components/Whiteboard'

export default function Meeting() {
  const navigate = useNavigate()
  const { roomId } = useParams()
  const { user, token } = useAuthStore()
  const {
    currentMeeting, participants, localStream, isHost,
    isMuted, isVideoOff, isScreenSharing, isRecording,
    remoteStreams, mediasoupReady, activeReactions,
    handRaisedUsers, isHandRaised, layout, pinnedUserId,
    spotlightUserId, activeSpeakerId, captionsEnabled, captions,
    isBeingRecorded, waitingRoomUsers, isMeetingLocked, recordingUser, isPiP,
    screenStream,
    joinMeeting, leaveMeeting, setLocalStream,
    setParticipants, setIsHost, addParticipant, removeParticipant,
    updateParticipant, toggleMute, toggleVideo,
    startScreenShare, stopScreenShare, startRecording, stopRecording,
    initMediasoup, produceAudio, produceVideo,
    consumeProducer, removeConsumer, removeRemoteStream,
    toggleHandRaise, addHandRaise, removeHandRaise,
    addReaction, sendReaction, setLayout, pinUser,
    spotlightUser, clearSpotlight, setActiveSpeaker,
    forceMute, forceVideoOff, setBeingRecorded,
    addToWaitingRoom, admitFromWaitingRoom, denyFromWaitingRoom,
    toggleCaptions, addCaption, enumerateDevices, enablePiP, disablePiP
  } = useMeetingStore()
  const { addMessage, loadMessages, clearMessages, setTypingUser } = useChatStore()

  const [showChat, setShowChat] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDeviceSettings, setShowDeviceSettings] = useState(false)
  const [showMeetingSettings, setShowMeetingSettings] = useState(false)
  const [showWhiteboard, setShowWhiteboard] = useState(false)
  const [isJoining, setIsJoining] = useState(true)
  const [screenShareUser, setScreenShareUser] = useState(null)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)

  const localVideoRef = useRef(null)
  const socketRef = useRef(null)
  const producerMapRef = useRef(new Map()) // Map<producerId, { peerId, mediaType }>
  const initCancelledRef = useRef(false)

  // =============================================
  // KEYBOARD SHORTCUTS
  // =============================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + D = toggle mic
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); toggleMute() }
      // Ctrl/Cmd + E = toggle video
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); toggleVideo() }
      // Ctrl/Cmd + Shift + S = toggle screen share
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') { e.preventDefault(); handleScreenShare() }
      // Ctrl/Cmd + Shift + H = raise hand
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') { e.preventDefault(); toggleHandRaise() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isScreenSharing])

  // =============================================
  // SET LOCAL VIDEO REF WHEN STREAM IS AVAILABLE
  // =============================================
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  // =============================================
  // ACTIVE SPEAKER DETECTION
  // =============================================
  useEffect(() => {
    if (!localStream || isMuted) return
    const audioTracks = localStream.getAudioTracks()
    if (audioTracks.length === 0) return

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    audioCtx.resume()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    const source = audioCtx.createMediaStreamSource(localStream)
    source.connect(analyser)
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const interval = setInterval(() => {
      analyser.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      if (avg > 20 && user?.id) {
        setActiveSpeaker(user.id)
      }
    }, 300)

    return () => { clearInterval(interval); audioCtx.close() }
  }, [localStream, isMuted])

  // =============================================
  // INITIALIZE SOCKET + MEDIASOUP + JOIN ROOM
  // =============================================
  useEffect(() => {
    initCancelledRef.current = false
    const currentUserId = user?.id || user?._id

    const initialize = async () => {
      try {
        const socket = initSocket(token)
        socketRef.current = socket

        // Wait for socket connection (with timeout)
        try {
          await waitForSocket(10000)
        } catch (socketError) {
          console.warn('Socket connection timed out, continuing with REST API only:', socketError.message)
        }

        if (initCancelledRef.current) return

        // Get local media stream if not already obtained (from pre-join)
        let stream = useMeetingStore.getState().localStream

        // Check if stream needs to be refreshed
        const hasLiveAudio = stream?.getAudioTracks().some(t => t.readyState === 'live')
        const hasLiveVideo = stream?.getVideoTracks().some(t => t.readyState === 'live')
        const needsAudio = !hasLiveAudio && !useMeetingStore.getState().isMuted
        const needsVideo = !hasLiveVideo && !useMeetingStore.getState().isVideoOff

        if (!stream || needsAudio || needsVideo) {
          const audioConstraint = needsAudio ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } : false
          const videoConstraint = needsVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false

          const constraints = {}
          if (audioConstraint) constraints.audio = audioConstraint
          if (videoConstraint) constraints.video = videoConstraint

          if (Object.keys(constraints).length > 0) {
            stream = await navigator.mediaDevices.getUserMedia(constraints)
            if (initCancelledRef.current) {
              stream.getTracks().forEach(t => t.stop())
              return
            }
            setLocalStream(stream)
          }
        }

        // Join meeting via API
        const joinResult = await joinMeeting(roomId)
        if (!joinResult.success) {
          toast.error(joinResult.message || 'Failed to join meeting')
          navigate('/')
          return
        }

        if (initCancelledRef.current) return

        const meeting = joinResult.meeting
        const hostId = meeting.host?.id || meeting.hostId
        setIsHost(hostId === currentUserId)

        // Re-read stream from store (may have been updated)
        stream = useMeetingStore.getState().localStream

        // Check muteOnEntry setting
        if (meeting.settings?.muteOnEntry && hostId !== currentUserId) {
          const audioTrack = stream?.getAudioTracks()[0]
          if (audioTrack) { audioTrack.stop(); stream.removeTrack(audioTrack) }
          useMeetingStore.setState({ isMuted: true })
          toast('You have been muted on entry by the host', { icon: '🔇' })
        }

        // Initialize mediasoup SFU (graceful failure)
        if (socket.connected) {
          const sfuResult = await initMediasoup(socket, roomId)
          if (!sfuResult.success) {
            console.error('SFU init failed, falling back to audio/video only')
          }

          if (initCancelledRef.current) return

          // Re-read stream again (mediasoup init is async)
          stream = useMeetingStore.getState().localStream

          // Produce local tracks to SFU
          const audioTrack = stream?.getAudioTracks()[0]
          const videoTrack = stream?.getVideoTracks()[0]
          if (audioTrack && audioTrack.readyState === 'live' && !useMeetingStore.getState().isMuted) {
            await produceAudio(audioTrack)
          }
          if (videoTrack && videoTrack.readyState === 'live') {
            await produceVideo(videoTrack)
          }
        } else {
          console.warn('Socket not connected, skipping SFU initialization')
        }

        if (initCancelledRef.current) return

        // Load chat messages & enumerate devices
        loadMessages(roomId)
        enumerateDevices()

        // Join socket room
        if (socket.connected) {
          socket.emit('room:join', { roomId })
        }
        setIsJoining(false)
      } catch (error) {
        if (initCancelledRef.current) return
        console.error('Failed to initialize meeting:', error)
        toast.error('Failed to access camera/microphone')
        navigate('/')
      }
    }

    initialize()
    return () => { initCancelledRef.current = true; handleCleanup() }
  }, [roomId])

  // =============================================
  // SOCKET EVENT HANDLERS
  // =============================================
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    // Re-emit room:join on socket reconnect
    const onReconnect = () => {
      if (roomId) {
        socket.emit('room:join', { roomId })
      }
    }
    socket.on('connect', onReconnect)

    // Room participants (on join)
    socket.on('room:participants', ({ participants: existingParticipants, isHost: hostStatus }) => {
      setParticipants(existingParticipants)
      setIsHost(hostStatus)
    })

    // Existing mediasoup producers — consume them
    socket.on('mediasoup:existingProducers', async ({ producers }) => {
      for (const p of producers) {
        producerMapRef.current.set(p.producerId, { peerId: p.userId, mediaType: p.mediaType })
        await consumeProducer(p.producerId, p.userId, { _id: p.userId, name: p.userName }, p.mediaType)
      }
    })

    // New remote producer
    socket.on('mediasoup:newProducer', async ({ producerId, userId, userName, mediaType }) => {
      producerMapRef.current.set(producerId, { peerId: userId, mediaType })
      await consumeProducer(producerId, userId, { _id: userId, name: userName }, mediaType)
    })

    // Remote producer paused
    socket.on('mediasoup:producerPaused', ({ producerId, socketId }) => {
      const info = producerMapRef.current.get(producerId)
      if (info) {
        // The consumer will automatically be paused
      }
    })

    // Remote producer resumed
    socket.on('mediasoup:producerResumed', ({ producerId, socketId }) => {
      const info = producerMapRef.current.get(producerId)
      if (info) {
        // The consumer will automatically resume
      }
    })

    // Remote producer closed
    socket.on('mediasoup:producerClosed', ({ producerId, socketId }) => {
      const info = producerMapRef.current.get(producerId)
      if (info) {
        removeConsumer(producerId, info.peerId, info.mediaType)
        producerMapRef.current.delete(producerId)
      }
    })

    // User joined
    socket.on('room:user-joined', ({ user: joinedUser, socketId }) => {
      toast(`${joinedUser.name} joined the meeting`, { icon: '👋' })
      addParticipant({ user: joinedUser, socketId })
      // Play join sound
      try { new Audio('/sounds/join.mp3').play().catch(() => {}) } catch {}
    })

    // User left
    socket.on('room:user-left', ({ socketId, userId, userName }) => {
      toast(`${userName || 'Someone'} left the meeting`)
      removeParticipant(userId)
      removeRemoteStream(userId)
      // Play leave sound
      try { new Audio('/sounds/leave.mp3').play().catch(() => {}) } catch {}
    })

    // Media state updates from others
    socket.on('media:user-muted', ({ userId, isMuted }) => {
      updateParticipant(userId, { isMuted })
    })

    socket.on('media:user-video', ({ userId, isVideoOff }) => {
      updateParticipant(userId, { isVideoOff })
    })

    socket.on('media:screen-share', ({ userId, userName, isScreenSharing }) => {
      if (isScreenSharing) {
        toast(`${userName} started screen sharing`)
        setScreenShareUser({ id: userId, name: userName })
      } else {
        toast(`${userName} stopped screen sharing`)
        setScreenShareUser(null)
      }
    })

    // Host controls
    socket.on('host:force-mute', () => {
      forceMute()
      toast('You have been muted by the host', { icon: '🔇' })
    })

    socket.on('host:force-video-off', () => {
      forceVideoOff()
      toast('Your camera has been turned off by the host', { icon: '📷' })
    })

    socket.on('host:request-unmute', () => {
      toast((t) => (
        <div className="flex flex-col gap-2">
          <span>The host is asking you to unmute</span>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-primary-600 rounded text-sm text-white" onClick={() => { toggleMute(); toast.dismiss(t.id) }}>Unmute</button>
            <button className="px-3 py-1 bg-dark-400 rounded text-sm text-white" onClick={() => toast.dismiss(t.id)}>Decline</button>
          </div>
        </div>
      ), { duration: 10000 })
    })

    socket.on('host:removed', () => {
      toast.error('You have been removed from the meeting')
      handleLeave()
    })

    socket.on('meeting:ended', () => {
      toast('The meeting has ended')
      handleLeave()
    })

    socket.on('host:spotlight', ({ userId }) => {
      useMeetingStore.setState({ spotlightUserId: userId })
    })

    socket.on('host:meeting-locked', ({ isLocked }) => {
      useMeetingStore.setState({ isMeetingLocked: isLocked })
      toast(isLocked ? 'Meeting has been locked' : 'Meeting has been unlocked', { icon: isLocked ? '🔒' : '🔓' })
    })

    // Waiting room
    socket.on('room:waiting', ({ user: waitingUser, socketId }) => {
      addToWaitingRoom(waitingUser, socketId)
      toast(`${waitingUser.name} is waiting to join`, { icon: '🚪' })
    })

    socket.on('room:admitted', () => {
      toast.success('You have been admitted to the meeting')
    })

    socket.on('room:denied', () => {
      toast.error('Your request to join was denied')
      navigate('/')
    })

    // Chat
    socket.on('chat:message', (message) => {
      addMessage(message)
      if (!showChat) {
        try { new Audio('/sounds/message.mp3').play().catch(() => {}) } catch {}
      }
    })

    socket.on('chat:user-typing', ({ userId, userName, isTyping }) => {
      setTypingUser(userId, userName, isTyping)
    })

    // Recording notifications
    socket.on('recording:started', ({ userName }) => {
      setBeingRecorded(true, userName)
      toast(`${userName} started recording`, { icon: '🔴' })
    })

    socket.on('recording:stopped', ({ userName }) => {
      setBeingRecorded(false, null)
      toast(`${userName} stopped recording`)
    })

    // Hand raise
    socket.on('reaction:hand-raise', ({ userId, userName, isRaised }) => {
      if (isRaised) {
        addHandRaise(userId, userName)
        toast(`${userName} raised their hand`, { icon: '✋' })
      } else {
        removeHandRaise(userId)
      }
    })

    // Emoji reactions
    socket.on('reaction:emoji', ({ userId, userName, emoji }) => {
      addReaction(userId, userName, emoji)
    })

    // Captions
    socket.on('caption:text', ({ userId, userName, text }) => {
      addCaption(userId, userName, text)
    })

    // Settings updates
    socket.on('meeting:settings-updated', ({ settings }) => {
      if (currentMeeting) {
        useMeetingStore.setState({
          currentMeeting: { ...currentMeeting, settings: { ...currentMeeting.settings, ...settings } }
        })
      }
    })

    socket.on('error', ({ message }) => {
      toast.error(message)
    })

    return () => {
      socket.off('connect', onReconnect)
      const events = [
        'room:participants', 'room:user-joined', 'room:user-left',
        'mediasoup:existingProducers', 'mediasoup:newProducer', 'mediasoup:producerPaused',
        'mediasoup:producerResumed', 'mediasoup:producerClosed',
        'media:user-muted', 'media:user-video', 'media:screen-share',
        'host:force-mute', 'host:force-video-off', 'host:request-unmute',
        'host:removed', 'meeting:ended', 'host:spotlight', 'host:meeting-locked',
        'room:waiting', 'room:admitted', 'room:denied',
        'chat:message', 'chat:user-typing',
        'recording:started', 'recording:stopped',
        'reaction:hand-raise', 'reaction:emoji',
        'caption:text', 'meeting:settings-updated', 'error'
      ]
      events.forEach(e => socket.off(e))
    }
  }, [socketRef.current])

  // Cleanup on unmount
  const handleCleanup = useCallback(() => {
    const stream = useMeetingStore.getState().localStream
    if (stream) stream.getTracks().forEach(t => t.stop())
    clearMessages()
    useMeetingStore.getState().setLocalStream(null)
  }, [])

  // Leave meeting
  const handleLeave = useCallback(async () => {
    await leaveMeeting()
    navigate('/')
  }, [])

  // End meeting for all (host only)
  const handleEndForAll = useCallback(async () => {
    const socket = socketRef.current
    const { currentMeeting } = useMeetingStore.getState()
    if (socket && currentMeeting) {
      socket.emit('host:end-meeting', { roomId: currentMeeting.roomId })
    }
    await leaveMeeting()
    navigate('/')
  }, [])

  // Screen share toggle
  const handleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await stopScreenShare()
      setScreenShareUser(null)
    } else {
      const result = await startScreenShare()
      if (result.success) {
        setScreenShareUser({ id: user?.id, name: user?.name })
      } else {
        toast.error(result.message || 'Failed to share screen')
      }
    }
  }, [isScreenSharing, user])

  // Recording toggle
  const handleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
      toast.success('Recording stopped. Upload and transcription are processing.')
    } else {
      const result = startRecording()
      if (result.success) toast.success('Recording started')
      else toast.error(result.message || 'Failed to start recording')
    }
  }, [isRecording])

  // Copy meeting link
  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/meeting/${roomId}`
    navigator.clipboard.writeText(link)
    toast.success('Meeting link copied!')
  }, [roomId])

  // Toggle PiP
  const handleTogglePiP = useCallback(() => {
    if (isPiP) {
      disablePiP()
    } else {
      enablePiP()
    }
  }, [isPiP, disablePiP, enablePiP])

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
      {/* Recording banner */}
      {isBeingRecorded && (
        <div className="bg-red-600/90 text-white text-center py-1 text-sm flex items-center justify-center gap-2">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          This meeting is being recorded{recordingUser ? ` by ${recordingUser}` : ''}
        </div>
      )}

      {/* Header */}
      <MeetingHeader
        roomId={roomId}
        title={currentMeeting?.title}
        onCopyLink={handleCopyLink}
        participantCount={participants.length + 1}
        isBeingRecorded={isBeingRecorded}
        layout={layout}
        onLayoutChange={setLayout}
        handRaisedCount={handRaisedUsers.length}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Grid */}
        <div className="flex-1 relative">
          <VideoGrid
            localStream={localStream}
            localVideoRef={localVideoRef}
            remoteStreams={remoteStreams}
            screenStream={screenStream}
            user={user}
            participants={participants}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            screenShareUser={screenShareUser}
            layout={layout}
            pinnedUserId={pinnedUserId}
            spotlightUserId={spotlightUserId}
            activeSpeakerId={activeSpeakerId}
            handRaisedUsers={handRaisedUsers}
            isHandRaised={isHandRaised}
            isHost={isHost}
            onPinUser={pinUser}
            onSpotlightUser={spotlightUser}
          />

          {/* Emoji Reactions Overlay */}
          <EmojiReactions reactions={activeReactions} />

          {/* Captions Overlay */}
          {captionsEnabled && <CaptionsOverlay captions={captions} />}
        </div>

        {/* Side Panels */}
        {showChat && (
          <ChatPanel roomId={roomId} onClose={() => setShowChat(false)} />
        )}

        {showParticipants && (
          <ParticipantsList
            participants={participants}
            user={user}
            isHost={isHost}
            roomId={roomId}
            handRaisedUsers={handRaisedUsers}
            waitingRoomUsers={waitingRoomUsers}
            onClose={() => setShowParticipants(false)}
            onAdmit={admitFromWaitingRoom}
            onDeny={denyFromWaitingRoom}
          />
        )}

        {showMeetingSettings && (
          <MeetingSettingsPanel
            meeting={currentMeeting}
            isHost={isHost}
            isMeetingLocked={isMeetingLocked}
            onClose={() => setShowMeetingSettings(false)}
          />
        )}
      </div>

      {/* Device Settings Modal */}
      {showDeviceSettings && (
        <DeviceSettings onClose={() => setShowDeviceSettings(false)} />
      )}

      {/* Whiteboard Modal */}
      {showWhiteboard && (
        <Whiteboard roomId={roomId} onClose={() => setShowWhiteboard(false)} />
      )}

      {/* Leave Dialog */}
      {showLeaveDialog && (
        <div className="modal-backdrop" onClick={() => setShowLeaveDialog(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Leave Meeting</h3>
            <div className="space-y-3">
              <button onClick={() => { setShowLeaveDialog(false); handleLeave() }}
                className="btn btn-secondary w-full">Leave Meeting</button>
              {isHost && (
                <button onClick={() => { setShowLeaveDialog(false); handleEndForAll() }}
                  className="btn btn-danger w-full">End Meeting for All</button>
              )}
              <button onClick={() => setShowLeaveDialog(false)}
                className="btn btn-ghost w-full">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <MeetingControls
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        isRecording={isRecording}
        isHost={isHost}
        isHandRaised={isHandRaised}
        showChat={showChat}
        showParticipants={showParticipants}
        onTogglePiP={handleTogglePiP}
        onOpenWhiteboard={() => setShowWhiteboard(true)}
        isPiP={isPiP}
        captionsEnabled={captionsEnabled}
        handRaisedCount={handRaisedUsers.length}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={handleScreenShare}
        onToggleRecording={handleRecording}
        onToggleChat={() => setShowChat(!showChat)}
        onToggleParticipants={() => setShowParticipants(!showParticipants)}
        onToggleHandRaise={toggleHandRaise}
        onToggleCaptions={toggleCaptions}
        onSendReaction={sendReaction}
        onLeave={() => setShowLeaveDialog(true)}
        onOpenSettings={() => setShowDeviceSettings(true)}
        onOpenMeetingSettings={() => setShowMeetingSettings(true)}
        chatUnread={useChatStore.getState().unreadCount}
      />
    </div>
  )
}
