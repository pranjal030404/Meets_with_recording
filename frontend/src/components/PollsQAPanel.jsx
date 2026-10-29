import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Trash2, BarChart3, HelpCircle, ThumbsUp, Check, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { getSocket } from '../lib/socket'

/**
 * In-meeting Polls + Q&A (Google Meet "Activities" / Teams "Polls" & "Q&A").
 * The REST routes already existed; this is the missing UI. Updates are pushed by
 * the server via `poll:changed` / `qa:changed`, and each client refetches its own view.
 */
export default function PollsQAPanel({ meetingId, canManage, initialTab = 'polls', onClose }) {
  const [tab, setTab] = useState(initialTab)

  return (
    <div className="w-80 bg-dark-200 border-l border-dark-400 flex flex-col">
      <div className="p-4 border-b border-dark-400 flex items-center justify-between">
        <h2 className="font-semibold">Activities</h2>
        <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded transition-colors" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex border-b border-dark-400">
        {[['polls', 'Polls', BarChart3], ['qa', 'Q&A', HelpCircle]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
              tab === id ? 'border-primary-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'polls'
        ? <PollsTab meetingId={meetingId} canManage={canManage} />
        : <QATab meetingId={meetingId} canManage={canManage} />}
    </div>
  )
}

// Fetch a list and keep it fresh when the server announces a change.
function useLiveList(path, event, key) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(path)
      setItems(data.data[key])
    } catch {
      toast.error('Failed to load')
    } finally {
      setLoading(false)
    }
  }, [path, key])

  useEffect(() => {
    load()
    const socket = getSocket()
    socket?.on(event, load)
    return () => socket?.off(event, load)
  }, [load, event])

  return { items, loading, reload: load }
}

function PollsTab({ meetingId, canManage }) {
  const { items: polls, loading, reload } = useLiveList(`/polls/meeting/${meetingId}`, 'poll:changed', 'polls')
  const [creating, setCreating] = useState(false)

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {canManage && (creating
        ? <PollForm meetingId={meetingId} onDone={() => { setCreating(false); reload() }} onCancel={() => setCreating(false)} />
        : <button onClick={() => setCreating(true)} className="btn btn-primary w-full flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> New poll
          </button>)}
      {!loading && polls.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">
          {canManage ? 'No polls yet. Create one to gather quick feedback.' : 'No polls yet.'}
        </p>
      )}
      {polls.map(poll => <PollCard key={poll.id} poll={poll} canManage={canManage} onChange={reload} />)}
    </div>
  )
}

function PollForm({ meetingId, onDone, onCancel }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const clean = options.map(o => o.trim()).filter(Boolean)
    if (!question.trim() || clean.length < 2) {
      toast.error('Add a question and at least two options')
      return
    }
    setSaving(true)
    try {
      await api.post('/polls', { meetingId, question: question.trim(), options: clean, allowMultiple, isAnonymous })
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create poll')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 bg-dark-300 rounded-xl p-3">
      <input className="input w-full" placeholder="Ask a question" value={question} maxLength={200}
        onChange={e => setQuestion(e.target.value)} autoFocus />
      {options.map((opt, i) => (
        <div key={i} className="flex gap-2">
          <input className="input flex-1" placeholder={`Option ${i + 1}`} value={opt} maxLength={100}
            onChange={e => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))} />
          {options.length > 2 && (
            <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))}
              className="p-2 text-gray-400 hover:text-red-400" aria-label="Remove option">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {options.length < 8 && (
        <button type="button" onClick={() => setOptions([...options, ''])}
          className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add option
        </button>
      )}
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={allowMultiple} onChange={e => setAllowMultiple(e.target.checked)} /> Allow multiple answers
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} /> Anonymous
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn btn-primary flex-1">Launch</button>
      </div>
    </form>
  )
}

