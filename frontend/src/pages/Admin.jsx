import { Fragment, useEffect, useState } from 'react'
import {
  Shield, Users, Video, MessageSquare, Folder, CheckSquare, Activity,
  Loader2, Search, ScrollText, BarChart3, LayoutDashboard
} from 'lucide-react'
import { LogOut, KeyRound, Plus, Trash2, X, UserCog } from 'lucide-react'
import api from '../lib/adminApi'
import { useAdminStore, useCan } from '../store/adminStore'
import { formatBytes } from '../store/fileStore'
import toast from 'react-hot-toast'

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, perm: 'admin.overview' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, perm: 'admin.overview' },
  { key: 'users', label: 'Users', icon: Users, perm: 'admin.users.view' },
  { key: 'admins', label: 'Admins', icon: UserCog, perm: 'admin.admins.manage' },
  { key: 'roles', label: 'Roles & permissions', icon: KeyRound, perm: 'admin.roles.manage' },
  { key: 'meetings', label: 'Meetings', icon: Video, perm: 'admin.meetings.view' },
  { key: 'audit', label: 'Activity history', icon: ScrollText, perm: 'admin.history.view' }
]

export default function Admin() {
  return (
    <div className="min-h-screen bg-dark-100 text-slate-100">
      <AdminBar />
      <AdminPage />
    </div>
  )
}

function AdminBar() {
  const { admin, logout } = useAdminStore()
  return (
    <div className="flex items-center justify-end gap-4 px-6 py-3 border-b border-white/[0.06] text-sm text-gray-400">
      <span>{admin?.name} · {admin?.role === 'superadmin' ? 'Super Admin' : 'Admin'}</span>
      <button onClick={logout} className="flex items-center gap-1.5 hover:text-white">
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </div>
  )
}

