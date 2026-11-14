// Mirrors backend/src/lib/breakoutRoomId.js: breakout rooms live at `<parent roomId>--br-<id>`.
const SEPARATOR = '--br-'

export const isBreakoutRoomId = (roomId) => typeof roomId === 'string' && roomId.includes(SEPARATOR)

export const parentRoomIdOf = (roomId) =>
  isBreakoutRoomId(roomId) ? roomId.slice(0, roomId.lastIndexOf(SEPARATOR)) : roomId

// Full reload on purpose: it tears down the old socket room and media transports cleanly.
export const goToRoom = (roomId) => window.location.assign(`/meeting/${roomId}`)
