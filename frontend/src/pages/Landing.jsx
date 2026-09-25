import { Link } from 'react-router-dom'
import {
  Video,
  Calendar,
  Users,
  MessageSquare,
  MonitorPlay,
  Brush,
  Subtitles,
  ShieldCheck,
  Mic,
  Hand,
  Smile,
  Clock,
  FileText,
  ArrowRight,
  Sparkles,
  Check,
  PictureInPicture,
  Radio,
  LogIn,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const FEATURES = [
  {
    icon: <Video className="w-6 h-6" />,
    title: 'HD Video Meetings',
    description: 'Crystal-clear video and audio powered by a scalable SFU media server — smooth even with dozens of participants.',
    color: 'text-sky-300',
    glow: 'from-sky-500/20 to-blue-700/10',
  },
  {
    icon: <MonitorPlay className="w-6 h-6" />,
    title: 'Recording & Transcripts',
    description: 'Record any session and get automatic AI transcripts downloadable as JSON, TXT, SRT, and VTT.',
    color: 'text-cyan-300',
    glow: 'from-cyan-500/20 to-teal-700/10',
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: 'Team Workspaces',
    description: 'Create teams with channels, roles, and invite codes. Keep every department connected in one place.',
    color: 'text-emerald-300',
    glow: 'from-emerald-500/20 to-green-700/10',
  },
  {
    icon: <MessageSquare className="w-6 h-6" />,
    title: 'In-Meeting Chat',
    description: 'Real-time chat with typing indicators and unread badges, so no message gets missed mid-call.',
    color: 'text-violet-300',
    glow: 'from-violet-500/20 to-purple-700/10',
  },
  {
    icon: <MonitorPlay className="w-6 h-6" />,
    title: 'Screen Sharing',
    description: 'Share your screen or a single window instantly — perfect for demos, reviews, and teaching.',
    color: 'text-amber-300',
    glow: 'from-amber-500/20 to-orange-700/10',
  },
  {
    icon: <Brush className="w-6 h-6" />,
    title: 'Collaborative Whiteboard',
    description: 'Sketch ideas together in real time with a built-in shared whiteboard for every meeting.',
    color: 'text-rose-300',
    glow: 'from-rose-500/20 to-pink-700/10',
  },
  {
    icon: <Subtitles className="w-6 h-6" />,
    title: 'Live Captions & Q&A',
    description: 'Real-time captions and hand-raising keep everyone included — from classrooms to all-hands.',
    color: 'text-blue-300',
    glow: 'from-blue-500/20 to-indigo-700/10',
  },
  {
    icon: <Calendar className="w-6 h-6" />,
    title: 'Scheduling & Reminders',
    description: 'Plan meetings on a built-in calendar with automatic reminders so nobody ever joins late.',
    color: 'text-fuchsia-300',
    glow: 'from-fuchsia-500/20 to-purple-700/10',
  },
  {
    icon: <ShieldCheck className="w-6 h-6" />,
    title: 'Host Controls & Security',
    description: 'Waiting room, meeting lock, spotlight, force-mute, and role-based access put hosts in full control.',
    color: 'text-teal-300',
    glow: 'from-teal-500/20 to-cyan-700/10',
  },
]

const STEPS = [
  {
    icon: <Calendar className="w-6 h-6" />,
    title: 'Create or schedule',
    text: 'Start an instant meeting or schedule one on the calendar with reminders for your whole team.',
  },
  {
    icon: <Video className="w-6 h-6" />,
    title: 'Check your devices',
    text: 'Preview your camera and mic on the pre-join screen, pick your devices, then jump in with one click.',
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: 'Meet & collaborate',
    text: 'Chat, share your screen, react, raise hands, and record — everything stays in your history afterwards.',
  },
]

export default function Landing() {
  const { isAuthenticated } = useAuthStore()

  return (
    <div className="relative min-h-screen bg-dark-100 text-slate-100 overflow-x-hidden aurora-bg noise">
      {/* Animated aurora background */}
      <div className="blob -top-40 left-1/4 h-[32rem] w-[32rem] bg-primary-600/20 animate-aurora" />
      <div className="blob top-1/3 -right-40 h-[26rem] w-[26rem] bg-accent-600/15 animate-aurora-slow" />
      <div className="blob bottom-0 -left-32 h-[24rem] w-[24rem] bg-cyan-500/10 animate-aurora" />

      {/* ---------- Navbar ---------- */}
      <header className="sticky top-0 z-50 glass-strong">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary-400/30 to-transparent" />
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 flex items-center justify-center shadow-lg shadow-primary-500/30 transition-transform duration-300 group-hover:scale-105">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold font-display tracking-tight">MeetClone</span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
            <a href="#features" className="nav-link">Features</a>
            <a href="#how" className="nav-link">How it works</a>
            <a href="#highlights" className="nav-link">Highlights</a>
            <Link to="/pricing" className="nav-link">Pricing</Link>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link to="/app" className="btn btn-primary">
                Open App
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost hidden sm:inline-flex">
                  <LogIn className="w-4 h-4" />
                  Sign in
                </Link>
                <Link to="/signup" className="btn btn-primary">
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-20 lg:pt-28 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary-400/25 bg-primary-500/10 px-4 py-1.5 text-xs font-semibold text-primary-200 mb-7 animate-fade-in-up">
          <Sparkles className="h-4 w-4" />
          HD Video · Recording · Transcripts · Teams — all in one place
        </div>

        <h1 className="text-4xl sm:text-6xl xl:text-7xl font-bold leading-[1.05] tracking-tight font-display animate-fade-in-up stagger-1">
          Professional meetings,
          <span className="block gradient-text">without the friction</span>
        </h1>

        <p className="mt-7 text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed animate-fade-in-up stagger-2">
          MeetClone gives your team everything a modern meeting app should have — video calls, screen sharing, recordings with AI transcripts, live chat, whiteboards, and scheduling. Free to start.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-in-up stagger-3">
          {isAuthenticated ? (
            <Link to="/app" className="btn btn-primary px-8 py-4 text-base">
              <Video className="w-5 h-5" />
              Start a Meeting
            </Link>
          ) : (
            <Link to="/signup" className="btn btn-primary px-8 py-4 text-base">
              <Video className="w-5 h-5" />
              Start for Free
            </Link>
          )}
          <a href="#features" className="btn btn-secondary px-8 py-4 text-base">
            Explore Features
          </a>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-gray-500 animate-fade-in stagger-4">
          <span className="flex items-center gap-2"><Check className="w-4 h-4 text-primary-400" /> No credit card needed</span>
          <span className="flex items-center gap-2"><Check className="w-4 h-4 text-primary-400" /> Works in your browser</span>
          <span className="flex items-center gap-2"><Check className="w-4 h-4 text-primary-400" /> Unlimited meetings</span>
        </div>

        {/* Hero mockup */}
        <div className="mt-16 max-w-4xl mx-auto animate-fade-in-up stagger-5" id="highlights">
          <div className="relative">
            <div className="absolute inset-8 bg-gradient-to-r from-primary-500/25 to-accent-500/20 blur-3xl rounded-full" />
            <div className="relative glass rounded-3xl p-5 sm:p-6 shadow-float text-left">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-400/70" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400/70" />
                  <span className="w-3 h-3 rounded-full bg-green-400/70" />
                </div>
                <span className="flex items-center gap-2 text-xs font-semibold text-red-300 bg-red-500/10 border border-red-400/20 px-3 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  REC · Weekly Standup
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <HeroTile name="You" color="from-primary-500 to-blue-700" animation="animate-float" speaking />
                <HeroTile name="Aisha" color="from-emerald-500 to-teal-700" animation="animate-float-delayed" />
                <HeroTile name="Marcus" color="from-cyan-500 to-sky-700" animation="animate-float-slow" />
                <HeroTile name="Sam" color="from-amber-500 to-orange-600" animation="animate-float" />
              </div>

              {/* Feature ticker row */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-gray-400">
                {[
                  { icon: <Mic className="w-3.5 h-3.5" />, label: 'Noise-suppressed audio' },
                  { icon: <MonitorPlay className="w-3.5 h-3.5" />, label: 'Screen sharing' },
                  { icon: <MessageSquare className="w-3.5 h-3.5" />, label: 'Live chat' },
                  { icon: <Smile className="w-3.5 h-3.5" />, label: 'Reactions' },
                  { icon: <Hand className="w-3.5 h-3.5" />, label: 'Raise hand' },
                  { icon: <Subtitles className="w-3.5 h-3.5" />, label: 'Captions' },
                  { icon: <PictureInPicture className="w-3.5 h-3.5" />, label: 'Picture-in-Picture' },
                ].map(({ icon, label }) => (
                  <span key={label} className="flex items-center gap-1.5 bg-dark-300/80 border border-white/[0.06] rounded-full px-3 py-1.5 transition-all duration-300 hover:border-primary-500/30 hover:text-white">
                    <span className="text-primary-400">{icon}</span>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Stats strip ---------- */}
      <section className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up">
          {[
            { value: 'HD', label: 'Video quality' },
            { value: '4', label: 'Transcript formats' },
            { value: '50+', label: 'Participants per room' },
            { value: '0₹', label: 'Price to start' },
          ].map((stat, i) => (
            <div key={stat.label} className={`glass rounded-2xl p-6 text-center animate-scale-in stagger-${i + 1} transition-transform duration-300 hover:-translate-y-1`}>
              <p className="text-3xl font-bold font-display gradient-text">{stat.value}</p>
              <p className="text-sm text-gray-400 mt-1.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-28">
        <div className="text-center mb-16 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-400/25 bg-primary-500/10 px-4 py-1.5 text-xs font-semibold text-primary-200 mb-5">
            <Radio className="h-4 w-4" />
            Everything included
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold font-display tracking-tight">
            One app for <span className="gradient-text">every meeting need</span>
          </h2>
          <p className="text-gray-400 mt-5 max-w-2xl mx-auto leading-relaxed">
            From quick standups to full lectures — MeetClone ships with the tools other apps make you pay for.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="group relative bg-dark-200/70 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-7 overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-primary-500/30 hover:shadow-glow animate-fade-in-up"
              style={{ animationDelay: `${(i % 3) * 0.08 + Math.floor(i / 3) * 0.05}s` }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl`} />
              <div className="relative">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-white/[0.03] border border-white/10 flex items-center justify-center ${feature.color} mb-5 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold font-display mb-2.5">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-16 animate-fade-in-up">
          <h2 className="text-3xl sm:text-5xl font-bold font-display tracking-tight">
            Start in <span className="gradient-text">under a minute</span>
          </h2>
          <p className="text-gray-400 mt-5 max-w-xl mx-auto">
            No downloads, no plugins, no setup calls. If you have a browser, you're ready.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-[4.5rem] left-[16%] right-[16%] h-px bg-gradient-to-r from-primary-500/40 via-accent-500/40 to-primary-500/40" />

          {STEPS.map((step, i) => (
            <div key={step.title} className="relative text-center animate-fade-in-up" style={{ animationDelay: `${i * 0.12}s` }}>
              <div className="relative inline-flex w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-500/20 to-accent-600/10 border border-primary-500/25 items-center justify-center text-primary-300 mb-6 transition-transform duration-300 hover:scale-110">
                {step.icon}
                <span className="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-accent-600 text-white text-sm font-bold flex items-center justify-center shadow-lg">
                  {i + 1}
                </span>
              </div>
              <h3 className="text-xl font-semibold font-display mb-2.5">{step.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Recordings highlight ---------- */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="gradient-border rounded-3xl p-8 sm:p-12 lg:p-14 overflow-hidden relative animate-fade-in-up">
          <div className="blob -top-24 -right-24 h-72 w-72 bg-primary-600/15 animate-aurora" />
          <div className="relative grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-4 py-1.5 text-xs font-semibold text-cyan-200 mb-5">
                <FileText className="h-4 w-4" />
                Never lose a conversation
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold font-display leading-tight mb-5">
                Record, transcribe, <span className="gradient-text">and revisit anytime</span>
              </h2>
              <p className="text-gray-400 leading-relaxed mb-8">
                Every recorded meeting lands in your history with an automatic transcript. Download the video or export subtitles in JSON, TXT, SRT, or VTT — ideal for lectures, interviews, and compliance.
              </p>
              <ul className="space-y-3.5">
                {[
                  'One-click recording with participant notification',
                  'Automatic AI transcription after upload',
                  'Download recordings & subtitle files',
                  'Full searchable meeting history',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-gray-200">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/15 border border-primary-500/30 shrink-0">
                      <Check className="h-3.5 w-3.5 text-primary-300" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              {!isAuthenticated && (
                <Link to="/signup" className="btn btn-primary mt-9 px-7 py-3.5">
                  Try it free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>

            {/* Transcript mockup */}
            <div className="glass rounded-2xl p-5 sm:p-6 shadow-card animate-float-slow">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Transcript · SRT</span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 px-2.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Ready
                </span>
              </div>
              <div className="space-y-3">
                {[
                  { time: '00:01:12', speaker: 'Aisha', text: 'Morning everyone — quick agenda: sprint demo, then blockers.', color: 'from-emerald-500 to-teal-600' },
                  { time: '00:01:26', speaker: 'You', text: 'Sounds good. Sharing my screen now.', color: 'from-primary-500 to-blue-700' },
                  { time: '00:02:03', speaker: 'Marcus', text: 'Can you zoom into the timeline view? 🙌', color: 'from-cyan-500 to-sky-700' },
                ].map((line) => (
                  <div key={line.time} className="flex gap-3">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${line.color} shrink-0 flex items-center justify-center text-xs font-bold text-white`}>
                      {line.speaker.charAt(0)}
                    </div>
                    <div className="flex-1 bg-dark-300/70 border border-white/[0.05] rounded-xl px-3.5 py-2.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-white">{line.speaker}</span>
                        <span className="text-[10px] font-mono text-primary-300/80">{line.time}</span>
                      </div>
                      <p className="text-sm text-gray-300 mt-0.5">{line.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="relative animate-fade-in-up">
          <div className="absolute -inset-6 bg-gradient-to-r from-primary-500/15 via-accent-500/10 to-primary-500/15 blur-3xl rounded-full" />
          <div className="relative glass-strong rounded-3xl p-10 sm:p-14 shadow-float">
            <h2 className="text-3xl sm:text-5xl font-bold font-display tracking-tight mb-5">
              Your next meeting is <span className="gradient-text">one click away</span>
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto mb-9">
              Create a free account and host your first professional meeting in under a minute.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {isAuthenticated ? (
                <Link to="/app" className="btn btn-primary px-8 py-4 text-base">
                  Open MeetClone
                  <ArrowRight className="w-5 h-5" />
                </Link>
              ) : (
                <>
                  <Link to="/signup" className="btn btn-primary px-8 py-4 text-base">
                    Get Started Free
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                  <Link to="/login" className="btn btn-secondary px-8 py-4 text-base">
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="relative border-t border-white/[0.06] mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
              <Video className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="font-semibold font-display">MeetClone</p>
              <p className="text-xs text-gray-500">Professional video meetings for everyone</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4 text-primary-400/70" />
            © {new Date().getFullYear()} MeetClone · Built for teams, classes, and everyone in between
          </div>
        </div>
      </footer>
    </div>
  )
}

function HeroTile({ name, color, animation = '', speaking = false }) {
  return (
    <div className={`aspect-video rounded-2xl bg-gradient-to-br from-dark-300 to-dark-400/60 border border-white/5 flex flex-col items-center justify-center gap-2 relative overflow-hidden ${animation}`}>
      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
        <span className="text-lg sm:text-xl font-semibold text-white/90">{name.charAt(0)}</span>
      </div>
      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm">{name}</span>
      </div>
      {speaking && (
        <span className="absolute inset-0 rounded-2xl ring-2 ring-emerald-400/70 speaking-border pointer-events-none" />
      )}
    </div>
  )
}
