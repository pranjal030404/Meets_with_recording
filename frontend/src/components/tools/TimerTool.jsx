import { useState } from 'react'
import { Timer } from 'lucide-react'
import { useCountdown, formatClock } from '../../hooks/useMeetingTools'
import { PrimaryButton, DangerButton } from './ui'

const PRESET_MINUTES = [1, 5, 10, 15, 30]

export default function TimerTool({ tools, canManage }) {
  const { timer, clockOffset, startTimer, stopTimer } = tools
  const remaining = useCountdown(timer, clockOffset)
  const [customMinutes, setCustomMinutes] = useState('')

  const startCustom = () => {
    const minutes = Number(customMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 720) return
    startTimer(Math.round(minutes * 60))
    setCustomMinutes('')
  }

  return (
    <div className="p-4 space-y-5">
      <div className="rounded-2xl bg-dark-300/70 py-6 text-center">
        <Timer className="w-6 h-6 mx-auto mb-2 text-primary-400" />
        {timer ? (
          <>
            <div className="font-mono text-4xl font-semibold tabular-nums">
              {remaining === 0 ? "Time's up" : formatClock(remaining)}
            </div>
            <p className="text-xs text-gray-500 mt-2">Started by {timer.startedBy}</p>
          </>
        ) : (
          <p className="text-sm text-gray-400">No timer is running</p>
        )}
      </div>

      {canManage ? (
        <>
          <div>
            <p className="text-xs text-gray-500 mb-2">Start a countdown</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_MINUTES.map(minutes => (
                <button key={minutes} onClick={() => startTimer(minutes * 60)}
                  className="px-3 py-1.5 rounded-full bg-dark-300 hover:bg-primary-500/20 text-sm transition-colors">
                  {minutes} min
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="number" min="1" max="720" value={customMinutes}
              onChange={e => setCustomMinutes(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startCustom()}
              placeholder="Custom minutes"
              className="flex-1 min-w-0 bg-dark-300 border border-white/[0.08] rounded-xl px-3 py-2 text-sm outline-none focus:border-primary-500/60"
            />
            <PrimaryButton onClick={startCustom} className="!w-auto px-5">Start</PrimaryButton>
          </div>
          {timer && <DangerButton onClick={stopTimer}>Stop timer</DangerButton>}
        </>
      ) : (
        <p className="text-xs text-gray-500 text-center">Only the host or co-hosts can start or stop the timer.</p>
      )}
    </div>
  )
}
