import { useState, useEffect, useRef } from 'react'
import { Download, AlertTriangle } from 'lucide-react'
import { LANGUAGES } from '../../lib/languages'
import { translateText } from '../../lib/translate'
import { PrimaryButton, DangerButton, selectClass } from './ui'

const formatTime = (timestamp) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function TranscriptLine({ line, translateTo }) {
  const [translated, setTranslated] = useState(null)

  useEffect(() => {
    setTranslated(null)
    if (!translateTo) return
    let cancelled = false
    translateText(line.text, translateTo)
      .then(result => { if (!cancelled) setTranslated(result) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [line.text, translateTo])

  return (
    <div className="text-sm">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-primary-400">{line.userName}</span>
        <span className="text-[11px] text-gray-600">{formatTime(line.timestamp)}</span>
      </div>
      <p className="text-gray-200">{translated ?? line.text}</p>
    </div>
  )
}

export default function TranscribeTool({ tools, canManage, title }) {
  const { transcribe, lines, setTranscribing, speechLang, setSpeechLang, speechSupported, translateTo } = tools
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [lines.length])

  const download = () => {
    const body = lines.map(l => `[${formatTime(l.timestamp)}] ${l.userName}: ${l.text}`).join('\n')
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title || 'meeting').replace(/[^\w-]+/g, '_')}-live-transcript.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="p-4 space-y-3 border-b border-dark-400">
        <p className="text-sm text-gray-300">
          {transcribe.enabled
            ? `Live transcription is on${transcribe.by ? ` (started by ${transcribe.by})` : ''}. Everyone's speech is captured while their mic is on.`
            : 'Live transcription is off. When the host starts it, what people say is captured here and shown as captions.'}
        </p>

        {!speechSupported && (
          <div className="flex gap-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 text-xs text-yellow-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            This browser can't transcribe your microphone (use Chrome or Edge). You'll still see others' transcript.
          </div>
        )}

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500">Language you speak</span>
          <select value={speechLang} onChange={e => setSpeechLang(e.target.value)} className={`${selectClass} mt-1.5`}>
            {LANGUAGES.map(l => <option key={l.speech} value={l.speech}>{l.label}</option>)}
          </select>
        </label>

        {canManage && (transcribe.enabled
          ? <DangerButton onClick={() => setTranscribing(false)}>Stop transcription</DangerButton>
          : <PrimaryButton onClick={() => setTranscribing(true)}>Start transcription</PrimaryButton>)}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {lines.length === 0
          ? <p className="text-sm text-gray-500 text-center mt-6">The transcript will appear here.</p>
          : lines.map((line, i) => <TranscriptLine key={`${line.timestamp}-${i}`} line={line} translateTo={translateTo} />)}
        <div ref={endRef} />
      </div>

      <div className="p-3 border-t border-dark-400">
        <button onClick={download} disabled={lines.length === 0}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-full text-sm bg-dark-300 hover:bg-dark-400 transition-colors disabled:opacity-40">
          <Download className="w-4 h-4" /> Download transcript
        </button>
      </div>
    </div>
  )
}
