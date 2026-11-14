/**
 * Client-side meeting session phase. Replaces guessing from separate booleans
 * (isWaitingRoom / mediasoupReady / currentMeeting...) with one explicit state.
 *
 *   idle -> joining -> waiting -> connected -> leaving -> idle
 *                  \-----------^   (no waiting room)
 */
export const SESSION_TRANSITIONS = {
  idle: ['joining'],
  joining: ['waiting', 'connected', 'leaving', 'idle'],
  waiting: ['connected', 'leaving', 'idle'], // admitted, or denied / gave up
  connected: ['connected', 'joining', 'leaving', 'idle'], // 'joining' = socket reconnect re-join
  leaving: ['idle']
}

export const canTransition = (from, to) => from === to || (SESSION_TRANSITIONS[from] || []).includes(to)

export const recordingState = (s) => (s.isRecording ? 'recording' : s.isBeingRecorded ? 'recorded-by-other' : 'idle')
