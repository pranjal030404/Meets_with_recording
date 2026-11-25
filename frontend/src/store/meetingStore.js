import { create } from 'zustand'
import api from '../lib/api'
import { getSocket, initSocket, setNodeUnreachableHandler } from '../lib/socket'
import { preferredSpatialLayer } from '../lib/subscriptionPolicy'
import toast from 'react-hot-toast'
import { isBreakoutRoomId } from '../lib/breakout'
import { createCompositeVideo } from '../lib/compositeRecorder'
import { withBackground, savedBackground, saveBackground } from '../lib/backgroundEffect'
import { useAuthStore } from './authStore'
import { canTransition, canMove, SCREEN_SHARE_TRANSITIONS, MEDIA_LINK_TRANSITIONS } from '../lib/sessionMachine'

// Singleton mediasoup client
let mediasoupClient = null
let levelMonitor = null
// Producers being consumed right now / already consumed / closed mid-flight. Several people switching
// cameras on at once means overlapping newProducer + existingProducers events for the same producer.
const consumeInFlight = new Map() // producerId -> Promise<consumer>
const consumedProducers = new Set()
const closedProducers = new Set()

// ---- Selective subscription -------------------------------------------------------------------
// Every producer the room announces lands in the catalog; the reconciler decides which ones we actually
// consume (server enforces the same budget: backend/src/media/subscriptionPolicy.js).
const producerCatalog = new Map() // producerId -> { peerId, user, mediaType, announcedAt, deniedAt }
let mediaPolicy = { mode: 'small', maxVideo: 1e9, maxAudio: 1e9, maxScreen: 4 } // permissive until the server announces
let activeSpeakerPeers = new Set()
let reconcileTimer = null
let reconciling = false
let reconcileAgain = false
const appliedLayers = new Map() // consumerId -> spatial layer last requested
const DENY_COOLDOWN_MS = 3000
const PRIORITY_EXTRA = 4
let unsubscribeInterest = null
let recovering = false

// Recording mixer: one audio track containing EVERYONE (you + all remote voices + shared-tab audio),
// so the recording has the whole meeting's sound, not just your microphone.
let recordingMixer = null
const mixerAdd = (track) => {
  if (!recordingMixer || !track || track.kind !== 'audio' || recordingMixer.nodes.has(track.id)) return
  try {
    const node = recordingMixer.ctx.createMediaStreamSource(new MediaStream([track]))
    node.connect(recordingMixer.dest)
    recordingMixer.nodes.set(track.id, node)
  } catch (e) { console.warn('Recording mixer: could not add track', e.message) }
}
const mixerStop = () => {
  if (!recordingMixer) return
  try { recordingMixer.ctx.close() } catch { /* already closed */ }
  recordingMixer = null
}
/** Everyone's picture right now, for the composite used by recording and the pop-out window. */
export const meetingTiles = (selfSuffix = '') => {
  const { localStream, screenStream, remoteStreams, participants, isVideoOff } = useMeetingStore.getState()
  const me = useAuthStore.getState().user
  const live = (stream) => stream?.getVideoTracks().find(t => t.readyState === 'live') || null
  const tiles = [{ id: 'me', name: [me?.name || 'You', selfSuffix].filter(Boolean).join(' '), track: isVideoOff ? null : live(localStream) }]
  if (screenStream) tiles.push({ id: 'my-screen', name: `${me?.name || 'You'}'s screen`, track: live(screenStream), isScreen: true })
  for (const [peerId, entry] of remoteStreams) {
    const info = participants.find(p => (p.user?.id || p.user?._id) === peerId)
    const name = entry.user?.name || info?.user?.name || 'Participant'
    tiles.push({ id: peerId, name, track: info?.isVideoOff ? null : live(entry.stream) })
    if (entry.screenStream) tiles.push({ id: `${peerId}-screen`, name: `${name}'s screen`, track: live(entry.screenStream), isScreen: true })
  }
  // people who have sent no media yet still belong in the picture
  for (const p of participants) {
    const id = p.user?.id || p.user?._id
    if (id && id !== me?.id && !remoteStreams.has(id)) tiles.push({ id, name: p.user.name, track: null })
  }
  return tiles
}

// A newly opened camera with the background effect applied; if that fails the camera is closed again
const freshCamera = async (track) => {
  try { return await withBackground(track) } catch (error) { track.stop(); throw error }
}

const stopLevelMonitor = () => {
  if (!levelMonitor) return
  clearInterval(levelMonitor.interval)
  levelMonitor.audioCtx.close?.().catch?.(() => {})
  levelMonitor = null
}
export const getMediasoupClient = () => mediasoupClient

