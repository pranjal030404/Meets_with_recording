// Build and download a CSV attendance report from the meeting's participant records.
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

export function downloadAttendanceReport(meeting) {
  const rows = (meeting?.participants || []).map((p) => {
    const joined = p.joinedAt ? new Date(p.joinedAt) : null
    const left = p.leftAt ? new Date(p.leftAt) : null
    const end = left || new Date()
    const minutes = joined ? Math.max(0, Math.round((end - joined) / 60000)) : ''
    return [
      p.user?.name || p.name || p.userId,
      p.user?.email || p.email || '',
      p.role || 'participant',
      joined ? joined.toISOString() : '',
      left ? left.toISOString() : 'Still in meeting',
      minutes,
    ]
  })
  const header = ['Name', 'Email', 'Role', 'Joined', 'Left', 'Duration (min)']
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `attendance-${meeting?.roomId || 'meeting'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
