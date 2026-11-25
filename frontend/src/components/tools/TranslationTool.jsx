import { useEffect, useState } from 'react'
import { Languages } from 'lucide-react'
import { translationStatus } from '../../lib/translate'
import { LANGUAGES } from '../../lib/languages'
import { selectClass } from './ui'

export default function TranslationTool({ tools, captionsEnabled, onToggleCaptions }) {
  const { translateTo, setTranslateTo } = tools
  const [status, setStatus] = useState(null)

  // Tell the user up front if the translation engine isn't running, instead of failing caption by caption
  useEffect(() => {
    if (!translateTo) { setStatus(null); return }
    let cancelled = false
    translationStatus().then(s => { if (!cancelled) setStatus(s) })
    return () => { cancelled = true }
  }, [translateTo])

  const change = (value) => {
    setTranslateTo(value)
    // Translated text appears in the captions overlay, so make sure it's showing
    if (value && !captionsEnabled) onToggleCaptions()
  }

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl bg-dark-300/70 p-4 flex gap-3">
        <Languages className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-300">
          Translate what others say into your language. Only you see the translation, as captions at the bottom of the call.
        </p>
      </div>

      <label className="block">
        <span className="text-xs text-gray-500">Translate captions to</span>
        <select value={translateTo} onChange={e => change(e.target.value)} className={`${selectClass} mt-2`}>
          <option value="">Off</option>
          {LANGUAGES.map(l => <option key={l.label} value={l.label}>{l.label}</option>)}
        </select>
      </label>

      {status && !status.available && (
        <p className="text-xs rounded-xl bg-red-500/10 text-red-300 p-3">
          Translation engine is not running. {status.hint}
        </p>
      )}

      <p className="text-xs text-gray-500">
        Captions are produced while live transcription is on. Ask the host to start <span className="text-gray-300">Transcribe</span> if nothing appears.
      </p>
    </div>
  )
}
