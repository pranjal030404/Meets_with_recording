import { useEffect, useState } from 'react'
import { User, Users, Plus, Clock, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useMeetingStore } from '../store/meetingStore'
import useTeamStore from '../store/teamStore'

const REMINDERS = [{ time: 15, unit: 'minutes' }, { time: 1, unit: 'hours' }]

// <input type="datetime-local"> speaks local time; toISOString() would shift it to UTC
const toInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

// The clicked day at 10:00, or the next full hour if that has passed
const defaultTime = (day) => {
  if (!day) return ''
  const at = new Date(day)
  at.setHours(10, 0, 0, 0)
  if (at < new Date()) {
    at.setTime(Date.now())
    at.setHours(at.getHours() + 1, 0, 0, 0)
  }
  return toInput(at)
}

/** Schedules a personal or a team meeting. teamId preselects a team. */
export default function ScheduleMeetingModal({ teamId = '', day, onClose, onScheduled }) {
  const createMeeting = useMeetingStore(s => s.createMeeting)
  const { teams, fetchTeams } = useTeamStore()
  const [kind, setKind] = useState(teamId ? 'team' : 'personal')
  const [form, setForm] = useState({ title: '', description: '', scheduledAt: defaultTime(day), teamId, emails: '' })
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { fetchTeams() }, [])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const idOf = (team) => team._id || team.id
  const chosenTeam = form.teamId || (teams[0] && idOf(teams[0])) || ''
  const link = created && `${window.location.origin}/meeting/${created.roomId}`

  const submit = async (e) => {
    e.preventDefault()
    const at = new Date(form.scheduledAt)
    if (at <= new Date()) return toast.error('Pick a time in the future')
    if (kind === 'team' && !chosenTeam) return toast.error('Pick a team')
    const emails = form.emails.split(/[\s,;]+/).filter(Boolean)
    const invalid = emails.find(x => !/^[^@]+@[^@]+\.[^@]+$/.test(x))
    if (kind === 'personal' && invalid) return toast.error(`"${invalid}" is not an email address`)

    setSaving(true)
    const result = await createMeeting({
      title: form.title,
      description: form.description,
      scheduledAt: at.toISOString(),
      teamId: kind === 'team' ? chosenTeam : undefined,
      invitees: kind === 'personal' ? emails.map(email => ({ email })) : [],
      reminders: REMINDERS
    })
    setSaving(false)
    if (!result.success) return toast.error(result.message || 'Could not schedule the meeting')
    setCreated(result.meeting)
    onScheduled?.(result.meeting)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      toast.error('Could not copy. Select the link and copy it.')
    }
  }

  const label = 'block text-sm font-medium text-gray-300 mb-2'

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto" role="dialog" aria-label="Schedule meeting">
        {created ? (
          <>
            <h2 className="text-2xl font-semibold font-display mb-2">Meeting scheduled</h2>
            <p className="text-gray-400 text-sm mb-5">{created.title}, {new Date(created.scheduledAt).toLocaleString()}</p>
            <label className={label}>Meeting link</label>
            <div className="flex gap-2">
              <input readOnly value={link} onFocus={(e) => e.target.select()} className="input flex-1 min-w-0" />
              <button type="button" onClick={copy} className="btn btn-secondary">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button type="button" onClick={onClose} className="btn btn-primary w-full mt-6">Done</button>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold font-display mb-5">Schedule meeting</h2>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-dark-300/60 border border-white/[0.06] p-1" role="radiogroup" aria-label="Meeting type">
                {[['personal', 'Personal', User], ['team', 'Team', Users]].map(([key, text, Icon]) => (
                  <button key={key} type="button" role="radio" aria-checked={kind === key} onClick={() => setKind(key)}
                    className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${kind === key ? 'bg-primary-500/20 text-primary-200' : 'text-gray-400 hover:text-gray-200'}`}>
                    <Icon className="w-4 h-4" /> {text}
                  </button>
                ))}
              </div>

              {kind === 'team' ? (
                <div>
                  <label className={label}>Team *</label>
                  {teams.length ? (
                    <>
                      <select value={chosenTeam} onChange={set('teamId')} className="input">
                        {teams.map(team => <option key={idOf(team)} value={idOf(team)}>{team.name}</option>)}
                      </select>
                      <p className="text-xs text-gray-500 mt-1.5">Everyone in the team is invited and notified.</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">You are not in a team yet.</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className={label}>Invite people</label>
                  <input type="text" value={form.emails} onChange={set('emails')} className="input" placeholder="Email addresses, separated by commas (optional)" />
                  <p className="text-xs text-gray-500 mt-1.5">People with an account get a notification. Send the link to anyone else.</p>
                </div>
              )}

              <div>
                <label className={label}>Title *</label>
                <input type="text" value={form.title} onChange={set('title')} className="input" required placeholder={kind === 'team' ? 'Team standup' : 'Catch-up'} />
              </div>
              <div>
                <label className={label}>Description</label>
                <textarea value={form.description} onChange={set('description')} className="input" rows="3" placeholder="Optional meeting description" />
              </div>
              <div>
                <label className={label}>Date & time *</label>
                <input type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} className="input" required min={toInput(new Date())} />
              </div>
              <p className="flex items-center gap-2 text-sm text-gray-400">
                <Clock className="w-4 h-4 text-primary-400" /> Reminders 15 minutes and 1 hour before
              </p>

              <div className="flex gap-3 pt-3">
                <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  <Plus className="w-4 h-4" /> {saving ? 'Scheduling…' : 'Schedule meeting'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
