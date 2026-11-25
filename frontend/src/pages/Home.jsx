import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Video, Plus, Calendar, Link2, Users, MonitorPlay, ArrowRight } from 'lucide-react'
import api from '../lib/api'
import { useMeetingStore } from '../store/meetingStore'
import AppShell from '../components/AppShell'
import toast from 'react-hot-toast'

const FEATURES = [
  { icon: Video, title: 'HD video calls', text: 'Video and audio routed through an SFU media server.' },
  { icon: Users, title: 'Team workspaces', text: 'Teams with members, roles and channels.' },
  { icon: Calendar, title: 'Scheduling', text: 'Plan meetings with reminders and notifications.' },
  { icon: MonitorPlay, title: 'Recording and transcripts', text: 'Record a session and download its transcript.' },
]

const when = (m) => new Date(m.scheduledAt || m.startedAt || m.createdAt)
const STATUS = {
  active: { label: 'Live', dot: 'bg-red-500' },
  scheduled: { label: 'Scheduled', dot: 'bg-primary-400' },
  ended: { label: 'Ended', dot: 'bg-gray-600' },
  cancelled: { label: 'Cancelled', dot: 'bg-gray-600' },
}
const ORDER = { active: 0, scheduled: 1 }

export default function Home() {
  const navigate = useNavigate()
  const { createMeeting, isLoading } = useMeetingStore()
  const [joinCode, setJoinCode] = useState('')
  const [meetings, setMeetings] = useState(null) // null = still loading
  const [loadFailed, setLoadFailed] = useState(false)

  // plain request so this list never toggles the store's isLoading used by "New meeting"
  useEffect(() => {
    api.get('/meetings')
      .then((res) => setMeetings(res.data.data.meetings || []))
      .catch(() => { setMeetings([]); setLoadFailed(true) })
  }, [])

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

  // live first, then upcoming (soonest first), then the most recent past ones
  const list = [...(meetings || [])]
    .sort((a, b) => {
      const d = (ORDER[a.status] ?? 2) - (ORDER[b.status] ?? 2)
      if (d) return d
      return a.status === 'scheduled' ? when(a) - when(b) : when(b) - when(a)
    })
    .slice(0, 6)

  return (
    <AppShell wide>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
        <h1 className="page-title">Home</h1>
        <p className="page-sub">{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_3fr]">
          <section className="card self-start p-6">
            <h2 className="font-display text-lg font-semibold">Start or join</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={handleNewMeeting} disabled={isLoading} className="btn btn-primary btn-lg">
                {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Video className="h-4 w-4" strokeWidth={1.5} />}
                {isLoading ? 'Creating…' : 'New meeting'}
              </button>
              <Link to="/join" className="btn btn-secondary btn-lg">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Join meeting
              </Link>
            </div>
            <form onSubmit={handleJoinMeeting} className="mt-6 border-t border-white/[0.06] pt-6">
              <label htmlFor="join-code" className="field-label">Meeting code or link</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" strokeWidth={1.5} />
                  <input id="join-code" type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="input min-h-11 pl-10" placeholder="abc123" />
                </div>
                <button type="submit" className="btn btn-secondary min-h-11">Join</button>
              </div>
            </form>
          </section>

          <section className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Your meetings</h2>
              <Link to="/history" className="inline-flex items-center gap-1.5 text-sm text-primary-300 hover:text-primary-200">
                All meetings <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            </div>
            {meetings === null && <div className="skeleton mt-4 h-40 rounded-lg" aria-label="Loading meetings" />}
            {meetings !== null && list.length === 0 && (
              <p className="py-12 text-center text-sm text-gray-500">
                {loadFailed ? 'Meetings could not be loaded' : 'No meetings yet. Start one and it shows up here'}
              </p>
            )}
            {list.length > 0 && (
              <ul className="mt-4 divide-y divide-white/[0.06]">
                {list.map((m) => {
                  const st = STATUS[m.status] || STATUS.ended
                  const date = when(m)
                  const row = (
                    <>
                      <time dateTime={date.toISOString()} className="timecode w-24 shrink-0">
                        <span className="block text-gray-300">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                        {date.toLocaleDateString([], { day: 'numeric', month: 'short' })}
                      </time>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-100">{m.title}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-gray-400">
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </>
                  )
                  const cls = 'flex items-center gap-4 rounded-md px-2 py-3'
                  return (
                    <li key={m.id}>
                      {m.status === 'active' || m.status === 'scheduled'
                        ? <Link to={`/join/${m.roomId}`} className={`${cls} focus-ring transition-colors hover:bg-white/[0.04]`}>{row}</Link>
                        : <div className={cls}>{row}</div>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <ul className="mt-12 grid gap-x-6 gap-y-8 border-t border-white/[0.08] pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon className="h-[18px] w-[18px] text-gray-400" strokeWidth={1.5} />
              <h3 className="mt-3 text-sm font-medium text-gray-100">{title}</h3>
              <p className="mt-1 text-sm text-gray-400">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  )
}
