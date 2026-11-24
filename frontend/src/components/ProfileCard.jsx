import { useEffect, useState } from 'react'
import { X, Mail, MapPin, Clock, Briefcase, MessageSquare, Loader2 } from 'lucide-react'
import api from '../lib/api'
import Avatar from './Avatar'
import { usePresenceStore, getActiveStatus } from '../store/presenceStore'

const localTime = (tz) => {
  try { return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date()) } catch { return null }
}

const Row = ({ icon: Icon, children }) => (
  <div className="flex items-start gap-3 text-sm text-gray-300"><Icon className="w-4 h-4 mt-0.5 text-gray-500 shrink-0" /><span className="min-w-0 break-words">{children}</span></div>
)

/** Read-only profile of another user (opened by clicking their avatar/name). */
export default function ProfileCard({ userId, initial, onClose, onMessage }) {
  const [u, setU] = useState(initial || null)
  const [error, setError] = useState(false)
  const live = usePresenceStore(s => s.statuses[userId])
  const online = usePresenceStore(s => s.onlineUserIds.includes(userId))

  useEffect(() => {
    let alive = true
    api.get(`/auth/users/${userId}`).then(r => alive && setU(r.data.data.user)).catch(() => alive && setError(true))
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => { alive = false; document.removeEventListener('keydown', onKey) }
  }, [userId, onClose])

  const status = getActiveStatus(live || u)
  const time = u?.timezone ? localTime(u.timezone) : null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-strong rounded-3xl border border-white/10 w-full max-w-sm shadow-float overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary-600/60 via-accent-600/40 to-primary-500/30" />
        <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/30 text-gray-200 hover:bg-black/50" aria-label="Close"><X className="w-4 h-4" /></button>

        {!u && !error && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>}
        {error && !u && <p className="text-center text-sm text-gray-400 py-16">Couldn't load this profile.</p>}

        {u && (
          <div className="px-6 pb-6 -mt-10">
            <Avatar user={u} size="2xl" online={online} ring className="mb-3" />
            <h3 className="text-xl font-bold font-display">{u.name}</h3>
            {(u.title || u.department) && <p className="text-sm text-gray-400">{[u.title, u.department].filter(Boolean).join(' · ')}</p>}
            <p className="text-xs text-gray-500 mt-1">{online ? 'Active now' : u.lastSeen ? `Last seen ${new Date(u.lastSeen).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Offline'}</p>

            {status && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-sm text-gray-200">
                <span>{status.statusEmoji}</span>{status.customStatus}
              </div>
            )}

            {u.bio && <p className="mt-4 text-sm text-gray-300 whitespace-pre-wrap">{u.bio}</p>}

            <div className="mt-4 space-y-2.5 pt-4 border-t border-white/[0.06]">
              <Row icon={Mail}>{u.email}</Row>
              {u.department && <Row icon={Briefcase}>{u.department}</Row>}
              {u.location && <Row icon={MapPin}>{u.location}</Row>}
              {time && <Row icon={Clock}>{time} local time <span className="text-gray-500">({u.timezone.replace(/_/g, ' ')})</span></Row>}
            </div>

            {onMessage && (
              <button onClick={() => onMessage(u)} className="btn btn-primary w-full mt-5 gap-2"><MessageSquare className="w-4 h-4" /> Message</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
