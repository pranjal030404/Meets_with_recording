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
      const message = error.response?.data?.message || 'Login failed'
      set({ isLoading: false, error: message })
      return { success: false, message }
    }
  },

  signup: async (name, email, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post('/auth/signup', { name, email, password })
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
      const message = error.response?.data?.message || 'Signup failed'
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
      return { success: false, message: error.response?.data?.message }
    }
  },

  initializeAuth: () => {
    const token = localStorage.getItem('token')
    if (token) {
      initSocket(token)
    }
  },

  clearError: () => set({ error: null })
}))
