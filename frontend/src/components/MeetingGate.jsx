import { CalendarClock, CheckCircle2 } from 'lucide-react'

/** Why this meeting can't be joined right now: 'ended' | 'cancelled' | 'upcoming' | 'host' | null. */
export function meetingGate(meeting, user) {
  if (meeting.status === 'ended' || meeting.status === 'cancelled') return meeting.status
  const me = user?.id || user?._id
  const people = meeting.participants || []
  if (meeting.hostId === me || people.some(p => p.userId === me && p.role === 'co-host')) return null
  if (meeting.status === 'scheduled' && meeting.scheduledAt && new Date(meeting.scheduledAt) > Date.now()) return 'upcoming'
  const hostIn = meeting.status === 'active' && people.some(p => p.userId === meeting.hostId && p.joinedAt && !p.leftAt)
  return meeting.settings?.hostMustJoinFirst && !hostIn ? 'host' : null
}

const when = (date) => new Date(date).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// "in 5 minutes", "2 days ago"
const relative = (date) => {
  const seconds = (new Date(date) - Date.now()) / 1000
  const [unit, size] = [['day', 86400], ['hour', 3600], ['minute', 60]].find(([, s]) => Math.abs(seconds) >= s) || ['minute', 60]
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(seconds / size), unit)
}

export default function MeetingGate({ gate, meeting, onHome }) {
  const waiting = gate === 'upcoming' || gate === 'host'
  const Icon = waiting ? CalendarClock : CheckCircle2
  const over = meeting.endedAt || meeting.scheduledAt

  const title = {
    upcoming: 'Waiting room',
    host: 'Waiting for the host',
    ended: 'This meeting has ended',
    cancelled: 'This meeting was cancelled'
  }[gate]

  const detail = {
    upcoming: `Starts ${relative(meeting.scheduledAt)}, on ${when(meeting.scheduledAt)}.`,
    host: 'You can join as soon as the host does.',
    ended: over ? `It ended ${relative(over)}, on ${when(over)}.` : 'It is already over.',
    cancelled: meeting.scheduledAt ? `It was planned for ${when(meeting.scheduledAt)}.` : 'It will not take place.'
  }[gate]

  return (
    <div className="card p-8 text-center" role="status">
      <Icon className="mx-auto w-9 h-9 text-primary-300" />
      <h1 className="mt-4 text-2xl font-semibold font-display">{title}</h1>
      <p className="mt-1 text-gray-200 font-medium">{meeting.title}</p>
      <p className="mt-2 text-sm text-gray-400">{detail}</p>
      {waiting && <p className="mt-4 text-xs text-gray-500">Keep this page open. The join button appears when the meeting opens.</p>}
      <button onClick={onHome} className="btn btn-secondary w-full mt-6">Back to home</button>
    </div>
  )
}
