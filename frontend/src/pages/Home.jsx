import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Video,
  Plus,
  Calendar,
  Link2,
  LogOut,
  User,
  Clock,
  Users,
  CreditCard,
  Keyboard,
  ShieldCheck,
  MonitorPlay,
  ArrowRight,
  Mic,
  Monitor,
  MessageSquare,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useMeetingStore } from '../store/meetingStore'
import NotificationBell from '../components/NotificationBell'
import toast from 'react-hot-toast'

export default function Home() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { createMeeting, isLoading } = useMeetingStore()
  const [joinCode, setJoinCode] = useState('')

  const handleNewMeeting = async () => {
    const result = await createMeeting({ title: 'Instant Meeting' })

    if (result.success) {
      navigate(`/meeting/${result.meeting.roomId}`)
    } else {
      toast.error(result.message)
    }
  }

  const handleJoinMeeting = (e) => {
    e.preventDefault()

    if (!joinCode.trim()) {
      toast.error('Please enter a meeting code')
      return
    }

    // Extract room ID from URL or code
    let roomId = joinCode.trim()
    if (joinCode.includes('/meeting/')) {
      roomId = joinCode.split('/meeting/')[1]
    }

    navigate(`/join/${roomId}`)
  }

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out successfully')
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-dark-100 aurora-bg noise">
      {/* Animated aurora background */}
      <div className="blob -top-40 left-1/4 h-[30rem] w-[30rem] bg-primary-600/20 animate-aurora" />
      <div className="blob top-1/3 -right-32 h-96 w-96 bg-accent-600/15 animate-aurora-slow" />
      <div className="blob bottom-0 -left-24 h-80 w-80 bg-cyan-500/10 animate-aurora" />

      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary-400/30 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <Link to="/app" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 flex items-center justify-center shadow-lg shadow-primary-500/30 transition-all duration-300 group-hover:scale-105 group-hover:shadow-glow">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold font-display tracking-tight">MeetClone</span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <Link to="/teams" className="nav-link">
              <Users className="w-[18px] h-[18px]" />
              <span className="hidden md:inline">Teams</span>
            </Link>

            <Link to="/calendar" className="nav-link">
              <Calendar className="w-[18px] h-[18px]" />
              <span className="hidden md:inline">Calendar</span>
            </Link>

            <Link to="/history" className="nav-link">
              <Clock className="w-[18px] h-[18px]" />
              <span className="hidden md:inline">History</span>
            </Link>

            <Link to="/billing" className="nav-link">
              <CreditCard className="w-[18px] h-[18px]" />
              <span className="hidden md:inline">Billing</span>
            </Link>

            <NotificationBell />

            <div className="flex items-center gap-3 pl-2 sm:pl-3 ml-1 border-l border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <img
                    src={user?.avatar}
                    alt={user?.name}
                    className="w-9 h-9 rounded-full ring-2 ring-primary-500/30 transition-all duration-300 hover:ring-primary-400/60"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-dark-200 live-dot text-green-400" />
                </div>
                <span className="hidden lg:inline text-sm font-medium text-gray-200">{user?.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-gray-400 transition-all duration-300 hover:bg-red-500/10 hover:text-red-400 hover:scale-110 tooltip-host"
                data-tooltip="Logout"
                title="Logout"
              >
                <LogOut className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 py-14 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          {/* Left: Actions */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-400/25 bg-primary-500/10 px-4 py-1.5 text-xs font-semibold text-primary-200 mb-6 animate-fade-in-up stagger-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
              HD Video · Recording · Transcripts · Teams
            </div>

            <h1 className="text-4xl sm:text-5xl xl:text-[3.4rem] font-bold leading-[1.08] tracking-tight mb-5 font-display animate-fade-in-up stagger-2">
              Video calls and meetings{' '}
              <span className="gradient-text">for everyone</span>
            </h1>

            <p className="text-gray-400 text-lg leading-relaxed mb-9 max-w-lg animate-fade-in-up stagger-3">
              Connect, collaborate, and celebrate from anywhere. Crystal-clear meetings with live chat, reactions, whiteboard, and smart reminders.
            </p>

            <div className="flex flex-wrap gap-4 mb-9 animate-fade-in-up stagger-4">
              <button
                onClick={handleNewMeeting}
                disabled={isLoading}
                className="btn btn-primary px-7 py-3.5 text-base"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  <>
                    <Video className="w-5 h-5" />
                    New Meeting
                  </>
                )}
              </button>

              <Link to="/join" className="btn btn-secondary px-7 py-3.5 text-base">
                <Plus className="w-5 h-5" />
                Join Meeting
              </Link>
            </div>

            {/* Quick Join */}
            <form onSubmit={handleJoinMeeting} className="flex gap-3 max-w-lg animate-fade-in-up stagger-5 group">
              <div className="relative flex-1">
                <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 transition-colors group-focus-within:text-primary-400" />
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="input pl-11 py-3.5"
                  placeholder="Enter a meeting code or link"
                />
              </div>
              <button type="submit" className="btn btn-secondary whitespace-nowrap px-6">
                Join
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Right: Illustration */}
          <div className="hidden lg:block animate-fade-in-up stagger-3">
            <div className="relative">
              {/* Glow behind card */}
              <div className="absolute inset-6 bg-gradient-to-br from-primary-500/25 to-accent-500/20 blur-3xl rounded-full" />

              <div className="relative glass rounded-3xl p-6 shadow-float">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-400/70" />
                    <span className="w-3 h-3 rounded-full bg-yellow-400/70" />
                    <span className="w-3 h-3 rounded-full bg-green-400/70" />
                  </div>
                  <span className="flex items-center gap-2 text-xs font-semibold text-red-300 bg-red-500/10 border border-red-400/20 px-3 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    REC
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Simulated video tiles */}
                  <DemoTile name="You" color="from-primary-500 to-primary-700" animation="animate-float" icon={<Mic className="w-4 h-4" />} active />
                  <DemoTile name="Aisha" color="from-emerald-500 to-teal-700" animation="animate-float-delayed" icon={<MessageSquare className="w-4 h-4" />} />
                  <DemoTile name="Marcus" color="from-fuchsia-500 to-purple-700" animation="animate-float-slow" icon={<Monitor className="w-4 h-4" />} />
                  <DemoTile name="Sam" color="from-amber-500 to-orange-600" animation="animate-float" icon={<User className="w-4 h-4" />} />
                </div>

                {/* Mini control bar */}
                <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl bg-dark-300/80 border border-white/5 py-3">
                  {[Mic, Video, Monitor, MessageSquare, Users].map((Icon, i) => (
                    <span
                      key={i}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 ${
                        i === 3
                          ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-500/30'
                          : 'bg-dark-400/80 text-gray-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                  ))}
                  <span className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 transition-transform duration-300 hover:scale-110">
                    <Keyboard className="w-4 h-4 rotate-[135deg]" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 lg:mt-32">
          <div className="text-center mb-14 animate-fade-in-up">
            <h2 className="text-3xl sm:text-4xl font-bold font-display tracking-tight">
              Everything you need for{' '}
              <span className="gradient-text">productive meetings</span>
            </h2>
            <p className="text-gray-400 mt-4 max-w-xl mx-auto">
              A complete collaboration suite designed for modern teams, classrooms, and everything in between.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<Video className="w-6 h-6" />}
              title="HD Video Calls"
              description="Crystal clear video and audio powered by an optimized SFU media stack."
              gradient="from-primary-500/20 to-primary-700/10"
              iconColor="text-primary-300"
              className="animate-fade-in-up stagger-1"
            />
            <FeatureCard
              icon={<Users className="w-6 h-6" />}
              title="Team Workspaces"
              description="Create teams, manage members and roles, and collaborate in channels."
              gradient="from-emerald-500/20 to-teal-700/10"
              iconColor="text-emerald-300"
              className="animate-fade-in-up stagger-2"
            />
            <FeatureCard
              icon={<Calendar className="w-6 h-6" />}
              title="Meeting Scheduler"
              description="Schedule meetings with reminders and in-app notifications."
              gradient="from-fuchsia-500/20 to-purple-700/10"
              iconColor="text-fuchsia-300"
              className="animate-fade-in-up stagger-3"
            />
            <FeatureCard
              icon={<MonitorPlay className="w-6 h-6" />}
              title="Recording & Transcripts"
              description="Record sessions and get automatic transcripts in multiple formats."
              gradient="from-amber-500/20 to-orange-600/10"
              iconColor="text-amber-300"
              className="animate-fade-in-up stagger-4"
            />
          </div>

          {/* Trust strip */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-gray-500 animate-fade-in stagger-5">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary-400" />
              End-to-end authenticated
            </span>
            <span className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-primary-400" />
              Keyboard shortcuts built in
            </span>
            <span className="flex items-center gap-2">
              <MonitorPlay className="w-4 h-4 text-primary-400" />
              Screen sharing & whiteboard
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}

function DemoTile({ name, color, animation = '', icon, active = false }) {
  return (
    <div className={`aspect-video rounded-2xl bg-gradient-to-br from-dark-300 to-dark-400/60 border border-white/5 flex flex-col items-center justify-center gap-2 relative overflow-hidden ${animation}`}>
      <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
        <User className="w-7 h-7 text-white/90" />
      </div>
      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm">{name}</span>
        {active && (
          <span className="w-5 h-5 rounded-md bg-black/50 backdrop-blur-sm flex items-center justify-center text-emerald-300">
            {icon}
          </span>
        )}
      </div>
      {active && (
        <span className="absolute inset-0 rounded-2xl ring-2 ring-emerald-400/70 speaking-border pointer-events-none" />
      )}
    </div>
  )
}

function FeatureCard({ icon, title, description, gradient, iconColor, className = '' }) {
  return (
    <div className={`group relative bg-dark-200/70 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-primary-500/30 hover:shadow-glow overflow-hidden ${className}`}>
      {/* Hover gradient wash */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl`} />

      <div className="relative">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-white/[0.03] border border-white/10 flex items-center justify-center ${iconColor} mb-4 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6 group-hover:border-white/20`}>
          {icon}
        </div>
        <h3 className="text-lg font-semibold font-display mb-2 group-hover:text-white transition-colors">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
