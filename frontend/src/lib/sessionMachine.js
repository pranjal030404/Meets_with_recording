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

// ---------------------------------------------------------------------------------------------
// Smaller machines that used to be implied by loose booleans (isScreenSharing, isUploading, ...).
// Each is { state: [allowed next states] }; use `canMove(machine, from, to)` before changing state.
// ---------------------------------------------------------------------------------------------
export const canMove = (machine, from, to) => from === to || (machine[from] || []).includes(to)

/** Screen share:  idle -> requesting (browser picker open) -> sharing -> stopping -> idle */
export const SCREEN_SHARE_TRANSITIONS = {
  idle: ['requesting'],
  requesting: ['sharing', 'idle'], // picked / cancelled / failed
  sharing: ['stopping', 'idle'],
  stopping: ['idle']
}

/** Chat attachment:  idle -> selected -> uploading -> (done -> idle | failed -> selected|idle) */
export const UPLOAD_TRANSITIONS = {
  idle: ['selected'],
  selected: ['uploading', 'idle', 'selected'],
  uploading: ['done', 'failed'],
  done: ['idle', 'selected', 'uploading'],
  failed: ['uploading', 'selected', 'idle']
}

/** SFU transport link (mediasoup): mirrors the WebRTC connection states plus our own recovery step. */
export const MEDIA_LINK_TRANSITIONS = {
  new: ['connecting', 'closed'],
  connecting: ['connected', 'failed', 'closed'],
  connected: ['disconnected', 'failed', 'closed'],
  disconnected: ['connected', 'reconnecting', 'failed', 'closed'],
  reconnecting: ['connected', 'failed', 'closed'], // ICE restart in flight
  failed: ['reconnecting', 'closed'],
  closed: []
}
