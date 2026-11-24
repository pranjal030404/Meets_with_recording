import { create } from 'zustand'
import api from '../lib/api'
import { initSocket, disconnectSocket } from '../lib/socket'

export const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/auth/login', { email, password })
      const { user, token } = response.data.data

      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))

      // Initialize socket connection
      initSocket(token)

      set({
        user,
        token,
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

      const { user, token } = response.data.data

      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))

      // Initialize socket connection
      initSocket(token)

      set({
        user,
        token,
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

    localStorage.removeItem('token')
    localStorage.removeItem('user')
    disconnectSocket()

    set({
      user: null,
      token: null,
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

  // A stored token only means "was logged in once": confirm it (and the account) is still valid.
  initializeAuth: async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const response = await api.get('/auth/me')
      const user = response.data?.data?.user
      if (user) {
        localStorage.setItem('user', JSON.stringify(user))
        set({ user })
      }
      initSocket(token)
    } catch (error) {
      // 401 / suspended are handled (session cleared + redirect) by the api interceptor; a network
      // error just leaves the stored session alone so a flaky connection doesn't log people out.
      if (error.response) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        disconnectSocket()
        set({ user: null, token: null, isAuthenticated: false })
      }
    }
  },

  clearError: () => set({ error: null })
}))
