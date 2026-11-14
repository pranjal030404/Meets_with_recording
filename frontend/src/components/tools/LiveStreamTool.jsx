import { useState, useEffect } from 'react'
import { Radio, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { PrimaryButton, DangerButton } from './ui'

const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function LiveStreamTool({ tools, roomId, canManage }) {
  const { stream, setStreaming } = tools
  const [now, setNow] = useState(Date.now())
  const viewerLink = `${window.location.origin}/meeting/${roomId}?viewOnly=1`

  useEffect(() => {
    if (!stream) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [stream])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(viewerLink)
      toast.success('View-only link copied')
    } catch {
      toast.error('Could not copy the link')
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl bg-dark-300/70 p-4 text-center">
        <Radio className={`w-6 h-6 mx-auto mb-2 ${stream ? 'text-red-400 animate-pulse' : 'text-primary-400'}`} />
        {stream ? (
          <>
            <p className="text-sm font-semibold text-red-300">Live for {formatElapsed(now - stream.startedAt)}</p>
            <p className="text-xs text-gray-500 mt-1">Started by {stream.startedBy}</p>
          </>
        ) : (
          <p className="text-sm text-gray-400">Not streaming</p>
        )}
      </div>

      <p className="text-sm text-gray-300">
        Share a view-only link so an audience can watch and listen without turning on their mic or camera.
      </p>

      {stream && (
        <button onClick={copyLink}
          className="w-full flex items-center justify-between gap-2 rounded-xl bg-dark-300 px-3 py-2 text-left hover:bg-dark-400 transition-colors">
          <span className="text-xs text-gray-300 truncate">{viewerLink}</span>
          <Copy className="w-4 h-4 shrink-0 text-gray-400" />
        </button>
      )}

      {canManage && (stream
        ? <DangerButton onClick={() => setStreaming(false)}>Stop live stream</DangerButton>
        : <PrimaryButton onClick={() => setStreaming(true)}>Start live stream</PrimaryButton>)}
    </div>
  )
}
