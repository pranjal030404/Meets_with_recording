import { useState } from 'react'
import { X } from 'lucide-react'
import Avatar from './Avatar'
import usePeopleSearch from '../hooks/usePeopleSearch'

export const isEmail = (text) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)

/**
 * Pick people by name, or type an email address for someone without an account.
 * value: [{ userId, name } | { email }]
 */
export default function PeoplePicker({ value, onChange, text, onText }) {
  const [index, setIndex] = useState(0)
  const { people, searching } = usePeopleSearch(text.includes('@') ? '' : text)
  const matches = people.filter(p => !value.some(v => v.userId === p.id))
  const selected = Math.min(index, matches.length - 1)

  const add = (entry) => {
    onChange([...value, entry])
    onText('')
    setIndex(0)
  }
  const pick = (p) => add({ userId: p.id, name: p.name })

  const onKeyDown = (e) => {
    const typed = text.trim().replace(/[,;]$/, '')
    if (matches.length && (e.key === 'Enter' || e.key === 'Tab')) pick(matches[selected])
    else if (matches.length && e.key === 'ArrowDown') setIndex((selected + 1) % matches.length)
    else if (matches.length && e.key === 'ArrowUp') setIndex((selected - 1 + matches.length) % matches.length)
    else if (['Enter', ',', ';'].includes(e.key) && isEmail(typed)) add({ email: typed })
    else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
    else if (e.key === 'Enter') { /* never submit the whole form from this field */ }
    else return
    e.preventDefault()
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((v) => (
            <span key={v.userId || v.email} className="inline-flex items-center gap-1.5 rounded-full bg-primary-500/15 border border-primary-500/30 pl-3 pr-1.5 py-1 text-sm text-primary-100">
              {v.name || v.email}
              <button type="button" onClick={() => onChange(value.filter(x => x !== v))} className="p-0.5 rounded-full hover:bg-white/10" aria-label={`Remove ${v.name || v.email}`}><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      <input type="text" value={text} onChange={(e) => { onText(e.target.value); setIndex(0) }} onKeyDown={onKeyDown}
        className="input" placeholder="Search by name, or type an email address" autoComplete="off" spellCheck={false} />
      {matches.length > 0 && (
        <ul role="listbox" className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-dark-300 py-1">
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === selected}>
              <button type="button" onClick={() => pick(p)} onMouseEnter={() => setIndex(i)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left ${i === selected ? 'bg-primary-500/20' : ''}`}>
                <Avatar user={p} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-200 truncate">{p.name}</span>
                  <span className="block text-xs text-gray-500 truncate">{p.email}</span>
                </span>
                {p.isContact && <span className="text-[10px] text-primary-300 shrink-0">Contact</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!matches.length && !searching && text.trim().length >= 2 && !text.includes('@') && people.length === 0 && (
        <p className="text-xs text-gray-500 mt-1.5">No one found with that name.</p>
      )}
    </div>
  )
}
