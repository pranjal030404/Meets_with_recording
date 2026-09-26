import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search as SearchIcon, MessageSquare, Users, Calendar, Folder, CheckSquare, Loader2, Hash
} from 'lucide-react'
import AppShell from '../components/AppShell'
import api from '../lib/api'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'messages', label: 'Messages' },
  { key: 'people', label: 'People' },
  { key: 'teams', label: 'Teams' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'files', label: 'Files' },
  { key: 'tasks', label: 'Tasks' }
]

export default function Search() {
  return (
    <AppShell>
      <SearchPage />
    </AppShell>
  )
}

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const query = searchParams.get('q') || ''
  const type = searchParams.get('type') || 'all'
  const [input, setInput] = useState(query)
  const [results, setResults] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const runSearch = async (q, t) => {
    if (!q || q.trim().length < 2) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.get('/search', { params: { q: q.trim(), type: t } })
      setResults(res.data.data.results)
    } catch (err) {
      setError(err.response?.data?.message || 'Search failed')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (query) runSearch(query, type)
  }, [query, type])

  const submit = (e) => {
    e.preventDefault()
    if (input.trim().length >= 2) {
      setSearchParams({ q: input.trim(), type })
    }
  }

  const setTab = (t) => {
    setSearchParams({ q: query || input, type: t })
    if (query) runSearch(query || input, t)
  }

  const total = results
    ? Object.values(results).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
    : 0

  return (
    <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
      <h1 className="text-3xl font-bold font-display tracking-tight mb-2">Search</h1>
      <p className="text-gray-500 mb-8">Messages, people, teams, meetings, files and tasks — all in one place.</p>

      <form onSubmit={submit} className="relative mb-5">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search everything..."
          className="input !py-4 !pl-12 !rounded-2xl text-base"
          autoFocus
        />
      </form>

      <div className="flex flex-wrap gap-2 mb-8">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
              type === t.key
                ? 'bg-primary-500/20 text-primary-200 border-primary-500/40'
                : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-gray-600 animate-spin" /></div>}

      {error && <p className="text-center text-red-400 py-10">{error}</p>}

      {!isLoading && !results && !query && (
        <div className="text-center py-16 text-gray-600">
          <Hash className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          <p className="text-sm">Type at least 2 characters to search across your workspace.</p>
        </div>
      )}

      {!isLoading && results && total === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p>No results for "<span className="text-gray-300">{query}</span>"</p>
        </div>
      )}

      {!isLoading && results && total > 0 && (
        <div className="space-y-8">
          {results.messages?.length > 0 && <MessageResults items={results.messages} onOpen={(link) => navigate(link)} />}
          {results.people?.length > 0 && <PeopleResults items={results.people} />}
          {results.teams?.length > 0 && <Section title="Teams" icon={Users} items={results.teams} render={(t) => ({ title: t.name, sub: t.description, link: t.link })} onOpen={(link) => navigate(link)} />}
          {results.meetings?.length > 0 && <Section title="Meetings" icon={Calendar} items={results.meetings} render={(m) => ({ title: m.title, sub: `${m.status} · ${m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : m.host?.name || ''}` , link: '/history' })} onOpen={(link) => navigate(link)} />}
          {results.files?.length > 0 && <Section title="Files" icon={Folder} items={results.files} render={(f) => ({ title: f.originalName, sub: `${f.owner?.name || ''} · ${new Date(f.createdAt).toLocaleDateString()}`, link: '/files' })} onOpen={(link) => navigate(link)} />}
          {results.tasks?.length > 0 && <Section title="Tasks" icon={CheckSquare} items={results.tasks} render={(t) => ({ title: t.title, sub: `${t.status} · ${t.team?.name || 'Personal'}`, link: '/tasks' })} onOpen={(link) => navigate(link)} />}
        </div>
      )}
    </div>
  )
}

function Section({ title, icon: Icon, items, render, onOpen }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
        <Icon className="w-4 h-4" /> {title} <span className="text-gray-600">({items.length})</span>
      </h2>
      <div className="space-y-2">
        {items.map(item => {
          const { title: t, sub, link } = render(item)
          return (
            <button
              key={item.id}
              onClick={() => link && onOpen(link)}
              className="w-full text-left rounded-2xl bg-dark-200/50 border border-white/[0.06] px-4 py-3 hover:border-primary-500/30 transition-all"
            >
              <p className="text-sm font-medium text-gray-200">{t}</p>
              {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MessageResults({ items, onOpen }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
        <MessageSquare className="w-4 h-4" /> Messages <span className="text-gray-600">({items.length})</span>
      </h2>
      <div className="space-y-2">
        {items.map(m => (
          <button
            key={m.id}
            onClick={() => m.link && onOpen(m.link)}
            className="w-full text-left rounded-2xl bg-dark-200/50 border border-white/[0.06] px-4 py-3 hover:border-primary-500/30 transition-all"
          >
            <div className="flex items-center gap-2 mb-1">
              {m.sender?.avatar ? (
                <img src={m.sender.avatar} className="w-5 h-5 rounded-full" alt="" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-gradient-to-br from-primary-500 to-accent-600" />
              )}
              <span className="text-sm font-medium text-gray-200">{m.sender?.name || 'Unknown'}</span>
              <span className="text-[11px] text-gray-600">{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm text-gray-400 line-clamp-2">{m.content}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function PeopleResults({ items }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
        <Users className="w-4 h-4" /> People <span className="text-gray-600">({items.length})</span>
      </h2>
      <div className="grid sm:grid-cols-2 gap-2">
        {items.map(u => (
          <div key={u.id} className="flex items-center gap-3 rounded-2xl bg-dark-200/50 border border-white/[0.06] px-4 py-3">
            <div className="relative shrink-0">
              {u.avatar ? (
                <img src={u.avatar} className="w-10 h-10 rounded-full" alt={u.name} />
              ) : (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white ${u.isOnline ? 'bg-gradient-to-br from-primary-500 to-accent-600' : 'bg-dark-300'}`}>
                  {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
              {u.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-dark-200" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{u.name}</p>
              <p className="text-xs text-gray-500 truncate">{u.customStatus ? `${u.statusEmoji || ''} ${u.customStatus}` : u.email}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
