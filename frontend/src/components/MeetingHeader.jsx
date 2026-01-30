import { Clock, Copy, Users } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function MeetingHeader({ roomId, title, onCopyLink, participantCount }) {
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
    <header className="bg-dark-200 border-b border-dark-400 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">{title || 'Meeting'}</h1>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <Clock className="w-4 h-4" />
          <span>{formatTime(elapsedTime)}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Users className="w-4 h-4" />
          <span>{participantCount}</span>
        </div>

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
