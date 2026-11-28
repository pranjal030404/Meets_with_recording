export const REPEATS = [
  ['', 'Does not repeat'],
  ['daily', 'Every day'],
  ['weekdays', 'Every weekday (Mon to Fri)'],
  ['weekly', 'Every week'],
  ['biweekly', 'Every 2 weeks'],
  ['monthly', 'Every month']
]
export const MAX_OCCURRENCES = 52

export const repeatLabel = (frequency) => REPEATS.find(([key]) => key === frequency)?.[1]

/**
 * The dates of a repeating meeting, at the same local time each day (so a clock change does not move it).
 * Weekdays skips weekends; monthly skips months that lack the day (e.g. the 31st).
 */
export function occurrences(start, frequency, count) {
  const dates = []
  for (let step = 0; dates.length < count && step < 800; step++) {
    const d = new Date(start)
    if (frequency === 'monthly') {
      d.setMonth(start.getMonth() + step, 1)
      d.setDate(start.getDate())
      if (d.getDate() !== start.getDate()) continue
    } else {
      d.setDate(start.getDate() + step * (frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 1))
      if (frequency === 'weekdays' && (d.getDay() === 0 || d.getDay() === 6)) continue
    }
    dates.push(d)
  }
  return dates
}

/** A list of meetings keeping only the soonest upcoming date of each repeating one. */
export function collapseSeries(meetings) {
  const soonest = new Map()
  for (const m of meetings) {
    const id = m.recurrence?.seriesId
    if (!id || m.status !== 'scheduled' || Date.now() - new Date(m.scheduledAt) > 12 * 3600 * 1000) continue
    const best = soonest.get(id)
    if (!best || new Date(m.scheduledAt) < new Date(best.scheduledAt)) soonest.set(id, m)
  }
  return meetings.filter(m => !m.recurrence?.seriesId || m.status !== 'scheduled' || soonest.get(m.recurrence.seriesId) === m)
}

/** The room in a meeting's invite link: one link for a whole repeating meeting. */
export const linkRoomId = (meeting, roomId = meeting?.roomId) => meeting?.recurrence?.seriesRoomId || roomId

/** Moves dates by as many days as the first one moved, all at its new time of day. */
export function shiftDates(dates, newFirst) {
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((midnight(newFirst) - midnight(dates[0])) / 86400000)
  return dates.map((date) => {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    next.setHours(newFirst.getHours(), newFirst.getMinutes(), 0, 0)
    return next
  })
}
