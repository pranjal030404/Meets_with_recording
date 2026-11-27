import axios from 'axios'

const API_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL || ''
  : ''

// The admin session is its own HttpOnly cookie, so it never mixes with a user session. This flag only records
// that there is one to restore.
export const ADMIN_FLAG = 'adminSignedIn'

const adminApi = axios.create({ baseURL: `${API_URL}/api`, withCredentials: !!API_URL, headers: { 'X-Client': 'web' } })

adminApi.interceptors.response.use(
  (r) => r,
  (error) => {
    const url = error.config?.url || ''
    if (error.response?.status === 401 && !url.includes('/admin/auth/login')) {
      localStorage.removeItem(ADMIN_FLAG)
      window.location.href = '/admin'
    }
    return Promise.reject(error)
  }
)

export default adminApi
