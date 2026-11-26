import { useState, useEffect } from 'react'
import api from '../lib/api'

const SIZES = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-12 h-12 text-sm',
  xl: 'w-20 h-20 text-xl',
  '2xl': 'w-28 h-28 text-3xl',
}
const DOTS = { xs: 'w-2 h-2', sm: 'w-2.5 h-2.5', md: 'w-3 h-3', lg: 'w-3.5 h-3.5', xl: 'w-4 h-4', '2xl': 'w-5 h-5' }
// muted, one step apart: enough to tell people apart without competing with the blue accent
const PALETTE = ['bg-[#31528c]', 'bg-[#2f6660]', 'bg-[#5b4a7d]', 'bg-[#7a4553]', 'bg-[#75592f]', 'bg-[#46525f]']

export const initialsOf = (name = '?') =>
  String(name).trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'

const colorOf = (key = '') => {
  let h = 0
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// Uploaded photos are private: <img> authenticates with a cookie that any signed-in API call (re)issues.
// If a photo fails, refresh that cookie once (shared by every avatar failing at the same time).
let cookieRefresh = null
const refreshAssetCookie = () => {
  cookieRefresh ||= api.get('/auth/me').finally(() => { cookieRefresh = null })
  return cookieRefresh
}

/**
 * One avatar for the whole app. Shows the photo when it loads, otherwise coloured initials
 * (a missing/broken image never shows the browser's broken-image icon + alt text).
 * `online` = true/false draws a presence dot, undefined draws none.
 */
export default function Avatar({ user, name, src, size = 'md', online, ring = false, className = '' }) {
  const label = name || user?.name || '?'
  const url = src !== undefined ? src : user?.avatar
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { setFailed(false); setAttempt(0) }, [url])

  const handleError = () => {
    setFailed(true)
    if (attempt > 0 || !url.startsWith('/uploads/') || !localStorage.getItem('token')) return
    refreshAssetCookie()
      .then(() => { setAttempt(1); setFailed(false) })
      .catch(() => {}) // keep the initials
  }
  const showImg = !!url && !failed
  const presence = online !== undefined ? online : undefined

  return (
    <div className={`relative shrink-0 ${className}`}>
      {showImg ? (
        <img
          key={attempt}
          src={url}
          alt=""
          onError={handleError}
          className={`${SIZES[size]} rounded-full object-cover bg-dark-300 ${ring ? 'ring-2 ring-primary-500/40' : ''}`}
        />
      ) : (
        <div
          aria-label={label}
          className={`${SIZES[size]} rounded-full flex items-center justify-center font-medium text-white ${colorOf(user?.id || label)} ${ring ? 'ring-2 ring-primary-500/40' : ''}`}
        >
          {initialsOf(label)}
        </div>
      )}
      {presence !== undefined && (
        <span className={`absolute -bottom-0.5 -right-0.5 ${DOTS[size]} rounded-full border-2 border-dark-200 ${presence ? 'bg-green-400' : 'bg-gray-600'}`} />
      )}
    </div>
  )
}