function PollCard({ poll, canManage, onChange }) {
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const active = poll.status === 'active'

  const toggle = (id) => {
    setSelected(sel => poll.allowMultiple
      ? (sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id])
      : [id])
  }

  const vote = async () => {
    setBusy(true)
    try {
      await api.post(`/polls/${poll.id}/vote`, { optionIds: selected })
      onChange()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Vote failed')
    } finally {
      setBusy(false)
    }
  }

  const end = async () => {
    try {
      await api.put(`/polls/${poll.id}/end`)
      onChange()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to end poll')
    }
  }

  return (
    <div className="bg-dark-300 rounded-xl p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm">{poll.question}</p>
        <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full shrink-0 ${
          active ? 'bg-green-500/15 text-green-400' : 'bg-gray-500/15 text-gray-400'
        }`}>{active ? 'Live' : 'Ended'}</span>
      </div>

      {poll.options.map(opt => (
        <div key={opt.id}>
          {active && !poll.hasVoted ? (
            <label className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-dark-400">
              <input type={poll.allowMultiple ? 'checkbox' : 'radio'} name={poll.id}
                checked={selected.includes(opt.id)} onChange={() => toggle(opt.id)} />
              {opt.text}
            </label>
          ) : (
            <div className="text-sm">
              <div className="flex justify-between mb-1">
                <span className="flex items-center gap-1.5">
                  {opt.mine && <Check className="w-3.5 h-3.5 text-primary-400" />}{opt.text}
                </span>
                <span className="text-gray-400 tabular-nums">{opt.votes} · {opt.percentage}%</span>
              </div>
              <div className="h-1.5 bg-dark-500 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 transition-all duration-500" style={{ width: `${opt.percentage}%` }} />
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}{poll.isAnonymous ? ' · anonymous' : ''}</span>
        <div className="flex gap-2">
          {active && !poll.hasVoted && (
            <button onClick={vote} disabled={busy || selected.length === 0} className="btn btn-primary py-1 px-3 text-xs">Submit</button>
          )}
          {active && canManage && (
            <button onClick={end} className="btn btn-secondary py-1 px-3 text-xs">End poll</button>
          )}
        </div>
      </div>
    </div>
  )
}

function QATab({ meetingId, canManage }) {
  const { items: questions, loading, reload } = useLiveList(`/qa/meeting/${meetingId}`, 'qa:changed', 'questions')
  const [text, setText] = useState('')
  const [answering, setAnswering] = useState(null)
  const [answer, setAnswer] = useState('')

  const ask = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    try {
      await api.post('/qa', { meetingId, question: text.trim() })
      setText('')
      reload()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit')
    }
  }

  const act = async (fn, errMsg) => {
    try {
      await fn()
      reload()
    } catch (err) {
      toast.error(err.response?.data?.message || errMsg)
    }
  }

  const submitAnswer = async (q) => {
    if (!answer.trim()) return
    await act(() => api.put(`/qa/${q.id}/answer`, { answer: answer.trim() }), 'Failed to answer')
    setAnswering(null)
    setAnswer('')
  }

  // Unanswered first, then most upvoted.
  const sorted = [...questions].sort((a, b) =>
    Number(a.isAnswered) - Number(b.isAnswered) || b.upvoteCount - a.upvoteCount)

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!loading && sorted.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">No questions yet. Be the first to ask.</p>
        )}
        {sorted.map(q => (
          <div key={q.id} className="bg-dark-300 rounded-xl p-3 space-y-2">
            <p className="text-xs text-gray-500">{q.askedByName}</p>
            <p className="text-sm">{q.question}</p>
            {q.isAnswered && (
              <div className="text-sm bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-green-200">
                <Check className="w-3.5 h-3.5 inline mr-1" />{q.answer}
              </div>
            )}
            {answering === q.id && (
              <div className="flex gap-2">
                <input className="input flex-1" value={answer} onChange={e => setAnswer(e.target.value)}
                  placeholder="Type an answer" autoFocus onKeyDown={e => e.key === 'Enter' && submitAnswer(q)} />
                <button onClick={() => submitAnswer(q)} className="btn btn-primary px-3" aria-label="Send answer"><Send className="w-4 h-4" /></button>
              </div>
            )}
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => act(() => api.put(`/qa/${q.id}/upvote`), 'Failed to upvote')}
                className={`flex items-center gap-1 ${q.hasUpvoted ? 'text-primary-400' : 'text-gray-400 hover:text-white'}`}>
                <ThumbsUp className="w-3.5 h-3.5" /> {q.upvoteCount}
              </button>
              {canManage && !q.isAnswered && answering !== q.id && (
                <button onClick={() => { setAnswering(q.id); setAnswer('') }} className="text-gray-400 hover:text-white">Answer</button>
              )}
              {(canManage || q.askedByMe) && (
                <button onClick={() => act(() => api.delete(`/qa/${q.id}`), 'Failed to dismiss')}
                  className="text-gray-400 hover:text-red-400 ml-auto">Dismiss</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={ask} className="p-3 border-t border-dark-400 flex gap-2">
        <input className="input flex-1" placeholder="Ask a question" value={text} maxLength={300}
          onChange={e => setText(e.target.value)} />
        <button type="submit" className="btn btn-primary px-3" aria-label="Submit question"><Send className="w-4 h-4" /></button>
      </form>
    </>
  )
}
