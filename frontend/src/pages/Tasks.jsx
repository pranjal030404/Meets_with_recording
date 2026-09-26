import { useEffect, useState } from 'react'
import {
  Plus, CircleDot, Clock, CheckCircle2, AlertTriangle, X, Calendar as CalendarIcon,
  Flag, User as UserIcon, Trash2, ChevronDown, Loader2, ListTodo
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useTaskStore } from '../store/taskStore'
import AppShell from '../components/AppShell'
import toast from 'react-hot-toast'

const COLUMNS = [
  { key: 'todo', label: 'To do', icon: CircleDot, color: 'text-gray-400' },
  { key: 'in_progress', label: 'In progress', icon: Clock, color: 'text-blue-400' },
  { key: 'done', label: 'Done', icon: CheckCircle2, color: 'text-emerald-400' }
]

const PRIORITY_STYLES = {
  low: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  medium: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  high: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  urgent: 'bg-red-500/15 text-red-300 border-red-500/30'
}

const isOverdue = (task) => task.dueDate && task.status !== 'done' && new Date(task.dueDate) < new Date()

export default function Tasks() {
  return (
    <AppShell>
      <TasksPage />
    </AppShell>
  )
}

function TasksPage() {
  const { user } = useAuthStore()
  const { tasks, stats, teams, isLoading, fetchTasks, fetchStats, fetchTeams, updateTask, deleteTask } = useTaskStore()
  const [scope, setScope] = useState('mine')
  const [teamId, setTeamId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [detailTask, setDetailTask] = useState(null)

  useEffect(() => {
    fetchStats()
    fetchTeams()
  }, [])

  useEffect(() => {
    fetchTasks({ scope, teamId: teamId || undefined })
  }, [scope, teamId])

  const moveTask = async (task, status) => {
    if (task.status === status) return
    const res = await updateTask(task.id, { status })
    if (!res.success) toast.error(res.message)
    else fetchStats()
  }

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">Tasks</h1>
          <p className="text-gray-500 mt-1">Personal and team work, in one board.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> New Task
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="To do" value={stats.todo} icon={ListTodo} tone="text-gray-300" />
        <StatCard label="In progress" value={stats.inProgress} icon={Clock} tone="text-blue-300" />
        <StatCard label="Completed" value={stats.done} icon={CheckCircle2} tone="text-emerald-300" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} tone="text-red-300" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex rounded-xl bg-dark-300/50 border border-white/[0.06] p-1">
          <button
            onClick={() => { setScope('mine'); setTeamId('') }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${scope === 'mine' ? 'bg-primary-500/20 text-primary-200' : 'text-gray-400 hover:text-gray-200'}`}
          >
            My tasks
          </button>
          <button
            onClick={() => setScope('team')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${scope === 'team' ? 'bg-primary-500/20 text-primary-200' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Team tasks
          </button>
        </div>
        {scope === 'team' && (
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="input !w-auto !py-2 text-sm">
            <option value="">Select a team</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* Board */}
      {scope === 'team' && !teamId ? (
        <div className="text-center py-20 text-gray-500">
          <ListTodo className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          Pick a team to see its shared tasks.
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-gray-600 animate-spin" /></div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-5">
          {COLUMNS.map(col => {
            const items = tasks.filter(t => t.status === col.key)
            return (
              <div key={col.key} className="rounded-2xl bg-dark-200/50 border border-white/[0.06] p-4 min-h-[240px]">
                <div className="flex items-center gap-2 mb-4">
                  <col.icon className={`w-4 h-4 ${col.color}`} />
                  <h3 className="font-semibold text-sm text-gray-200">{col.label}</h3>
                  <span className="ml-auto text-xs text-gray-600">{items.length}</span>
                </div>
                <div className="space-y-2.5">
                  {items.length === 0 && <p className="text-xs text-gray-600 text-center py-8">Nothing here</p>}
                  {items.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => setDetailTask(task)}
                      onMove={(s) => moveTask(task, s)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && <CreateTaskModal teams={teams} onClose={() => setShowCreate(false)} />}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          teams={teams}
          onClose={() => setDetailTask(null)}
          onDelete={async () => {
            const res = await deleteTask(detailTask.id)
            if (res.success) { toast.success('Task deleted'); setDetailTask(null) }
            else toast.error(res.message)
          }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl bg-dark-200/60 border border-white/[0.06] p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center ${tone}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold font-display">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}

function TaskCard({ task, onClick, onMove }) {
  return (
    <div
      onClick={onClick}
      className={`group rounded-xl bg-dark-300/60 border p-3.5 cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary-500/30 ${
        isOverdue(task) ? 'border-red-500/30' : 'border-white/[0.06]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-medium leading-snug ${task.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
          {task.title}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${PRIORITY_STYLES[task.priority]}`}>
          {task.priority}
        </span>
        {task.team && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-gray-400">{task.team.name}</span>
        )}
        {task.dueDate && (
          <span className={`text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full ${isOverdue(task) ? 'bg-red-500/15 text-red-300' : 'bg-white/[0.05] text-gray-400'}`}>
            <CalendarIcon className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
        {task.assignee?.avatar ? (
          <img src={task.assignee.avatar} alt={task.assignee.name} className="w-5 h-5 rounded-full ml-auto ring-1 ring-white/10" title={task.assignee.name} />
        ) : task.assignee ? (
          <span className="ml-auto text-[10px] text-gray-500 flex items-center gap-1"><UserIcon className="w-3 h-3" />{task.assignee.name?.split(' ')[0]}</span>
        ) : null}
      </div>
      {/* Quick status move */}
      <div className="flex gap-1 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {COLUMNS.filter(c => c.key !== task.status).map(c => (
          <button
            key={c.key}
            onClick={(e) => { e.stopPropagation(); onMove(c.key) }}
            className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.05] text-gray-400 hover:bg-primary-500/20 hover:text-primary-200 transition-colors"
          >
            → {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CreateTaskModal({ teams, onClose }) {
  const { createTask } = useTaskStore()
  const [form, setForm] = useState({ title: '', description: '', teamId: '', assigneeId: '', dueDate: '', priority: 'medium' })
  const [members, setMembers] = useState([])
  const [saving, setSaving] = useState(false)

  const loadMembers = async (id) => {
    setForm(f => ({ ...f, teamId: id, assigneeId: '' }))
    if (!id) { setMembers([]); return }
    try {
      const { default: api } = await import('../lib/api')
      const res = await api.get(`/teams/${id}`)
      const list = (res.data.data.team?.members || []).map(m => ({
        id: m.user?.id || m.userId,
        name: m.user?.name || m.user
      })).filter(m => m.id)
      setMembers(list)
    } catch { setMembers([]) }
  }

  const submit = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const res = await createTask({
      title: form.title.trim(),
      description: form.description || undefined,
      teamId: form.teamId || undefined,
      assigneeId: form.assigneeId || undefined,
      dueDate: form.dueDate || undefined,
      priority: form.priority
    })
    setSaving(false)
    if (res.success) { toast.success('Task created'); onClose() }
    else toast.error(res.message)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-strong rounded-3xl border border-white/10 w-full max-w-lg p-6 shadow-float max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold font-display">New task</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/[0.06]"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title" className="input" autoFocus />
          <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" rows={3} className="input resize-none" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Team</label>
              <select value={form.teamId} onChange={(e) => loadMembers(e.target.value)} className="input">
                <option value="">Personal</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Assignee</label>
              <select value={form.assigneeId} onChange={(e) => setForm(f => ({ ...f, assigneeId: e.target.value }))} className="input" disabled={!form.teamId}>
                <option value="">Me</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Due date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Priority</label>
              <select value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))} className="input">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <button onClick={submit} disabled={!form.title.trim() || saving} className="btn btn-primary w-full disabled:opacity-40">
            {saving ? 'Creating...' : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskDetailModal({ task, teams, onClose, onDelete }) {
  const { updateTask } = useTaskStore()
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || '',
    priority: task.priority,
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
    status: task.status
  })
  const [subtasks, setSubtasks] = useState([])
  const [newSubtask, setNewSubtask] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    useTaskStore.getState().fetchSubtasks(task.id).then(res => {
      if (res.success) setSubtasks(res.subtasks)
    })
  }, [task.id])

  const save = async () => {
    setSaving(true)
    const res = await updateTask(task.id, {
      title: form.title,
      description: form.description,
      priority: form.priority,
      dueDate: form.dueDate || null,
      status: form.status
    })
    setSaving(false)
    if (res.success) { toast.success('Task updated'); onClose() }
    else toast.error(res.message)
  }

  const addSubtask = async () => {
    if (!newSubtask.trim()) return
    const res = await useTaskStore.getState().createSubtask(task.id, newSubtask.trim())
    if (res.success) { setSubtasks(s => [...s, res.subtask]); setNewSubtask('') }
    else toast.error(res.message)
  }

  const toggleSubtask = async (st) => {
    const { default: api } = await import('../lib/api')
    try {
      await api.put(`/tasks/${st.id}`, { status: st.status === 'done' ? 'todo' : 'done' })
      setSubtasks(list => list.map(x => x.id === st.id ? { ...x, status: x.status === 'done' ? 'todo' : 'done' } : x))
    } catch { toast.error('Failed to update subtask') }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-strong rounded-3xl border border-white/10 w-full max-w-lg p-6 shadow-float max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold font-display">Task details</h3>
          <div className="flex items-center gap-1">
            <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-500 hover:bg-red-500/10 hover:text-red-400" title="Delete task">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/[0.06]"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="space-y-3">
          <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} className="input font-semibold" />
          <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" rows={3} className="input resize-none" />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Status</label>
              <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))} className="input">
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Priority</label>
              <select value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))} className="input">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Due date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} className="input" />
            </div>
          </div>

          {/* Subtasks */}
          <div className="rounded-2xl bg-dark-300/40 border border-white/[0.06] p-3.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Subtasks {subtasks.length > 0 && `(${subtasks.filter(s => s.status === 'done').length}/${subtasks.length})`}
            </p>
            <div className="space-y-1.5">
              {subtasks.map(st => (
                <button key={st.id} onClick={() => toggleSubtask(st)} className="w-full flex items-center gap-2.5 text-left group">
                  <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${st.status === 'done' ? 'bg-emerald-500/30 border-emerald-400/50' : 'border-gray-600'}`}>
                    {st.status === 'done' && <CheckCircle2 className="w-3 h-3 text-emerald-300" />}
                  </span>
                  <span className={`text-sm ${st.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-300'}`}>{st.title}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2.5">
              <input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
                placeholder="Add subtask..."
                className="input !py-1.5 text-sm flex-1"
              />
              <button onClick={addSubtask} className="btn btn-ghost !px-2.5"><Plus className="w-4 h-4" /></button>
            </div>
          </div>

          <button onClick={save} disabled={saving} className="btn btn-primary w-full disabled:opacity-40">
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
