import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import AuthLayout, { Field, FormError, SubmitButton } from '../components/AuthLayout'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading, error } = useAuthStore()
  const [needsVerify, setNeedsVerify] = useState(false)
  const [resending, setResending] = useState(false)

  const resend = async () => {
    if (!email) { toast.error('Enter your email first'); return }
    setResending(true)
    try {
      const res = await api.post('/auth/resend-verification', { email })
      toast.success(res.data.message || 'Verification email sent')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send the email')
    } finally {
      setResending(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!email || !password) {
      toast.error('Please fill in all fields')
      return
    }

    setNeedsVerify(false)
    const result = await login(email, password)
    if (!result.success && result.code === 'EMAIL_NOT_VERIFIED') setNeedsVerify(true)

    if (result.success) {
      toast.success('Signed in')
    } else {
      toast.error(result.message)
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Your meetings, chats and transcripts">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <FormError>
            {error}
            {needsVerify && (
              <button type="button" onClick={resend} disabled={resending} className="mt-2 block font-medium text-primary-300 hover:text-primary-200 disabled:opacity-50">
                {resending ? 'Sending…' : 'Resend verification email'}
              </button>
            )}
          </FormError>
        )}
        <Field id="email" label="Email" icon={Mail} type="email" autoComplete="email" placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
        <Field id="password" label="Password" icon={Lock} type="password" autoComplete="current-password" placeholder="Your password"
          reveal={showPassword} onReveal={() => setShowPassword(!showPassword)}
          value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
        <SubmitButton busy={isLoading} busyLabel="Signing in…">Sign in</SubmitButton>
        <p className="text-center text-sm text-gray-400">
          No account yet?{' '}
          <Link to="/signup" className="font-medium text-primary-300 underline-offset-4 hover:underline">Create one</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
