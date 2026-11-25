import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { getSocket } from '../lib/socket'

const EMPTY = { currentPassword: '', newPassword: '', confirm: '' }
const FIELDS = [
  ['currentPassword', 'Current password', 'current-password'],
  ['newPassword', 'New password (at least 6 characters)', 'new-password'],
  ['confirm', 'Confirm new password', 'new-password']
]

/** Lives inside the profile <form>, so it submits itself instead of being a nested form. */
export default function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(EMPTY)
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  const close = () => { setOpen(false); setValues(EMPTY); setShow(false) }

  const submit = async () => {
    const { currentPassword, newPassword, confirm } = values
    if (!currentPassword) return toast.error('Enter your current password')
    if (newPassword.length < 6) return toast.error('The new password must be at least 6 characters')
    if (newPassword !== confirm) return toast.error('The new passwords do not match')
    setSaving(true)
    try {
      const res = await api.post('/auth/change-password', { currentPassword, newPassword })
      // Every older session is now signed out, including this one: carry on with the new token
      const { token } = res.data.data
      localStorage.setItem('token', token)
      useAuthStore.setState({ token })
      const socket = getSocket()
      if (socket) socket.auth = { token } // used on the next reconnect
      toast.success('Password changed. Other devices have been signed out.')
      close()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change the password')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary !py-2 !px-4 text-sm gap-2">
        <KeyRound className="w-4 h-4" /> Change password
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 p-4 space-y-3">
      {FIELDS.map(([key, label, autoComplete], i) => (
        <div key={key}>
          <label htmlFor={key} className="text-xs text-gray-500 mb-1 block">{label}</label>
          <input id={key} type={show ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={i === 0} className="input"
            value={values[key]} onChange={(e) => setValues(v => ({ ...v, [key]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!saving) submit() } }} />
        </div>
      ))}
      <label className="flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="btn btn-ghost !py-2 !px-4 text-sm">Cancel</button>
        <button type="button" onClick={submit} disabled={saving} className="btn btn-primary !py-2 !px-4 text-sm disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Update password
        </button>
      </div>
    </div>
  )
}
