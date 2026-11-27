import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import AuthLayout, { Field, FormError, SubmitButton } from '../components/AuthLayout'

/** Forgotten password: ask for an emailed code, then set a new password with it. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email) return setError('Enter your email')
    if (sent && !/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from the email')
    if (sent && password.length < 6) return setError('Password must be at least 6 characters')
    setBusy(true)
    try {
      if (!sent) {
        const res = await api.post('/auth/forgot-password', { email })
        toast.success(res.data.message)
        setSent(true)
      } else {
        const res = await api.post('/auth/reset-password', { email, code, newPassword: password })
        toast.success(res.data.message)
        navigate('/login')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle={sent ? 'Enter the code we emailed you' : 'We will email you a code'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormError>{error}</FormError>}
        <Field id="email" label="Email" icon={Mail} type="email" autoComplete="email" placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy || sent} />
        {sent && (
          <>
            <Field id="code" label="Code" icon={KeyRound} inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
              value={code} onChange={(e) => setCode(e.target.value.trim())} disabled={busy} />
            <Field id="new-password" label="New password" icon={Lock} type="password" autoComplete="new-password" placeholder="At least 6 characters"
              value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          </>
        )}
        <SubmitButton busy={busy} busyLabel="Please wait…">{sent ? 'Set new password' : 'Email me a code'}</SubmitButton>
        <p className="text-center text-sm text-gray-400">
          <Link to="/login" className="font-medium text-primary-300 underline-offset-4 hover:underline">Back to sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
