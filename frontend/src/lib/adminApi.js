import axios from 'axios'

const API_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL || ''
  : ''

// Separate client + storage key so admin sessions never mix with user sessions.
export const ADMIN_TOKEN_KEY = 'adminToken'

const adminApi = axios.create({ baseURL: `${API_URL}/api` })

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  config.headers = config.headers || {}
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

adminApi.interceptors.response.use(
  (r) => r,
  (error) => {
    const url = error.config?.url || ''
    if (error.response?.status === 401 && !url.includes('/admin/auth/login')) {
      localStorage.removeItem(ADMIN_TOKEN_KEY)
      window.location.href = '/admin'
    }
    return Promise.reject(error)
  }
)

export default adminApi
