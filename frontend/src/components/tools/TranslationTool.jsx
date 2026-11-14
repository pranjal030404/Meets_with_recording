import { Languages } from 'lucide-react'
import { LANGUAGES } from '../../lib/languages'
import { selectClass } from './ui'

export default function TranslationTool({ tools, captionsEnabled, onToggleCaptions }) {
  const { translateTo, setTranslateTo } = tools

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
        <span className="text-xs uppercase tracking-wide text-gray-500">Translate captions to</span>
        <select value={translateTo} onChange={e => change(e.target.value)} className={`${selectClass} mt-2`}>
          <option value="">Off</option>
          {LANGUAGES.map(l => <option key={l.label} value={l.label}>{l.label}</option>)}
        </select>
      </label>

      <p className="text-xs text-gray-500">
        Captions are produced while live transcription is on. Ask the host to start <span className="text-gray-300">Transcribe</span> if nothing appears.
      </p>
    </div>
  )
}
