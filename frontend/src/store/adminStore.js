import { create } from 'zustand'
import adminApi, { ADMIN_TOKEN_KEY } from '../lib/adminApi'

export const useAdminStore = create((set) => ({
  admin: null,
  permissions: [],
  isLoading: !!localStorage.getItem(ADMIN_TOKEN_KEY),
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await adminApi.post('/admin/auth/login', { email, password })
      const { admin, token, permissions } = res.data.data
      localStorage.setItem(ADMIN_TOKEN_KEY, token)
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
    if (!localStorage.getItem(ADMIN_TOKEN_KEY)) return set({ isLoading: false })
    try {
      const res = await adminApi.get('/admin/auth/me')
      set({ admin: res.data.data.admin, permissions: res.data.data.permissions, isLoading: false })
    } catch {
      localStorage.removeItem(ADMIN_TOKEN_KEY)
      set({ admin: null, isLoading: false })
    }
  },

  logout: () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    set({ admin: null, permissions: [], error: null })
  }
}))

export const useCan = (perm) => useAdminStore(s => s.permissions.includes(perm))
