import { useEffect, useState } from 'react'
import {
  Shield, Users, Video, MessageSquare, Folder, CheckSquare, Activity,
  Loader2, Search, ScrollText, BarChart3, LayoutDashboard
} from 'lucide-react'
import AppShell from '../components/AppShell'
import api from '../lib/api'
import { formatBytes } from '../store/fileStore'
import toast from 'react-hot-toast'

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'audit', label: 'Audit log', icon: ScrollText }
]

export default function Admin() {
  return (
    <AppShell>
      <AdminPage />
    </AppShell>
  )
}

function AdminPage() {
  const [tab, setTab] = useState('overview')
  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">Admin console</h1>
          <p className="text-gray-500 mt-1">Platform health, people, analytics and the audit trail.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              tab === t.key
                ? 'bg-amber-500/15 text-amber-200 border-amber-500/40'
                : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:text-gray-200'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'analytics' && <Analytics />}
      {tab === 'users' && <UsersTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

function Overview() {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/overview')
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load overview'))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-gray-600 animate-spin" /></div>
  if (!data) return null

  const cards = [
    { label: 'Total users', value: data.users.total, sub: `${data.users.online} online now`, icon: Users, tone: 'text-primary-300' },
    { label: 'Active teams', value: data.teams, sub: 'workspaces', icon: Users, tone: 'text-emerald-300' },
    { label: 'Meetings', value: data.meetings.total, sub: `${data.meetings.active} live right now`, icon: Video, tone: 'text-fuchsia-300' },
    { label: 'Messages', value: data.messages, sub: `${data.conversations} conversations`, icon: MessageSquare, tone: 'text-blue-300' },
    { label: 'Tasks', value: data.tasks.total, sub: `${data.tasks.open} open`, icon: CheckSquare, tone: 'text-amber-300' },
    { label: 'Storage used', value: formatBytes(data.files.storageBytes), sub: `${data.files.count} files`, icon: Folder, tone: 'text-cyan-300' }
  ]

  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-3">
              <c.icon className={`w-5 h-5 ${c.tone}`} />
            </div>
            <p className="text-2xl font-bold font-display">{c.value}</p>
            <p className="text-sm text-gray-400">{c.label}</p>
            <p className="text-xs text-gray-600 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
          <h3 className="font-semibold text-sm text-gray-300 mb-3">Newest members</h3>
          <div className="space-y-2">
            {data.recentUsers.map(u => (
              <div key={u.id} className="flex items-center gap-3">
                {u.avatar ? <img src={u.avatar} className="w-8 h-8 rounded-full" alt="" /> : <div className="w-8 h-8 rounded-full bg-dark-300" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-200 truncate">{u.name} {u.role !== 'user' && <span className="text-[10px] uppercase text-amber-300">({u.role})</span>}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                </div>
                {u.isOnline && <span className="w-2 h-2 rounded-full bg-green-400" />}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
          <h3 className="font-semibold text-sm text-gray-300 mb-3">Latest audit events</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {data.recentAudit.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-gray-600">{new Date(a.createdAt).toLocaleTimeString()}</span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.05] text-gray-400">{a.action}</span>
                <span className="text-gray-500 truncate">{a.actorName}</span>
              </div>
            ))}
            {data.recentAudit.length === 0 && <p className="text-xs text-gray-600">No events yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Analytics() {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/analytics', { params: { days: 14 } })
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-gray-600 animate-spin" /></div>
  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <BarChart title="Meetings per day" data={data.meetingsPerDay} color="from-fuchsia-500 to-purple-600" />
        <BarChart title="Messages per day" data={data.messagesPerDay} color="from-primary-500 to-accent-600" />
        <BarChart title="New signups per day" data={data.signupsPerDay} color="from-emerald-500 to-teal-600" />
      </div>

      <div className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
        <h3 className="font-semibold text-sm text-gray-300 mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-primary-300" /> Most active teams</h3>
        <div className="space-y-2">
          {data.topTeams.map(t => (
            <div key={t.teamId} className="flex items-center gap-3">
              <span className="text-sm text-gray-300 w-40 truncate">{t.teamName}</span>
              <div className="flex-1 h-2.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500"
                  style={{ width: `${Math.min(100, (t.messageCount / Math.max(...data.topTeams.map(x => Number(x.messageCount)))) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-16 text-right">{t.messageCount} msgs</span>
            </div>
          ))}
          {data.topTeams.length === 0 && <p className="text-xs text-gray-600">No team messages yet.</p>}
        </div>
      </div>
    </div>
  )
}

function BarChart({ title, data, color }) {
  const max = Math.max(1, ...data.map(d => Number(d.count)))
  return (
    <div className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
      <h3 className="font-semibold text-sm text-gray-300 mb-4">{title}</h3>
      <div className="flex items-end gap-1.5 h-28">
        {data.length === 0 && <p className="text-xs text-gray-600">No data yet.</p>}
        {data.map(d => (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
            <span className="text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">{d.count}</span>
            <div
              className={`w-full rounded-t-md bg-gradient-to-t ${color} min-h-[3px]`}
              style={{ height: `${(Number(d.count) / max) * 100}%` }}
            />
            <span className="text-[8px] text-gray-600">{d.day?.slice(8)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    api.get('/admin/users', { params: { search, page, limit: 20 } })
      .then(res => { setUsers(res.data.data.users); setTotal(res.data.data.total) })
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setIsLoading(false))
  }, [search, page])

  return (
    <div className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-gray-300">Users ({total})</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search users..." className="input pl-9 !py-2 text-sm w-56" />
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-gray-600 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-white/[0.06]">
                <th className="pb-2 pr-4">User</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Title</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2.5">
                      {u.avatar ? <img src={u.avatar} className="w-7 h-7 rounded-full" alt="" /> : <div className="w-7 h-7 rounded-full bg-dark-300" />}
                      <div>
                        <p className="text-gray-200">{u.name}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'user' ? 'bg-white/[0.05] text-gray-400' : 'bg-amber-500/15 text-amber-300'}`}>{u.role}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-400">{u.title || '—'}</td>
                  <td className="py-2.5 pr-4">
                    {u.isOnline
                      ? <span className="text-xs text-emerald-300 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />Online</span>
                      : <span className="text-xs text-gray-500">Seen {new Date(u.lastSeen).toLocaleDateString()}</span>}
                  </td>
                  <td className="py-2.5 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-secondary !px-4 !py-1.5 text-xs disabled:opacity-30">Prev</button>
              <span className="text-xs text-gray-500 self-center">Page {page}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} className="btn btn-secondary !px-4 !py-1.5 text-xs disabled:opacity-30">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AuditTab() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    api.get('/admin/audit-logs', { params: { action: action || undefined, page, limit: 50 } })
      .then(res => { setLogs(res.data.data.logs); setTotal(res.data.data.total) })
      .catch(() => toast.error('Failed to load audit logs'))
      .finally(() => setIsLoading(false))
  }, [action, page])

  return (
    <div className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-gray-300">Audit trail ({total})</h3>
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className="input !w-auto !py-2 text-sm">
          <option value="">All actions</option>
          {['auth.login', 'auth.logout', 'team.create', 'team.invite', 'message.send', 'message.edit', 'message.delete', 'message.pin', 'conversation.create', 'task.create', 'task.update', 'task.delete', 'file.upload', 'file.download', 'file.delete', 'ai.meeting_summary', 'ai.summarize'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-gray-600 animate-spin" /></div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-gray-600 py-8 text-center">No audit events recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-white/[0.06]">
                <th className="pb-2 pr-4">Time</th>
                <th className="pb-2 pr-4">Actor</th>
                <th className="pb-2 pr-4">Action</th>
                <th className="pb-2 pr-4">Entity</th>
                <th className="pb-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-4 text-gray-300">{l.actorName}</td>
                  <td className="py-2 pr-4"><span className="text-xs px-2 py-0.5 rounded bg-white/[0.05] text-gray-300 font-mono">{l.action}</span></td>
                  <td className="py-2 pr-4 text-xs text-gray-500">{l.entityType || '—'}</td>
                  <td className="py-2 text-xs text-gray-600 max-w-xs truncate">{l.metadata && Object.keys(l.metadata).length > 0 ? JSON.stringify(l.metadata) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 50 && (
            <div className="flex justify-center gap-2 mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-secondary !px-4 !py-1.5 text-xs disabled:opacity-30">Prev</button>
              <span className="text-xs text-gray-500 self-center">Page {page}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total} className="btn btn-secondary !px-4 !py-1.5 text-xs disabled:opacity-30">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
