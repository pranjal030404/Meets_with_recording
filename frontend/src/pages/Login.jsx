import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Video, ShieldCheck, Radio, Sparkles } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading, error } = useAuthStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email || !password) {
      toast.error('Please fill in all fields')
      return
    }

    const result = await login(email, password)
    
    if (result.success) {
      toast.success('Welcome back!')
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-800/70 p-8 shadow-2xl shadow-slate-950/60 backdrop-blur lg:p-10">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
              <Sparkles className="h-4 w-4" />
              Real-Time Collaboration Hub
            </div>

            <h1
              className="text-4xl font-bold leading-tight text-white sm:text-5xl"
              style={{ fontFamily: 'Space Grotesk, Manrope, sans-serif' }}
            >
              MeetClone
              <span className="block bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                Built for focused conversations
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
              Host smooth video meetings, run team standups, and keep everyone aligned with live chat, Q&A, and collaborative tools.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <ShieldCheck className="mb-2 h-5 w-5 text-emerald-300" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Secure</p>
                <p className="mt-1 text-sm text-slate-200">Role-based access for teams</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <Radio className="mb-2 h-5 w-5 text-cyan-300" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Low Latency</p>
                <p className="mt-1 text-sm text-slate-200">Optimized real-time media stack</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <Video className="mb-2 h-5 w-5 text-indigo-300" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Flexible</p>
                <p className="mt-1 text-sm text-slate-200">Perfect for classes and teams</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/60 backdrop-blur sm:p-8">
            <div className="mb-6 flex items-center gap-4">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-lg shadow-cyan-500/25">
                <Video className="h-7 w-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, Manrope, sans-serif' }}>
                  Welcome Back
                </h2>
                <p className="text-sm text-slate-400">Sign in to continue your meeting flow</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input border-slate-700 bg-slate-800/80 pl-10 placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400/20"
                    placeholder="you@example.com"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input border-slate-700 bg-slate-800/80 pl-10 pr-10 placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400/20"
                    placeholder="Enter your password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-3 text-base font-semibold text-white transition hover:from-cyan-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>

              <p className="text-center text-sm text-slate-400">
                Don&apos;t have an account?{' '}
                <Link to="/signup" className="font-semibold text-cyan-300 transition hover:text-cyan-200">
                  Sign up
                </Link>
              </p>
            </form>
          </section>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
    </div>
  )
}
