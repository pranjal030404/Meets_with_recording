import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  ArrowLeft,
  Settings,
  ChevronDown
} from 'lucide-react'
import { useMeetingStore } from '../store/meetingStore'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

export default function JoinMeeting() {
  const navigate = useNavigate()
  const { roomId: paramRoomId } = useParams()
  const { user } = useAuthStore()
  const { joinMeeting, getMeeting, setLocalStream, isLoading } = useMeetingStore()
  
  const [roomId, setRoomId] = useState(paramRoomId || '')
  const [meeting, setMeeting] = useState(null)
  const [localStream, setLocalStreamState] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isCheckingMeeting, setIsCheckingMeeting] = useState(false)
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(null) // 'audio' | 'video' | null
  const [devices, setDevices] = useState({ audioinput: [], videoinput: [], audiooutput: [] })
  const [selectedAudioDevice, setSelectedAudioDevice] = useState(null)
  const [selectedVideoDevice, setSelectedVideoDevice] = useState(null)
  const [audioLevel, setAudioLevel] = useState(0)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)

  // Initialize camera preview
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        })
        streamRef.current = stream
        setLocalStreamState(stream)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        // Enumerate devices after getting permission
        const deviceList = await navigator.mediaDevices.enumerateDevices()
        setDevices({
          audioinput: deviceList.filter(d => d.kind === 'audioinput'),
          videoinput: deviceList.filter(d => d.kind === 'videoinput'),
          audiooutput: deviceList.filter(d => d.kind === 'audiooutput'),
        })

        // Start audio level monitoring
        startAudioLevelMonitoring(stream)
      } catch (error) {
        console.error('Camera access error:', error)
        toast.error('Unable to access camera/microphone')
      }
    }

    initCamera()

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

  const startAudioLevelMonitoring = useCallback((stream) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
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

    if (result.success) {
      setMeeting(result.meeting)
    } else {
      toast.error('Meeting not found')
      setMeeting(null)
    }
  }

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

    // Save stream to store before joining
    setLocalStream(localStream)

    // Save muted/video-off state
    if (isMuted) useMeetingStore.setState({ isMuted: true })
    if (isVideoOff) useMeetingStore.setState({ isVideoOff: true })

    const result = await joinMeeting(meeting.roomId)
    
    if (result.success) {
      navigate(`/meeting/${meeting.roomId}`)
    } else {
      toast.error(result.message)
    }
  }

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        if (!isMuted) {
          // Mute: stop track (release mic permission, LED off)
          audioTrack.stop()
          localStream.removeTrack(audioTrack)
          setAudioLevel(0)
        } else {
          // Unmute: reacquire with noise suppression
          const constraints = {
            audio: {
              deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          }
          navigator.mediaDevices.getUserMedia(constraints).then(newStream => {
            const newTrack = newStream.getAudioTracks()[0]
            localStream.addTrack(newTrack)
            streamRef.current = localStream
            startAudioLevelMonitoring(localStream)
          }).catch(err => {
            console.error('Failed to reacquire mic:', err)
            toast.error('Failed to access microphone')
            return
          })
        }
        setIsMuted(!isMuted)
      }
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (!isVideoOff && videoTrack) {
        // Turn off: stop track (release camera, LED off)
        videoTrack.stop()
        localStream.removeTrack(videoTrack)
        setIsVideoOff(true)
      } else {
        // Turn on: reacquire
        const constraints = selectedVideoDevice
          ? { video: { deviceId: { exact: selectedVideoDevice }, width: 640, height: 480 } }
          : { video: { width: 640, height: 480 } }
        navigator.mediaDevices.getUserMedia(constraints).then(newStream => {
          const newTrack = newStream.getVideoTracks()[0]
          localStream.addTrack(newTrack)
          streamRef.current = localStream
          if (videoRef.current) videoRef.current.srcObject = localStream
          setIsVideoOff(false)
        }).catch(err => {
          console.error('Failed to reacquire camera:', err)
          toast.error('Failed to access camera')
        })
      }
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
          if (videoRef.current) videoRef.current.srcObject = localStream
        }
      }
    } catch (err) {
      console.error('Switch device error:', err)
      toast.error('Failed to switch device')
    }
    setShowDeviceDropdown(null)
  }

  return (
    <div className="min-h-screen bg-dark-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to home
        </button>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Video Preview */}
          <div className="bg-dark-200 rounded-2xl overflow-hidden">
            <div className="aspect-video relative">
              {isVideoOff ? (
                <div className="w-full h-full flex items-center justify-center bg-dark-300">
                  <div className="w-24 h-24 bg-primary-600 rounded-full flex items-center justify-center">
                    <span className="text-3xl font-semibold">
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
              <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-lg text-sm">
                {user?.name} (You)
              </div>

              {/* Mute on entry notice */}
              {meeting?.settings?.muteOnEntry && (
                <div className="absolute top-4 left-4 bg-yellow-600/80 px-3 py-1 rounded-lg text-xs">
                  🔇 You'll be muted when you join
                </div>
              )}
            </div>

            {/* Controls + Audio Level */}
            <div className="p-4">
              {/* Audio level meter */}
              {!isMuted && (
                <div className="mb-3 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-gray-400" />
                  <div className="flex-1 h-2 bg-dark-400 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-75"
                      style={{ width: `${audioLevel * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-3">
                {/* Mic button + device selector */}
                <div className="flex items-center">
                  <button
                    onClick={toggleMute}
                    className={`control-btn ${isMuted ? 'inactive' : 'active'}`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  {devices.audioinput.length > 1 && (
                    <div className="relative">
                      <button onClick={() => setShowDeviceDropdown(showDeviceDropdown === 'audio' ? null : 'audio')}
                        className="p-1 ml-0.5 bg-dark-400 hover:bg-dark-500 rounded-r-full transition-colors">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showDeviceDropdown === 'audio' && (
                        <div className="absolute bottom-full mb-2 left-0 bg-dark-300 rounded-lg shadow-xl py-1 min-w-[250px] z-20">
                          <p className="px-3 py-1 text-xs text-gray-400 font-semibold">Microphone</p>
                          {devices.audioinput.map(d => (
                            <button key={d.deviceId} onClick={() => switchDevice('audioinput', d.deviceId)}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-dark-400 transition-colors truncate ${
                                d.deviceId === selectedAudioDevice ? 'text-primary-400' : ''
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
                <div className="flex items-center">
                  <button
                    onClick={toggleVideo}
                    className={`control-btn ${isVideoOff ? 'inactive' : 'active'}`}
                    title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                  >
                    {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </button>
                  {devices.videoinput.length > 1 && (
                    <div className="relative">
                      <button onClick={() => setShowDeviceDropdown(showDeviceDropdown === 'video' ? null : 'video')}
                        className="p-1 ml-0.5 bg-dark-400 hover:bg-dark-500 rounded-r-full transition-colors">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showDeviceDropdown === 'video' && (
                        <div className="absolute bottom-full mb-2 left-0 bg-dark-300 rounded-lg shadow-xl py-1 min-w-[250px] z-20">
                          <p className="px-3 py-1 text-xs text-gray-400 font-semibold">Camera</p>
                          {devices.videoinput.map(d => (
                            <button key={d.deviceId} onClick={() => switchDevice('videoinput', d.deviceId)}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-dark-400 transition-colors truncate ${
                                d.deviceId === selectedVideoDevice ? 'text-primary-400' : ''
                              }`}>
                              {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Join Form */}
          <div className="flex flex-col justify-center">
            <h1 className="text-2xl font-bold mb-2">Ready to join?</h1>
            <p className="text-gray-400 mb-6">
              {meeting 
                ? `You're about to join: ${meeting.title}`
                : 'Enter a meeting code to join'
              }
            </p>

            {!meeting && (
              <form onSubmit={handleCheckMeeting} className="mb-6">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="input mb-4"
                  placeholder="Enter meeting code or link"
                />
                <button
                  type="submit"
                  disabled={isCheckingMeeting}
                  className="btn btn-secondary w-full"
                >
                  {isCheckingMeeting ? 'Checking...' : 'Find Meeting'}
                </button>
              </form>
            )}

            {meeting && (
              <div className="space-y-4">
                {/* Meeting Info */}
                <div className="bg-dark-300 rounded-xl p-4">
                  <h3 className="font-semibold mb-2">{meeting.title}</h3>
                  <p className="text-sm text-gray-400">
                    Hosted by {meeting.host?.name}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    {meeting.status === 'active' ? 'Meeting in progress' : 'Ready to start'}
                  </div>
                  {meeting.settings?.muteOnEntry && (
                    <p className="text-xs text-yellow-400 mt-2">🔇 Participants are muted on entry</p>
                  )}
                </div>

                <button
                  onClick={handleJoinMeeting}
                  disabled={isLoading}
                  className="btn btn-primary w-full py-3 text-lg"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Joining...
                    </span>
                  ) : (
                    'Join Now'
                  )}
                </button>

                <button
                  onClick={() => setMeeting(null)}
                  className="text-gray-400 hover:text-white text-sm w-full"
                >
                  Join a different meeting
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
