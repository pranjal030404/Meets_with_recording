import { useEffect, useRef } from 'react'

const Recognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null

export const speechRecognitionSupported = !!Recognition

/**
 * Runs the browser's speech recogniser on the local mic while `active`, calling
 * `onPhrase` with each finished phrase. Chrome ends sessions on silence, so it restarts itself.
 */
export default function useSpeechCapture({ active, lang, onPhrase }) {
  const onPhraseRef = useRef(onPhrase)
  onPhraseRef.current = onPhrase

  useEffect(() => {
    if (!active || !Recognition) return

    let stopped = false
    let restartTimer = null
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = lang

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue
        const phrase = event.results[i][0].transcript.trim()
        if (phrase) onPhraseRef.current(phrase)
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') stopped = true
    }
    recognition.onend = () => {
      if (stopped) return
      restartTimer = setTimeout(() => { try { recognition.start() } catch {} }, 300)
    }

    try { recognition.start() } catch {}

    return () => {
      stopped = true
      clearTimeout(restartTimer)
      recognition.onend = null
      try { recognition.stop() } catch {}
    }
  }, [active, lang])
}
