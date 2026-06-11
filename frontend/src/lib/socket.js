import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.DEV
  ? import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'
  : ''

let socket = null
let keepAliveTimer = null

const CONNECTION_TIMEOUT = 15000
const MAX_RECONNECT_ATTEMPTS = 20
const RECONNECT_BASE_DELAY = 500
const RECONNECT_MAX_DELAY = 5000
const KEEPALIVE_INTERVAL = 20000

export const initSocket = (token) => {
  if (socket?.connected) {
    return socket
  }

  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }

  socket = io(SOCKET_URL, {
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

  socket.on('reconnect_attempt', (attempt) => {
    if (attempt % 5 === 0) {
      window.location.reload()
    }
  })

  socket.on('reconnect_failed', () => {
    window.location.reload()
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
