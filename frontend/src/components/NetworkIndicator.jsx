import { useState, useEffect } from 'react'
import { getSocket } from '../lib/socket'

// Round-trip latency to the server, sampled every 5s, shown as signal bars.
export default function NetworkIndicator() {
  const [rtt, setRtt] = useState(null)

  useEffect(() => {
    let cancelled = false
    const probe = () => {
      const socket = getSocket()
      if (!socket?.connected) return !cancelled && setRtt(-1)
      const start = performance.now()
      socket.timeout(4000).emit('net:ping', (err) => {
        if (!cancelled) setRtt(err ? -1 : Math.round(performance.now() - start))
      })
    }
    probe()
    const id = setInterval(probe, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (rtt === null) return null
  const bars = rtt < 0 ? 0 : rtt < 150 ? 3 : rtt < 350 ? 2 : 1
  const color = bars === 3 ? 'bg-green-400' : bars === 2 ? 'bg-yellow-400' : 'bg-red-400'
  const label = rtt < 0 ? 'Connection lost' : `${rtt} ms${bars === 1 ? ' — poor connection' : ''}`

  return (
    <div className="flex items-end gap-0.5 h-4 px-1" title={label} aria-label={label}>
      {[1, 2, 3].map(n => (
        <span key={n} className={`w-1 rounded-sm ${n <= bars ? color : 'bg-dark-500'}`} style={{ height: `${n * 33}%` }} />
      ))}
    </div>
  )
}
