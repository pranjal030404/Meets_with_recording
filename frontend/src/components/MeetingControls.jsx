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
  Smile,
  Subtitles,
  Shield,
  PictureInPicture,
  Brush
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { REACTION_EMOJIS } from './EmojiReactions'

export default function MeetingControls({
  isMuted,
  isVideoOff,
  isScreenSharing,
  isRecording,
  isHost,
  isHandRaised,
  showChat,
  showParticipants,
  captionsEnabled,
  handRaisedCount,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleRecording,
  onToggleChat,
  onToggleParticipants,
  onToggleHandRaise,
  onToggleCaptions,
  onSendReaction,
  onLeave,
  onOpenSettings,
  onOpenMeetingSettings,
  onTogglePiP,
  onOpenWhiteboard,
  isPiP,
  chatUnread
}) {
  const [showMore, setShowMore] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const moreMenuRef = useRef(null)
  const reactionRef = useRef(null)

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) setShowMore(false)
      if (reactionRef.current && !reactionRef.current.contains(event.target)) setShowReactionPicker(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="bg-dark-200 border-t border-dark-400 px-4 py-3">
      <div className="flex items-center justify-center gap-2 sm:gap-3">
        {/* Mute */}
        <ControlButton
          active={!isMuted}
          onClick={onToggleMute}
          icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          label={isMuted ? 'Unmute (Ctrl+D)' : 'Mute (Ctrl+D)'}
        />

        {/* Video */}
        <ControlButton
          active={!isVideoOff}
          onClick={onToggleVideo}
          icon={isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          label={isVideoOff ? 'Turn on camera (Ctrl+E)' : 'Turn off camera (Ctrl+E)'}
        />

        {/* Screen Share */}
        <ControlButton
          active={isScreenSharing}
          activeColor="green"
          onClick={onToggleScreenShare}
          icon={isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          label={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        />

        {/* Hand Raise */}
        <ControlButton
          active={isHandRaised}
          activeColor="yellow"
          onClick={onToggleHandRaise}
          icon={<Hand className="w-5 h-5" />}
          label={isHandRaised ? 'Lower hand' : 'Raise hand'}
          badge={handRaisedCount > 0 ? handRaisedCount : null}
        />

        {/* Reactions */}
        <div className="relative" ref={reactionRef}>
          <ControlButton
            active={showReactionPicker}
            activeColor="blue"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            icon={<Smile className="w-5 h-5" />}
            label="Reactions"
          />
          {showReactionPicker && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-dark-300 rounded-xl shadow-lg p-2 flex gap-1 animate-slide-up">
              {REACTION_EMOJIS.map((emoji) => (
                <button key={emoji} onClick={() => { onSendReaction(emoji); setShowReactionPicker(false) }}
                  className="w-10 h-10 flex items-center justify-center text-xl hover:bg-dark-400 rounded-lg transition-colors hover:scale-125 transform">
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-dark-400 mx-1" />

        {/* Chat */}
        <ControlButton
          active={showChat}
          activeColor="blue"
          onClick={onToggleChat}
          icon={<MessageSquare className="w-5 h-5" />}
          label="Chat"
          badge={chatUnread > 0 ? chatUnread : null}
        />

        {/* Participants */}
        <ControlButton
          active={showParticipants}
          activeColor="blue"
          onClick={onToggleParticipants}
          icon={<Users className="w-5 h-5" />}
          label="Participants"
        />

        {/* Captions */}
        <ControlButton
          active={captionsEnabled}
          activeColor="blue"
          onClick={onToggleCaptions}
          icon={<Subtitles className="w-5 h-5" />}
          label={captionsEnabled ? 'Hide captions' : 'Show captions'}
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
            <div className="absolute bottom-full mb-2 right-0 bg-dark-300 rounded-xl shadow-lg py-2 min-w-[200px] animate-slide-up">
              {/* Recording */}
              <MoreMenuItem
                icon={<Circle className={`w-4 h-4 ${isRecording ? 'fill-red-500 text-red-500' : ''}`} />}
                label={isRecording ? 'Stop recording' : 'Start recording'}
                onClick={() => { onToggleRecording(); setShowMore(false) }}
              />
              {/* Device Settings */}
              <MoreMenuItem
                icon={<Settings className="w-4 h-4" />}
                label="Audio & Video settings"
                onClick={() => { onOpenSettings(); setShowMore(false) }}
              />
              {/* Picture-in-Picture */}
              {document.pictureInPictureEnabled && (
                <MoreMenuItem
                  icon={<PictureInPicture className="w-4 h-4" />}
                  label={isPiP ? 'Exit PiP' : 'Picture-in-Picture'}
                  onClick={() => { onTogglePiP(); setShowMore(false) }}
                />
              )}
              {/* Whiteboard */}
              <MoreMenuItem
                icon={<Brush className="w-4 h-4" />}
                label="Whiteboard"
                onClick={() => { onOpenWhiteboard(); setShowMore(false) }}
              />
              {/* Meeting Settings (host only) */}
              {isHost && (
                <MoreMenuItem
                  icon={<Shield className="w-4 h-4" />}
                  label="Meeting settings"
                  onClick={() => { onOpenMeetingSettings(); setShowMore(false) }}
                />
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-dark-400 mx-1" />

        {/* Leave */}
        <button
          onClick={onLeave}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 rounded-full flex items-center gap-2 transition-colors"
        >
          <PhoneOff className="w-5 h-5" />
          <span className="hidden sm:inline text-sm font-medium">Leave</span>
        </button>
      </div>
    </div>
  )
}

function ControlButton({ active, activeColor = 'default', onClick, icon, label, badge }) {
  const getButtonClasses = () => {
    if (!active) {
      if (activeColor === 'default') return 'bg-dark-400 hover:bg-dark-500'
      return 'bg-dark-400 hover:bg-dark-500'
    }

    switch (activeColor) {
      case 'green': return 'bg-green-600 hover:bg-green-700'
      case 'red': return 'bg-red-600 hover:bg-red-700'
      case 'blue': return 'bg-primary-600 hover:bg-primary-700'
      case 'yellow': return 'bg-yellow-600 hover:bg-yellow-700'
      default: return 'bg-dark-400 hover:bg-dark-500'
    }
  }

  // For mic/video: when active (unmuted/video on) = dark, when inactive (muted/off) = red
  const getToggleClasses = () => {
    if (activeColor === 'default') {
      return active ? 'bg-dark-400 hover:bg-dark-500' : 'bg-red-600 hover:bg-red-700'
    }
    return getButtonClasses()
  }

  return (
    <button
      onClick={onClick}
      className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${
        activeColor === 'default' ? getToggleClasses() : getButtonClasses()
      }`}
      title={label}
    >
      {icon}
      {badge != null && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-primary-600 rounded-full text-[10px] flex items-center justify-center px-1 font-semibold">
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
      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-dark-400 transition-colors text-left"
    >
      {icon}
      <span className="text-sm">{label}</span>
    </button>
  )
}
