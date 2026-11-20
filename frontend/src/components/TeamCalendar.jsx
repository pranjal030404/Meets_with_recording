import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Video, Plus, Loader2, CalendarDays, Clock } from 'lucide-react'
import api from '../lib/api'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const meetingDate = (m) => new Date(m.scheduledAt || m.createdAt)

export default function TeamCalendar({ teamId }) {
  const navigate = useNavigate()
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get(`/meetings/team/${teamId}`, { params: { limit: 200 } })
      .then(res => { if (!cancelled) setMeetings((res.data.data.meetings || []).filter(m => m.status !== 'cancelled')) })
      .catch(() => { if (!cancelled) setMeetings([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [teamId])

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [...Array(first.getDay()).fill(null), ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  }, [month])

  const forDay = (d) => meetings.filter(m => sameDay(meetingDate(m), d))
  const dayMeetings = forDay(selected).sort((a, b) => meetingDate(a) - meetingDate(b))
  const goto = (delta) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1))
  const time = (m) => meetingDate(m).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-5 sm:p-6 overflow-y-auto h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold font-display">Team calendar</h2>
          <p className="text-gray-500 text-sm mt-1">Meetings scheduled for this team.</p>
        </div>
        <button onClick={() => navigate(`/meeting/create?teamId=${teamId}`)} className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" /> Schedule meeting
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-gray-600 animate-spin" /></div>
      ) : (
        <div className="grid xl:grid-cols-[1fr_20rem] gap-5">
          <div className="rounded-2xl bg-dark-200/50 border border-white/[0.06] p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => goto(-1)} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-400" aria-label="Previous month"><ChevronLeft className="w-5 h-5" /></button>
              <h3 className="font-semibold">{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h3>
              <button onClick={() => goto(1)} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-400" aria-label="Next month"><ChevronRight className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wider text-gray-500 mb-1">
              {DAYS.map(d => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />
                const n = forDay(d).length
                const isSel = sameDay(d, selected)
                return (
                  <button key={i} onClick={() => setSelected(d)}
                    className={`aspect-square sm:aspect-[4/3] rounded-xl text-sm flex flex-col items-center justify-center gap-1 border transition-colors ${
                      isSel ? 'bg-primary-500/20 border-primary-500/40 text-primary-100'
                        : sameDay(d, today) ? 'border-primary-500/30 text-primary-300 hover:bg-white/[0.04]'
                        : 'border-transparent text-gray-300 hover:bg-white/[0.04]'}`}>
                    {d.getDate()}
                    {n > 0 && <span className="flex gap-0.5">{Array.from({ length: Math.min(n, 3) }).map((_, k) => <span key={k} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />)}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-dark-200/50 border border-white/[0.06] p-4">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-primary-400" />
              {selected.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            {dayMeetings.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">No meetings this day.</p>
            ) : (
              <div className="space-y-2.5">
                {dayMeetings.map(m => (
                  <div key={m.id} className="rounded-xl bg-dark-300/60 border border-white/[0.06] p-3">
                    <p className="font-medium text-sm truncate">{m.title}</p>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{time(m)}{m.host?.name ? ` · ${m.host.name}` : ''}</p>
                    <button onClick={() => navigate(`/meeting/${m.roomId}`)} className="mt-2.5 w-full btn btn-secondary !py-1.5 text-xs">
                      <Video className="w-3.5 h-3.5" /> Join
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
