import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  ArrowLeft,
  Settings
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

  const videoRef = useRef(null)

  // Initialize camera preview
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true
        })
        setLocalStreamState(stream)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (error) {
        console.error('Camera access error:', error)
        toast.error('Unable to access camera/microphone')
      }
    }

    initCamera()

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
    }
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

    // Extract room ID from URL if needed
    let extractedRoomId = roomId.trim()
    if (roomId.includes('/meeting/')) {
      extractedRoomId = roomId.split('/meeting/')[1]
    }

    setRoomId(extractedRoomId)
    checkMeeting(extractedRoomId)
  }

  const handleJoinMeeting = async () => {
    if (!meeting) return

    // Save stream to store before joining
    setLocalStream(localStream)

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
        audioTrack.enabled = isMuted
        setIsMuted(!isMuted)
      }
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = isVideoOff
        setIsVideoOff(!isVideoOff)
      }
    }
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
                  className="w-full h-full object-cover mirror"
                  style={{ transform: 'scaleX(-1)' }}
                />
              )}

              {/* Name badge */}
              <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-lg text-sm">
                {user?.name} (You)
              </div>
            </div>

            {/* Controls */}
            <div className="p-4 flex justify-center gap-4">
              <button
                onClick={toggleMute}
                className={`control-btn ${isMuted ? 'inactive' : 'active'}`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button
                onClick={toggleVideo}
                className={`control-btn ${isVideoOff ? 'inactive' : 'active'}`}
                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
              <button
                className="control-btn active"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
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