function AdminPage() {
  const permissions = useAdminStore(s => s.permissions)
  const tabs = TABS.filter(t => permissions.includes(t.perm))
  const [tab, setTab] = useState(tabs[0]?.key || 'overview')
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

      {tabs.length === 0 && <p className="text-gray-500">Your admin role has no console permissions. Ask a super admin to update it.</p>}
      <div className="flex flex-wrap gap-2 mb-8">
        {tabs.map(t => (
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
      {tab === 'admins' && <AdminsTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'meetings' && <MeetingsTab />}
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

function Pager({ page, setPage, total, size }) {
  if (total <= size) return null
  return (
    <div className="flex justify-center gap-2 mt-4">
      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-secondary !px-4 !py-1.5 text-xs disabled:opacity-30">Prev</button>
      <span className="text-xs text-gray-500 self-center">Page {page} of {Math.ceil(total / size)}</span>
      <button onClick={() => setPage(p => p + 1)} disabled={page * size >= total} className="btn btn-secondary !px-4 !py-1.5 text-xs disabled:opacity-30">Next</button>
    </div>
  )
}

const Spinner = () => <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-gray-600 animate-spin" /></div>
const errMsg = (e, fallback) => e.response?.data?.message || fallback

function UsersTab() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [historyUser, setHistoryUser] = useState(null)
  const isSuper = useCan('admin.users.manage')
  const [creating, setCreating] = useState(false)

  const load = () => {
    setIsLoading(true)
    api.get('/admin/users', { params: { search, page, limit: 20 } })
      .then(res => { setUsers(res.data.data.users); setTotal(res.data.data.total) })
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setIsLoading(false))
  }
  useEffect(load, [search, page])
  useEffect(() => { api.get('/admin/roles', { params: { scope: 'user' } }).then(r => setRoles(r.data.data.roles)).catch(() => {}) }, [])

  const defaultRole = roles.find(r => r.isDefault)

  const changeRole = async (u, roleId) => {
    try {
      await api.put(`/admin/users/${u.id}/role`, { roleId: roleId || null })
      toast.success('Role updated')
      load()
    } catch (e) { toast.error(errMsg(e, 'Failed to update role')) }
  }
  const toggleActive = async (u) => {
    try {
      await api.put(`/admin/users/${u.id}/status`, { isActive: !u.isActive })
      toast.success(u.isActive ? 'User suspended' : 'User reactivated')
      load()
    } catch (e) { toast.error(errMsg(e, 'Failed to update status')) }
  }

  return (
    <div className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-gray-300">Users ({total})</h3>
        <div className="flex items-center gap-3">
        {isSuper && <button onClick={() => setCreating(true)} className="btn btn-primary !py-2 text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Add user</button>}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search users..." className="input pl-9 !py-2 text-sm w-56" />
        </div>
        </div>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-white/[0.06]">
                <th className="pb-2 pr-4">User</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Joined</th>
                <th className="pb-2">Actions</th>
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
                    {isSuper ? (
                      <select value={u.roleId || ''} onChange={(e) => changeRole(u, e.target.value)} className="input !w-auto !py-1.5 text-xs">
                        <option value="">{defaultRole ? `${defaultRole.name} (default)` : 'Default'}</option>
                        {roles.filter(r => !r.isDefault).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.05] text-gray-400">{u.customRole?.name || defaultRole?.name || 'Member'}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    {!u.isActive
                      ? <span className="text-xs text-red-300">Suspended</span>
                      : u.isOnline
                        ? <span className="text-xs text-emerald-300 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />Online</span>
                        : <span className="text-xs text-gray-500">Seen {new Date(u.lastSeen).toLocaleDateString()}</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2.5">
                    <div className="flex gap-2">
                      <button onClick={() => setHistoryUser(u)} className="text-xs text-primary-300 hover:underline">History</button>
                      {isSuper && (
                        <button onClick={() => toggleActive(u)} className={`text-xs hover:underline ${u.isActive ? 'text-red-300' : 'text-emerald-300'}`}>
                          {u.isActive ? 'Suspend' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} setPage={setPage} total={total} size={20} />
        </div>
      )}
      {creating && (
        <AccountForm
          title="Add user"
          roles={roles.filter(r => !r.isDefault)}
          defaultRoleName={defaultRole?.name}
          onClose={() => setCreating(false)}
          onSubmit={async (f) => { await api.post('/admin/users', f); toast.success('User created'); setCreating(false); load() }}
        />
      )}
      {historyUser && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setHistoryUser(null)}>
          <div className="w-full max-w-4xl mt-10 rounded-2xl bg-dark-100 border border-white/10 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">History · {historyUser.name}</h3>
              <button onClick={() => setHistoryUser(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <AuditTab userId={historyUser.id} compact />
          </div>
        </div>
      )}
    </div>
  )
}

function RolesTab() {
  const [scope, setScope] = useState('user')
  const [roles, setRoles] = useState([])
  const [catalogs, setCatalogs] = useState({ user: [], admin: [] })
  const catalog = catalogs[scope]
  const [editing, setEditing] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const isSuper = useCan('admin.roles.manage')

  const load = () => {
    Promise.all([api.get('/admin/roles', { params: { scope } }), api.get('/admin/permissions')])
      .then(([r, p]) => { setRoles(r.data.data.roles); setCatalogs({ user: p.data.data.permissions, admin: p.data.data.adminPermissions }) })
      .catch(() => toast.error('Failed to load roles'))
      .finally(() => setIsLoading(false))
  }
  useEffect(() => { setIsLoading(true); load() }, [scope])

  const save = async () => {
    try {
      if (editing.id) await api.put(`/admin/roles/${editing.id}`, editing)
      else await api.post('/admin/roles', { ...editing, scope })
      toast.success('Role saved')
      setEditing(null)
      load()
    } catch (e) { toast.error(errMsg(e, 'Failed to save role')) }
  }
  const remove = async (r) => {
    if (!window.confirm(`Delete role "${r.name}"? Its users fall back to the default role.`)) return
    try { await api.delete(`/admin/roles/${r.id}`); toast.success('Role deleted'); load() }
    catch (e) { toast.error(errMsg(e, 'Failed to delete role')) }
  }
  const togglePerm = (key) => setEditing(ed => ({
    ...ed,
    permissions: ed.permissions.includes(key) ? ed.permissions.filter(k => k !== key) : [...ed.permissions, key]
  }))

  if (isLoading) return <Spinner />
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex gap-2 mb-2">
            {[['user', 'User roles'], ['admin', 'Admin roles']].map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${scope === k ? 'bg-amber-500/15 text-amber-200 border-amber-500/40' : 'border-white/[0.06] text-gray-400'}`}>{l}</button>
            ))}
          </div>
          <p className="text-sm text-gray-400">
            {scope === 'user' ? 'What regular users can do in the app. Users without a role get the default one.' : 'What admins can do in this console (e.g. Manager). Super admins always have everything.'}
          </p>
        </div>
        {isSuper && (
          <button onClick={() => setEditing({ name: '', description: '', permissions: [] })} className="btn btn-primary !py-2 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> New role
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {roles.map(r => (
          <div key={r.id} className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-gray-100">
                  {r.name}
                  {r.isDefault && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 uppercase">default</span>}
                  {r.isSystem && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-400 uppercase">system</span>}
                </h4>
                <p className="text-xs text-gray-500 mt-1">{r.description || 'No description'} · {r.userCount} user{r.userCount === 1 ? '' : 's'}</p>
              </div>
              {isSuper && (
                <div className="flex gap-3 text-xs">
                  <button onClick={() => setEditing({ ...r })} className="text-primary-300 hover:underline">Edit</button>
                  {!r.isSystem && <button onClick={() => remove(r)} className="text-red-300"><Trash2 className="w-4 h-4" /></button>}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {catalog.map(p => (
                <span key={p.key} className={`text-[11px] px-2 py-0.5 rounded ${r.permissions.includes(p.key) ? 'bg-primary-500/15 text-primary-200' : 'bg-white/[0.03] text-gray-600 line-through'}`}>{p.label}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-dark-100 border border-white/10 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold">{editing.id ? 'Edit role' : 'New role'}</h3>
            <input className="input" placeholder="Role name" value={editing.name} disabled={editing.isSystem} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <input className="input" placeholder="Description" value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            <div className="space-y-2">
              {catalog.map(p => (
                <label key={p.key} className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={editing.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} />
                  {p.label} <span className="text-xs text-gray-600 font-mono">{p.key}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn btn-secondary !py-2 text-sm">Cancel</button>
              <button onClick={save} className="btn btn-primary !py-2 text-sm">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MeetingsTab() {
  const [meetings, setMeetings] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    api.get('/admin/meetings', { params: { search: search || undefined, status: status || undefined, page, limit: 20 } })
      .then(res => { setMeetings(res.data.data.meetings); setTotal(res.data.data.total) })
      .catch(() => toast.error('Failed to load meetings'))
      .finally(() => setIsLoading(false))
  }, [search, status, page])

  const fmt = (d) => (d ? new Date(d).toLocaleString() : '—')
  const dur = (m) => (m.startedAt && m.endedAt ? `${Math.max(1, Math.round((new Date(m.endedAt) - new Date(m.startedAt)) / 60000))} min` : '—')

  return (
    <div className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-semibold text-sm text-gray-300">Meeting history ({total})</h3>
        <div className="flex gap-2">
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Title or room id..." className="input !py-2 text-sm w-48" />
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className="input !w-auto !py-2 text-sm">
            <option value="">All statuses</option>
            {['scheduled', 'active', 'ended', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {isLoading ? <Spinner /> : meetings.length === 0 ? (
        <p className="text-xs text-gray-600 py-8 text-center">No meetings found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-white/[0.06]">
                <th className="pb-2 pr-4">Meeting</th><th className="pb-2 pr-4">Host</th><th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Started</th><th className="pb-2 pr-4">Ended</th><th className="pb-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map(m => (
                <tr key={m.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-4"><p className="text-gray-200">{m.title}</p><p className="text-xs text-gray-600 font-mono">{m.roomId}</p></td>
                  <td className="py-2.5 pr-4 text-gray-400">{m.host?.name || '—'}</td>
                  <td className="py-2.5 pr-4"><span className="text-xs px-2 py-0.5 rounded bg-white/[0.05] text-gray-300">{m.status}</span></td>
                  <td className="py-2.5 pr-4 text-xs text-gray-500 whitespace-nowrap">{fmt(m.startedAt || m.scheduledAt)}</td>
                  <td className="py-2.5 pr-4 text-xs text-gray-500 whitespace-nowrap">{fmt(m.endedAt)}</td>
                  <td className="py-2.5 text-xs text-gray-500">{dur(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} setPage={setPage} total={total} size={20} />
        </div>
      )}
    </div>
  )
}

const statusColor = (c) => !c ? 'text-gray-500' : c >= 500 ? 'text-red-400' : c >= 400 ? 'text-amber-300' : 'text-emerald-300'

function AuditTab({ userId, compact = false }) {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [f, setF] = useState({ search: '', actorType: '', method: '', statusClass: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [open, setOpen] = useState(null)
  const set = (k, v) => { setF(prev => ({ ...prev, [k]: v })); setPage(1) }

  useEffect(() => {
    setIsLoading(true)
    const params = { page, limit: 50, userId }
    Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v })
    api.get('/admin/audit-logs', { params })
      .then(res => { setLogs(res.data.data.logs); setTotal(res.data.data.total) })
      .catch(() => toast.error('Failed to load activity history'))
      .finally(() => setIsLoading(false))
  }, [f, page, userId])

  return (
    <div className={compact ? '' : 'rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5'}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h3 className="font-semibold text-sm text-gray-300 mr-auto">Activity history ({total})</h3>
        <input value={f.search} onChange={e => set('search', e.target.value)} placeholder="Search actor, path, action..." className="input !py-2 text-sm w-56" />
        {!userId && (
          <select value={f.actorType} onChange={e => set('actorType', e.target.value)} className="input !w-auto !py-2 text-sm">
            <option value="">All actors</option>
            {['user', 'admin', 'anonymous', 'system'].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <select value={f.method} onChange={e => set('method', e.target.value)} className="input !w-auto !py-2 text-sm">
          <option value="">Any method</option>
          {['POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={f.statusClass} onChange={e => set('statusClass', e.target.value)} className="input !w-auto !py-2 text-sm">
          <option value="">Any result</option>
          <option value="2">Success (2xx)</option>
          <option value="4">Client error (4xx)</option>
          <option value="5">Server error (5xx)</option>
        </select>
        <input type="date" value={f.from} onChange={e => set('from', e.target.value)} className="input !w-auto !py-2 text-sm" />
        <input type="date" value={f.to} onChange={e => set('to', e.target.value)} className="input !w-auto !py-2 text-sm" />
      </div>
      {isLoading ? <Spinner /> : logs.length === 0 ? (
        <p className="text-xs text-gray-600 py-8 text-center">No activity matches these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-white/[0.06]">
                <th className="pb-2 pr-4">Time</th><th className="pb-2 pr-4">Actor</th><th className="pb-2 pr-4">Action</th>
                <th className="pb-2 pr-4">Request</th><th className="pb-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <Fragment key={l.id}>
                  <tr onClick={() => setOpen(open === l.id ? null : l.id)} className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer">
                    <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-gray-300">{l.actorName}<span className="ml-1.5 text-[10px] text-gray-600">{l.actorType}</span></td>
                    <td className="py-2 pr-4"><span className="text-xs px-2 py-0.5 rounded bg-white/[0.05] text-gray-300 font-mono">{l.action}</span></td>
                    <td className="py-2 pr-4 text-xs text-gray-500 font-mono max-w-xs truncate">{l.method ? `${l.method} ${l.path}` : (l.entityType || '—')}</td>
                    <td className={`py-2 text-xs font-mono ${statusColor(l.statusCode)}`}>{l.statusCode || '—'}</td>
                  </tr>
                  {open === l.id && (
                    <tr className="bg-white/[0.02]">
                      <td colSpan={5} className="px-3 py-3">
                        <pre className="text-xs text-gray-400 whitespace-pre-wrap break-all">{JSON.stringify({
                          id: l.id, actorId: l.actorId, entityType: l.entityType, entityId: l.entityId,
                          ip: l.ip, userAgent: l.userAgent, metadata: l.metadata
                        }, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <Pager page={page} setPage={setPage} total={total} size={50} />
        </div>
      )}
    </div>
  )
}

function AccountForm({ title, roles, defaultRoleName, onClose, onSubmit, isAdmin = false, canMakeSuper = false, initial = null }) {
  const [f, setF] = useState({ name: initial?.name || '', email: initial?.email || '', password: '', roleId: initial?.roleId || '', role: initial?.role || 'admin' })
  const [saving, setSaving] = useState(false)
  const [show, setShow] = useState(false)
  const editing = !!initial

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...f, roleId: f.roleId || null }
      if (editing && !payload.password) delete payload.password
      await onSubmit(payload)
    } catch (err) {
      toast.error(errMsg(err, 'Failed to save'))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} autoComplete="off" className="w-full max-w-md rounded-2xl bg-dark-100 border border-white/10 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <input className="input" placeholder="Full name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required />
        <input className="input" type="email" placeholder="Email" autoComplete="off" value={f.email} disabled={editing} onChange={e => setF({ ...f, email: e.target.value })} required />
        <div className="relative">
          <input className="input pr-16" type={show ? 'text' : 'password'} autoComplete="new-password"
            placeholder={editing ? 'New password (leave blank to keep)' : `Password (min ${isAdmin ? 8 : 6} characters)`}
            value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required={!editing} />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{show ? 'Hide' : 'Show'}</button>
        </div>
        {isAdmin && canMakeSuper && (
          <select className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
            <option value="admin">Admin (uses role below)</option>
            <option value="superadmin">Super admin (full access)</option>
          </select>
        )}
        {f.role !== 'superadmin' && (
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{isAdmin ? 'Admin role' : 'Role'}</label>
            <select className="input" value={f.roleId} onChange={e => setF({ ...f, roleId: e.target.value })}>
              {!isAdmin && <option value="">{defaultRoleName ? `${defaultRoleName} (default)` : 'Default'}</option>}
              {isAdmin && <option value="">Default admin role</option>}
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.isDefault ? ' (default)' : ''}</option>)}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary !py-2 text-sm">Cancel</button>
          <button disabled={saving} className="btn btn-primary !py-2 text-sm">{saving ? 'Saving...' : editing ? 'Save changes' : 'Create'}</button>
        </div>
      </form>
    </div>
  )
}

function AdminsTab() {
  const [admins, setAdmins] = useState([])
  const [roles, setRoles] = useState([])
  const [form, setForm] = useState(null) // null | {} (create) | admin (edit)
  const [isLoading, setIsLoading] = useState(true)
  const me = useAdminStore(s => s.admin)

  const load = () => {
    Promise.all([api.get('/admin/admins'), api.get('/admin/roles', { params: { scope: 'admin' } })])
      .then(([a, r]) => { setAdmins(a.data.data.admins); setRoles(r.data.data.roles) })
      .catch(() => toast.error('Failed to load admins'))
      .finally(() => setIsLoading(false))
  }
  useEffect(load, [])

  const remove = async (a) => {
    if (!window.confirm(`Delete admin ${a.email}?`)) return
    try { await api.delete(`/admin/admins/${a.id}`); toast.success('Admin deleted'); load() }
    catch (e) { toast.error(errMsg(e, 'Failed to delete admin')) }
  }

  if (isLoading) return <Spinner />
  return (
    <div className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-gray-300">Admin accounts ({admins.length})</h3>
        <button onClick={() => setForm({})} className="btn btn-primary !py-2 text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Add admin</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-white/[0.06]">
              <th className="pb-2 pr-4">Admin</th><th className="pb-2 pr-4">Role</th><th className="pb-2 pr-4">Last login</th><th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map(a => (
              <tr key={a.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                <td className="py-2.5 pr-4"><p className="text-gray-200">{a.name}{a.id === me?.id && <span className="ml-2 text-[10px] text-gray-500">(you)</span>}</p><p className="text-xs text-gray-500">{a.email}</p></td>
                <td className="py-2.5 pr-4"><span className={`text-xs px-2 py-0.5 rounded-full ${a.role === 'superadmin' ? 'bg-amber-500/15 text-amber-300' : 'bg-primary-500/15 text-primary-200'}`}>{a.roleName}</span></td>
                <td className="py-2.5 pr-4 text-xs text-gray-500">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : 'Never'}</td>
                <td className="py-2.5">
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => setForm(a)} className="text-primary-300 hover:underline">Edit</button>
                    {a.id !== me?.id && <button onClick={() => remove(a)} className="text-red-300 hover:underline">Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <AccountForm
          isAdmin
          canMakeSuper={me?.role === 'superadmin'}
          title={form.id ? 'Edit admin' : 'Add admin'}
          roles={roles}
          initial={form.id ? form : null}
          onClose={() => setForm(null)}
          onSubmit={async (payload) => {
            if (form.id) await api.put(`/admin/admins/${form.id}`, payload)
            else await api.post('/admin/admins', payload)
            toast.success(form.id ? 'Admin updated' : 'Admin created')
            setForm(null)
            load()
          }}
        />
      )}
    </div>
  )
}
