import { create } from 'zustand'
import adminApi, { ADMIN_FLAG } from '../lib/adminApi'

export const useAdminStore = create((set) => ({
  admin: null,
  permissions: [],
  isLoading: !!localStorage.getItem(ADMIN_FLAG),
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await adminApi.post('/admin/auth/login', { email, password })
      const { admin, permissions } = res.data.data
      localStorage.setItem(ADMIN_FLAG, '1')
      set({ admin, permissions, isLoading: false })
      return { success: true }
    } catch (err) {
      const message = !err.response
        ? 'Cannot reach backend server.'
        : err.response.data?.message || 'Login failed'
      set({ isLoading: false, error: message })
      return { success: false, message }
    }
  },

  restore: async () => {
    if (!localStorage.getItem(ADMIN_FLAG)) return set({ isLoading: false })
    try {
      const res = await adminApi.get('/admin/auth/me')
      set({ admin: res.data.data.admin, permissions: res.data.data.permissions, isLoading: false })
    } catch {
      localStorage.removeItem(ADMIN_FLAG)
      set({ admin: null, isLoading: false })
    }
  },

  logout: async () => {
    await adminApi.post('/admin/auth/logout').catch(() => {}) // ends the session and removes the cookie
    localStorage.removeItem(ADMIN_FLAG)
    set({ admin: null, permissions: [], error: null })
  }
}))

export const useCan = (perm) => useAdminStore(s => s.permissions.includes(perm))
