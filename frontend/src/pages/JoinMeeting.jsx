import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  ArrowLeft,
  ChevronDown,
  Link2,
  Radio,
  Sparkles,
  Aperture,
  LogIn
} from 'lucide-react'
import { useMeetingStore } from '../store/meetingStore'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import InviteDetails from '../components/InviteDetails'
import { withBackground, savedBackground, saveBackground } from '../lib/backgroundEffect'
import api from '../lib/api'
import MeetingGate, { meetingGate } from '../components/MeetingGate'

export default function JoinMeeting() {
  const navigate = useNavigate()
  const { roomId: paramRoomId } = useParams()
  const { user } = useAuthStore()
  const { joinMeeting, getMeeting, setLocalStream, isLoading } = useMeetingStore()

  const [roomId, setRoomId] = useState(paramRoomId || '')
  const [meeting, setMeeting] = useState(null)
  const [people, setPeople] = useState([])
  const [localStream, setLocalStreamState] = useState(null)
  // Camera and mic start OFF: the browser's permission prompt only appears when the user turns one on
  const [isMuted, setIsMuted] = useState(true)
  const [isVideoOff, setIsVideoOff] = useState(true)
  const [isCheckingMeeting, setIsCheckingMeeting] = useState(false)
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(null) // 'audio' | 'video' | null
  const [devices, setDevices] = useState({ audioinput: [], videoinput: [], audiooutput: [] })
  const [selectedAudioDevice, setSelectedAudioDevice] = useState(null)
  const [selectedVideoDevice, setSelectedVideoDevice] = useState(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [background, setBackground] = useState(() => savedBackground().mode)
  const [backgroundVersion, setBackgroundVersion] = useState(0) // a second picture keeps the mode 'image'
  const speaker = useMeetingStore(s => s.selectedAudioOutputDevice)

  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)

  // No automatic capture. We only list devices (labels stay hidden until permission is granted) and
  // clean up whatever the user chose to turn on.
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((deviceList) => {
      setDevices({
        audioinput: deviceList.filter(d => d.kind === 'audioinput'),
        videoinput: deviceList.filter(d => d.kind === 'videoinput'),
        audiooutput: deviceList.filter(d => d.kind === 'audiooutput'),
      })
    }).catch(() => {})

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [])

  // The preview shows what others will see. The stream keeps the plain camera: the meeting applies the
  // saved effect again before anything is sent.
  const cameraId = localStream?.getVideoTracks()[0]?.id
  useEffect(() => {
    const video = videoRef.current
    const raw = localStream?.getVideoTracks()[0]
    if (isVideoOff || !video || !raw) return
    let cancelled = false
    let shown = null
    video.srcObject = null // nothing unprocessed while the effect loads
    withBackground(raw).then((track) => {
      if (cancelled) return track.release?.()
      shown = track
      video.srcObject = new MediaStream([track])
    }).catch((error) => {
      console.error('Background effect error:', error)
      if (!cancelled) toast.error('Background effects are not available in this browser', { id: 'background' })
    })
    return () => {
      cancelled = true
      shown?.release?.() // stops the effect, not the camera
    }
  }, [isVideoOff, localStream, cameraId, background, backgroundVersion])

  const chooseBackground = (mode, file) => {
    saveBackground(mode, file)
    setBackground(mode)
    setBackgroundVersion(v => v + 1)
    useMeetingStore.setState({ background: mode })
  }

  const startAudioLevelMonitoring = useCallback((stream) => {
    try {
      // Clean up previous monitoring resources
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtx.resume()
      audioContextRef.current = audioCtx
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        setAudioLevel(Math.min(avg / 128, 1))
        animFrameRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()
    } catch (e) { console.error('Audio monitoring error:', e) }
  }, [])

  // Check meeting when roomId from params
  useEffect(() => {
    if (paramRoomId) {
      checkMeeting(paramRoomId)
    }
  }, [paramRoomId])

  const checkMeeting = async (id) => {
    setIsCheckingMeeting(true)
    const result = await getMeeting(id)
    setIsCheckingMeeting(false)

    // The shared link of a repeating meeting leads on to the current date
    if (result.success && result.nextRoomId) return navigate(`/join/${result.nextRoomId}`, { replace: true })

    if (result.success) {
      setMeeting(result.meeting)
      setPeople(result.people || [])
    } else {
      toast.error('Meeting not found')
      setMeeting(null)
    }
  }

  const toggleNotes = async (takeNotes) => {
    try {
      const { data } = await api.put(`/meetings/${meeting.roomId}/settings`, { settings: { takeNotes } })
      setMeeting(m => ({ ...m, settings: data.data.meeting.settings }))
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not change note taking')
    }
  }

  // While waiting for a meeting to open, look again every few seconds
  const gate = meeting ? meetingGate(meeting, user) : null
  const [, setTick] = useState(0)
  useEffect(() => {
    if (gate !== 'upcoming' && gate !== 'host') return
    const timer = setInterval(async () => {
      const result = await getMeeting(meeting.roomId)
      if (result.success) setMeeting(result.meeting)
      setTick(t => t + 1) // the countdown and the start time move even if nothing else did
    }, 10000)
    return () => clearInterval(timer)
  }, [gate, meeting?.roomId])

  const handleCheckMeeting = (e) => {
    e.preventDefault()
    if (!roomId.trim()) {
      toast.error('Please enter a meeting code')
      return
    }

    let extractedRoomId = roomId.trim()
    if (roomId.includes('/meeting/')) {
      extractedRoomId = roomId.split('/meeting/')[1]
    }

    setRoomId(extractedRoomId)
    checkMeeting(extractedRoomId)
  }

  const handleJoinMeeting = async () => {
    if (!meeting) return

    // Set device preferences in store before joining
    const store = useMeetingStore.getState()
    if (selectedAudioDevice) store.setSelectedAudioDevice?.(selectedAudioDevice)
    if (selectedVideoDevice) store.setSelectedVideoDevice?.(selectedVideoDevice)

    // Save stream to store before joining (null when both are off: the meeting page then won't capture anything)
    const hasTracks = localStream && localStream.getTracks().length > 0
    setLocalStream(hasTracks ? localStream : null)

    // Hand over exactly what the user chose (the store defaults are not "off")
    useMeetingStore.setState({ isMuted, isVideoOff })

    const result = await joinMeeting(meeting.roomId)

    if (result.success) {
      // Prevent cleanup from stopping tracks — Meeting page will manage them
      streamRef.current = null
      navigate(`/meeting/${meeting.roomId}`)
    } else {
      toast.error(result.message)
    }
  }

  // Turning something ON asks the browser for permission (first time) and only then flips the switch.
  const ensureStream = () => {
    let stream = streamRef.current || localStream
    if (!stream) {
      stream = new MediaStream()
      streamRef.current = stream
      setLocalStreamState(stream)
    }
    return stream
  }

  const toggleMute = async () => {
    if (!isMuted) {
      // Mute: stop the track (releases the mic, LED off)
      const stream = streamRef.current || localStream
      stream?.getAudioTracks().forEach(t => { t.stop(); stream.removeTrack(t) })
      setAudioLevel(0)
      setIsMuted(true)
      return
    }
    try {
      const audioConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      if (selectedAudioDevice) audioConstraints.deviceId = { exact: selectedAudioDevice }
      const gum = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      const stream = ensureStream()
      stream.getAudioTracks().forEach(t => { t.stop(); stream.removeTrack(t) })
      stream.addTrack(gum.getAudioTracks()[0])
      startAudioLevelMonitoring(stream)
      setIsMuted(false)
      // Permission is granted now, so device labels are available
      navigator.mediaDevices.enumerateDevices().then((list) => setDevices({
        audioinput: list.filter(d => d.kind === 'audioinput'),
        videoinput: list.filter(d => d.kind === 'videoinput'),
        audiooutput: list.filter(d => d.kind === 'audiooutput'),
      })).catch(() => {})
    } catch (err) {
      console.error('Failed to access microphone:', err)
      toast.error(err.name === 'NotAllowedError' ? 'Microphone permission denied' : 'Failed to access microphone')
    }
  }

  const toggleVideo = async () => {
    if (!isVideoOff) {
      const stream = streamRef.current || localStream
      stream?.getVideoTracks().forEach(t => { t.stop(); stream.removeTrack(t) })
      setIsVideoOff(true)
      return
    }
    try {
      const constraints = selectedVideoDevice
        ? { video: { deviceId: { exact: selectedVideoDevice }, width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { video: { width: { ideal: 1280 }, height: { ideal: 720 } } }
      const gum = await navigator.mediaDevices.getUserMedia(constraints)
      const stream = ensureStream()
      stream.getVideoTracks().forEach(t => { t.stop(); stream.removeTrack(t) })
      stream.addTrack(gum.getVideoTracks()[0])
      setIsVideoOff(false)
      navigator.mediaDevices.enumerateDevices().then((list) => setDevices({
        audioinput: list.filter(d => d.kind === 'audioinput'),
        videoinput: list.filter(d => d.kind === 'videoinput'),
        audiooutput: list.filter(d => d.kind === 'audiooutput'),
      })).catch(() => {})
    } catch (err) {
      console.error('Failed to access camera:', err)
      toast.error(err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Failed to access camera')
    }
  }

  const switchDevice = async (kind, deviceId) => {
    if (!localStream) return
    try {
      if (kind === 'audioinput') {
        setSelectedAudioDevice(deviceId)
        if (!isMuted) {
          const oldTrack = localStream.getAudioTracks()[0]
          if (oldTrack) { oldTrack.stop(); localStream.removeTrack(oldTrack) }
          const ns = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } })
          localStream.addTrack(ns.getAudioTracks()[0])
          streamRef.current = localStream
          startAudioLevelMonitoring(localStream)
        }
      } else if (kind === 'videoinput') {
        setSelectedVideoDevice(deviceId)
        if (!isVideoOff) {
          const oldTrack = localStream.getVideoTracks()[0]
          if (oldTrack) { oldTrack.stop(); localStream.removeTrack(oldTrack) }
          const ns = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: 640, height: 480 } })
          localStream.addTrack(ns.getVideoTracks()[0])
          streamRef.current = localStream
        }
      }
    } catch (err) {
      console.error('Switch device error:', err)
      toast.error('Failed to switch device')
    }
    setShowDeviceDropdown(null)
  }

  return (
    <div className="relative min-h-screen bg-dark-100 flex items-center justify-center p-4">

      <div className="relative w-full max-w-5xl">
        {/* Back button */}
        <button
          onClick={() => navigate('/app')}
          className="group flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 transition-transform" />
          Back to home
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
          {/* Video Preview */}
          <div className="glass rounded-2xl overflow-hidden flex flex-col">
            <div className="aspect-video relative">
              {isVideoOff ? (
                <div className="w-full h-full flex items-center justify-center bg-dark-300">
                  <div className="w-24 h-24 bg-primary-500 rounded-full flex items-center justify-center">
                    <span className="text-3xl font-semibold text-ink">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain bg-dark-300"
                  style={{ transform: 'scaleX(-1)' }}
                />
              )}

              {/* Name badge */}
              <div className="absolute bottom-4 left-4 glass-strong px-3.5 py-1.5 rounded-xl text-sm font-medium">
                {user?.name} <span className="text-primary-300">(You)</span>
              </div>

              {/* Mute on entry notice */}
              {meeting?.settings?.muteOnEntry && (
                <div className="absolute top-4 left-4 glass-strong bg-yellow-500/20 border-yellow-400/30 px-3 py-1.5 rounded-xl text-xs font-medium text-yellow-200 animate-slide-down">
                  You'll be muted when you join
                </div>
              )}
            </div>

            {/* Controls + Audio Level */}
            <div className="p-5 border-t border-white/5">
              {/* Audio level meter */}
              {!isMuted && (
                <div className="mb-4 flex items-center gap-2.5">
                  <Mic className="w-4 h-4 text-primary-400" />
                  <div className="flex-1 h-2 bg-dark-400/80 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-colors duration-100"
                      style={{ width: `${Math.max(audioLevel * 100, 4)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-3">
                {/* Mic button + device selector */}
                <div className="flex items-center animate-scale-in">
                  <button
                    onClick={toggleMute}
                    className={`control-btn ${isMuted ? 'inactive' : 'active'} ${devices.audioinput.length > 1 ? '!rounded-r-none' : ''}`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  {devices.audioinput.length > 1 && (
                    <div className="relative">
                      <button onClick={() => setShowDeviceDropdown(showDeviceDropdown === 'audio' ? null : 'audio')}
                        className="h-12 px-1.5 bg-dark-400 hover:bg-dark-500 border-l border-black/20 rounded-r-full transition-colors text-gray-300">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {showDeviceDropdown === 'audio' && (
                        <div className="absolute bottom-full mb-2 left-0 glass-strong rounded-xl py-1.5 w-[min(250px,calc(50vw+3rem))] z-20 animate-slide-up border-white/10">
                          <p className="px-3.5 py-1.5 text-[11px] text-gray-500 font-semibold">Microphone</p>
                          {devices.audioinput.map(d => (
                            <button key={d.deviceId} onClick={() => switchDevice('audioinput', d.deviceId)}
                              className={`w-full px-3.5 py-2 text-left text-sm hover:bg-primary-500/10 transition-colors truncate ${
                                d.deviceId === selectedAudioDevice ? 'text-primary-300' : 'text-gray-300'
                              }`}>
                              {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Video button + device selector */}
                <div className="flex items-center animate-scale-in">
                  <button
                    onClick={toggleVideo}
                    className={`control-btn ${isVideoOff ? 'inactive' : 'active'} ${devices.videoinput.length > 1 ? '!rounded-r-none' : ''}`}
                    title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                  >
                    {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </button>
                  {devices.videoinput.length > 1 && (
                    <div className="relative">
                      <button onClick={() => setShowDeviceDropdown(showDeviceDropdown === 'video' ? null : 'video')}
                        className="h-12 px-1.5 bg-dark-400 hover:bg-dark-500 border-l border-black/20 rounded-r-full transition-colors text-gray-300">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {showDeviceDropdown === 'video' && (
                        <div className="absolute bottom-full mb-2 left-0 glass-strong rounded-xl py-1.5 w-[min(250px,calc(50vw+3rem))] z-20 animate-slide-up">
                          <p className="px-3.5 py-1.5 text-[11px] text-gray-500 font-semibold">Camera</p>
                          {devices.videoinput.map(d => (
                            <button key={d.deviceId} onClick={() => switchDevice('videoinput', d.deviceId)}
                              className={`w-full px-3.5 py-2 text-left text-sm hover:bg-primary-500/10 transition-colors truncate ${
                                d.deviceId === selectedVideoDevice ? 'text-primary-300' : 'text-gray-300'
                              }`}>
                              {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Background blur */}
                <button
                  onClick={() => chooseBackground(background === 'off' ? 'blur' : 'off')}
                  className={`control-btn ${background === 'off' ? 'inactive' : 'active'}`}
                  title={background === 'off' ? 'Blur my background' : 'Turn off background effect'}
                  aria-pressed={background !== 'off'}
                >
                  <Aperture className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-gray-400">
                  Background
                  <select className="input mt-1" value={background}
                    onChange={(e) => e.target.value === 'pick' ? fileRef.current.click() : chooseBackground(e.target.value)}>
                    <option value="off">None</option>
                    <option value="blur">Blur</option>
                    {background === 'image' && <option value="image">My picture</option>}
                    <option value="pick">Choose a picture…</option>
                  </select>
                </label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) chooseBackground('image', file); e.target.value = '' }} />
                {/* Browsers list speakers only once permission is granted, and not all can switch them */}
                {'setSinkId' in HTMLMediaElement.prototype && devices.audiooutput.some(d => d.label) && (
                  <label className="text-xs text-gray-400">
                    Speaker
                    <select className="input mt-1" value={speaker || ''}
                      onChange={(e) => useMeetingStore.setState({ selectedAudioOutputDevice: e.target.value })}>
                      {!speaker && <option value="">Default</option>}
                      {devices.audiooutput.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker'}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Join Form */}
          <div className="flex flex-col justify-center">
{gate ? (
              <MeetingGate gate={gate} meeting={meeting} onHome={() => navigate('/app')} />
            ) : (<>
<h1 className="text-3xl sm:text-4xl font-semibold font-display mb-3">
              Ready to join?
            </h1>
            <p className="text-gray-400 mb-8">
              {meeting
                ? `You're about to join: ${meeting.title}`
                : 'Enter a meeting code to join'
              }
            </p>

            {!meeting && (
              <form onSubmit={handleCheckMeeting} className="mb-6 group">
                <div className="relative mb-4">
                  <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 transition-colors group-focus-within:text-primary-400" />
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="input pl-11 py-3.5"
                    placeholder="Enter meeting code or link"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isCheckingMeeting}
                  className="btn btn-secondary w-full py-3.5"
                >
                  {isCheckingMeeting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Checking...
                    </span>
                  ) : (
                    'Find meeting'
                  )}
                </button>
              </form>
            )}

            {meeting && (
              <div className="space-y-4">
                {/* Meeting Info */}
                <div className="card p-5 animate-scale-in">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold font-display text-lg mb-1">{meeting.title}</h3>
                      <p className="text-sm text-gray-400">
                        Hosted by <span className="text-gray-200 font-medium">{meeting.host?.name}</span>
                      </p>
                    </div>
                    <Radio className="w-5 h-5 text-primary-400 shrink-0 mt-1" />
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-sm text-gray-400">
                    <span className="live-dot text-emerald-400" />
                    {meeting.status === 'active' ? 'Meeting in progress' : 'Ready to start'}
                  </div>
                  {meeting.settings?.muteOnEntry && (
                    <p className="text-xs text-yellow-400/90 mt-2.5 bg-yellow-500/10 border border-yellow-400/20 rounded-lg px-3 py-1.5 inline-block">Participants are muted on entry</p>
                  )}
                </div>

                {meeting.hostId === (user?.id || user?._id) ? (
                  <label className="flex items-center justify-between gap-3 text-sm text-gray-300 cursor-pointer">
                    Take notes (live transcript)
                    <input type="checkbox" checked={!!meeting.settings?.takeNotes} onChange={(e) => toggleNotes(e.target.checked)} />
                  </label>
                ) : meeting.settings?.takeNotes && (
                  <p className="text-sm text-gray-400">Notes will be taken: what you say while unmuted is transcribed.</p>
                )}

                <button
                  onClick={handleJoinMeeting}
                  disabled={isLoading}
                  className="btn btn-primary w-full py-4 text-base"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Joining...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <LogIn className="w-5 h-5" />
                      Join now
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setMeeting(null)}
                  className="text-gray-400 hover:text-white text-sm w-full transition-colors hover:underline underline-offset-4"
                >
                  Join a different meeting
                </button>
              </div>
            )}
            </>)}
            {meeting && !meeting.isInstant && <InviteDetails meeting={meeting} people={people} user={user} />}
          </div>
        </div>
      </div>
    </div>
  )
}
