import { Clock, Copy, Users, Grid3X3, Presentation, LayoutPanelLeft, Hand, Circle, Video } from 'lucide-react'
import { useState, useEffect } from 'react'

const LAYOUTS = [
  { id: 'grid', icon: Grid3X3, label: 'Grid view' },
  { id: 'speaker', icon: Presentation, label: 'Speaker view' },
  { id: 'sidebar', icon: LayoutPanelLeft, label: 'Sidebar view' },
]

export default function MeetingHeader({
  roomId,
  title,
  onCopyLink,
  participantCount,
  isBeingRecorded,
  layout,
  onLayoutChange,
  handRaisedCount
}) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleCopy = () => {
    onCopyLink()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header className="glass border-b border-white/[0.06] px-4 py-2.5 flex items-center justify-between animate-fade-in-down">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 flex items-center justify-center shadow-md shadow-primary-500/25">
            <Video className="w-4 h-4 text-white" />
          </div>
        </div>
        <h1 className="text-base sm:text-lg font-semibold font-display truncate max-w-[180px] sm:max-w-[220px]">{title || 'Meeting'}</h1>
        <div className="flex items-center gap-2 text-gray-400 text-sm tabular-nums">
          {isBeingRecorded && (
            <span className="flex items-center gap-1.5 text-red-400 mr-1 bg-red-500/10 border border-red-400/25 rounded-full px-2.5 py-0.5">
              <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500 animate-pulse" />
              <span className="text-[11px] font-semibold tracking-wide">REC</span>
            </span>
          )}
          <Clock className="w-4 h-4 text-primary-400/80" />
          <span>{formatTime(elapsedTime)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Layout Selector */}
        {onLayoutChange && (
          <div className="hidden sm:flex items-center bg-dark-300/80 border border-white/[0.06] rounded-xl p-0.5">
            {LAYOUTS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => onLayoutChange(id)}
                className={`p-2 rounded-lg transition-all duration-300 ${
                  layout === id
                    ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-md shadow-primary-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-dark-400'
                }`}
                title={label}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}

        {/* Hand Raise Count */}
        {handRaisedCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-yellow-500/15 border border-yellow-400/25 rounded-xl text-yellow-300 text-sm font-semibold animate-pop">
            <Hand className="w-4 h-4 animate-bounce-hand" />
            <span>{handRaisedCount}</span>
          </div>
        )}

        {/* Participant count */}
        <div className="flex items-center gap-2 text-sm text-gray-400 bg-dark-300/80 border border-white/[0.06] rounded-xl px-3 py-1.5">
          <Users className="w-4 h-4 text-primary-400/80" />
          <span className="font-semibold text-gray-200 tabular-nums">{participantCount}</span>
        </div>

        {/* Copy meeting link */}
        <button
          onClick={handleCopy}
          className="group flex items-center gap-2 px-3 py-1.5 bg-dark-300/80 border border-white/[0.06] hover:border-primary-500/40 hover:bg-dark-400 rounded-xl text-sm transition-all duration-300 hover:shadow-glow"
          title="Copy meeting link"
        >
          <Copy className={`w-4 h-4 transition-all duration-300 ${copied ? 'text-green-400 scale-110' : 'text-gray-400 group-hover:text-primary-300'}`} />
          <span className="hidden md:inline font-mono text-xs text-gray-300">{roomId}</span>
        </button>
      </div>
    </header>
  )
}
