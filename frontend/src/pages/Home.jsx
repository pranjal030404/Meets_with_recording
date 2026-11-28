import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Video, Play, ArrowRight } from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useMeetingStore } from '../store/meetingStore'
import AppShell from '../components/AppShell'
import toast from 'react-hot-toast'
import { mySessions, totalMinutes, isLive, spokenDuration } from '../lib/meetingTime'

const DAY = 24 * 60 * 60 * 1000
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const clock = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
const shortDate = (d) => d.toLocaleDateString([], { day: 'numeric', month: 'short' })
const minuteOfDay = (d) => d.getHours() * 60 + d.getMinutes()
const startOf = (m) => new Date(m.startedAt || m.scheduledAt || m.createdAt)
const fileUrl = (path) => /^https?:\/\//.test(path)
  ? path
  : `${import.meta.env.VITE_API_URL || window.location.origin}${path.startsWith('/') ? path : `/${path}`}`

const KINDS = {
  recorded: { label: 'Recorded', color: 'bg-primary-500' },
  summary: { label: 'Summary', color: 'bg-primary-200' },
  call: { label: 'Call only', color: 'bg-gray-600' },
}
const kindOf = (m) => m.recordings?.length ? 'recorded' : m.aiSummary ? 'summary' : 'call'

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { createMeeting, isLoading } = useMeetingStore()
  const [joinCode, setJoinCode] = useState('')
  const [meetings, setMeetings] = useState(null) // null = still loading
  const [loadFailed, setLoadFailed] = useState(false)
  const [tasks, setTasks] = useState(null)
  const [tasksFailed, setTasksFailed] = useState(false)
  const [now, setNow] = useState(() => new Date())

  // plain requests so these never toggle the store's isLoading used by "New meeting".
  // The API lists scheduled meetings before instant ones, so ask for enough to cover the week.
  useEffect(() => {
    api.get('/meetings', { params: { limit: 200, series: 'next' } })
      .then((res) => setMeetings(res.data.data.meetings || []))
      .catch(() => { setMeetings([]); setLoadFailed(true) })
    api.get('/tasks', { params: { scope: 'mine' } })
      .then((res) => setTasks(res.data.data.tasks || []))
      .catch(() => { setTasks([]); setTasksFailed(true) })
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
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

  const all = meetings || []
  const today = startOfDay(now)
  const days = Array.from({ length: 7 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + i))
  const userId = user?.id || user?._id
  // only this user's own time: one tape block per stay, plus a marker where the end was never recorded
  const week = all
    .flatMap((m) => mySessions(m, userId, now).map((session, i) => ({
      ...m,
      key: `${m.id}-${i}`,
      session,
      start: new Date(session.start),
      minutes: session.end === null ? null : Math.max(1, Math.round((session.end - session.start) / 60000)),
    })))
    .filter((v) => v.start >= days[0] && v.start <= now)
  const total = totalMinutes(all.flatMap((m) => mySessions(m, userId, now)), days[0])
  const unknown = week.filter((v) => v.minutes === null).length

  // meetings with something to read or play come first, then the list reads newest first
  const hasNotes = (m) => Boolean(m.aiSummary || m.recordings?.length)
  const past = all.filter((m) => m.status === 'ended').sort((a, b) => startOf(b) - startOf(a))
  const entries = [...past.filter(hasNotes), ...past.filter((m) => !hasNotes(m))]
    .slice(0, 3)
    .sort((a, b) => startOf(b) - startOf(a))

  const live = all.find((m) => isLive(m, now))
  const upcoming = all
    .filter((m) => m.status === 'scheduled' && m.scheduledAt && new Date(m.scheduledAt) > now - 60 * 60 * 1000)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0]

  const firstName = user?.name?.split(' ')[0]

  return (
    <AppShell wide>
      <div className="mx-auto max-w-[1320px] space-y-4 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6 pb-2">
          <div className="min-w-0">
            <p className="timecode mb-2 uppercase">
              {now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · {clock(now)}
            </p>
            <h1 className="max-w-[20em] font-display text-2xl font-medium leading-tight text-gray-100 sm:text-[2.125rem]">
              {meetings === null || loadFailed ? (
                `Welcome back${firstName ? `, ${firstName}` : ''}.`
              ) : total ? (
                <>{firstName ? `${firstName}, you` : 'You'} spent <span className="text-primary-500">{spokenDuration(total)}</span> in meetings over the last 7 days.</>
              ) : (
                `${firstName ? `${firstName}, no` : 'No'} meeting time recorded in the last 7 days.`
              )}
            </h1>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button onClick={handleNewMeeting} disabled={isLoading} className="btn btn-primary min-h-11">
              {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" /> : <Video className="h-4 w-4" strokeWidth={1.5} />}
              {isLoading ? 'Creating…' : 'New meeting'}
            </button>
            <Link to="/calendar" className="btn btn-secondary min-h-11">Schedule</Link>
            <form onSubmit={handleJoinMeeting} className="flex w-full min-w-0 gap-2 sm:w-auto sm:flex-1">
              <input aria-label="Meeting code or link" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className="input min-h-11 min-w-0 flex-1 font-mono sm:w-56 sm:flex-none" placeholder="code or link" />
              <button type="submit" className="btn btn-secondary min-h-11">Join</button>
            </form>
          </div>
        </div>

        <WeekTape days={days} visits={week} unknown={unknown} now={now} loading={meetings === null} failed={loadFailed} />

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="card p-4 sm:p-6">
            <CardHead title="The minutes" to="/history" link="All meetings" />
            {meetings === null && <div className="skeleton h-40 rounded-lg" aria-label="Loading meetings" />}
            {meetings !== null && entries.length === 0 && (
              <p className="py-12 text-center text-sm text-gray-500">
                {loadFailed ? 'Meetings could not be loaded' : 'No past meetings yet. Start one and it shows up here'}
              </p>
            )}
            {entries.map((m) => <Entry key={m.id} meeting={m} sessions={mySessions(m, userId, now)} />)}
          </section>

          <div className="space-y-4">
            <UpNext userId={userId} live={live} upcoming={upcoming} now={now} loading={meetings === null} failed={loadFailed} />
            <ActionItems tasks={tasks} setTasks={setTasks} failed={tasksFailed} today={today} />
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function CardHead({ title, to, link }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <Link to={to} className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded text-sm text-primary-300 hover:text-primary-200">
        {link} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
      </Link>
    </div>
  )
}

// The last seven days, one row each: every meeting sits at its real time and is as wide as it ran
function WeekTape({ days, visits, unknown, now, loading, failed }) {
  // 08:00 to midnight, opening earlier (on an even hour) only if something started before that
  const first = Math.min(8, ...visits.map((m) => Math.floor(m.start.getHours() / 2) * 2))
  const from = first * 60
  const span = 24 * 60 - from
  const pct = (minute) => ((minute - from) / span) * 100
  const hours = Array.from({ length: (24 - first) / 2 + 1 }, (_, i) => first + i * 2)
  const ticks = { backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.11) 0 1px, transparent 1px calc(100% / 48))', backgroundSize: '100% 6px', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }

  return (
    <section className="card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Your week</h2>
        <ul className="flex flex-wrap gap-4 text-xs text-gray-400">
          {Object.values(KINDS).map((k) => (
            <li key={k.label} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${k.color}`} />{k.label}
            </li>
          ))}
        </ul>
      </div>
      {loading ? <div className="skeleton h-52 rounded-lg" aria-label="Loading your week" /> : failed ? (
        <p className="py-12 text-center text-sm text-gray-500">Your week could not be loaded</p>
      ) : (
        <>
          {days.map((day, i) => {
            const isToday = i === days.length - 1
            return (
              <div key={day.getTime()} className="flex h-[30px] items-center gap-3">
                <span className={`w-14 shrink-0 font-mono text-xs ${isToday ? 'text-gray-100' : 'text-gray-500'}`}>
                  {isToday ? 'Today' : `${day.toLocaleDateString([], { weekday: 'short' })} ${day.getDate()}`}
                </span>
                <div className="relative h-5 flex-1" style={ticks}>
                  {visits.filter((m) => startOfDay(m.start).getTime() === day.getTime()).map((m) => {
                    const left = Math.min(pct(minuteOfDay(m.start)), 99.5)
                    const tip = `${m.title} · ${clock(m.start)} · ${m.minutes === null ? 'end not recorded' : `${m.minutes} min`}`
                    return (
                      <button
                        key={m.key}
                        type="button"
                        aria-label={`${tip}, ${KINDS[kindOf(m)].label}`}
                        className={`group absolute top-0 h-5 min-w-1 rounded-[3px] outline-offset-1 hover:z-10 hover:outline hover:outline-2 hover:outline-white focus:z-10 focus:outline focus:outline-2 focus:outline-white ${m.minutes === null ? 'border border-dashed border-gray-400' : KINDS[kindOf(m)].color}`}
                        style={{ left: `${left}%`, width: `${Math.min(((m.minutes || 0) / span) * 100, 100 - left)}%` }}
                      >
                        <span className={`pointer-events-none absolute bottom-7 hidden whitespace-nowrap rounded-md border border-white/10 bg-dark-400 px-2 py-1 font-mono text-xs text-gray-100 group-hover:block group-focus:block ${left > 60 ? 'right-0' : left < 30 ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
                          {tip}
                        </span>
                      </button>
                    )
                  })}
                  {isToday && minuteOfDay(now) >= from && (
                    <span className="absolute -bottom-1 -top-1 w-0.5 bg-red-500" style={{ left: `${pct(minuteOfDay(now))}%` }} aria-hidden="true" />
                  )}
                </div>
              </div>
            )
          })}
          <div className="relative ml-[68px] mt-1.5 h-4 font-mono text-[11px] text-gray-600" aria-hidden="true">
            {hours.map((h, i) => (
              <span key={h} className={`absolute ${i === 0 ? '' : i === hours.length - 1 ? '-translate-x-full' : '-translate-x-1/2'} ${i % 2 ? 'hidden sm:inline' : ''}`} style={{ left: `${pct(h * 60)}%` }}>
                {String(h).padStart(2, '0')}
              </span>
            ))}
          </div>
          {unknown > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              Dashed marks ({unknown}) are visits with no reliable end time. They are not counted.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function Entry({ meeting, sessions }) {
  const [summary, setSummary] = useState(meeting.aiSummary || null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const start = startOf(meeting)
  const recordings = meeting.recordings || []
  const recording = recordings[recordings.length - 1]
  const seconds = Number(recording?.duration)
  const length = seconds > 0 ? (seconds < 60 ? `${Math.floor(seconds)} sec` : `${Math.round(seconds / 60)} min`) : 'recording'
  const mine = totalMinutes(sessions)
  const endMissing = sessions.some((s) => s.end === null)
  const chip = 'focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-200 transition-colors hover:border-white/25 hover:bg-white/[0.04] disabled:opacity-50'

  const createSummary = async () => {
    setBusy(true)
    try {
      const res = await api.post(`/ai/meetings/${meeting.roomId}/summary`, {})
      setSummary(res.data.data.summary)
      setOpen(true)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not create a summary')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="flex gap-4 border-t border-white/[0.06] py-4 sm:gap-5">
      <time dateTime={start.toISOString()} className="timecode w-14 shrink-0">
        <span className="block text-[15px] font-medium text-gray-100">{clock(start)}</span>
        {shortDate(start)}
      </time>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-gray-100">{meeting.title}</h3>
        <p className={`mt-1 text-sm leading-relaxed text-gray-400 ${open ? '' : 'line-clamp-2'}`}>
          {summary?.summary || (recording ? 'Recorded, no summary yet.' : mine ? `You were in for ${spokenDuration(mine)}.` : endMissing ? 'The end time was not recorded.' : 'No notes from this meeting.')}
        </p>
        {open && summary?.decisions?.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-400">
            {summary.decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
        {(recording || summary) && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {recording?.url && (
              <a href={fileUrl(recording.url)} target="_blank" rel="noreferrer" className={chip}>
                <Play className="h-3 w-3" fill="currentColor" />
                {recordings.length > 1 ? 'Play latest · ' : 'Play '}{length}
              </a>
            )}
            {summary ? (
              <button onClick={() => setOpen(!open)} aria-expanded={open} className={chip}>{open ? 'Close summary' : 'Read summary'}</button>
            ) : (
              <button onClick={createSummary} disabled={busy} className={chip}>{busy ? 'Summarising…' : 'Create summary'}</button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

// Countdown ring: the lit ticks are the share of the next 24 hours still to wait
function UpNext({ live, upcoming, now, loading, failed, userId }) {
  const meeting = live || upcoming
  const at = upcoming && new Date(upcoming.scheduledAt)
  const wait = live || !at ? 0 : Math.max(0, at - now)
  const minutes = Math.ceil(wait / 60000)
  const lit = Math.ceil(Math.min(wait / DAY, 1) * 60)

  let big = 'Now'
  let small = live ? 'in progress' : 'time to start'
  if (!live && minutes >= 24 * 60) {
    big = String(Math.round((startOfDay(at) - startOfDay(now)) / DAY))
    small = big === '1' ? 'day to go' : 'days to go'
  } else if (!live && minutes > 0) {
    big = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
    small = minutes >= 60 ? 'hours to go' : 'minutes to go'
  }

  const dayName = at && (at.toDateString() === now.toDateString()
    ? 'Today'
    : at.toDateString() === new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toDateString()
      ? 'Tomorrow'
      : shortDate(at))
  const invited = meeting?.invitees?.length

  return (
    <section className="card p-4 sm:p-6">
      <CardHead title={live ? 'Live now' : 'Up next'} to="/calendar" link="Calendar" />
      {loading ? <div className="skeleton h-40 rounded-lg" aria-label="Loading next meeting" /> : !meeting ? (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-500">{failed ? 'Meetings could not be loaded' : 'Nothing scheduled'}</p>
          {!failed && <Link to="/calendar" className="btn btn-secondary mt-4">Schedule a meeting</Link>}
        </div>
      ) : (
        <div className="text-center">
          <div className="relative mx-auto w-48">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              {Array.from({ length: 60 }, (_, i) => (
                <line key={i} x1="100" y1="8" x2="100" y2={i % 5 ? 18 : 22} strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${i * 6} 100 100)`}
                  className={live ? 'stroke-red-500' : i < lit ? 'stroke-primary-500' : 'stroke-dark-500'} />
              ))}
            </svg>
            <div className="absolute inset-0 grid place-content-center">
              <span className="font-mono text-[28px] font-medium tabular-nums">{big}</span>
              <span className="text-xs text-gray-500">{small}</span>
            </div>
          </div>
          <p className="mt-3 truncate text-sm font-semibold">{meeting.title}</p>
          <p className="mt-1 text-sm text-gray-400">
            {live ? `Started ${clock(startOf(live))}` : `${dayName} at ${clock(at)}`}
            {invited ? ` · ${invited} invited` : ''}
          </p>
          {meeting.host?.name && meeting.hostId !== userId && (
            <p className="mt-1 truncate text-sm text-gray-400">Invited by <span className="text-gray-200">{meeting.host.name}</span></p>
          )}
          <Link to={`/join/${meeting.roomId}`} className="btn btn-secondary mt-4 w-full">{live ? 'Join meeting' : 'Open meeting'}</Link>
        </div>
      )}
    </section>
  )
}

function ActionItems({ tasks, setTasks, failed, today }) {
  // ticked tasks stay in place (so a mistake can be undone) until the page is next loaded
  const [ticked, setTicked] = useState({}) // task id -> status it had before ticking
  const due = (t) => t.dueDate ? new Date(t.dueDate) : null
  const list = (tasks || [])
    .filter((t) => t.status !== 'done' || t.id in ticked)
    .sort((a, b) => (due(a)?.getTime() ?? Infinity) - (due(b)?.getTime() ?? Infinity))
    .slice(0, 5)

  const dueLabel = (t) => {
    if (!due(t)) return ''
    const days = Math.round((startOfDay(due(t)) - today) / DAY)
    if (days < 0) return `${-days}d late`
    if (days === 0) return 'today'
    return days < 7 ? due(t).toLocaleDateString([], { weekday: 'short' }) : shortDate(due(t))
  }

  const toggle = async (task) => {
    const done = task.status === 'done'
    const status = done ? ticked[task.id] || 'todo' : 'done'
    const apply = (value) => setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, status: value } : t)))
    if (!done) setTicked((current) => ({ ...current, [task.id]: task.status }))
    apply(status)
    try {
      await api.put(`/tasks/${task.id}`, { status })
    } catch (error) {
      apply(task.status)
      toast.error(error.response?.data?.message || 'Could not update the task')
    }
  }

  return (
    <section className="card p-4 sm:p-6">
      <CardHead title="Action items" to="/tasks" link="All tasks" />
      {tasks === null && <div className="skeleton h-24 rounded-lg" aria-label="Loading tasks" />}
      {tasks !== null && list.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">{failed ? 'Tasks could not be loaded' : 'No open tasks'}</p>
      )}
      {list.map((t) => (
        <label key={t.id} className="flex cursor-pointer items-center gap-3 border-t border-white/[0.06] py-3 text-sm">
          <input type="checkbox" checked={t.status === 'done'} onChange={() => toggle(t)} className="h-4 w-4 shrink-0 accent-primary-500" />
          <span className={`min-w-0 flex-1 truncate ${t.status === 'done' ? 'text-gray-600 line-through' : 'text-gray-100'}`}>{t.title}</span>
          <span className={`shrink-0 font-mono text-xs ${t.status !== 'done' && due(t) && startOfDay(due(t)) < today ? 'text-red-300' : 'text-gray-500'}`}>{dueLabel(t)}</span>
        </label>
      ))}
    </section>
  )
}
