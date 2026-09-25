import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Video, ShieldCheck, Radio, Sparkles, Users, Globe, ArrowRight } from 'lucide-react'
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
    <div className="relative min-h-screen overflow-hidden bg-dark-100 text-slate-100 aurora-bg noise">
      {/* Animated aurora blobs */}
      <div className="blob -left-32 -top-32 h-[28rem] w-[28rem] bg-primary-600/25 animate-aurora" />
      <div className="blob -right-24 top-24 h-96 w-96 bg-accent-600/20 animate-aurora-slow" />
      <div className="blob bottom-0 left-1/3 h-80 w-80 bg-emerald-500/10 animate-aurora" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_1fr]">
          {/* Brand panel */}
          <section className="animate-fade-in-up stagger-1 rounded-3xl border border-white/10 bg-gradient-to-br from-dark-200/90 via-dark-200/60 to-dark-300/60 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl lg:p-10 relative overflow-hidden">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary-500/10 blur-3xl" />

            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary-400/30 bg-primary-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-200 animate-fade-in stagger-2">
              <Sparkles className="h-4 w-4" />
              Real-Time Collaboration Hub
            </div>

            <h1 className="text-4xl font-bold leading-tight text-white font-display animate-fade-in-up stagger-2 sm:text-5xl">
              MeetClone
              <span className="block mt-2 gradient-text">
                Built for focused conversations
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-300/90 sm:text-base animate-fade-in-up stagger-3">
              Host smooth video meetings, run team standups, and keep everyone aligned with live chat, Q&A, and collaborative tools.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <HighlightCard icon={<ShieldCheck className="h-5 w-5 text-emerald-300" />} label="Secure" text="Role-based access" className="animate-fade-in-up stagger-3" />
              <HighlightCard icon={<Radio className="h-5 w-5 text-primary-300" />} label="Low Latency" text="Real-time media stack" className="animate-fade-in-up stagger-4" />
              <HighlightCard icon={<Globe className="h-5 w-5 text-accent-300" />} label="Flexible" text="Classes & teams" className="animate-fade-in-up stagger-5" />
            </div>

            {/* Floating mini stats */}
            <div className="mt-8 flex items-center gap-6 text-sm text-slate-400 animate-fade-in stagger-6">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary-400" />
                Built for teams of any size
              </span>
              <span className="flex items-center gap-2">
                <Video className="h-4 w-4 text-accent-400" />
                HD quality, always
              </span>
            </div>
          </section>

          {/* Form panel */}
          <section className="animate-fade-in-up stagger-2 rounded-3xl border border-white/10 bg-dark-200/80 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8 relative overflow-hidden">
            <div className="pointer-events-none absolute -left-16 bottom-0 h-52 w-52 rounded-full bg-primary-600/10 blur-3xl" />

            <div className="mb-8 flex items-center gap-4">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 shadow-lg shadow-primary-500/30 group">
                <Video className="h-7 w-7 text-white transition-transform duration-300 group-hover:scale-110" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white font-display">Welcome Back</h2>
                <p className="text-sm text-slate-400">Sign in to continue your meeting flow</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200 animate-slide-down">
                  {error}
                </div>
              )}

              <div className="group animate-fade-in-up stagger-3">
                <label className="mb-2 block text-sm font-medium text-slate-200 transition-colors group-focus-within:text-primary-300">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-11"
                    placeholder="you@example.com"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="group animate-fade-in-up stagger-4">
                <label className="mb-2 block text-sm font-medium text-slate-200 transition-colors group-focus-within:text-primary-300">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pl-11 pr-11"
                    placeholder="Enter your password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-all duration-200 hover:text-white hover:scale-110"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary w-full py-3.5 text-base animate-fade-in-up stagger-5"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Sign In
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                )}
              </button>

              <p className="text-center text-sm text-slate-400 animate-fade-in stagger-6">
                Don&apos;t have an account?{' '}
                <Link to="/signup" className="font-semibold text-primary-300 transition-all duration-200 hover:text-primary-200 hover:underline underline-offset-4">
                  Sign up
                </Link>
              </p>
            </form>
          </section>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary-400/40 to-transparent" />
    </div>
  )
}

function HighlightCard({ icon, label, text, className = '' }) {
  return (
    <div className={`group rounded-2xl border border-white/10 bg-dark-300/60 p-4 transition-all duration-300 hover:border-primary-400/30 hover:-translate-y-1 hover:shadow-glow ${className}`}>
      <div className="mb-2 inline-flex rounded-xl bg-white/5 p-2 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-200">{text}</p>
    </div>
  )
}
