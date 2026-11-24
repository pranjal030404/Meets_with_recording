import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Clock } from 'lucide-react'

// [emoji, search keywords]. Curated on purpose: no extra dependency, loads instantly.
const DATA = {
  Smileys: [
    ['😀', 'grin happy'], ['😃', 'smile happy'], ['😄', 'laugh happy'], ['😁', 'beam grin'], ['😆', 'laughing'], ['😅', 'sweat smile'],
    ['😂', 'joy tears lol'], ['🤣', 'rofl lol'], ['🙂', 'slight smile'], ['😉', 'wink'], ['😊', 'blush'], ['😇', 'angel halo'],
    ['🥰', 'love hearts'], ['😍', 'heart eyes love'], ['🤩', 'star struck wow'], ['😘', 'kiss'], ['😋', 'yum tasty'], ['😎', 'cool sunglasses'],
    ['🤗', 'hug'], ['🤔', 'think hmm'], ['🤨', 'raised eyebrow'], ['😐', 'neutral'], ['😑', 'expressionless'], ['😶', 'silent'],
    ['🙄', 'eye roll'], ['😏', 'smirk'], ['😴', 'sleep tired'], ['😪', 'sleepy'], ['🤤', 'drool'], ['😌', 'relieved'],
    ['😔', 'sad pensive'], ['😢', 'cry sad'], ['😭', 'sob cry'], ['😤', 'angry huff'], ['😠', 'angry'], ['😡', 'rage mad'],
    ['🤯', 'mind blown'], ['😱', 'scream shock'], ['😨', 'fear'], ['😰', 'anxious'], ['😳', 'flushed embarrassed'], ['🥺', 'pleading'],
    ['🤒', 'sick ill'], ['🤕', 'hurt injured'], ['🤧', 'sneeze'], ['🥳', 'party celebrate'], ['🥱', 'yawn'], ['🤓', 'nerd'],
    ['🫡', 'salute'], ['🫠', 'melt'], ['🤝', 'handshake deal'], ['🙃', 'upside down'],
  ],
  Gestures: [
    ['👍', 'thumbs up yes like ok'], ['👎', 'thumbs down no dislike'], ['👏', 'clap applause'], ['🙌', 'raised hands praise'], ['👋', 'wave hello bye'],
    ['🤚', 'raised hand'], ['✋', 'stop hand'], ['🖐️', 'hand'], ['👌', 'ok perfect'], ['🤌', 'pinched'], ['✌️', 'peace victory'],
    ['🤞', 'fingers crossed luck'], ['🤟', 'love you'], ['🤘', 'rock'], ['👈', 'left'], ['👉', 'right'], ['👆', 'up'], ['👇', 'down'],
    ['☝️', 'point up'], ['💪', 'strong muscle'], ['🙏', 'pray thanks please'], ['✍️', 'write'], ['🫶', 'heart hands'], ['🫰', 'snap'],
  ],
  Hearts: [
    ['❤️', 'red heart love'], ['🧡', 'orange heart'], ['💛', 'yellow heart'], ['💚', 'green heart'], ['💙', 'blue heart'], ['💜', 'purple heart'],
    ['🖤', 'black heart'], ['🤍', 'white heart'], ['💔', 'broken heart'], ['❣️', 'heart exclamation'], ['💕', 'two hearts'], ['💞', 'revolving hearts'],
    ['💓', 'beating heart'], ['💗', 'growing heart'], ['💖', 'sparkling heart'], ['💘', 'cupid'], ['💝', 'gift heart'],
  ],
  Celebrate: [
    ['🎉', 'party tada celebrate'], ['🎊', 'confetti'], ['🎈', 'balloon'], ['🎁', 'gift present'], ['🏆', 'trophy win'], ['🥇', 'gold medal first'],
    ['🏅', 'medal'], ['🎯', 'target focus goal'], ['🚀', 'rocket launch ship'], ['⭐', 'star'], ['🌟', 'glowing star'], ['✨', 'sparkles'],
    ['🔥', 'fire hot lit'], ['💯', 'hundred perfect'], ['💥', 'boom'], ['🎂', 'cake birthday'], ['🍾', 'champagne'], ['🥂', 'cheers toast'],
  ],
  Work: [
    ['✅', 'check done yes'], ['❌', 'cross no'], ['⚠️', 'warning'], ['❓', 'question'], ['❗', 'exclamation important'], ['📌', 'pin'],
    ['📎', 'paperclip attach'], ['📅', 'calendar date'], ['⏰', 'alarm clock time'], ['⏳', 'hourglass wait'], ['💡', 'idea bulb'], ['📝', 'note memo'],
    ['📊', 'chart stats'], ['📈', 'growth up'], ['📉', 'down'], ['💼', 'briefcase work'], ['💻', 'laptop computer'], ['📱', 'phone mobile'],
    ['🎥', 'video camera'], ['🎤', 'mic microphone'], ['🎧', 'headphones'], ['🔔', 'bell notification'], ['🔒', 'lock secure'], ['🔑', 'key'],
    ['📞', 'call phone'], ['✉️', 'mail email'], ['🔗', 'link'], ['🛠️', 'tools build'], ['🐛', 'bug'], ['🧪', 'test'],
  ],
  'Food & drink': [
    ['☕', 'coffee tea break'], ['🍵', 'tea'], ['🍕', 'pizza'], ['🍔', 'burger'], ['🍟', 'fries'], ['🌮', 'taco'], ['🍜', 'noodles ramen'],
    ['🍣', 'sushi'], ['🍰', 'cake'], ['🍫', 'chocolate'], ['🍪', 'cookie'], ['🍎', 'apple'], ['🍌', 'banana'], ['🍇', 'grapes'],
    ['🍺', 'beer'], ['🍷', 'wine'], ['🥤', 'drink'], ['🧃', 'juice'],
  ],
  'Nature & travel': [
    ['🌞', 'sun'], ['🌙', 'moon night'], ['⛅', 'cloud'], ['🌧️', 'rain'], ['⚡', 'lightning fast'], ['❄️', 'snow cold'], ['🌈', 'rainbow'],
    ['🌿', 'leaf plant'], ['🌸', 'flower blossom'], ['🌴', 'palm tree vacation'], ['🐶', 'dog'], ['🐱', 'cat'], ['🦄', 'unicorn'], ['🐢', 'turtle slow'],
    ['✈️', 'plane travel flight'], ['🚗', 'car drive'], ['🚆', 'train'], ['🏠', 'home house wfh'], ['🏖️', 'beach holiday'], ['🌍', 'earth world'],
  ],
}