// Everything that belongs to ONE joined session. Used for the initial state AND the reset on leave,
// so a flag added here can never be forgotten in the reset (and Maps/arrays are always fresh objects).
const sessionDefaults = () => ({
  // idle | joining | waiting | connected | leaving  (see lib/sessionMachine.js)
  sessionPhase: 'idle',
  localStream: null,
  screenStream: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  screenSharePhase: 'idle', // idle | requesting | sharing | stopping (see SCREEN_SHARE_TRANSITIONS)
  mediaLink: 'new', // SFU transport health: new | connecting | connected | disconnected | reconnecting | failed | closed
  isRecording: false,
  mediaRecorder: null,
  recordedChunks: [],
  isPiP: false,
  background: savedBackground().mode, // off | blur | image

  remoteStreams: new Map(),
  producers: { audio: null, video: null, screen: null },
  mediasoupReady: false,
  socketEpoch: 0, // bumps when failover replaces the socket (Meeting.jsx re-binds its listeners)

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

  captionsEnabled: false,
  captions: [],

  audioLevel: 0,
  isSpeaking: false,

  isBeingRecorded: false,
  recordingUpload: 'idle', // idle | uploading | uploaded | failed
  recordingUser: null,

  peers: new Map()
})

export const useMeetingStore = create((set, get) => ({
  currentMeeting: null,
  meetings: [],
  participants: [],
  isHost: false,
  isCoHost: false,
  myRole: 'participant',
  isLoading: false,
  error: null,

  // Per-session state (media, SFU, hands/layout, waiting room, captions, recording indicator, peers)
  ...sessionDefaults(),

  // Preferences that survive leaving a meeting
  videoQuality: '720p', // '360p', '720p', '1080p'
  mirrorSelf: true,
  hideSelf: false,
  audioProcessing: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  selectedAudioDevice: null,
  selectedVideoDevice: null,
  selectedAudioOutputDevice: null,
  availableDevices: { audioinput: [], videoinput: [], audiooutput: [] },

  // =============================================
  // MEETING CRUD
  // =============================================

  createMeeting: async (data = {}) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/meetings', data)
      const { meeting } = response.data.data
      set({ currentMeeting: meeting, isHost: true, isCoHost: false, myRole: 'host', isLoading: false })
      return { success: true, meeting }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to create meeting'
      set({ isLoading: false, error: message })
      return { success: false, message }
    }
  },

  // The only way to change the session phase; refuses illegal jumps. isWaitingRoom is derived from it.
  setSessionPhase: (next) => {
    const current = get().sessionPhase
    if (!canTransition(current, next)) {
      console.warn(`Ignored session transition ${current} -> ${next}`)
      return false
    }
    set({ sessionPhase: next, isWaitingRoom: next === 'waiting' })
    return true
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
    // A second concurrent call (button + unmount cleanup, meeting:ended + click) must not skip ahead to idle
    if (get().sessionPhase === 'leaving') return
    const { currentMeeting, localStream, screenStream, mediaRecorder } = get()
    if (get().sessionPhase !== 'idle') get().setSessionPhase('leaving')

    // Leaving mid-recording: finish it so the file still gets saved/uploaded (its handler holds its own meeting ref)
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop() } catch { /* already stopped */ }
    }

    if (currentMeeting) {
      // A breakout room shares the parent's meeting record; leaving it must not end that meeting
      if (!isBreakoutRoomId(window.location.pathname.split('/meeting/')[1])) {
        try { await api.post(`/meetings/${currentMeeting.roomId}/leave`) } catch (e) { console.error('Leave error:', e) }
      }
      const socket = getSocket()
      if (socket) socket.emit('room:leave')
    }

    if (localStream) localStream.getTracks().forEach(t => t.stop())
    if (screenStream) screenStream.getTracks().forEach(t => t.stop())

    consumeInFlight.clear(); consumedProducers.clear(); closedProducers.clear()
    producerCatalog.clear(); appliedLayers.clear(); activeSpeakerPeers = new Set(); clearTimeout(reconcileTimer)
    mediaPolicy = { mode: 'small', maxVideo: 1e9, maxAudio: 1e9, maxScreen: 4 }
    unsubscribeInterest?.(); unsubscribeInterest = null; setNodeUnreachableHandler(null)
    if (mediasoupClient) { mediasoupClient.closeAll(); mediasoupClient = null }
    stopLevelMonitor()

    set({
      currentMeeting: null, participants: [], isHost: false, isCoHost: false, myRole: 'participant',
      ...sessionDefaults()
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
      // Loaded on demand: the 220 KB media library is only needed once you are actually in a meeting
      const { default: MediasoupClientService } = await import('../lib/mediasoupClient')
      mediasoupClient = new MediasoupClientService()
      mediasoupClient.onLinkChange = (state) => get().setMediaLink(state)
      mediasoupClient.onDiagnostic = (msg) => toast.error(msg, { id: 'media-diagnostic', duration: 20000 })
      await mediasoupClient.init(socket, roomId)
      unsubscribeInterest?.()
      unsubscribeInterest = useMeetingStore.subscribe((st, prev) => {
        if (st.pinnedUserId !== prev.pinnedUserId || st.spotlightUserId !== prev.spotlightUserId) get().reconcileSubscriptions()
      })
      setNodeUnreachableHandler(() => get().recoverMedia('node-unreachable'))
      await Promise.all([mediasoupClient._ensureSendTransport(), mediasoupClient._ensureRecvTransport()])
      set({ mediasoupReady: true })
      return { success: true }
    } catch (error) {
      console.error('Mediasoup init error:', error)
      mediasoupClient = null
      if (error.redirect) setTimeout(() => get().recoverMedia('redirect'), 0) // meeting lives on another node
      set({ mediasoupReady: false })
      return { success: false, message: error.message }
    }
  },

  /**
   * Failover: the media path is gone (worker crashed, node died, or the meeting is owned elsewhere).
   * WebRTC transports cannot migrate, so: re-resolve the owner node, reconnect the socket if it changed,
   * discard all local media state, rebuild transports, republish our tracks and re-join the room.
   * Retries with backoff while the old node is still being declared dead (~heartbeat TTL).
   */
  recoverMedia: async (reason) => {
    const { currentMeeting } = get()
    if (recovering || !currentMeeting) return
    recovering = true
    set({ mediaLink: 'reconnecting' })
    toast.loading('Reconnecting media…', { id: 'media-recover' })
    try {
      const roomId = currentMeeting.roomId
      const token = getSocket()?.auth?.token
      for (let attempt = 0; attempt < 8; attempt++) {
        if (get().sessionPhase === 'leaving' || get().sessionPhase === 'idle') return
        try {
          const { data: placement } = await api.get(`/meetings/${encodeURIComponent(roomId)}/placement`)
          let socket = getSocket()
          const moved = (placement.url || '') !== ((socket?.__target ?? '') === '' ? '' : socket.__target) && placement.url
          if (moved || !socket?.connected) {
            // Same owner and still disconnected => it may simply be restarting: wait and retry
            if (!moved && socket && !socket.connected && reason === 'node-unreachable') throw new Error('owner not reachable yet')
            if (moved) { socket = initSocket(token, placement.url); set({ socketEpoch: get().socketEpoch + 1 }) }
            await new Promise((res, rej) => { if (socket.connected) return res(); const t = setTimeout(() => rej(new Error('socket timeout')), 8000); socket.once('connect', () => { clearTimeout(t); res() }) })
          }
          // Tear down every piece of local media state tied to the dead transports
          consumeInFlight.clear(); consumedProducers.clear(); closedProducers.clear(); producerCatalog.clear(); appliedLayers.clear()
          for (const e of get().remoteStreams.values()) for (const c of [e.audioConsumer, e.videoConsumer, e.screenConsumer]) { try { c?.close() } catch { /* already closed */ } }
          set({ remoteStreams: new Map(), producers: { audio: null, video: null, screen: null } })
          if (mediasoupClient) { mediasoupClient.closeAll(); mediasoupClient = null }
          const res = await get().initMediasoup(socket, roomId)
          if (!res.success) throw new Error(res.message || 'media init failed')
          const { localStream, screenStream, isMuted, isVideoOff, isScreenSharing } = get()
          const a = localStream?.getAudioTracks()[0], v = localStream?.getVideoTracks()[0], sc = screenStream?.getVideoTracks()[0]
          await Promise.all([
            a && a.readyState === 'live' && !isMuted ? get().produceAudio(a) : null,
            v && v.readyState === 'live' && !isVideoOff ? get().produceVideo(v) : null,
            isScreenSharing && sc && sc.readyState === 'live' ? get().produceScreen(sc) : null,
          ])
          socket.emit('room:join', { roomId }) // server answers with participants + existing producers => normal consume path
          toast.success('Media reconnected', { id: 'media-recover' })
          return
        } catch (e) {
          await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)))
        }
      }
      toast.error('Could not restore the media connection. Please rejoin the meeting.', { id: 'media-recover', duration: 15000 })
    } finally { recovering = false }
  },

  produceAudio: async (track) => {
    if (!mediasoupClient) return
    try {
      const producer = await mediasoupClient.produceAudio(track)
      set(s => ({ producers: { ...s.producers, audio: producer } }))
      return producer
    } catch (e) { if (e?.code === 'WEBINAR_VIEW_ONLY') toast('Webinar mode: only hosts can present', { id: 'webinar-view-only', icon: '🎤' }); else console.error('Produce audio error:', e) }
  },

  /** Switch background blur / picture, for the camera that is on now and every later one. */
  setBackground: async (mode, image) => {
    saveBackground(mode, image)
    set({ background: mode })
    const { localStream, isVideoOff, producers } = get()
    const current = localStream?.getVideoTracks()[0]
    if (!current || isVideoOff) return
    const raw = current.rawTrack || current
    try {
      const next = await withBackground(raw)
      localStream.removeTrack(current)
      localStream.addTrack(next)
      if (producers.video) await producers.video.replaceTrack({ track: next })
      current.release?.() // stops the old effect, not the camera
    } catch (error) {
      console.error('Background effect error:', error)
      toast.error('Background effects are not available in this browser', { id: 'background' })
    }
  },

  /** The pre-join screen hands over a plain camera track: apply the saved effect before it is sent. */
  applySavedBackground: async () => {
    const { localStream } = get()
    const raw = localStream?.getVideoTracks()[0]
    if (!raw || raw.rawTrack || savedBackground().mode === 'off') return
    try {
      const next = await withBackground(raw)
      localStream.removeTrack(raw)
      localStream.addTrack(next)
    } catch (error) {
      // never show a room the person asked to hide: turn the camera off instead
      console.error('Background effect error:', error)
      raw.stop()
      localStream.removeTrack(raw)
      set({ isVideoOff: true })
      toast.error('Background effect failed, so your camera was left off', { id: 'background' })
    }
  },

  produceVideo: async (track) => {
    if (!mediasoupClient) return
    try {
      const producer = await mediasoupClient.produceVideo(track)
      set(s => ({ producers: { ...s.producers, video: producer } }))
      return producer
    } catch (e) { if (e?.code === 'WEBINAR_VIEW_ONLY') toast('Webinar mode: only hosts can present', { id: 'webinar-view-only', icon: '🎤' }); else console.error('Produce video error:', e) }
  },

  produceScreen: async (track) => {
    if (!mediasoupClient) return
    try {
      const producer = await mediasoupClient.produceScreen(track)
      set(s => ({ producers: { ...s.producers, screen: producer } }))
      return producer
    } catch (e) { if (e?.code === 'WEBINAR_VIEW_ONLY') toast('Webinar mode: only hosts can present', { id: 'webinar-view-only', icon: '🎤' }); else console.error('Produce screen error:', e) }
  },

  // Announce a remote producer. Whether it is actually consumed is the reconciler's decision.
  consumeProducer: async (producerId, peerId, peerUser, mediaType) => {
    if (!mediasoupClient) return
    if (!producerCatalog.has(producerId)) producerCatalog.set(producerId, { peerId, user: peerUser, mediaType, announcedAt: Date.now(), deniedAt: 0 })
    return get().reconcileSubscriptions()
  },

  forgetProducer: (producerId) => { producerCatalog.delete(producerId); get().reconcileSubscriptions() },

  setMediaPolicy: (policy) => { mediaPolicy = { ...mediaPolicy, ...policy }; get().reconcileSubscriptions() },
  setActiveSpeakers: (userIds) => { activeSpeakerPeers = new Set(userIds || []); get().reconcileSubscriptions() },

  // Coalesces bursts (a room of 50 joining at once) into one pass
  reconcileSubscriptions: () => new Promise((resolve) => {
    clearTimeout(reconcileTimer)
    reconcileTimer = setTimeout(() => { get()._reconcile().finally(resolve) }, 30)
  }),

  _reconcile: async () => {
    if (!mediasoupClient) return
    if (reconciling) { reconcileAgain = true; return }
    reconciling = true
    try {
      do {
        reconcileAgain = false
        const { pinnedUserId, spotlightUserId } = get()
        const now = Date.now()
        const isPinned = (peerId) => peerId === pinnedUserId || peerId === spotlightUserId
        const priorityOf = (e) => (isPinned(e.peerId) ? 0 : activeSpeakerPeers.has(e.peerId) ? 1 : 2)
        const rank = (id, e) => [priorityOf(e), consumedProducers.has(id) ? 0 : 1, e.announcedAt]
        const cmp = (a, b) => { const ra = rank(...a), rb = rank(...b); return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] }
        const byType = (t) => [...producerCatalog].filter(([, e]) => e.mediaType === t).sort(cmp)
        // Soft cap, plus bounded extra room for pinned/speaking peers (mirrors the server rule)
        const pick = (list, max) => list.filter(([, e], i) => i < max || (priorityOf(e) < 2 && i < max + PRIORITY_EXTRA))
        const desired = new Set([
          ...byType('screen').slice(0, mediaPolicy.maxScreen ?? 4).map(([id]) => id),
          ...pick(byType('video'), mediaPolicy.maxVideo).map(([id]) => id),
          ...pick(byType('audio'), mediaPolicy.maxAudio).map(([id]) => id),
        ])

        // 1. drop what is no longer wanted (video/audio only; the SFU stops forwarding it)
        for (const [id, e] of producerCatalog) {
          if (consumedProducers.has(id) && !desired.has(id) && e.mediaType !== 'screen') get().removeConsumer(id, e.peerId, e.mediaType)
        }
        // 2. start what is wanted
        const starts = []
        for (const id of desired) {
          const e = producerCatalog.get(id)
          if (!e || consumedProducers.has(id) || consumeInFlight.has(id) || now - e.deniedAt < DENY_COOLDOWN_MS) continue
          const job = get()._consumeProducer(id, e.peerId, e.user, e.mediaType, isPinned(e.peerId) ? 'pinned' : undefined)
            .finally(() => consumeInFlight.delete(id))
          consumeInFlight.set(id, job)
          starts.push(job)
        }
        await Promise.all(starts)
        // 3. quality: thumbnails low, pinned/speaker high
        get()._applyLayers(isPinned)
      } while (reconcileAgain)
    } finally { reconciling = false }
  },

  _applyLayers: (isPinned) => {
    if (!mediasoupClient) return
    const entries = [...get().remoteStreams.values()].filter((e) => e.videoConsumer)
    for (const e of entries) {
      const c = e.videoConsumer
      const peerId = e.user?._id || e.user?.id
      const layer = preferredSpatialLayer({ mode: mediaPolicy.mode, pinned: isPinned(peerId), activeSpeaker: activeSpeakerPeers.has(peerId), tileCount: entries.length })
      if (appliedLayers.get(c.id) === layer) continue
      appliedLayers.set(c.id, layer)
      mediasoupClient.setConsumerLayers(c.id, layer).catch(() => appliedLayers.delete(c.id))
    }
  },

  _consumeProducer: async (producerId, peerId, peerUser, mediaType, priority) => {
    try {
      closedProducers.delete(producerId)
      // One retry: the producer can briefly be unknown to the SFU while many peers publish at once.
      // A subscription-limit denial is a decision, not a glitch: never retry it, back off instead.
      let consumer
      try { consumer = await mediasoupClient.consume(producerId, { priority }) }
      catch (e) {
        if (e.code === 'SUBSCRIPTION_LIMIT') { const c = producerCatalog.get(producerId); if (c) c.deniedAt = Date.now(); return }
        await new Promise(r => setTimeout(r, 400)); consumer = await mediasoupClient.consume(producerId, { priority })
      }
      if (closedProducers.has(producerId)) { consumer.close(); closedProducers.delete(producerId); return }
      consumedProducers.add(producerId)
      const { remoteStreams } = get()
      const newMap = new Map(remoteStreams)
      let entry = newMap.get(peerId) || {
        stream: new MediaStream(), screenStream: null, user: peerUser,
        audioConsumer: null, videoConsumer: null, screenConsumer: null,
      }
      // The shared screen gets its OWN stream. Mixed into the camera stream, a <video> plays whichever
      // video track came first, so the share view could show the camera (or nothing) instead of the screen.
      if (mediaType === 'screen') {
        entry.screenStream = new MediaStream([consumer.track])
      } else {
        entry.stream.addTrack(consumer.track)
      }
      if (mediaType === 'audio') entry.audioConsumer = consumer
      else if (mediaType === 'video') entry.videoConsumer = consumer
      else if (mediaType === 'screen') entry.screenConsumer = consumer
      if (mediaType === 'audio') mixerAdd(consumer.track)
      entry.user = peerUser
      newMap.set(peerId, { ...entry })
      set({ remoteStreams: newMap })
      return consumer
    } catch (e) { console.error('Consume error:', e) }
  },

  removeConsumer: (producerId, peerId, mediaType) => {
    consumedProducers.delete(producerId)
    if (consumeInFlight.has(producerId)) closedProducers.add(producerId)
    const { remoteStreams } = get()
    const newMap = new Map(remoteStreams)
    const entry = newMap.get(peerId)
    if (!entry) return
    // Only remove the consumer that belongs to THIS producer (a newer one for the same kind may already exist)
    const isMine = (c) => c && (!producerId || c.producerId === producerId)
    for (const c of [entry.audioConsumer, entry.videoConsumer, entry.screenConsumer]) if (isMine(c) && c.producerId === producerId) { appliedLayers.delete(c.id); mediasoupClient?.notifyConsumerClosed(c.id) }
    if (mediaType === 'audio' && isMine(entry.audioConsumer)) {
      entry.stream.removeTrack(entry.audioConsumer.track); entry.audioConsumer.close(); entry.audioConsumer = null
    } else if (mediaType === 'video' && isMine(entry.videoConsumer)) {
      entry.stream.removeTrack(entry.videoConsumer.track); entry.videoConsumer.close(); entry.videoConsumer = null
    } else if (mediaType === 'screen' && isMine(entry.screenConsumer)) {
      entry.screenConsumer.close(); entry.screenConsumer = null; entry.screenStream = null
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
      for (const c of [entry.audioConsumer, entry.videoConsumer, entry.screenConsumer]) if (c) consumedProducers.delete(c.producerId)
      for (const [id, e] of producerCatalog) if (e.peerId === peerId) producerCatalog.delete(id)
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

  getAudioConstraints: () => {
    const { selectedAudioDevice, audioProcessing } = get()
    const constraints = {
      ...audioProcessing,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: 1 },
    }
    if (selectedAudioDevice) {
      constraints.deviceId = { exact: selectedAudioDevice }
    }
    return constraints
  },

  startAudioLevelMonitor: () => {
    stopLevelMonitor() // one monitor at a time (they used to pile up on every unmute)
    const { localStream } = get()
    if (!localStream) return
    const audioTrack = localStream.getAudioTracks()[0]
    if (!audioTrack) return

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtx.resume?.()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      audioCtx.createMediaStreamSource(new MediaStream([audioTrack])).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      let holdUntil = 0

      const interval = setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (let i = 0; i < samples.length; i++) { const v = (samples[i] - 128) / 128; sum += v * v }
        const rms = Math.sqrt(sum / samples.length)
        const level = Math.min(1, rms * 5)
        const now = Date.now()
        if (rms > 0.015) holdUntil = now + 350 // short hold so the light doesn't flicker between words
        set({ audioLevel: level, isSpeaking: now < holdUntil })
      }, 100)

      levelMonitor = { interval, audioCtx }
    } catch (e) {
      console.error('Audio level monitor error:', e)
    }
  },

  toggleMute: async () => {
    const state = get()
    const { localStream, isMuted, producers } = state
    const socket = getSocket()

    if (isMuted) {
      try {
        const constraints = { audio: get().getAudioConstraints() }
        const gumStream = await navigator.mediaDevices.getUserMedia(constraints)
        const newAudioTrack = gumStream.getAudioTracks()[0]

        let targetStream = localStream
        if (!targetStream) {
          targetStream = new MediaStream()
          set({ localStream: targetStream })
        }

        targetStream.getAudioTracks().forEach(t => { t.stop(); targetStream.removeTrack(t) })
        targetStream.addTrack(newAudioTrack)
        gumStream.getTracks().forEach(t => { if (t !== newAudioTrack) t.stop() })

        if (mediasoupClient) await get().produceAudio(newAudioTrack)
        mixerAdd(newAudioTrack)
        set({ isMuted: false })
        get().startAudioLevelMonitor()
        if (socket) socket.emit('media:toggle-mute', { isMuted: false })
      } catch (error) {
        console.error('Failed to unmute:', error)
        if (error.name === 'NotAllowedError') {
          toast.error('Microphone permission denied. Check browser settings.')
        } else if (error.name === 'NotFoundError') {
          toast.error('No microphone found. Connect a mic and try again.')
        } else {
          toast.error('Failed to access microphone. Please check your permissions.')
        }
      }
    } else {
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0]
        if (audioTrack) { audioTrack.stop(); localStream.removeTrack(audioTrack) }
      }
      if (mediasoupClient && producers.audio) {
        await mediasoupClient.closeProducer('audio')
        set(s => ({ producers: { ...s.producers, audio: null } }))
      }
      stopLevelMonitor()
      set({ isMuted: true, audioLevel: 0, isSpeaking: false })
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
          '360p': { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 } },
          '720p': { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
        }
        const videoConstraints = {
          ...qualitySettings[videoQuality] || qualitySettings['720p']
        }
        if (selectedVideoDevice) {
          videoConstraints.deviceId = { exact: selectedVideoDevice }
        }
        const gumStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints })
        gumStream.getTracks().slice(1).forEach(t => t.stop())
        const newVideoTrack = await freshCamera(gumStream.getVideoTracks()[0])
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
      } catch (error) {
        console.error('Failed to enable video:', error)
        toast.error(/Background/.test(error.message) ? 'Background effect failed, so your camera was left off' : 'Failed to access camera')
      }
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
    getSocket()?.emit('media:toggle-mute', { isMuted: true })
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
    getSocket()?.emit('media:toggle-video', { isVideoOff: true })
  },

  // =============================================
  // SCREEN SHARING
  // =============================================

  startScreenShare: async () => {
    // One share at a time: a second click while the picker is open / already sharing must not leak a stream
    if (!canMove(SCREEN_SHARE_TRANSITIONS, get().screenSharePhase, 'requesting') || get().screenSharePhase !== 'idle') {
      return { success: false, message: 'Screen share already in progress' }
    }
    set({ screenSharePhase: 'requesting' })
    let screenStream = null
    try {
      if (typeof navigator.mediaDevices?.getDisplayMedia === 'function') {
        const videoOpts = { cursor: 'always', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video: videoOpts, audio: true })
        } catch (e) {
          if (e.name === 'NotAllowedError' || e.name === 'AbortError') throw e
          // Some browsers reject the audio / advanced constraints outright: retry with the bare minimum
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        }
      } else if (navigator.mediaDevices?.getUserMedia) {
        // Phones (Android Chrome, iOS Safari) cannot capture their own screen from a web page.
        // Offer the rear camera as the shared content instead (documents, whiteboards, the room).
        screenStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        toast('Phones can’t share their screen in a browser, so your rear camera is being shared instead.', { icon: '📷', id: 'share-camera-fallback', duration: 6000 })
      } else {
        throw new Error('Screen sharing isn’t supported in this browser. Use Chrome, Edge or Firefox on a computer.')
      }
      const socket = getSocket()
      const screenVideoTrack = screenStream.getVideoTracks()[0]

      if (mediasoupClient && screenVideoTrack) {
        const producer = await get().produceScreen(screenVideoTrack)
        // produceScreen swallows its own error: without a producer nobody would ever see the share
        if (!producer) throw new Error('Could not publish the screen share. Check your connection and try again.')
      }
      set({ screenStream, isScreenSharing: true, screenSharePhase: 'sharing' })
      if (socket) socket.emit('media:screen-share', { isScreenSharing: true })

      screenVideoTrack.onended = () => { get().stopScreenShare() }
      return { success: true, stream: screenStream }
    } catch (error) {
      console.error('Screen share error:', error)
      // Roll back completely so the state never claims "sharing" with nothing behind it
      screenStream?.getTracks().forEach(t => t.stop())
      set({ screenStream: null, isScreenSharing: false, screenSharePhase: 'idle' })
      const message = error.name === 'NotAllowedError'
        ? 'Screen sharing permission denied'
        : error.name === 'NotFoundError' ? 'No camera found to share'
        : error.message
      return { success: false, message }
    }
  },

  stopScreenShare: async () => {
    // Idempotent: the track's `onended` and the Stop button can both fire for the same share
    if (get().screenSharePhase !== 'sharing') return
    set({ screenSharePhase: 'stopping' })
    const { screenStream, producers } = get()
    const socket = getSocket()
    if (screenStream) screenStream.getTracks().forEach(t => t.stop())
    if (mediasoupClient && producers.screen) {
      await mediasoupClient.closeProducer('screen').catch(() => {})
      set(s => ({ producers: { ...s.producers, screen: null } }))
    }
    if (socket) socket.emit('media:screen-share', { isScreenSharing: false })
    set({ screenStream: null, isScreenSharing: false, screenSharePhase: 'idle' })
  },

  setMediaLink: (next) => {
    const current = get().mediaLink
    if (current === next) return
    if (!canMove(MEDIA_LINK_TRANSITIONS, current, next)) return
    set({ mediaLink: next })
  },

  // =============================================
  // RECORDING
  // =============================================

  startRecording: ({ audioOnly = false } = {}) => {
    const { screenStream, localStream, currentMeeting, isRecording, mediaRecorder: existing } = get()
    if (isRecording || (existing && existing.state !== 'inactive')) return { success: false, message: 'Already recording' }
    const socket = getSocket()
    // You join with camera/mic off now, so your own stream may be empty: the meeting's remote audio
    // still makes a valid (audio-only) recording.
    const streamToRecord = screenStream || localStream || new MediaStream()
    let composite = null
    try {
      const recordingStartedAt = Date.now()
      // vp9 isn't available everywhere (Safari, some Firefox builds): fall back instead of throwing
      const mimeType = (audioOnly
        ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'])
        .find((t) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t))
      // Picture (unless audio only): shared screen or everyone's tiles. Sound: the mixed meeting audio.
      if (!audioOnly) composite = createCompositeVideo(() => meetingTiles('(recording)'))
      const recordStream = new MediaStream(composite?.stream.getVideoTracks() || [])
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 })
        ctx.resume?.()
        recordingMixer = { ctx, dest: ctx.createMediaStreamDestination(), nodes: new Map() }
        get().localStream?.getAudioTracks().forEach(mixerAdd)
        streamToRecord.getAudioTracks().forEach(mixerAdd) // shared-tab audio
        for (const [, entry] of get().remoteStreams) entry.stream.getAudioTracks().forEach(mixerAdd)
        recordingMixer.dest.stream.getAudioTracks().forEach(t => recordStream.addTrack(t))
      } catch (e) {
        console.warn('Audio mixing unavailable, recording your own audio only:', e.message)
        mixerStop()
        streamToRecord.getAudioTracks().forEach(t => recordStream.addTrack(t))
      }
      const mediaRecorder = new MediaRecorder(recordStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 4000000, // the default (~2.5 Mbps) smears shared text
        audioBitsPerSecond: 160000
      })
      const blobType = (mediaRecorder.mimeType || mimeType || (audioOnly ? 'audio/webm' : 'video/webm')).split(';')[0]
      const ext = blobType === 'video/mp4' ? 'mp4' : blobType === 'audio/mp4' ? 'm4a' : 'webm'
      const recordedChunks = []
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data) }
      mediaRecorder.onstop = () => {
        mixerStop()
        composite?.stop()
        // The recorder can stop on its own (shared screen ended): bring the flags and other participants back in sync
        if (get().mediaRecorder === mediaRecorder) {
          set({ mediaRecorder: null, isRecording: false })
          getSocket()?.emit('recording:stopped', { roomId: currentMeeting?.roomId })
        }

        const blob = new Blob(recordedChunks, { type: blobType })
        if (blob.size === 0) { set({ recordedChunks: [] }); return }
        const url = URL.createObjectURL(blob)
        const fileName = `meeting-recording-${Date.now()}.${ext}`
        const a = document.createElement('a'); a.href = url
        a.download = fileName
        document.body.appendChild(a); a.click(); document.body.removeChild(a)

        if (currentMeeting?.roomId) {
          const durationSeconds = Number(((Date.now() - recordingStartedAt) / 1000).toFixed(2))
          const formData = new FormData()
          formData.append('recording', blob, fileName)
          formData.append('duration', String(durationSeconds))
          formData.append('mimeType', blob.type || blobType)

          set({ recordingUpload: 'uploading' })
          api.post(`/meetings/${currentMeeting.roomId}/recordings`, formData)
            .then(() => {
              set({ recordingUpload: 'uploaded' })
              toast.success('Recording uploaded - transcription is processing')
            })
            .catch((error) => {
              console.error('Recording upload error:', error)
              set({ recordingUpload: 'failed' })
              // The local download above still has the file, so say so
              toast.error(`${error.response?.data?.message || 'Recording upload failed'}. A copy was saved to your downloads.`, { duration: 8000 })
            })
        }

        setTimeout(() => URL.revokeObjectURL(url), 10000); set({ recordedChunks: [] })
      }
      // No auto-stop when your own tracks end (mute, camera off, share ended): the mixed meeting audio keeps
      // flowing, and the recorder stops itself if every track really is gone.
      mediaRecorder.start(1000)
      set({ mediaRecorder, isRecording: true, recordedChunks, recordingUpload: 'idle' })
      if (socket) socket.emit('recording:started', { roomId: currentMeeting?.roomId })
      return { success: true }
    } catch (error) {
      composite?.stop(); mixerStop()
      console.error('Recording error:', error); return { success: false, message: error.message }
    }
  },

  stopRecording: () => {
    const { mediaRecorder, currentMeeting } = get()
    const socket = getSocket()
    // Flip the flags first so onstop doesn't treat this as an unexpected stop
    set({ mediaRecorder: null, isRecording: false })
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
      if (socket) socket.emit('recording:stopped', { roomId: currentMeeting?.roomId })
    }
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
  toggleMirrorSelf: () => set({ mirrorSelf: !get().mirrorSelf }),
  toggleHideSelf: () => set({ hideSelf: !get().hideSelf }),

  // Noise suppression / echo cancellation / auto gain: applied live to the mic track.
  setAudioProcessing: async (key, value) => {
    const audioProcessing = { ...get().audioProcessing, [key]: value }
    set({ audioProcessing })
    const track = get().localStream?.getAudioTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ [key]: value })
    } catch (e) {
      console.warn(`Could not apply ${key}:`, e.message)
    }
  },

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
    // A manager arriving later gets the queue replayed: never list the same guest twice
    if (get().waitingRoomUsers.some(u => u.socketId === socketId)) return
    set({ waitingRoomUsers: [...get().waitingRoomUsers, { user, socketId }] })
  },

  // Guest cancelled/disconnected while waiting (no server round-trip needed)
  removeFromWaitingRoom: (socketId) => {
    set({ waitingRoomUsers: get().waitingRoomUsers.filter(u => u.socketId !== socketId) })
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
  // =============================================
  // DEVICE MANAGEMENT
  // =============================================

  setSelectedAudioDevice: (deviceId) => set({ selectedAudioDevice: deviceId }),
  setSelectedVideoDevice: (deviceId) => set({ selectedVideoDevice: deviceId }),
  setSelectedAudioOutputDevice: (deviceId) => set({ selectedAudioOutputDevice: deviceId }),

  switchAudioOutput: async (deviceId) => {
    set({ selectedAudioOutputDevice: deviceId })
    try {
      const videoElements = document.querySelectorAll('video')
      for (const video of videoElements) {
        if (typeof video.setSinkId === 'function') {
          await video.setSinkId(deviceId)
        }
      }
    } catch (e) {
      console.error('Switch audio output error:', e)
    }
  },

  enumerateDevices: async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audiooutput = devices.filter(d => d.kind === 'audiooutput')
      set({
        availableDevices: {
          audioinput: devices.filter(d => d.kind === 'audioinput'),
          videoinput: devices.filter(d => d.kind === 'videoinput'),
          audiooutput,
        }
      })
      if (audiooutput.length > 0 && !get().selectedAudioOutputDevice) {
        set({ selectedAudioOutputDevice: audiooutput[0].deviceId })
      }
    } catch (e) { console.error('Enumerate devices error:', e) }
  },

  switchAudioDevice: async (deviceId) => {
    const { localStream, isMuted, producers } = get()
    set({ selectedAudioDevice: deviceId })
    if (isMuted) return
    try {
      const gumStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } })
      const newTrack = gumStream.getAudioTracks()[0]
      // Stop extra tracks from gumStream (only newTrack is needed)
      gumStream.getTracks().forEach(t => { if (t !== newTrack) t.stop() })
      if (localStream) {
        localStream.getAudioTracks().forEach(t => { t.stop(); localStream.removeTrack(t) })
        localStream.addTrack(newTrack)
      } else {
        const newLocalStream = new MediaStream([newTrack])
        set({ localStream: newLocalStream })
      }
      if (mediasoupClient && producers.audio) await producers.audio.replaceTrack({ track: newTrack })
    } catch (e) {
      console.error('Switch audio error:', e)
      toast.error('Failed to switch microphone device')
    }
  },

  switchVideoDevice: async (deviceId) => {
    const { localStream, isVideoOff, producers } = get()
    set({ selectedVideoDevice: deviceId })
    if (isVideoOff) return
    try {
      const gumStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: 640, height: 480 } })
      gumStream.getTracks().slice(1).forEach(t => t.stop())
      const newTrack = await freshCamera(gumStream.getVideoTracks()[0])
      if (localStream) {
        localStream.getVideoTracks().forEach(t => { t.stop(); localStream.removeTrack(t) })
        localStream.addTrack(newTrack)
      } else {
        const newLocalStream = new MediaStream([newTrack])
        set({ localStream: newLocalStream })
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
  setIsCoHost: (isCoHost) => set({ isCoHost }),
  setMyRole: (myRole) => set({ myRole }),

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
