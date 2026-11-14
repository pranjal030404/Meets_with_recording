import { useState, useEffect, useRef, useCallback } from 'react'
import { getSocket } from '../lib/socket'
import { defaultSpeechLanguage } from '../lib/languages'
import useSpeechCapture, { speechRecognitionSupported } from './useSpeechCapture'

const SPEECH_LANG_KEY = 'meet.speechLanguage'

const readSpeechLanguage = () => {
  try { return localStorage.getItem(SPEECH_LANG_KEY) || defaultSpeechLanguage() } catch { return defaultSpeechLanguage() }
}

/**
 * Client side of the in-meeting tools (timer, live transcription, live streaming).
 * The server owns the state; this mirrors it and exposes host actions.
 */
export default function useMeetingTools({ roomId, enabled, isMuted, onBreakoutClosed }) {
  const [timer, setTimer] = useState(null)
  const [clockOffset, setClockOffset] = useState(0) // server time minus local time
  const [transcribe, setTranscribe] = useState({ enabled: false, by: null })
  const [lines, setLines] = useState([])
  const [stream, setStream] = useState(null)
  const [speechLang, setSpeechLangState] = useState(readSpeechLanguage)
  const [translateTo, setTranslateTo] = useState('') // '' = off
  const onBreakoutClosedRef = useRef(onBreakoutClosed)
  onBreakoutClosedRef.current = onBreakoutClosed

  useEffect(() => {
    if (!enabled) return
    const socket = getSocket()
    if (!socket) return

    const onTimer = ({ timer: next, serverNow }) => {
      setClockOffset(serverNow - Date.now())
      setTimer(next)
    }
    const onTranscribe = (state) => {
      setTranscribe(state)
      if (state.enabled) socket.emit('transcript:request', { roomId })
    }
    const onStream = ({ stream: next }) => setStream(next)
    const onLine = (line) => setLines(prev => [...prev.slice(-1999), line])
    const onHistory = ({ lines: history }) => setLines(history)
    const onClosed = ({ returnRoomId }) => onBreakoutClosedRef.current?.(returnRoomId)
    const request = () => socket.emit('tools:request', { roomId })

    socket.on('timer:state', onTimer)
    socket.on('transcribe:state', onTranscribe)
    socket.on('stream:state', onStream)
    socket.on('transcript:line', onLine)
    socket.on('transcript:history', onHistory)
    socket.on('breakout:closed', onClosed)
    socket.on('connect', request)

    // The server also pushes this on join; asking again covers listeners attaching late.
    request()
    socket.emit('transcript:request', { roomId })
    const retry = setTimeout(request, 1500)

    return () => {
      clearTimeout(retry)
      socket.off('timer:state', onTimer)
      socket.off('transcribe:state', onTranscribe)
      socket.off('stream:state', onStream)
      socket.off('transcript:line', onLine)
      socket.off('transcript:history', onHistory)
      socket.off('breakout:closed', onClosed)
      socket.off('connect', request)
    }
  }, [roomId, enabled])

  // Everyone's browser transcribes their own mic while transcription is on (and they're unmuted)
  const sendPhrase = useCallback((text) => {
    getSocket()?.emit('transcribe:line', { roomId, text })
  }, [roomId])
  useSpeechCapture({ active: enabled && transcribe.enabled && !isMuted, lang: speechLang, onPhrase: sendPhrase })

  const setSpeechLang = useCallback((lang) => {
    setSpeechLangState(lang)
    try { localStorage.setItem(SPEECH_LANG_KEY, lang) } catch {}
  }, [])

  const startTimer = useCallback((seconds) => getSocket()?.emit('timer:start', { roomId, seconds }), [roomId])
  const stopTimer = useCallback(() => getSocket()?.emit('timer:stop', { roomId }), [roomId])
  const setTranscribing = useCallback((on) => getSocket()?.emit('transcribe:set', { roomId, enabled: on }), [roomId])
  const setStreaming = useCallback((on) => getSocket()?.emit('stream:set', { roomId, enabled: on }), [roomId])

  return {
    timer, clockOffset, startTimer, stopTimer,
    transcribe, lines, setTranscribing, speechLang, setSpeechLang, speechSupported: speechRecognitionSupported,
    stream, setStreaming,
    translateTo, setTranslateTo
  }
}

// Seconds left on the timer (ticks 4x a second so it stays in step with the server clock).
export function useCountdown(timer, clockOffset) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timer) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [timer])
  if (!timer) return null
  return Math.max(0, Math.ceil((timer.endsAt - (now + clockOffset)) / 1000))
}

export const formatClock = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return h > 0 ? `${h}:${mmss}` : mmss
}
