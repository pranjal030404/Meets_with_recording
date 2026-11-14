import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, Shield, Eye, EyeOff } from 'lucide-react'
import { useAdminStore } from '../store/adminStore'
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
    <div className="min-h-screen bg-dark-100 text-slate-100 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} autoComplete="off" className="w-full max-w-md space-y-5 rounded-3xl border border-white/10 bg-dark-200/80 p-8 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Admin sign in</h1>
            <p className="text-sm text-slate-400">Administrators only</p>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          <input type="email" name="admin-email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-11" placeholder="admin@example.com" disabled={isLoading} />
        </div>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          <input type={showPassword ? 'text' : 'password'} name="admin-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input pl-11 pr-11" placeholder="Password" disabled={isLoading} />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        <button type="submit" disabled={isLoading} className="btn btn-primary w-full py-3">
          {isLoading ? 'Signing in...' : 'Sign in'}
        </button>
        <Link to="/" className="block text-center text-sm text-slate-400 hover:text-slate-200">Back to site</Link>
      </form>
    </div>
  )
}
