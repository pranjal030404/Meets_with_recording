import { Clock, Copy, Users, Grid3X3, Presentation, LayoutPanelLeft, Hand, Circle } from 'lucide-react'
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

  return (
    <header className="bg-dark-200 border-b border-dark-400 px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold truncate max-w-[200px]">{title || 'Meeting'}</h1>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          {isBeingRecorded && (
            <span className="flex items-center gap-1 text-red-400 mr-2">
              <Circle className="w-3 h-3 fill-red-500 text-red-500 animate-pulse" />
              <span className="text-xs font-medium">REC</span>
            </span>
          )}
          <Clock className="w-4 h-4" />
          <span>{formatTime(elapsedTime)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Layout Selector */}
        {onLayoutChange && (
          <div className="flex items-center bg-dark-300 rounded-lg p-0.5">
            {LAYOUTS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => onLayoutChange(id)}
                className={`p-1.5 rounded-md transition-colors ${
                  layout === id ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-dark-400'
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
          <div className="flex items-center gap-1 px-2 py-1 bg-yellow-600/20 rounded-lg text-yellow-400 text-sm">
            <Hand className="w-4 h-4" />
            <span>{handRaisedCount}</span>
          </div>
        )}

        {/* Participant count */}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Users className="w-4 h-4" />
          <span>{participantCount}</span>
        </div>

        {/* Copy meeting link */}
        <button
          onClick={onCopyLink}
          className="flex items-center gap-2 px-3 py-1.5 bg-dark-300 hover:bg-dark-400 rounded-lg text-sm transition-colors"
          title="Copy meeting link"
        >
          <Copy className="w-4 h-4" />
          <span className="hidden sm:inline">{roomId}</span>
        </button>
      </div>
    </header>
  )
}
