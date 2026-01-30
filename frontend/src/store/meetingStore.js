import { create } from 'zustand'
import api from '../lib/api'
import { getSocket } from '../lib/socket'

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

  // Peer connections
  peers: new Map(),

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

      set({
        currentMeeting: meeting,
        isLoading: false
      })
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
    const { currentMeeting, localStream, screenStream, peers } = get()
    
    if (currentMeeting) {
      try {
        await api.post(`/meetings/${currentMeeting.roomId}/leave`)
      } catch (error) {
        console.error('Leave meeting error:', error)
      }

      const socket = getSocket()
      if (socket) {
        socket.emit('room:leave')
      }
    }

    // Stop all media tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop())
    }

    // Close all peer connections
    peers.forEach(peer => peer.destroy())

    set({
      currentMeeting: null,
      participants: [],
      isHost: false,
      localStream: null,
      screenStream: null,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
      isRecording: false,
      peers: new Map()
    })
  },

  endMeeting: async () => {
    const { currentMeeting } = get()
    
    if (currentMeeting) {
      try {
        await api.post(`/meetings/${currentMeeting.roomId}/end`)
      } catch (error) {
        console.error('End meeting error:', error)
      }
    }

    await get().leaveMeeting()
  },

  // Media controls
  setLocalStream: (stream) => set({ localStream: stream }),

  toggleMute: () => {
    const { localStream, isMuted } = get()
    const socket = getSocket()

    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = isMuted
        set({ isMuted: !isMuted })

        if (socket) {
          socket.emit('media:toggle-mute', { isMuted: !isMuted })
        }
      }
    }
  },

  toggleVideo: () => {
    const { localStream, isVideoOff } = get()
    const socket = getSocket()

    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = isVideoOff
        set({ isVideoOff: !isVideoOff })

        if (socket) {
          socket.emit('media:toggle-video', { isVideoOff: !isVideoOff })
        }
      }
    }
  },

  startScreenShare: async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true
      })

      const socket = getSocket()
      set({ screenStream, isScreenSharing: true })

      if (socket) {
        socket.emit('media:screen-share', { isScreenSharing: true })
      }

      // Handle stop sharing from browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        get().stopScreenShare()
      }

      return { success: true, stream: screenStream }
    } catch (error) {
      console.error('Screen share error:', error)
      return { success: false, message: error.message }
    }
  },

  stopScreenShare: () => {
    const { screenStream } = get()
    const socket = getSocket()

    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop())
    }

    if (socket) {
      socket.emit('media:screen-share', { isScreenSharing: false })
    }

    set({ screenStream: null, isScreenSharing: false })
  },

  // Recording
  startRecording: () => {
    const { screenStream, localStream } = get()
    const socket = getSocket()
    const streamToRecord = screenStream || localStream

    if (!streamToRecord) {
      return { success: false, message: 'No stream to record' }
    }

    try {
      const mediaRecorder = new MediaRecorder(streamToRecord, {
        mimeType: 'video/webm;codecs=vp9,opus'
      })

      const recordedChunks = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        
        // Auto-download
        const a = document.createElement('a')
        a.href = url
        a.download = `meeting-recording-${Date.now()}.webm`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        set({ recordedChunks: [] })
      }

      mediaRecorder.start(1000) // Capture every second
      set({ mediaRecorder, isRecording: true, recordedChunks })

      if (socket) {
        socket.emit('recording:started', { roomId: get().currentMeeting?.roomId })
      }

      return { success: true }
    } catch (error) {
      console.error('Recording error:', error)
      return { success: false, message: error.message }
    }
  },

  stopRecording: () => {
    const { mediaRecorder } = get()
    const socket = getSocket()

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }

    if (socket) {
      socket.emit('recording:stopped', { roomId: get().currentMeeting?.roomId })
    }

    set({ mediaRecorder: null, isRecording: false })
  },

  // Participants management
  setParticipants: (participants) => set({ participants }),
  setIsHost: (isHost) => set({ isHost }),

  addParticipant: (participant) => {
    const { participants } = get()
    const exists = participants.find(p => p.user._id === participant.user._id)
    if (!exists) {
      set({ participants: [...participants, participant] })
    }
  },

  removeParticipant: (userId) => {
    const { participants, peers } = get()
    set({ participants: participants.filter(p => p.user._id !== userId) })
    
    if (peers.has(userId)) {
      peers.get(userId).destroy()
      peers.delete(userId)
      set({ peers: new Map(peers) })
    }
  },

  updateParticipant: (userId, data) => {
    const { participants } = get()
    set({
      participants: participants.map(p =>
        p.user._id === userId ? { ...p, ...data } : p
      )
    })
  },

  // Peer connections
  addPeer: (peerId, peer) => {
    const { peers } = get()
    peers.set(peerId, peer)
    set({ peers: new Map(peers) })
  },

  removePeer: (peerId) => {
    const { peers } = get()
    if (peers.has(peerId)) {
      peers.get(peerId).destroy()
      peers.delete(peerId)
      set({ peers: new Map(peers) })
    }
  },

  clearError: () => set({ error: null })
}))
