import { useState } from 'react'
import { Download, Loader2, UserX } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { disconnectSocket } from '../lib/socket'

/** "My data": download everything held about me, or delete my account. Lives inside the profile form. */
export default function AccountData() {
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const download = async () => {
    try {
      const { data } = await api.get('/auth/me/export', { responseType: 'blob' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(data)
      link.download = 'my-data.json'
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      toast.error('Could not export your data')
    }
  }

  const remove = async () => {
    if (!password) return toast.error('Enter your password')
    setBusy(true)
    try {
      await api.delete('/auth/me', { data: { password } })
      disconnectSocket()
      localStorage.removeItem('user')
      window.location.replace('/') // a full load drops everything this account left in memory
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete the account')
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={download} className="btn btn-secondary !py-2 !px-4 text-sm gap-2">
          <Download className="w-4 h-4" /> Download my data
        </button>
        <button type="button" onClick={() => setConfirming(true)} className="btn btn-ghost !py-2 !px-4 text-sm gap-2 text-red-400">
          <UserX className="w-4 h-4" /> Delete account
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-red-500/40 p-4 space-y-3">
      <p className="text-sm text-gray-300">
        This cannot be undone. Your profile, files, messages and the recordings of meetings you hosted are removed.
        Billing records and security logs are kept without your name.
      </p>
      <div>
        <label htmlFor="delete-password" className="text-xs text-gray-500 mb-1 block">Your password</label>
        <input id="delete-password" type="password" autoComplete="current-password" autoFocus className="input" value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); remove() } }} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setConfirming(false); setPassword('') }} className="btn btn-ghost !py-2 !px-4 text-sm">Keep my account</button>
        <button type="button" onClick={remove} disabled={busy} className="btn !py-2 !px-4 text-sm bg-red-600 text-white disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Delete for good
        </button>
      </div>
    </div>
  )
}
