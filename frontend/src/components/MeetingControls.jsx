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
  Brush,
  BarChart3,
  HelpCircle,
  FlipHorizontal,
  Keyboard,
  Download,
  StickyNote,
  EyeOff,
  Shapes,
  Image
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useMeetingStore } from '../store/meetingStore'
import { REACTION_EMOJIS } from './EmojiReactions'
import { popOutSupported } from '../lib/popOut'

export default function MeetingControls({
  isMuted,
  isVideoOff,
  isScreenSharing,
  isRecording,
  isHost,
  isCoHost,
  canManage,
  isHandRaised,
  showChat,
  showParticipants,
  showTools,
  captionsEnabled,
  handRaisedCount,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleRecording,
  onRecordAudio,
  onOpenBackground,
  onToggleChat,
  onToggleParticipants,
  onToggleTools,
  onToggleHandRaise,
  onToggleCaptions,
  onSendReaction,
  onLeave,
  onOpenSettings,
  onOpenMeetingSettings,
  onOpenMeetingDetails,
  onTogglePiP,
  onOpenWhiteboard,
  onOpenActivities,
  onToggleMirror,
  onOpenShortcuts,
  onDownloadAttendance,
  onOpenNotes,
  onToggleHideSelf,
  hideSelf,
  mirrorSelf,
  isPiP,
  chatUnread
}) {
  const micLevel = useMeetingStore(st => st.audioLevel)
  const micTalking = useMeetingStore(st => st.isSpeaking)
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
    <div className="glass-strong border-t border-white/[0.06] px-2 sm:px-4 py-2 sm:py-3 relative z-30">
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-3">
        {/* Mute */}
        <div className="tooltip-host" data-tooltip={isMuted ? 'Unmute (Ctrl+D)' : 'Mute (Ctrl+D)'}>
          <ControlButton
            active={!isMuted}
            onClick={onToggleMute}
            icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className={`w-5 h-5 ${micTalking ? 'text-emerald-400' : ''}`} />}
            label={isMuted ? 'Unmute (Ctrl+D)' : 'Mute (Ctrl+D)'}
            ringLevel={!isMuted && micTalking ? Math.min(1, micLevel * 1.5) : 0}
            attention={isMuted}
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
            icon={<Hand className={`w-5 h-5 ${isHandRaised ? '' : ''}`} />}
            label={isHandRaised ? 'Lower hand' : 'Raise hand'}
            badge={handRaisedCount > 0 ? handRaisedCount : null}
          />
        </div>

        {/* Reactions */}
        <div className="sm:relative tooltip-host" data-tooltip="Reactions" ref={reactionRef}>
          <ControlButton
            active={showReactionPicker}
            activeColor="blue"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            icon={<Smile className="w-5 h-5" />}
            label="Reactions"
          />
          {showReactionPicker && (
            <div className="absolute bottom-full mb-2 sm:mb-3 left-1/2 -translate-x-1/2 w-max max-w-[calc(100vw-1rem)] flex-wrap justify-center glass-strong rounded-2xl p-2.5 flex gap-1 z-50 animate-fade-in border border-white/10">
              {REACTION_EMOJIS.map((emoji, i) => (
                <button key={emoji} onClick={() => { onSendReaction(emoji); setShowReactionPicker(false) }}
                  className="w-11 h-11 flex items-center justify-center text-2xl hover:bg-primary-500/15 rounded-xl transition-colors transform"
                  style={{ transitionDelay: `${i * 15}ms` }}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-8 bg-white/10 mx-1" />

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

        {/* Meeting tools */}
        <div className="tooltip-host" data-tooltip="Meeting tools">
          <ControlButton
            active={showTools}
            activeColor="blue"
            onClick={onToggleTools}
            icon={<Shapes className="w-5 h-5" />}
            label="Meeting tools"
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
        <div className="sm:relative tooltip-host" data-tooltip="More options" ref={moreMenuRef}>
          <ControlButton
            active={showMore}
            onClick={() => setShowMore(!showMore)}
            activeColor="blue"
            icon={<MoreVertical className="w-5 h-5" />}
            label="More"
          />

          {showMore && (
            <div className="absolute bottom-full mb-2 sm:mb-3 right-2 sm:right-0 glass-strong rounded-2xl py-2 w-[min(18rem,calc(100vw-1rem))] max-h-[min(70dvh,calc(100dvh-7rem))] overflow-y-auto z-50 animate-slide-up border border-white/10 ">
              {/* Recording */}
              <MoreMenuItem
                icon={<Circle className={`w-4 h-4 ${isRecording ? 'fill-red-500 text-red-500 animate-pulse' : ''}`} />}
                label={isRecording ? 'Stop recording' : 'Start recording'}
                danger={isRecording}
                onClick={() => { onToggleRecording(); setShowMore(false) }}
              />
              {!isRecording && (
                <MoreMenuItem
                  icon={<Mic className="w-4 h-4" />}
                  label="Record audio only"
                  onClick={() => { onRecordAudio(); setShowMore(false) }}
                />
              )}
              <MoreMenuItem
                icon={<Image className="w-4 h-4" />}
                label="Background effects"
                onClick={() => { onOpenBackground(); setShowMore(false) }}
              />
              {/* Device Settings */}
              <MoreMenuItem
                icon={<Settings className="w-4 h-4" />}
                label="Audio & Video settings"
                onClick={() => { onOpenSettings(); setShowMore(false) }}
              />
              {/* Picture-in-Picture */}
              {popOutSupported() && (
                <MoreMenuItem
                  icon={<PictureInPicture className="w-4 h-4" />}
                  label={isPiP ? 'Close pop-out' : 'Pop out meeting'}
                  onClick={() => { onTogglePiP(); setShowMore(false) }}
                />
              )}
              {/* Whiteboard */}
              <MoreMenuItem
                icon={<Brush className="w-4 h-4" />}
                label="Whiteboard"
                onClick={() => { onOpenWhiteboard(); setShowMore(false) }}
              />
              {/* Polls & Q&A */}
              <MoreMenuItem
                icon={<BarChart3 className="w-4 h-4" />}
                label="Polls"
                onClick={() => { onOpenActivities('polls'); setShowMore(false) }}
              />
              <MoreMenuItem
                icon={<HelpCircle className="w-4 h-4" />}
                label="Q&A"
                onClick={() => { onOpenActivities('qa'); setShowMore(false) }}
              />
              <MoreMenuItem
                icon={<StickyNote className="w-4 h-4" />}
                label="Meeting notes"
                onClick={() => { onOpenNotes(); setShowMore(false) }}
              />
              <MoreMenuItem
                icon={<EyeOff className="w-4 h-4" />}
                label={hideSelf ? 'Show my video tile' : 'Hide my video tile'}
                onClick={() => { onToggleHideSelf(); setShowMore(false) }}
              />
              {/* Self-view mirror */}
              <MoreMenuItem
                icon={<FlipHorizontal className="w-4 h-4" />}
                label={mirrorSelf ? 'Unmirror my video' : 'Mirror my video'}
                onClick={() => { onToggleMirror(); setShowMore(false) }}
              />
              {/* Attendance */}
              {canManage && (
                <MoreMenuItem
                  icon={<Download className="w-4 h-4" />}
                  label="Download attendance"
                  onClick={() => { onDownloadAttendance(); setShowMore(false) }}
                />
              )}
              <MoreMenuItem
                icon={<Keyboard className="w-4 h-4" />}
                label="Keyboard shortcuts"
                onClick={() => { onOpenShortcuts(); setShowMore(false) }}
              />
              {/* Meeting Details */}
              <MoreMenuItem
                icon={<Shield className="w-4 h-4" />}
                label="Meeting details"
                onClick={() => { onOpenMeetingDetails && onOpenMeetingDetails(); setShowMore(false) }}
              />
              {/* Meeting Settings */}
              {((canManage) || (isHost || isCoHost)) && (
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
        <div className="hidden sm:block w-px h-8 bg-white/10 mx-1" />

        {/* Leave */}
        <button
          onClick={onLeave}
          className="group px-3.5 sm:px-5 py-2.5 bg-red-500 hover:from-red-400 hover:to-red-500 rounded-full flex items-center gap-2 transition-colors active:scale-95"
          title="Leave meeting"
        >
          <PhoneOff className="w-5 h-5 transition-transform" />
          <span className="hidden sm:inline text-sm font-semibold">Leave</span>
        </button>
      </div>
    </div>
  )
}

function ControlButton({ active, activeColor = 'default', onClick, icon, label, badge, ringLevel = 0, attention = false }) {
  const getButtonClasses = () => {
    if (!active) {
      return 'bg-dark-400/70 hover:bg-dark-500/80 border border-white/[0.06] text-gray-200'
    }

    switch (activeColor) {
      case 'green': return 'bg-green-500 text-white'
      case 'red': return 'bg-red-500 text-white'
      case 'blue': return 'bg-primary-500 text-ink'
      case 'yellow': return 'bg-yellow-500 text-black'
      default: return 'bg-dark-400/70 hover:bg-dark-500/80 border border-white/[0.06] text-gray-200'
    }
  }

  // For mic/video: when active (unmuted/video on) = dark, when inactive (muted/off) = red
  const getToggleClasses = () => {
    if (activeColor === 'default') {
      return active
        ? 'bg-dark-400/70 hover:bg-dark-500/80 border border-white/[0.06] text-gray-200'
        : 'bg-red-500 text-white'
    }
    return getButtonClasses()
  }

  return (
    <button
      onClick={onClick}
      className={`relative w-10 h-10 min-[400px]:w-11 min-[400px]:h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ease-out transform active:scale-95 ${
        activeColor === 'default' ? getToggleClasses() : getButtonClasses()
      }`}
      title={label}
      aria-label={label}
      style={ringLevel > 0 ? { boxShadow: `0 0 0 ${2 + ringLevel * 4}px rgba(52, 211, 153, ${0.25 + ringLevel * 0.45})` } : undefined}
    >
      {attention && (
        <span className="absolute inset-0 rounded-full ring-2 ring-red-400/70 pointer-events-none" aria-hidden="true" />
      )}
      {icon}
      {badge != null && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-primary-500 rounded-full text-[10px] flex items-center justify-center px-1 font-semibold text-ink">
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
      <span className="transition-transform">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}
