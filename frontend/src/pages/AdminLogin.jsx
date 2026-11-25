import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import { useAdminStore } from '../store/adminStore'
import AuthLayout, { Field, FormError, SubmitButton } from '../components/AuthLayout'
import toast from 'react-hot-toast'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading, error } = useAdminStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return toast.error('Please fill in all fields')
    const result = await login(email, password)
    if (!result.success) toast.error(result.message)
  }

  return (
    <AuthLayout aside={false} title="Admin sign in" subtitle="Administrators only">
      <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4" noValidate>
        {error && <FormError>{error}</FormError>}
        <Field id="admin-email" name="admin-email" label="Email" icon={Mail} type="email" autoComplete="off" placeholder="admin@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
        <Field id="admin-password" name="admin-password" label="Password" icon={Lock} type="password" autoComplete="new-password" placeholder="Password"
          reveal={showPassword} onReveal={() => setShowPassword(!showPassword)}
          value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
        <SubmitButton busy={isLoading} busyLabel="Signing in…">Sign in</SubmitButton>
        <Link to="/" className="block text-center text-sm text-gray-400 hover:text-gray-200">Back to site</Link>
      </form>
    </AuthLayout>
  )
}
