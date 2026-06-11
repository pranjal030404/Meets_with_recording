import { create } from 'zustand'
import api from '../lib/api'
import { getSocket } from '../lib/socket'
import MediasoupClientService from '../lib/mediasoupClient'

// Singleton mediasoup client
let mediasoupClient = null
export const getMediasoupClient = () => mediasoupClient

export const useMeetingStore = create((set, get) => ({
  currentMeeting: null,
  meetings: [],
  participants: [],
  isHost: false,
  isLoading: false,
  error: null,

  // Local media state
  localStream: null,
  screenStream: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  isRecording: false,
  mediaRecorder: null,
  recordedChunks: [],
  videoQuality: '720p', // '360p', '720p', '1080p'
  isPiP: false,

  // SFU state
  remoteStreams: new Map(), // Map<peerId, { stream, user, audioConsumer, videoConsumer, screenConsumer }>
  producers: { audio: null, video: null, screen: null },
  mediasoupReady: false,

  // Meeting features state
  handRaisedUsers: [],
  isHandRaised: false,
  activeReactions: [],
  pinnedUserId: null,
  spotlightUserId: null,
  activeSpeakerId: null,
  layout: 'grid',
  isWaitingRoom: false,
  waitingRoomUsers: [],
  isMeetingLocked: false,

  // Captions
  captionsEnabled: false,
  captions: [],

  // Devices
  selectedAudioDevice: null,
  selectedVideoDevice: null,
  availableDevices: { audioinput: [], videoinput: [], audiooutput: [] },

  // Recording indicator
  isBeingRecorded: false,
  recordingUser: null,

  // Legacy peers (compat)
  peers: new Map(),

  // =============================================
  // MEETING CRUD
  // =============================================

  createMeeting: async (data = {}) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/meetings', data)
      const { meeting } = response.data.data
      set({ currentMeeting: meeting, isHost: true, isLoading: false })
      return { success: true, meeting }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to create meeting'
      set({ isLoading: false, error: message })
      return { success: false, message }
    }
  },

  joinMeeting: async (roomId) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post(`/meetings/${roomId}/join`)
      const { meeting } = response.data.data
      set({ currentMeeting: meeting, isLoading: false })
      return { success: true, meeting }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to join meeting'
      set({ isLoading: false, error: message })
      return { success: false, message }
    }
  },

  getMeeting: async (roomId) => {
    try {
      const response = await api.get(`/meetings/${roomId}`)
      const { meeting } = response.data.data
      return { success: true, meeting }
    } catch (error) {
      return { success: false, message: error.response?.data?.message }
    }
  },

  getMeetings: async (status) => {
    set({ isLoading: true })
    try {
      const params = status ? { status } : {}
      const response = await api.get('/meetings', { params })
      const { meetings } = response.data.data
      set({ meetings, isLoading: false })
      return { success: true, meetings }
    } catch (error) {
      set({ isLoading: false })
      return { success: false, message: error.response?.data?.message }
    }
  },

  leaveMeeting: async () => {
    const { currentMeeting, localStream, screenStream } = get()

    if (currentMeeting) {
      try { await api.post(`/meetings/${currentMeeting.roomId}/leave`) } catch (e) { console.error('Leave error:', e) }
      const socket = getSocket()
      if (socket) socket.emit('room:leave')
    }

    if (localStream) localStream.getTracks().forEach(t => t.stop())
    if (screenStream) screenStream.getTracks().forEach(t => t.stop())

    if (mediasoupClient) { mediasoupClient.closeAll(); mediasoupClient = null }

    set({
      currentMeeting: null, participants: [], isHost: false,
      localStream: null, screenStream: null,
      isMuted: false, isVideoOff: false, isScreenSharing: false,
      isRecording: false, mediasoupReady: false,
      remoteStreams: new Map(), producers: { audio: null, video: null, screen: null },
      handRaisedUsers: [], isHandRaised: false, activeReactions: [],
      pinnedUserId: null, spotlightUserId: null, activeSpeakerId: null,
      layout: 'grid', isWaitingRoom: false, waitingRoomUsers: [],
      isMeetingLocked: false, captionsEnabled: false, captions: [],
      isBeingRecorded: false, recordingUser: null, peers: new Map()
    })
  },

  endMeeting: async () => {
    const { currentMeeting } = get()
    if (currentMeeting) {
      try { await api.post(`/meetings/${currentMeeting.roomId}/end`) } catch (e) { console.error('End error:', e) }
    }
    await get().leaveMeeting()
  },

  // =============================================
  // SFU INITIALIZATION
  // =============================================

  initMediasoup: async (socket, roomId) => {
    try {
      mediasoupClient = new MediasoupClientService()
      await mediasoupClient.init(socket, roomId)
      await mediasoupClient.createSendTransport()
      await mediasoupClient.createRecvTransport()
      set({ mediasoupReady: true })
      return { success: true }
    } catch (error) {
      console.error('Mediasoup init error:', error)
      mediasoupClient = null
      set({ mediasoupReady: false })
      return { success: false, message: error.message }
    }
  },

  produceAudio: async (track) => {
    if (!mediasoupClient) return
    try {
      const producer = await mediasoupClient.produceAudio(track)
      set(s => ({ producers: { ...s.producers, audio: producer } }))
      return producer
    } catch (e) { console.error('Produce audio error:', e) }
  },

  produceVideo: async (track) => {
    if (!mediasoupClient) return
    try {
      const producer = await mediasoupClient.produceVideo(track)
      set(s => ({ producers: { ...s.producers, video: producer } }))
      return producer
    } catch (e) { console.error('Produce video error:', e) }
  },

  produceScreen: async (track) => {
    if (!mediasoupClient) return
    try {
      const producer = await mediasoupClient.produceScreen(track)
      set(s => ({ producers: { ...s.producers, screen: producer } }))
      return producer
    } catch (e) { console.error('Produce screen error:', e) }
  },

  consumeProducer: async (producerId, peerId, peerUser, mediaType) => {
    if (!mediasoupClient) return
    try {
      const consumer = await mediasoupClient.consume(producerId)
      const { remoteStreams } = get()
      const newMap = new Map(remoteStreams)
      let entry = newMap.get(peerId) || {
        stream: new MediaStream(), user: peerUser,
        audioConsumer: null, videoConsumer: null, screenConsumer: null,
      }
      entry.stream.addTrack(consumer.track)
      if (mediaType === 'audio') entry.audioConsumer = consumer
      else if (mediaType === 'video') entry.videoConsumer = consumer
      else if (mediaType === 'screen') entry.screenConsumer = consumer
      entry.user = peerUser
      newMap.set(peerId, { ...entry })
      set({ remoteStreams: newMap })
      return consumer
    } catch (e) { console.error('Consume error:', e) }
  },

  removeConsumer: (producerId, peerId, mediaType) => {
    const { remoteStreams } = get()
    const newMap = new Map(remoteStreams)
    const entry = newMap.get(peerId)
    if (!entry) return
    if (mediaType === 'audio' && entry.audioConsumer) {
      entry.stream.removeTrack(entry.audioConsumer.track); entry.audioConsumer.close(); entry.audioConsumer = null
    } else if (mediaType === 'video' && entry.videoConsumer) {
      entry.stream.removeTrack(entry.videoConsumer.track); entry.videoConsumer.close(); entry.videoConsumer = null
    } else if (mediaType === 'screen' && entry.screenConsumer) {
      entry.stream.removeTrack(entry.screenConsumer.track); entry.screenConsumer.close(); entry.screenConsumer = null
    }
    if (!entry.audioConsumer && !entry.videoConsumer && !entry.screenConsumer) newMap.delete(peerId)
    else newMap.set(peerId, { ...entry })
    set({ remoteStreams: newMap })
  },

  removeRemoteStream: (peerId) => {
    const { remoteStreams } = get()
    const newMap = new Map(remoteStreams)
    const entry = newMap.get(peerId)
    if (entry) {
      if (entry.audioConsumer) entry.audioConsumer.close()
      if (entry.videoConsumer) entry.videoConsumer.close()
      if (entry.screenConsumer) entry.screenConsumer.close()
      newMap.delete(peerId)
    }
    set({ remoteStreams: newMap })
  },

  // =============================================
  // MEDIA CONTROLS — Full track stop/release
  // =============================================

  setLocalStream: (stream) => set({ localStream: stream }),

  toggleMute: async () => {
    const { localStream, isMuted, producers } = get()
    const socket = getSocket()

    if (isMuted) {
      // Unmute: reacquire audio with AI noise suppression
      try {
        const { selectedAudioDevice } = get()
        const audioConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
        if (selectedAudioDevice) {
          audioConstraints.deviceId = { exact: selectedAudioDevice }
        }
        const constraints = { audio: audioConstraints }
        const newStream = await navigator.mediaDevices.getUserMedia(constraints)
        const newAudioTrack = newStream.getAudioTracks()[0]
        if (localStream) {
          localStream.getAudioTracks().forEach(t => localStream.removeTrack(t))
          localStream.addTrack(newAudioTrack)
        }
        if (mediasoupClient) await get().produceAudio(newAudioTrack)
        set({ isMuted: false })
        if (socket) socket.emit('media:toggle-mute', { isMuted: false })
      } catch (error) { console.error('Failed to unmute:', error) }
    } else {
      // Mute: stop audio track fully (release mic permission)
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0]
        if (audioTrack) { audioTrack.stop(); localStream.removeTrack(audioTrack) }
      }
      if (mediasoupClient && producers.audio) {
        await mediasoupClient.closeProducer('audio')
        set(s => ({ producers: { ...s.producers, audio: null } }))
      }
      set({ isMuted: true })
      if (socket) socket.emit('media:toggle-mute', { isMuted: true })
    }
  },

  toggleVideo: async () => {
    const { localStream, isVideoOff, producers } = get()
    const socket = getSocket()

    if (isVideoOff) {
      try {
        const { selectedVideoDevice, videoQuality } = get()
        const qualitySettings = {
          '360p': { width: { ideal: 640 }, height: { ideal: 360 } },
          '720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
          '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } }
        }
        const videoConstraints = {
          ...qualitySettings[videoQuality] || qualitySettings['720p']
        }
        if (selectedVideoDevice) {
          videoConstraints.deviceId = { exact: selectedVideoDevice }
        }
        const newStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints })
        const newVideoTrack = newStream.getVideoTracks()[0]
        if (localStream) {
          localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t) })
          localStream.addTrack(newVideoTrack)
        } else {
          const newLocalStream = new MediaStream([newVideoTrack])
          set({ localStream: newLocalStream })
        }
        if (mediasoupClient) await get().produceVideo(newVideoTrack)
        set({ isVideoOff: false })
        if (socket) socket.emit('media:toggle-video', { isVideoOff: false })
      } catch (error) { console.error('Failed to enable video:', error) }
    } else {
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0]
        if (videoTrack) { videoTrack.stop(); localStream.removeTrack(videoTrack) }
      }
      if (mediasoupClient && producers.video) {
        await mediasoupClient.closeProducer('video')
        set(s => ({ producers: { ...s.producers, video: null } }))
      }
      set({ isVideoOff: true })
      if (socket) socket.emit('media:toggle-video', { isVideoOff: true })
    }
  },

  forceMute: async () => {
    const { localStream, isMuted, producers } = get()
    if (isMuted) return
    if (localStream) {
      const t = localStream.getAudioTracks()[0]
      if (t) { t.stop(); localStream.removeTrack(t) }
    }
    if (mediasoupClient && producers.audio) {
      await mediasoupClient.closeProducer('audio')
      set(s => ({ producers: { ...s.producers, audio: null } }))
    }
    set({ isMuted: true })
  },

  forceVideoOff: async () => {
    const { localStream, isVideoOff, producers } = get()
    if (isVideoOff) return
    if (localStream) {
      const t = localStream.getVideoTracks()[0]
      if (t) { t.stop(); localStream.removeTrack(t) }
    }
    if (mediasoupClient && producers.video) {
      await mediasoupClient.closeProducer('video')
      set(s => ({ producers: { ...s.producers, video: null } }))
    }
    set({ isVideoOff: true })
  },

  // =============================================
  // SCREEN SHARING
  // =============================================

  startScreenShare: async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: true })
      const socket = getSocket()
      set({ screenStream, isScreenSharing: true })

      const screenVideoTrack = screenStream.getVideoTracks()[0]
      if (mediasoupClient && screenVideoTrack) await get().produceScreen(screenVideoTrack)
      if (socket) socket.emit('media:screen-share', { isScreenSharing: true })

      screenVideoTrack.onended = () => { get().stopScreenShare() }
      return { success: true, stream: screenStream }
    } catch (error) {
      console.error('Screen share error:', error)
      const message = error.name === 'NotAllowedError' 
        ? 'Screen sharing permission denied' 
        : error.message
      return { success: false, message }
    }
  },

  stopScreenShare: async () => {
    const { screenStream, producers } = get()
    const socket = getSocket()
    if (screenStream) screenStream.getTracks().forEach(t => t.stop())
    if (mediasoupClient && producers.screen) {
      await mediasoupClient.closeProducer('screen')
      set(s => ({ producers: { ...s.producers, screen: null } }))
    }
    if (socket) socket.emit('media:screen-share', { isScreenSharing: false })
    set({ screenStream: null, isScreenSharing: false })
  },

  // =============================================
  // RECORDING
  // =============================================

  startRecording: () => {
    const { screenStream, localStream, currentMeeting } = get()
    const socket = getSocket()
    const streamToRecord = screenStream || localStream
    if (!streamToRecord) return { success: false, message: 'No stream to record' }
    // Check if stream has active tracks
    const tracks = streamToRecord.getTracks()
    if (tracks.length === 0 || !tracks.some(t => t.readyState === 'live')) {
      return { success: false, message: 'No active audio or video tracks available' }
    }
    try {
      const recordingStartedAt = Date.now()
      const mediaRecorder = new MediaRecorder(streamToRecord, { mimeType: 'video/webm;codecs=vp9,opus' })
      const recordedChunks = []
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data) }
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        const fileName = `meeting-recording-${Date.now()}.webm`
        const a = document.createElement('a'); a.href = url
        a.download = fileName
        document.body.appendChild(a); a.click(); document.body.removeChild(a)

        if (currentMeeting?.roomId) {
          const durationSeconds = Number(((Date.now() - recordingStartedAt) / 1000).toFixed(2))
          const formData = new FormData()
          formData.append('recording', blob, fileName)
          formData.append('duration', String(durationSeconds))
          formData.append('mimeType', blob.type || 'video/webm')

          api.post(`/meetings/${currentMeeting.roomId}/recordings`, formData)
            .catch((error) => {
              console.error('Recording upload error:', error)
            })
        }

        URL.revokeObjectURL(url); set({ recordedChunks: [] })
      }
      mediaRecorder.start(1000)
      set({ mediaRecorder, isRecording: true, recordedChunks })
      if (socket) socket.emit('recording:started', { roomId: currentMeeting?.roomId })
      return { success: true }
    } catch (error) {
      console.error('Recording error:', error); return { success: false, message: error.message }
    }
  },

  stopRecording: () => {
    const { mediaRecorder, currentMeeting } = get()
    const socket = getSocket()
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    if (socket) socket.emit('recording:stopped', { roomId: currentMeeting?.roomId })
    set({ mediaRecorder: null, isRecording: false })
  },

  // =============================================
  // HAND RAISE
  // =============================================

  toggleHandRaise: () => {
    const { isHandRaised, currentMeeting } = get()
    const socket = getSocket()
    const newState = !isHandRaised
    set({ isHandRaised: newState })
    if (socket && currentMeeting) socket.emit('reaction:hand-raise', { roomId: currentMeeting.roomId, isRaised: newState })
  },

  addHandRaise: (userId, userName) => {
    const { handRaisedUsers } = get()
    if (!handRaisedUsers.find(h => h.userId === userId)) {
      set({ handRaisedUsers: [...handRaisedUsers, { userId, userName, timestamp: Date.now() }] })
    }
  },

  removeHandRaise: (userId) => {
    set({ handRaisedUsers: get().handRaisedUsers.filter(h => h.userId !== userId) })
  },

  lowerAllHands: () => set({ handRaisedUsers: [], isHandRaised: false }),

  // =============================================
  // EMOJI REACTIONS
  // =============================================

  addReaction: (userId, userName, emoji) => {
    const id = `${userId}-${Date.now()}`
    set({ activeReactions: [...get().activeReactions, { id, userId, userName, emoji, timestamp: Date.now() }] })
    setTimeout(() => { set({ activeReactions: get().activeReactions.filter(r => r.id !== id) }) }, 3000)
  },

  sendReaction: (emoji) => {
    const { currentMeeting } = get()
    const socket = getSocket()
    if (socket && currentMeeting) socket.emit('reaction:emoji', { roomId: currentMeeting.roomId, emoji })
  },

  // =============================================
  // LAYOUT & PINNING
  // =============================================

  setLayout: (layout) => set({ layout }),

  pinUser: (userId) => set({ pinnedUserId: get().pinnedUserId === userId ? null : userId }),

  spotlightUser: (userId) => {
    const socket = getSocket()
    const { currentMeeting } = get()
    if (socket && currentMeeting) socket.emit('host:spotlight', { roomId: currentMeeting.roomId, userId })
    set({ spotlightUserId: userId })
  },

  clearSpotlight: () => {
    const socket = getSocket()
    const { currentMeeting } = get()
    if (socket && currentMeeting) socket.emit('host:spotlight', { roomId: currentMeeting.roomId, userId: null })
    set({ spotlightUserId: null })
  },

  setActiveSpeaker: (userId) => set({ activeSpeakerId: userId }),

  // =============================================
  // WAITING ROOM
  // =============================================

  addToWaitingRoom: (user, socketId) => {
    set({ waitingRoomUsers: [...get().waitingRoomUsers, { user, socketId }] })
  },

  admitFromWaitingRoom: (socketId) => {
    const socket = getSocket()
    const { currentMeeting, waitingRoomUsers } = get()
    if (socket && currentMeeting) {
      socket.emit('host:admit-user', { roomId: currentMeeting.roomId, targetSocketId: socketId })
      set({ waitingRoomUsers: waitingRoomUsers.filter(u => u.socketId !== socketId) })
    }
  },

  denyFromWaitingRoom: (socketId) => {
    const socket = getSocket()
    const { currentMeeting, waitingRoomUsers } = get()
    if (socket && currentMeeting) {
      socket.emit('host:deny-user', { roomId: currentMeeting.roomId, targetSocketId: socketId })
      set({ waitingRoomUsers: waitingRoomUsers.filter(u => u.socketId !== socketId) })
    }
  },

  // =============================================
  // MEETING LOCK
  // =============================================

  toggleMeetingLock: () => {
    const socket = getSocket()
    const { currentMeeting, isMeetingLocked } = get()
    if (socket && currentMeeting) {
      socket.emit('host:lock-meeting', { roomId: currentMeeting.roomId, isLocked: !isMeetingLocked })
      set({ isMeetingLocked: !isMeetingLocked })
    }
  },

  // =============================================
  // CAPTIONS
  // =============================================

  toggleCaptions: () => set({ captionsEnabled: !get().captionsEnabled }),

  addCaption: (userId, userName, text) => {
    const updated = [...get().captions, { userId, userName, text, timestamp: Date.now() }]
    set({ captions: updated.slice(-10) })
  },

  setVideoQuality: (quality) => set({ videoQuality: quality }),

  // Picture-in-Picture
  enablePiP: async () => {
    try {
      const videoElement = document.querySelector('video[data-local="true"]')
      if (videoElement && document.pictureInPictureEnabled && videoElement !== document.pictureInPictureElement) {
        await videoElement.requestPictureInPicture()
        set({ isPiP: true })
      }
    } catch (error) {
      console.error('PiP error:', error)
    }
  },

  disablePiP: async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        set({ isPiP: false })
      }
    } catch (error) {
      console.error('Exit PiP error:', error)
    }
  },
  // =============================================
  // DEVICE MANAGEMENT
  // =============================================

  setSelectedAudioDevice: (deviceId) => set({ selectedAudioDevice: deviceId }),
  setSelectedVideoDevice: (deviceId) => set({ selectedVideoDevice: deviceId }),

  enumerateDevices: async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      set({
        availableDevices: {
          audioinput: devices.filter(d => d.kind === 'audioinput'),
          videoinput: devices.filter(d => d.kind === 'videoinput'),
          audiooutput: devices.filter(d => d.kind === 'audiooutput'),
        }
      })
    } catch (e) { console.error('Enumerate devices error:', e) }
  },

  switchAudioDevice: async (deviceId) => {
    const { localStream, isMuted, producers } = get()
    set({ selectedAudioDevice: deviceId })
    if (isMuted) return
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } })
      const newTrack = ns.getAudioTracks()[0]
      if (localStream) {
        localStream.getAudioTracks().forEach(t => { t.stop(); localStream.removeTrack(t) })
        localStream.addTrack(newTrack)
      }
      if (mediasoupClient && producers.audio) await producers.audio.replaceTrack({ track: newTrack })
    } catch (e) { console.error('Switch audio error:', e) }
  },

  switchVideoDevice: async (deviceId) => {
    const { localStream, isVideoOff, producers } = get()
    set({ selectedVideoDevice: deviceId })
    if (isVideoOff) return
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: 640, height: 480 } })
      const newTrack = ns.getVideoTracks()[0]
      if (localStream) {
        localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t) })
        localStream.addTrack(newTrack)
      }
      if (mediasoupClient && producers.video) await producers.video.replaceTrack({ track: newTrack })
    } catch (e) { console.error('Switch video error:', e) }
  },

  // =============================================
  // RECORDING INDICATOR
  // =============================================

  setBeingRecorded: (isRecording, userName = null) => set({ isBeingRecorded: isRecording, recordingUser: userName }),

  // =============================================
  // PARTICIPANTS MANAGEMENT
  // =============================================

  setParticipants: (participants) => set({ participants }),
  setIsHost: (isHost) => set({ isHost }),

  addParticipant: (participant) => {
    const { participants } = get()
    const pid = participant.user?.id || participant.user?._id
    if (!participants.find(p => (p.user?.id || p.user?._id) === pid)) {
      set({ participants: [...participants, participant] })
    }
  },

  removeParticipant: (userId) => {
    set({ participants: get().participants.filter(p => (p.user?.id || p.user?._id) !== userId) })
    get().removeRemoteStream(userId)
    get().removeHandRaise(userId)
  },

  updateParticipant: (userId, data) => {
    set({
      participants: get().participants.map(p =>
        (p.user?.id || p.user?._id) === userId ? { ...p, ...data } : p
      )
    })
  },

  addPeer: (peerId, peer) => {
    const { peers } = get(); peers.set(peerId, peer); set({ peers: new Map(peers) })
  },

  removePeer: (peerId) => {
    const { peers } = get()
    if (peers.has(peerId)) { const p = peers.get(peerId); if (p?.destroy) p.destroy(); peers.delete(peerId); set({ peers: new Map(peers) }) }
  },

  clearError: () => set({ error: null })
}))
