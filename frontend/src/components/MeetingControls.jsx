import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor, 
  MonitorOff,
  MessageSquare,
  Users,
  MoreVertical,
  Hand,
  Circle,
  PhoneOff,
  Settings,
  Smile
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export default function MeetingControls({
  isMuted,
  isVideoOff,
  isScreenSharing,
  isRecording,
  isHost,
  showChat,
  showParticipants,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleRecording,
  onToggleChat,
  onToggleParticipants,
  onLeave
}) {
  const [showMore, setShowMore] = useState(false)
  const [isHandRaised, setIsHandRaised] = useState(false)
  const moreMenuRef = useRef(null)

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMore(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="bg-dark-200 border-t border-dark-400 px-4 py-4">
      <div className="flex items-center justify-center gap-3">
        {/* Mute */}
        <ControlButton
          active={!isMuted}
          onClick={onToggleMute}
          icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          label={isMuted ? 'Unmute' : 'Mute'}
        />

        {/* Video */}
        <ControlButton
          active={!isVideoOff}
          onClick={onToggleVideo}
          icon={isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          label={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        />

        {/* Screen Share */}
        <ControlButton
          active={isScreenSharing}
          activeColor="green"
          onClick={onToggleScreenShare}
          icon={isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          label={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        />

        {/* Recording */}
        <ControlButton
          active={isRecording}
          activeColor="red"
          onClick={onToggleRecording}
          icon={<Circle className={`w-5 h-5 ${isRecording ? 'fill-current' : ''}`} />}
          label={isRecording ? 'Stop recording' : 'Start recording'}
        />

        {/* Divider */}
        <div className="w-px h-8 bg-dark-400 mx-2" />

        {/* Chat */}
        <ControlButton
          active={showChat}
          activeColor="blue"
          onClick={onToggleChat}
          icon={<MessageSquare className="w-5 h-5" />}
          label="Chat"
          badge={false}
        />

        {/* Participants */}
        <ControlButton
          active={showParticipants}
          activeColor="blue"
          onClick={onToggleParticipants}
          icon={<Users className="w-5 h-5" />}
          label="Participants"
        />

        {/* More options */}
        <div className="relative" ref={moreMenuRef}>
          <ControlButton
            active={showMore}
            onClick={() => setShowMore(!showMore)}
            icon={<MoreVertical className="w-5 h-5" />}
            label="More"
          />

          {showMore && (
            <div className="absolute bottom-full mb-2 right-0 bg-dark-300 rounded-xl shadow-lg py-2 min-w-[180px] animate-slide-up">
              <MoreMenuItem
                icon={<Hand className="w-4 h-4" />}
                label={isHandRaised ? 'Lower hand' : 'Raise hand'}
                onClick={() => setIsHandRaised(!isHandRaised)}
              />
              <MoreMenuItem
                icon={<Smile className="w-4 h-4" />}
                label="Send reaction"
                onClick={() => {}}
              />
              <MoreMenuItem
                icon={<Settings className="w-4 h-4" />}
                label="Settings"
                onClick={() => {}}
              />
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-dark-400 mx-2" />

        {/* Leave */}
        <button
          onClick={onLeave}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-full flex items-center gap-2 transition-colors"
        >
          <PhoneOff className="w-5 h-5" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>
    </div>
  )
}

function ControlButton({ active, activeColor = 'default', onClick, icon, label, badge }) {
  const getButtonClasses = () => {
    if (!active) {
      return 'bg-red-600 hover:bg-red-700'
    }

    switch (activeColor) {
      case 'green':
        return 'bg-green-600 hover:bg-green-700'
      case 'red':
        return 'bg-red-600 hover:bg-red-700'
      case 'blue':
        return 'bg-primary-600 hover:bg-primary-700'
      default:
        return 'bg-dark-400 hover:bg-dark-500'
    }
  }

  return (
    <button
      onClick={onClick}
      className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-colors ${getButtonClasses()}`}
      title={label}
    >
      {icon}
      {badge && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-600 rounded-full text-xs flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  )
}

function MoreMenuItem({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-dark-400 transition-colors text-left"
    >
      {icon}
      <span className="text-sm">{label}</span>
    </button>
  )
}
