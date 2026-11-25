import { useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Mail, Lock } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import AuthLayout, { Field, FormError, SubmitButton } from '../components/AuthLayout'
import toast from 'react-hot-toast'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { signup, isLoading, error } = useAuthStore()
  const [pending, setPending] = useState(null) // set after signup when email verification is required
  const [resending, setResending] = useState(false)

  const resend = async () => {
    setResending(true)
    try {
      await api.post('/auth/resend-verification', { email: pending.email })
      toast.success('Verification email sent')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not resend the email')
    } finally {
      setResending(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!name || !email || !password || !confirmPassword) {
      toast.error('Please fill in all fields')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    const result = await signup(name, email, password)

    if (result.success && result.requiresVerification) {
      setPending({ email: result.email, emailSent: result.emailSent })
    } else if (result.success) {
      toast.success('Account created')
    } else {
      toast.error(result.message)
    }
  }

  if (pending) {
    return (
      <AuthLayout aside={false} title={pending.emailSent ? 'Check your inbox' : 'Account created'}>
        <p className="text-sm text-gray-300">
          {pending.emailSent
            ? <>We sent a verification link to <span className="font-medium text-white">{pending.email}</span>. Open it within 24 hours to activate your account.</>
            : <>We couldn't send the verification email to <span className="font-medium text-white">{pending.email}</span>. Try sending it again.</>}
        </p>
        <button onClick={resend} disabled={resending} className="btn btn-secondary btn-lg mt-6 w-full">
          {resending ? 'Sending…' : 'Resend email'}
        </button>
        <Link to="/login" className="mt-4 block text-center text-sm font-medium text-primary-300 underline-offset-4 hover:underline">Go to sign in</Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your account" subtitle="You start on the Free plan">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <FormError>{error}</FormError>}
        <Field id="name" label="Full name" icon={User} autoComplete="name" placeholder="Aisha Rao"
          value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading} />
        <Field id="email" label="Email" icon={Mail} type="email" autoComplete="email" placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="password" label="Password" icon={Lock} type="password" autoComplete="new-password" placeholder="6+ characters"
            reveal={showPassword} onReveal={() => setShowPassword(!showPassword)}
            value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
          <Field id="confirm" label="Confirm password" icon={Lock} type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Repeat it"
            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isLoading} />
        </div>
        {confirmPassword && (
          <p className={`text-xs ${password === confirmPassword ? 'text-emerald-300' : 'text-gray-400'}`}>
            {password === confirmPassword ? 'Passwords match' : 'Passwords do not match yet'}
          </p>
        )}
        <SubmitButton busy={isLoading} busyLabel="Creating account…">Create account</SubmitButton>
        <p className="text-center text-sm text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary-300 underline-offset-4 hover:underline">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
