import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.DEV
  ? import.meta.env.VITE_SOCKET_URL || 'http://localhost:5173'
  : ''

let socket = null

const CONNECTION_TIMEOUT = 10000
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 10000

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
    timeout: CONNECTION_TIMEOUT
  })

  socket.on('connect', () => {
    console.log('🔌 Socket connected:', socket.id)
  })

  socket.on('connect_error', (error) => {
    console.error('🔌 Socket connection error:', error.message)
  })

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' || reason === 'transport close') {
      console.log('🔌 Socket disconnected:', reason)
    }
  })

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`🔌 Socket reconnection attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`)
  })

  socket.on('reconnect_failed', () => {
    console.error('🔌 Socket reconnection failed after all attempts')
  })

  return socket
}

export const getSocket = () => socket

export const disconnectSocket = () => {
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
