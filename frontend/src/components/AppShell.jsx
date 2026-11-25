import { useEffect, useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Video, LayoutDashboard, MessageSquare, Users, Calendar, Folder, CheckSquare,
  Clock, CreditCard, Shield, LogOut, Menu, X, Search, ChevronDown, SmilePlus, Check, Pencil, Smile
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import branding from '../config/branding'
import BrandMark from './BrandMark'
import { useConversationStore, bindConversationSocket } from '../store/conversationStore'
import { usePresenceStore, bindPresenceSocket, getActiveStatus } from '../store/presenceStore'
import Avatar from './Avatar'
import EmojiPicker from './EmojiPicker'
import ProfileModal from './ProfileModal'
import NotificationBell from './NotificationBell'
import toast from 'react-hot-toast'

const NAV_ITEMS = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, match: ['/app'] },
  { to: '/chat', label: 'Chat', icon: MessageSquare, match: ['/chat'], badge: 'unread' },
  { to: '/teams', label: 'Teams', icon: Users, match: ['/teams'] },
  { to: '/calendar', label: 'Calendar', icon: Calendar, match: ['/calendar'] },
  { to: '/files', label: 'Files', icon: Folder, match: ['/files'] },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, match: ['/tasks'] },
  { to: '/history', label: 'Meetings', icon: Clock, match: ['/history'] },
  { to: '/billing', label: 'Billing', icon: CreditCard, match: ['/billing'] },
]

// tone drives the presence dot: green = reachable, red = please don't disturb, amber = away
const STATUS_PRESETS = [
  { emoji: '✅', text: 'Available', tone: 'green' },
  { emoji: '🎯', text: 'Focused', tone: 'red' },
  { emoji: '📅', text: 'In a meeting', tone: 'red' },
  { emoji: '☕', text: 'On a break', tone: 'amber' },
  { emoji: '🍽️', text: 'At lunch', tone: 'amber' },
  { emoji: '🏠', text: 'Working remotely', tone: 'green' },
  { emoji: '✈️', text: 'Traveling', tone: 'amber' },
  { emoji: '🌿', text: 'Out sick', tone: 'gray' },
]
const TONE_DOT = { green: 'bg-green-400', red: 'bg-red-500', amber: 'bg-amber-400', gray: 'bg-gray-500' }
const dotFor = (st) => TONE_DOT[STATUS_PRESETS.find(p => p.text === st?.customStatus)?.tone || 'green']

const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 0); return d }
const endOfWeek = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); d.setHours(23, 59, 59, 0); return d }
const CLEAR_AFTER = [
  { id: 'never', label: "Don't clear", at: () => null },
  { id: '30m', label: '30 minutes', at: () => new Date(Date.now() + 30 * 60e3) },
  { id: '1h', label: '1 hour', at: () => new Date(Date.now() + 60 * 60e3) },
  { id: '4h', label: '4 hours', at: () => new Date(Date.now() + 4 * 60 * 60e3) },
  { id: 'today', label: 'Today', at: endOfToday },
  { id: 'week', label: 'This week', at: endOfWeek },
]
const clearsLabel = (iso) => {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return null
  const m = Math.round(ms / 60e3)
  if (m < 60) return `Clears in ${Math.max(m, 1)} min`
  return `Clears ${new Date(iso).toLocaleString([], { weekday: m > 24 * 60 ? 'short' : undefined, hour: 'numeric', minute: '2-digit' })}`
}

