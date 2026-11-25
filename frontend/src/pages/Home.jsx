import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Video, Plus, Link2, ArrowRight } from 'lucide-react'
import api from '../lib/api'
import { useMeetingStore } from '../store/meetingStore'
import AppShell from '../components/AppShell'
import toast from 'react-hot-toast'

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
    .slice(0, 12)

  return (
    <AppShell wide>
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-8">
        <h1 className="page-title">Home</h1>
        <p className="page-sub">{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</p>

        <div className="mt-6 space-y-4">
          <section aria-label="Start or join" className="card flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between lg:p-6">
            <div className="grid gap-2 sm:flex">
              <button onClick={handleNewMeeting} disabled={isLoading} className="btn btn-primary btn-lg">
                {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" /> : <Video className="h-4 w-4" strokeWidth={1.5} />}
                {isLoading ? 'Creating…' : 'New meeting'}
              </button>
              <Link to="/join" className="btn btn-secondary btn-lg">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Join meeting
              </Link>
            </div>
            <form onSubmit={handleJoinMeeting} className="w-full lg:max-w-md">
              <label htmlFor="join-code" className="field-label">Meeting code or link</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" strokeWidth={1.5} />
                  <input id="join-code" type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="input min-h-12 pl-10" placeholder="abc123" />
                </div>
                <button type="submit" className="btn btn-secondary min-h-12">Join</button>
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
      </div>
    </AppShell>
  )
}
