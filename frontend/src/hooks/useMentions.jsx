import { useState } from 'react'
import Avatar from '../components/Avatar'

// "@" at the start or after a space, followed by what has been typed of the name so far
const TRIGGER = /(^|\s)@([^\s@]*)$/

/** Ids of the people whose "@Full Name" appears in the text. */
export const mentionedIds = (text, people) =>
  people.filter(p => text.toLowerCase().includes(`@${p.name.toLowerCase()}`)).map(p => p.id)

/**
 * "@name" suggestions for a text field. Type @, pick with the arrows, press Tab or Enter (or click).
 * Call onKeyDown first and skip your own handling when it returns true.
 */
export default function useMentions({ value, setValue, inputRef, people }) {
  const [caret, setCaret] = useState(0)
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(null) // position of an "@" closed with Escape

  const match = value.slice(0, caret).match(TRIGGER)
  const query = match?.[2].toLowerCase()
  const at = match ? caret - match[2].length - 1 : null
  const matches = match && at !== dismissed
    ? people.filter(p => p.name.toLowerCase().startsWith(query) || p.name.toLowerCase().split(/\s+/).some(w => w.startsWith(query))).slice(0, 6)
    : []
  const selected = Math.min(index, matches.length - 1)

  const track = (e) => setCaret(e.target.selectionStart ?? e.target.value.length)

  const choose = (person) => {
    const inserted = `@${person.name} `
    setValue(value.slice(0, at) + inserted + value.slice(caret))
    const next = at + inserted.length
    setCaret(next)
    setIndex(0)
    setDismissed(at)
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(next, next) })
  }

  const onChange = (e) => {
    track(e)
    setIndex(0)
    if (!e.target.value.includes('@')) setDismissed(null)
    else if (e.nativeEvent.data === '@') setDismissed(null)
  }

  const onKeyDown = (e) => {
    if (!matches.length) return false
    if (e.key === 'Tab' || e.key === 'Enter') choose(matches[selected])
    else if (e.key === 'ArrowDown') setIndex((selected + 1) % matches.length)
    else if (e.key === 'ArrowUp') setIndex((selected - 1 + matches.length) % matches.length)
    else if (e.key === 'Escape') setDismissed(at)
    else return false
    e.preventDefault()
    return true
  }

  const menu = matches.length > 0 && (
    <ul role="listbox" className="absolute bottom-full left-0 mb-2 w-72 max-w-full rounded-xl bg-dark-300 border border-white/10 shadow-xl py-1.5 z-30">
      {matches.map((p, i) => (
        <li key={p.id} role="option" aria-selected={i === selected}>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); choose(p) }} onMouseEnter={() => setIndex(i)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm ${i === selected ? 'bg-primary-500/20 text-white' : 'text-gray-300'}`}>
            <Avatar user={p} size="sm" />
            <span className="truncate flex-1">{p.name}</span>
            {i === selected && <kbd className="text-[10px] font-mono text-gray-500">Tab</kbd>}
          </button>
        </li>
      ))}
    </ul>
  )

  return { menu, onKeyDown, onChange, onSelect: track }
}

/** Message text with the tagged names highlighted. */
export function MentionText({ text, people }) {
  const names = people.map(p => p.name).sort((a, b) => b.length - a.length)
  if (!text || !names.length) return text || null
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  // split() with a capture group puts the matches at the odd positions
  return text.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'gi')).map((part, i) =>
    i % 2 ? <span key={i} className="rounded px-1 bg-primary-500/20 text-primary-200 font-medium">{part}</span> : part)
}
