import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.DEV
  ? import.meta.env.VITE_SOCKET_URL || ''
  : ''

let socket = null
let keepAliveTimer = null
let nodeUnreachableHandler = null
// Called once a few reconnect attempts have failed: the owner node may be dead, so re-resolve placement.
export const setNodeUnreachableHandler = (fn) => { nodeUnreachableHandler = fn }

const CONNECTION_TIMEOUT = 15000
const MAX_RECONNECT_ATTEMPTS = 20
const RECONNECT_BASE_DELAY = 500
const RECONNECT_MAX_DELAY = 5000
const KEEPALIVE_INTERVAL = 20000

export const initSocket = (token, nodeUrl = '') => {
  // Callers without an explicit node (auth store) must reuse whatever live socket exists, never replace a meeting's node socket
  const target = nodeUrl || SOCKET_URL
  // Reuse a live socket only if it belongs to the same user: after a login as someone else it must be replaced
  // `active` is true while connecting / reconnecting too. Replacing a socket that is still connecting
  // (e.g. the auth check calling initSocket right after the meeting page did) killed the instance the
  // meeting page was holding: it never emitted room:join, so nobody could see anybody.
  if (socket && socket.auth?.token === token && (!nodeUrl || socket.__target === target) && (socket.connected || socket.active)) {
    return socket
  }

  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }

  socket = io(target, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: RECONNECT_BASE_DELAY,
    reconnectionDelayMax: RECONNECT_MAX_DELAY,
    randomizationFactor: 0.5,
    timeout: CONNECTION_TIMEOUT,
    closeOnBeforeunload: false,
  })

  socket.__target = target

  socket.on('connect', () => {
    if (keepAliveTimer) clearInterval(keepAliveTimer)
    keepAliveTimer = setInterval(() => {
      if (socket?.connected) socket.volatile.emit('ping')
    }, KEEPALIVE_INTERVAL)
  })

  socket.on('connect_error', (error) => {
    if (error.message === 'websocket error') return
    console.error('Socket connection error:', error.message)
  })

  socket.on('disconnect', (reason) => {
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null }
  })

  // socket.io re-joins on its own. Never reload the page here: that would destroy an in-progress
  // recording and the whole meeting session. After the built-in attempts run out, keep trying slowly.
  socket.io.on('reconnect_attempt', (attempt) => { if (attempt === 3) { try { nodeUnreachableHandler?.() } catch { /* ignore */ } } })
  socket.io.on('reconnect_failed', () => {
    setTimeout(() => { if (socket && !socket.connected) socket.connect() }, 10000)
  })

  return socket
}

export const getSocket = () => socket

export const disconnectSocket = () => {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null }
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}

export const waitForSocket = (timeout = 15000) => {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('Socket not initialized'))
      return
    }

    if (socket.connected) {
      resolve(socket)
      return
    }

    const timer = setTimeout(() => {
      socket.off('connect', onConnect)
      reject(new Error('Socket connection timed out'))
    }, timeout)

    const onConnect = () => {
      clearTimeout(timer)
      resolve(socket)
    }

    socket.once('connect', onConnect)
  })
}

export const isSocketConnected = () => socket?.connected ?? false

export default socket
