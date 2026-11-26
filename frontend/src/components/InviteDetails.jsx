import { CalendarClock } from 'lucide-react'
import Avatar from './Avatar'

const STATUS = { accepted: 'Accepted', declined: 'Declined', pending: 'Invited' }

/** Who set the meeting up, when it is, what it is about and who else is on it. */
export default function InviteDetails({ meeting, people = [], user }) {
  const me = user?.id || user?._id
  const mine = meeting.hostId === me
  const host = meeting.host
  const invitedMe = people.some(p => p.id === me)

  return (
    <div className="card p-5 mt-4 text-left space-y-3">
      <div className="flex items-center gap-3">
        <Avatar user={host} size="md" />
        <div className="min-w-0">
          <p className="text-sm text-gray-200 font-medium truncate">
            {mine ? 'You set up this meeting' : invitedMe ? `${host?.name} invited you` : `Hosted by ${host?.name}`}
          </p>
          {!mine && host?.email && <p className="text-xs text-gray-500 truncate">{host.email}</p>}
        </div>
      </div>
      {meeting.scheduledAt && (
        <p className="flex items-center gap-2 text-sm text-gray-400">
          <CalendarClock className="w-4 h-4 text-primary-400 shrink-0" />
          {new Date(meeting.scheduledAt).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
        </p>
      )}
      {meeting.team?.name && <p className="text-sm text-gray-400">Team: <span className="text-gray-200">{meeting.team.name}</span></p>}
      {meeting.description && <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{meeting.description}</p>}
      {people.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Invited ({people.length})</p>
          <ul className="space-y-1.5 max-h-40 overflow-y-auto">
            {people.map((p, i) => (
              <li key={p.id || i} className="flex items-center gap-2 text-sm">
                <Avatar user={p} size="sm" />
                <span className="text-gray-200 truncate flex-1">{p.name}{p.id === me ? ' (you)' : ''}</span>
                <span className="text-xs text-gray-500">{STATUS[p.status] || 'Invited'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
