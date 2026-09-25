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
    <div className="glass-strong border-t border-white/[0.06] px-4 py-3 relative z-30">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-400/20 to-transparent" />
      <div className="flex items-center justify-center gap-2 sm:gap-3">
        {/* Mute */}
        <div className="tooltip-host" data-tooltip={isMuted ? 'Unmute (Ctrl+D)' : 'Mute (Ctrl+D)'}>
          <ControlButton
            active={!isMuted}
            onClick={onToggleMute}
            icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            label={isMuted ? 'Unmute (Ctrl+D)' : 'Mute (Ctrl+D)'}
          />
        </div>

        {/* Video */}
        <div className="tooltip-host" data-tooltip={isVideoOff ? 'Turn on camera (Ctrl+E)' : 'Turn off camera (Ctrl+E)'}>
          <ControlButton
            active={!isVideoOff}
            onClick={onToggleVideo}
            icon={isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            label={isVideoOff ? 'Turn on camera (Ctrl+E)' : 'Turn off camera (Ctrl+E)'}
          />
        </div>

        {/* Screen Share */}
        <div className="tooltip-host" data-tooltip={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
          <ControlButton
            active={isScreenSharing}
            activeColor="green"
            onClick={onToggleScreenShare}
            icon={isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            label={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          />
        </div>

        {/* Hand Raise */}
        <div className="tooltip-host" data-tooltip={isHandRaised ? 'Lower hand' : 'Raise hand'}>
          <ControlButton
            active={isHandRaised}
            activeColor="yellow"
            onClick={onToggleHandRaise}
            icon={<Hand className={`w-5 h-5 ${isHandRaised ? 'animate-bounce-hand' : ''}`} />}
            label={isHandRaised ? 'Lower hand' : 'Raise hand'}
            badge={handRaisedCount > 0 ? handRaisedCount : null}
          />
        </div>

        {/* Reactions */}
        <div className="relative tooltip-host" data-tooltip="Reactions" ref={reactionRef}>
          <ControlButton
            active={showReactionPicker}
            activeColor="blue"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            icon={<Smile className="w-5 h-5" />}
            label="Reactions"
          />
          {showReactionPicker && (
            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 glass-strong rounded-2xl shadow-float p-2.5 flex gap-1 animate-slide-up border border-white/10">
              {REACTION_EMOJIS.map((emoji, i) => (
                <button key={emoji} onClick={() => { onSendReaction(emoji); setShowReactionPicker(false) }}
                  className="w-11 h-11 flex items-center justify-center text-2xl hover:bg-primary-500/15 rounded-xl transition-all duration-200 hover:scale-125 transform"
                  style={{ transitionDelay: `${i * 15}ms` }}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10 mx-1" />

        {/* Chat */}
        <div className="tooltip-host" data-tooltip="Chat">
          <ControlButton
            active={showChat}
            activeColor="blue"
            onClick={onToggleChat}
            icon={<MessageSquare className="w-5 h-5" />}
            label="Chat"
            badge={chatUnread > 0 ? chatUnread : null}
          />
        </div>

        {/* Participants */}
        <div className="tooltip-host" data-tooltip="Participants">
          <ControlButton
            active={showParticipants}
            activeColor="blue"
            onClick={onToggleParticipants}
            icon={<Users className="w-5 h-5" />}
            label="Participants"
          />
        </div>

        {/* Captions */}
        <div className="tooltip-host hidden sm:block" data-tooltip={captionsEnabled ? 'Hide captions' : 'Show captions'}>
          <ControlButton
            active={captionsEnabled}
            activeColor="blue"
            onClick={onToggleCaptions}
            icon={<Subtitles className="w-5 h-5" />}
            label={captionsEnabled ? 'Hide captions' : 'Show captions'}
          />
        </div>

        {/* More options */}
        <div className="relative tooltip-host" data-tooltip="More options" ref={moreMenuRef}>
          <ControlButton
            active={showMore}
            onClick={() => setShowMore(!showMore)}
            icon={<MoreVertical className="w-5 h-5" />}
            label="More"
          />

          {showMore && (
            <div className="absolute bottom-full mb-3 right-0 glass-strong rounded-2xl shadow-float py-2 min-w-[230px] animate-slide-up border border-white/10 overflow-hidden">
              {/* Recording */}
              <MoreMenuItem
                icon={<Circle className={`w-4 h-4 ${isRecording ? 'fill-red-500 text-red-500 animate-pulse' : ''}`} />}
                label={isRecording ? 'Stop recording' : 'Start recording'}
                danger={isRecording}
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
        <div className="w-px h-8 bg-white/10 mx-1" />

        {/* Leave */}
        <button
          onClick={onLeave}
          className="group px-5 py-2.5 bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 rounded-full flex items-center gap-2 transition-all duration-300 shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:scale-105 active:scale-95"
          title="Leave meeting"
        >
          <PhoneOff className="w-5 h-5 transition-transform duration-300 group-hover:rotate-[15deg]" />
          <span className="hidden sm:inline text-sm font-semibold">Leave</span>
        </button>
      </div>
    </div>
  )
}

function ControlButton({ active, activeColor = 'default', onClick, icon, label, badge }) {
  const getButtonClasses = () => {
    if (!active) {
      return 'bg-dark-400/70 hover:bg-dark-500/80 border border-white/[0.06] text-gray-200'
    }

    switch (activeColor) {
      case 'green': return 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg shadow-green-500/30'
      case 'red': return 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30'
      case 'blue': return 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-500/30'
      case 'yellow': return 'bg-gradient-to-br from-yellow-500 to-amber-600 text-black shadow-lg shadow-yellow-500/30'
      default: return 'bg-dark-400/70 hover:bg-dark-500/80 border border-white/[0.06] text-gray-200'
    }
  }

  // For mic/video: when active (unmuted/video on) = dark, when inactive (muted/off) = red
  const getToggleClasses = () => {
    if (activeColor === 'default') {
      return active
        ? 'bg-dark-400/70 hover:bg-dark-500/80 border border-white/[0.06] text-gray-200'
        : 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30'
    }
    return getButtonClasses()
  }

  return (
    <button
      onClick={onClick}
      className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 ease-out transform hover:scale-110 active:scale-95 ${
        activeColor === 'default' ? getToggleClasses() : getButtonClasses()
      }`}
      title={label}
      aria-label={label}
    >
      {icon}
      {badge != null && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-gradient-to-br from-primary-500 to-accent-600 rounded-full text-[10px] flex items-center justify-center px-1 font-bold text-white shadow-lg animate-pop">
          {badge}
        </span>
      )}
    </button>
  )
}

function MoreMenuItem({ icon, label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-2.5 flex items-center gap-3 transition-colors text-left group ${
        danger ? 'text-red-300 hover:bg-red-500/10' : 'text-gray-200 hover:bg-primary-500/10'
      }`}
    >
      <span className="transition-transform duration-200 group-hover:scale-110">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}
