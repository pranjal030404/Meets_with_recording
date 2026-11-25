import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Camera, Trash2, Loader2, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import Avatar from './Avatar'
import { useAuthStore } from '../store/authStore'

const MAX_MB = 5
const FIELD = 'text-xs text-gray-500 mb-1 block'

const timezones = () => {
  try { return Intl.supportedValuesOf('timeZone') } catch { return ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London'] }
}

/**
 * Edit "my profile": photo + personal details.
 * Also reused by the admin console to edit ANY user: pass `target` (the user), `endpoints` (admin URLs)
 * and `onSaved`. Without them it edits the signed-in user through /auth/*.
 */
export default function ProfileModal({ onClose, target, endpoints, onSaved, client = api }) {
  const { user: me, setUser } = useAuthStore()
  const user = target || me
  const isSelf = !target
  const ep = endpoints || { profile: '/auth/profile', avatar: '/auth/profile/avatar' }

  const [form, setForm] = useState({
    name: user.name || '', title: user.title || '', department: user.department || '',
    phone: user.phone || '', location: user.location || '', timezone: user.timezone || '', bio: user.bio || '',
  })
  const [avatar, setAvatar] = useState(user.avatar || null)
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileRef = useRef(null)
  const zones = useMemo(timezones, [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const sync = (u) => {
    setAvatar(u.avatar || null)
    if (isSelf) setUser(u)
    onSaved?.(u)
  }

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return toast.error('Choose a JPG, PNG, WebP or GIF image')
    if (file.size > MAX_MB * 1024 * 1024) return toast.error(`Image must be under ${MAX_MB} MB`)
    setPhotoBusy(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      const res = await client.post(ep.avatar, fd)
      sync(res.data.data.user)
      toast.success('Photo updated')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed')
    } finally { setPhotoBusy(false) }
  }

  const onRemovePhoto = async () => {
    setPhotoBusy(true)
    try {
      const res = await client.delete(ep.avatar)
      sync(res.data.data.user)
      toast.success('Photo removed')
    } catch { toast.error('Could not remove photo') } finally { setPhotoBusy(false) }
  }

  const save = async (e) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return toast.error('Name must be at least 2 characters')
    setSaving(true)
    try {
      const res = await client.put(ep.profile, form)
      sync(res.data.data.user)
      toast.success('Profile saved')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save profile')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form onSubmit={save} className="relative glass-strong rounded-2xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5">
          <h3 className="text-lg font-semibold font-display">{isSelf ? 'Edit profile' : `Edit ${user.name}`}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/[0.06]" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {/* Photo */}
        <div className="flex items-center gap-5 px-6 py-5">
          <div className="relative">
            <Avatar user={{ ...user, avatar }} size="2xl" ring />
            {photoBusy && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>
            )}
          </div>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onPhoto} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy} className="btn btn-primary !py-2 !px-4 text-sm gap-2">
              <Camera className="w-4 h-4" /> {avatar ? 'Change photo' : 'Upload photo'}
            </button>
            {avatar && (
              <button type="button" onClick={onRemovePhoto} disabled={photoBusy} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300">
                <Trash2 className="w-3.5 h-3.5" /> Remove photo
              </button>
            )}
            <p className="text-[11px] text-gray-500">JPG, PNG, WebP or GIF · up to {MAX_MB} MB</p>
          </div>
        </div>

        {/* Details */}
        <div className="px-6 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={FIELD}>Full name</label>
            <input value={form.name} onChange={set('name')} className="input" maxLength={100} required />
          </div>
          <div>
            <label className={FIELD}>Job title</label>
            <input value={form.title} onChange={set('title')} className="input" maxLength={100} placeholder="e.g. Product Designer" />
          </div>
          <div>
            <label className={FIELD}>Department</label>
            <input value={form.department} onChange={set('department')} className="input" maxLength={100} placeholder="e.g. Engineering" />
          </div>
          <div>
            <label className={FIELD}>Phone</label>
            <input value={form.phone} onChange={set('phone')} className="input" maxLength={30} placeholder="+91 98765 43210" inputMode="tel" />
          </div>
          <div>
            <label className={FIELD}>Location</label>
            <input value={form.location} onChange={set('location')} className="input" maxLength={100} placeholder="City, Country" />
          </div>
          <div className="sm:col-span-2">
            <label className={FIELD}>Time zone</label>
            <select value={form.timezone} onChange={set('timezone')} className="input">
              <option value="">Not set</option>
              {zones.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={FIELD}>About <span className="text-gray-600">({form.bio.length}/300)</span></label>
            <textarea value={form.bio} onChange={set('bio')} className="input resize-none" rows={3} maxLength={300} placeholder="A line or two about you" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2 text-xs text-gray-500">
            <Mail className="w-3.5 h-3.5" /> {user.email} <span className="text-gray-600">· email can't be changed here</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-5">
          <button type="button" onClick={onClose} className="btn btn-ghost !py-2.5 !px-5 text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn btn-primary !py-2.5 !px-6 text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
