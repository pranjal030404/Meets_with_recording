import { useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Mail, Lock, Eye, EyeOff, Video, ShieldCheck, Sparkles, Radio, Globe, ArrowRight, Check } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

const PERKS = [
  'Unlimited meetings with HD video & audio',
  'Recording with automatic transcripts',
  'Team workspaces with channels & roles',
  'Smart scheduling with reminders',
]

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { signup, isLoading, error } = useAuthStore()

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

    if (result.success) {
      toast.success('Account created successfully!')
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-dark-100 text-slate-100 aurora-bg noise">
      {/* Animated aurora blobs */}
      <div className="blob -left-32 -top-32 h-[28rem] w-[28rem] bg-primary-600/25 animate-aurora" />
      <div className="blob -right-24 top-1/3 h-96 w-96 bg-accent-600/20 animate-aurora-slow" />
      <div className="blob bottom-0 left-1/4 h-80 w-80 bg-cyan-500/10 animate-aurora" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-8 lg:grid-cols-[1fr_1.1fr]">
          {/* Brand panel */}
          <section className="hidden lg:flex flex-col justify-center animate-fade-in-up stagger-1">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-primary-400/30 bg-primary-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-200 animate-fade-in stagger-2">
              <Sparkles className="h-4 w-4" />
              Join MeetClone
            </div>

            <h1 className="mt-6 text-4xl font-bold leading-tight text-white font-display animate-fade-in-up stagger-2 xl:text-5xl">
              Create your account and{' '}
              <span className="gradient-text">start meeting in seconds</span>
            </h1>

            <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-300/90 sm:text-base animate-fade-in-up stagger-3">
              Everything your team needs to connect — video calls, recordings, transcripts, chat, and scheduling — in one polished workspace.
            </p>

            <ul className="mt-8 space-y-3.5">
              {PERKS.map((perk, i) => (
                <li
                  key={perk}
                  className={`flex items-center gap-3 text-sm text-slate-200 animate-fade-in-up stagger-${i + 3}`}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/15 border border-primary-500/30">
                    <Check className="h-3.5 w-3.5 text-primary-300" />
                  </span>
                  {perk}
                </li>
              ))}
            </ul>

            <div className="mt-10 flex items-center gap-6 text-sm text-slate-400 animate-fade-in stagger-6">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-300" /> Secure by design
              </span>
              <span className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary-300" /> Low latency
              </span>
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-accent-300" /> Works everywhere
              </span>
            </div>
          </section>

          {/* Form panel */}
          <section className="animate-fade-in-up stagger-2 rounded-3xl border border-white/10 bg-dark-200/80 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8 relative overflow-hidden">
            <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-primary-600/10 blur-3xl" />

            <div className="mb-8 text-center lg:text-left">
              <div className="mx-auto lg:mx-0 mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 shadow-lg shadow-primary-500/30 group">
                <Video className="h-7 w-7 text-white transition-transform duration-300 group-hover:scale-110" />
              </div>
              <h2 className="text-2xl font-bold text-white font-display">Create your account</h2>
              <p className="text-sm text-slate-400 mt-1">Free forever for personal meetings</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200 animate-slide-down">
                  {error}
                </div>
              )}

              <div className="group animate-fade-in-up stagger-2">
                <label className="mb-2 block text-sm font-medium text-slate-200 transition-colors group-focus-within:text-primary-300">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input pl-11"
                    placeholder="John Doe"
                    disabled={isLoading}
                  />
                </div>
              </div>

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

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="group animate-fade-in-up stagger-4">
                  <label className="mb-2 block text-sm font-medium text-slate-200 transition-colors group-focus-within:text-primary-300">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input pl-11 pr-10"
                      placeholder="Min 6 characters"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-all duration-200 hover:text-white hover:scale-110"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="group animate-fade-in-up stagger-4">
                  <label className="mb-2 block text-sm font-medium text-slate-200 transition-colors group-focus-within:text-primary-300">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input pl-11"
                      placeholder="Repeat password"
                      disabled={isLoading}
                    />
                    {confirmPassword && password === confirmPassword && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 animate-pop">
                        <Check className="h-5 w-5 text-green-400" />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary w-full py-3.5 text-base animate-fade-in-up stagger-5"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Creating account...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Create Account
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>

              <p className="text-center text-sm text-slate-400 pt-1 animate-fade-in stagger-6">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-primary-300 transition-all duration-200 hover:text-primary-200 hover:underline underline-offset-4">
                  Sign in
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