const RECENT_KEY = 'mc_recent_emojis'
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }
const pushRecent = (e) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter(x => x !== e)].slice(0, 16))) } catch { /* private mode */ }
}

/**
 * Emoji popover. Position it yourself (wrap in `relative`, pass `className` like "bottom-full right-0 mb-2").
 * Closes on Escape / outside click. `onPick(emoji)` fires on every pick; set `closeOnPick` for single-shot uses.
 */
export default function EmojiPicker({ onPick, onClose, className = '', closeOnPick = false }) {
  const ref = useRef(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('Smileys')
  const [recent, setRecent] = useState(readRecent)

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.() }
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    // next tick: the click that opened the picker must not instantly close it
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    document.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const pick = (e) => {
    pushRecent(e); setRecent(readRecent())
    onPick(e)
    if (closeOnPick) onClose?.()
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return Object.values(DATA).flat().filter(([e, k]) => k.includes(q) || e === q)
  }, [query])

  const list = results ? results.map(([e]) => e) : DATA[tab].map(([e]) => e)

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className={`absolute z-50 w-[19rem] glass-strong rounded-2xl border border-white/10 shadow-float overflow-hidden ${className}`}
    >
      <div className="p-2.5 pb-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji…"
            className="input !py-1.5 !pl-8 text-sm"
          />
        </div>
      </div>

      {!results && (
        <div className="flex gap-0.5 px-2 overflow-x-auto no-scrollbar border-b border-white/[0.06]">
          {Object.keys(DATA).map(c => (
            <button
              key={c}
              onClick={() => setTab(c)}
              className={`px-2 py-1.5 text-[11px] whitespace-nowrap font-medium border-b-2 transition-colors ${tab === c ? 'border-primary-400 text-primary-200' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="h-56 overflow-y-auto p-2">
        {!results && recent.length > 0 && (
          <>
            <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Recent</p>
            <div className="grid grid-cols-8 gap-0.5 mb-2">
              {recent.map(e => <EmojiBtn key={`r${e}`} e={e} onClick={pick} />)}
            </div>
          </>
        )}
        {list.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-10">No emoji found</p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {list.map(e => <EmojiBtn key={e} e={e} onClick={pick} />)}
          </div>
        )}
      </div>
    </div>
  )
}

const EmojiBtn = ({ e, onClick }) => (
  <button type="button" onClick={() => onClick(e)} className="w-8 h-8 rounded-lg text-xl leading-none hover:bg-white/10 hover:scale-110 transition-transform">
    {e}
  </button>
)
