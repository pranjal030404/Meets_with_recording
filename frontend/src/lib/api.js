import axios from 'axios'

const API_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL || ''
  : ''

const api = axios.create({
  baseURL: `${API_URL}/api`
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData

  config.headers = config.headers || {}

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  if (isFormData) {
    if (typeof config.headers.delete === 'function') {
      config.headers.delete('Content-Type')
    } else {
      delete config.headers['Content-Type']
    }
  } else if (!config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json'
  }

  return config
})

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = error.config?.url || ''
    const isCredentialCall = /\/auth\/(login|register|signup)/.test(url) || url.includes('/admin/')
    // An expired token (401) or a suspended account (403) ends the session. A wrong password on the
    // login form is also a 401, and must stay on the page so the error can be shown.
    const suspended = status === 403 && /suspended/i.test(error.response?.data?.message || '')
    if ((status === 401 || suspended) && !isCredentialCall) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (window.location.pathname !== '/login') window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
