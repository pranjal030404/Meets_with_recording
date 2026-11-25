// How long one person was really in meetings.
//
// Closing a tab doesn't tell the server you left, so a meeting can stay open for days and then
// stamp that late moment as everyone's leaving time. Anything longer than MAX_SESSION is treated
// as "end not recorded" instead of being counted.
export const MAX_SESSION = 4 * 60 * 60 * 1000

/** This person's stays in one meeting: [{ start, end }] in ms. end is null when it can't be trusted. */
export const mySessions = (meeting, userId, now) => (meeting.participants || [])
  .filter((p) => p.userId === userId && p.joinedAt)
  .map((p) => {
    const start = new Date(p.joinedAt).getTime()
    const left = p.leftAt || meeting.endedAt
    const end = left ? new Date(left).getTime() : meeting.status === 'active' ? new Date(now).getTime() : null
    return { start, end: end !== null && end >= start && end - start <= MAX_SESSION ? end : null }
  })

/** Whole minutes covered by the sessions from `since` on. Time in two meetings at once counts once. */
export const totalMinutes = (sessions, since = 0) => {
  let total = 0
  let covered = new Date(since).getTime()
  for (const s of sessions.filter((s) => s.end !== null).sort((a, b) => a.start - b.start)) {
    total += Math.max(0, s.end - Math.max(s.start, covered))
    covered = Math.max(covered, s.end)
  }
  return total ? Math.max(1, Math.round(total / 60000)) : 0
}

/** An "active" meeting nobody could still be sitting in is not live. */
export const isLive = (meeting, now) => meeting.status === 'active' &&
  new Date(now) - new Date(meeting.startedAt || meeting.createdAt) <= MAX_SESSION

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
export const spokenDuration = (minutes) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h && plural(h, 'hour'), (m || !h) && plural(m, 'minute')].filter(Boolean).join(' ')
}