export default function AppShell({ children, wide = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const conversations = useConversationStore(s => s.conversations)
  const fetchConversations = useConversationStore(s => s.fetchConversations)
  const statuses = usePresenceStore(s => s.statuses)
  const updateMyStatus = usePresenceStore(s => s.updateMyStatus)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [customText, setCustomText] = useState('')
  const [customEmoji, setCustomEmoji] = useState('💬')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [clearAfter, setClearAfter] = useState('never')
  const [profileOpen, setProfileOpen] = useState(false)
  const [, tick] = useState(0)
  const statusRef = useRef(null)

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
  const myStatus = getActiveStatus(statuses[user?.id] || { customStatus: user?.customStatus, statusEmoji: user?.statusEmoji, statusExpiresAt: user?.statusExpiresAt })

  // re-evaluate expiry while the app stays open
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  // Bind workspace sockets for the shell's lifetime + load chat unread counts
  useEffect(() => {
    if (!user?.id) return
    useConversationStore.setState({ _myId: user.id })
    const unbindConv = bindConversationSocket(useConversationStore)
    const unbindPresence = bindPresenceSocket(user.id)
    fetchConversations()
    return () => { unbindConv(); unbindPresence() }
  }, [user?.id])

  // Close status popover on outside click
  useEffect(() => {
    const handler = (e) => {
      if (statusRef.current && !statusRef.current.contains(e.target)) { setStatusOpen(false); setEmojiOpen(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isActive = (item) => {
    if (item.match.includes('/app')) return location.pathname === '/app'
    return item.match.some(p => location.pathname.startsWith(p))
  }

  const handleSetStatus = async (emoji, text) => {
    const at = CLEAR_AFTER.find(o => o.id === clearAfter)?.at()
    const result = await updateMyStatus({ customStatus: text, statusEmoji: emoji, statusExpiresAt: at ? at.toISOString() : null })
    if (result.success) {
      toast.success('Status updated')
      setStatusOpen(false)
      setCustomText('')
      setCustomEmoji('💬')
      setEmojiOpen(false)
    } else {
      toast.error(result.message)
    }
  }

  const handleClearStatus = async () => {
    await updateMyStatus({ customStatus: null, statusEmoji: null, statusExpiresAt: null })
    setStatusOpen(false)
  }

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out successfully')
    navigate('/')
  }

  const sidebar = (withBell) => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 py-4">
        <Link to="/app" className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
          <BrandMark size="sm" />
          <span className="font-display text-lg font-semibold">{branding.appName}</span>
        </Link>
        {/* the bell lives here so it never sits on top of page buttons */}
        {withBell && <NotificationBell placement="sidebar" />}
      </div>

      {/* Search shortcut */}
      <div className="px-4 pb-3">
        <button
          onClick={() => { navigate('/search'); setSidebarOpen(false) }}
          className="w-full flex items-center gap-2.5 rounded-lg bg-dark-300 border border-white/[0.08] px-3 py-2 text-sm text-gray-400 hover:border-white/20 hover:text-gray-200 transition-colors"
        >
          <Search className="w-4 h-4" />
          Search
          <span className="ml-auto text-[10px] font-mono text-gray-600">/</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {NAV_ITEMS.map(item => {
          const active = isActive(item)
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 group relative ${
                active
                  ? 'bg-white/[0.08] text-white border border-white/10'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <item.icon className={`w-[18px] h-[18px] ${active ? 'text-gray-100' : 'text-gray-500 group-hover:text-gray-300'}`} />
              {item.label}
              {item.badge === 'unread' && totalUnread > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User + status */}
      <div className="p-3 border-t border-white/[0.06] relative" ref={statusRef}>
        {statusOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 lg:bottom-3 lg:left-full lg:right-auto lg:mb-0 lg:ml-3 lg:w-80 glass-strong rounded-2xl border border-white/10 z-50">
            {/* who am I + edit profile */}
            <div className="flex items-center gap-3 p-3 border-b border-white/[0.06]">
              <Avatar user={user} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-100 truncate">{user?.name}</p>
                <p className="text-[11px] text-gray-500 truncate">{user?.title || user?.email}</p>
              </div>
              <button
                onClick={() => { setProfileOpen(true); setStatusOpen(false) }}
                className="p-2 rounded-lg text-gray-400 hover:text-primary-300 hover:bg-primary-500/10 transition-colors"
                title="Edit profile"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Set status</p>
              <div className="grid grid-cols-2 gap-1.5">
                {STATUS_PRESETS.map(preset => {
                  const on = myStatus?.customStatus === preset.text
                  return (
                    <button
                      key={preset.text}
                      onClick={() => handleSetStatus(preset.emoji, preset.text)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] text-left border transition-colors ${
                        on ? 'bg-primary-500/15 border-primary-500/40 text-primary-100' : 'border-white/[0.06] bg-white/[0.02] text-gray-300 hover:bg-white/[0.07]'
                      }`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[preset.tone]}`} />
                      <span className="truncate">{preset.text}</span>
                    </button>
                  )
                })}
              </div>

              {/* custom status with emoji picker */}
              <div className="relative flex gap-1.5 mt-3">
                {emojiOpen && (
                  <EmojiPicker
                    className="bottom-full left-0 mb-2"
                    onClose={() => setEmojiOpen(false)}
                    onPick={(e) => setCustomEmoji(e)}
                    closeOnPick
                  />
                )}
                <button
                  type="button"
                  onClick={() => setEmojiOpen(o => !o)}
                  className={`w-10 shrink-0 rounded-xl border text-xl flex items-center justify-center transition-colors ${emojiOpen ? 'border-primary-500/50 bg-primary-500/10' : 'border-white/10 bg-dark-300/70 hover:bg-white/[0.08]'}`}
                  title="Choose emoji"
                  aria-label="Choose status emoji"
                >
                  {customEmoji || <Smile className="w-5 h-5 text-gray-400" />}
                </button>
                <input
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && customText.trim() && handleSetStatus(customEmoji, customText.trim())}
                  placeholder="What's your status?"
                  className="input !py-2 text-sm flex-1 min-w-0"
                  maxLength={60}
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <label className="text-[11px] text-gray-500 shrink-0">Clear after</label>
                <select value={clearAfter} onChange={(e) => setClearAfter(e.target.value)} className="input !py-1.5 !px-2 text-xs flex-1">
                  {CLEAR_AFTER.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <button
                  onClick={() => customText.trim() && handleSetStatus(customEmoji, customText.trim())}
                  disabled={!customText.trim()}
                  className="btn btn-primary !px-3 !py-1.5 text-xs disabled:opacity-40"
                >
                  Save
                </button>
              </div>

              {myStatus?.customStatus && (
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/[0.06]">
                  <span className="text-[11px] text-gray-500 truncate">{clearsLabel(myStatus.statusExpiresAt) || 'Stays until you clear it'}</span>
                  <button onClick={handleClearStatus} className="text-xs text-red-400 hover:text-red-300 font-medium shrink-0 ml-2">Clear status</button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusOpen(!statusOpen)}
            aria-expanded={statusOpen}
            className={`relative flex-1 min-w-0 flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors text-left ${statusOpen ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
          >
            <div className="relative shrink-0">
              <Avatar user={user} size="md" ring />
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-200 ${dotFor(myStatus)}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-200 truncate">{user?.name}</p>
              {myStatus?.customStatus ? (
                <p className="text-[11px] text-gray-400 truncate">{myStatus.statusEmoji} {myStatus.customStatus}</p>
              ) : (
                <p className="text-[11px] text-gray-500 flex items-center gap-1"><ChevronDown className="w-3 h-3" /> Set status</p>
              )}
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Logout"
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-dark-100">

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col z-40 glass-strong border-r border-white/[0.06]">
        {sidebar(true)}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 flex-col glass-strong border-r border-white/[0.06] flex">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            {sidebar(false)}
          </aside>
        </div>
      )}

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 glass-strong flex items-center justify-between px-4 py-3">
        <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-gray-300 hover:text-white">
          <Menu className="w-6 h-6" />
        </button>
        <Link to="/app" className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span className="font-semibold font-display">{branding.appName}</span>
        </Link>
        <NotificationBell />
      </div>

      {/* Content */}
      <main className={`lg:ml-64 relative ${wide ? '' : 'max-w-6xl'}`}>
        {children}
      </main>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  )
}
