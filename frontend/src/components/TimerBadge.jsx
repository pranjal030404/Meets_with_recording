import { useState, useEffect } from 'react'
import { Timer } from 'lucide-react'
import { useCountdown, formatClock } from '../hooks/useMeetingTools'

const TIMES_UP_VISIBLE_MS = 8000

// Floating countdown shown to everyone while a host timer is running.
export default function TimerBadge({ timer, clockOffset }) {
  const remaining = useCountdown(timer, clockOffset)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    setExpired(false)
    if (!timer) return
    const hideAt = timer.endsAt + TIMES_UP_VISIBLE_MS - clockOffset
    const id = setTimeout(() => setExpired(true), Math.max(0, hideAt - Date.now()))
    return () => clearTimeout(id)
  }, [timer, clockOffset])

  if (!timer || remaining === null || expired) return null

  const done = remaining === 0
  const urgent = !done && remaining <= 10

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-fade-in">
      <div className={`flex items-center gap-2 rounded-full px-4 py-2 border ${
        done ? 'bg-red-600/90 border-red-400/40 text-white animate-pulse'
          : urgent ? 'bg-red-500/20 border-red-400/40 text-red-200'
          : 'bg-dark-300/90 border-white/10 text-white'
      }`}>
        <Timer className="w-4 h-4" />
        <span className="font-mono text-lg font-semibold tabular-nums">
          {done ? "Time's up" : formatClock(remaining)}
        </span>
      </div>
    </div>
  )
}
