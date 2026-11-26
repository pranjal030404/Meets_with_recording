import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { shiftDates } from '../lib/recurrence'

// <input type="datetime-local"> speaks local time
const toInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

/** Edits an upcoming meeting: one date of a repeating one, or that date and all later ones. */
export default function EditMeetingModal({ meeting, onClose, onSaved }) {
  const repeats = !!meeting.recurrence?.seriesId
  const original = toInput(new Date(meeting.scheduledAt))
  const [form, setForm] = useState({
    title: meeting.title,
    description: meeting.description || '',
    scheduledAt: original,
    waitingRoom: !!meeting.settings?.waitingRoom,
    muteOnEntry: !!meeting.settings?.muteOnEntry,
    takeNotes: !!meeting.settings?.takeNotes
  })
  const [scope, setScope] = useState('one')
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const save = async (e) => {
    e.preventDefault()
    const at = new Date(form.scheduledAt)
    const moved = form.scheduledAt !== original
    if (moved && at <= new Date()) return toast.error('Pick a time in the future')
    setSaving(true)
    try {
      let dates
      if (moved && scope === 'series') {
        const { data } = await api.get(`/meetings/${meeting.roomId}/series`)
        dates = shiftDates(data.data.dates.map(d => new Date(d)), at).map(d => d.toISOString())
      } else if (moved) {
        dates = [at.toISOString()]
      }
      const { waitingRoom, muteOnEntry, takeNotes, title, description } = form
      await api.put(`/meetings/${meeting.roomId}/schedule`, {
        title, description, dates, scope, settings: { waitingRoom, muteOnEntry, takeNotes }
      })
      toast.success('Meeting updated')
      await onSaved?.()
      onClose()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save the changes')
      setSaving(false)
    }
  }

  const label = 'block text-sm font-medium text-gray-300 mb-2'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-content max-w-lg max-h-[90vh] overflow-y-auto space-y-4 text-left" onSubmit={save} onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-semibold font-display">Edit meeting</h2>
        {repeats && (
          <div>
            <label className={label}>Apply to</label>
            <select value={scope} onChange={e => setScope(e.target.value)} className="input">
              <option value="one">This date only</option>
              <option value="series">This and all later dates</option>
            </select>
          </div>
        )}
        <div>
          <label className={label}>Title</label>
          <input value={form.title} onChange={set('title')} className="input" required />
        </div>
        <div>
          <label className={label}>Description</label>
          <textarea value={form.description} onChange={set('description')} className="input" rows="3" />
        </div>
        <div>
          <label className={label}>Date & time</label>
          <input type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} className="input" required />
          {repeats && scope === 'series' && <p className="text-xs text-gray-500 mt-1.5">Later dates move by the same number of days, to the same time.</p>}
        </div>
        {[['waitingRoom', 'Waiting room'], ['muteOnEntry', 'Mute participants on entry'], ['takeNotes', 'Take notes (live transcript)']].map(([key, text]) => (
          <label key={key} className="flex items-center justify-between text-sm text-gray-300 cursor-pointer">
            {text}
            <input type="checkbox" checked={form[key]} onChange={set(key)} />
          </label>
        ))}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Close</button>
          <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </div>
  )
}
