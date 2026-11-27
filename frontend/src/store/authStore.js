import { create } from 'zustand'
import api from '../lib/api'
import { initSocket, disconnectSocket } from '../lib/socket'

// A returning visitor is shown as signed in at once, so the socket has to exist at once too: components subscribe
// to it as they mount, and one that mounts before it exists would never receive live updates.
// Earlier versions kept the session token in page storage. Drop it: those people sign in once more.
if (localStorage.getItem('token') || localStorage.getItem('adminToken')) {
  for (const key of ['token', 'user', 'adminToken']) localStorage.removeItem(key)
}
const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
if (storedUser) initSocket(storedUser.id)

export const useAuthStore = create((set, get) => ({
  user: storedUser,
  isAuthenticated: !!storedUser,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/auth/login', { email, password })
      const { user } = response.data.data

      localStorage.setItem('user', JSON.stringify(user))

      // Initialize socket connection
      initSocket(user.id)

      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null
      })

      return { success: true }
    } catch (error) {
      const message = !error.response
        ? 'Cannot reach backend server. Start backend (port 5000) and MongoDB, then try again.'
        : error.response?.data?.message || 'Login failed'
      set({ isLoading: false, error: message })
      return { success: false, message, code: error.response?.data?.code }
    }
  },

  signup: async (name, email, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/auth/signup', { name, email, password })

      // Email verification is on: no session yet, the user must confirm their address first.
      if (response.data.data?.requiresVerification) {
        set({ isLoading: false, error: null })
        const { emailSent, email: sentTo } = response.data.data
        return { success: true, requiresVerification: true, emailSent, email: sentTo, message: response.data.message }
      }

      const { user } = response.data.data

      localStorage.setItem('user', JSON.stringify(user))

      // Initialize socket connection
      initSocket(user.id)

      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null
      })

      return { success: true }
    } catch (error) {
      const message = !error.response
        ? 'Cannot reach backend server. Start backend (port 5000) and MongoDB, then try again.'
        : error.response?.data?.message || 'Signup failed'
      set({ isLoading: false, error: message })
      return { success: false, message }
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      console.error('Logout error:', error)
    }

    localStorage.removeItem('user')
    disconnectSocket()

    set({
      user: null,
      isAuthenticated: false,
      error: null
    })
  },

  // Replace the cached user after a profile/avatar change (also refreshes localStorage)
  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ user })
  },

  updateProfile: async (data) => {
    set({ isLoading: true })
    try {
      const response = await api.put('/auth/profile', data)
      const { user } = response.data.data

      localStorage.setItem('user', JSON.stringify(user))
      set({ user, isLoading: false })

      return { success: true }
    } catch (error) {
      set({ isLoading: false })
      return { success: false, message: error.response?.data?.message || 'Could not save profile' }
    }
  },

  // A stored profile only means "was logged in once": confirm the session (and the account) is still valid.
  initializeAuth: async () => {
    if (!localStorage.getItem('user')) return
    try {
      const response = await api.get('/auth/me')
      const user = response.data?.data?.user
      if (user) {
        localStorage.setItem('user', JSON.stringify(user))
        set({ user })
        initSocket(user.id)
      }
    } catch (error) {
      // 401 / suspended are handled (session cleared + redirect) by the api interceptor; a network
      // error just leaves the stored session alone so a flaky connection doesn't log people out.
      if (error.response) {
        localStorage.removeItem('user')
        disconnectSocket()
        set({ user: null, isAuthenticated: false })
      }
    }
  },

  clearError: () => set({ error: null })
}))
