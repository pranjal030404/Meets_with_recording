import { useEffect, useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Video, LayoutDashboard, MessageSquare, Users, Calendar, Folder, CheckSquare,
  Clock, CreditCard, Shield, LogOut, Menu, X, Search, ChevronDown, SmilePlus, Check
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useConversationStore, bindConversationSocket } from '../store/conversationStore'
import { usePresenceStore, bindPresenceSocket } from '../store/presenceStore'
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

const STATUS_PRESETS = [
  { emoji: '✅', text: 'Available' },
  { emoji: '🎯', text: 'Focused' },
  { emoji: '📅', text: 'In a meeting' },
  { emoji: '☕', text: 'On a break' },
  { emoji: '🌿', text: 'Out sick' },
  { emoji: '✈️', text: 'Traveling' },
]

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
  const statusRef = useRef(null)

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
  const myStatus = statuses[user?.id] || { customStatus: user?.customStatus, statusEmoji: user?.statusEmoji }

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
      if (statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isActive = (item) => {
    if (item.match.includes('/app')) return location.pathname === '/app'
    return item.match.some(p => location.pathname.startsWith(p))
  }

  const handleSetStatus = async (emoji, text) => {
    const result = await updateMyStatus({ customStatus: text, statusEmoji: emoji })
    if (result.success) {
      toast.success('Status updated')
      setStatusOpen(false)
      setCustomText('')
    } else {
      toast.error(result.message)
    }
  }

  const handleClearStatus = async () => {
    await updateMyStatus({ customStatus: null, statusEmoji: null })
    setStatusOpen(false)
  }

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out successfully')
    navigate('/')
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <Link to="/app" className="flex items-center gap-3 px-5 py-5 group" onClick={() => setSidebarOpen(false)}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 flex items-center justify-center shadow-lg shadow-primary-500/30 transition-transform duration-300 group-hover:scale-105">
          <Video className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold font-display tracking-tight">MeetClone</span>
      </Link>

      {/* Search shortcut */}
      <div className="px-4 pb-3">
        <button
          onClick={() => { navigate('/search'); setSidebarOpen(false) }}
          className="w-full flex items-center gap-2.5 rounded-xl bg-dark-300/60 border border-white/[0.06] px-3.5 py-2.5 text-sm text-gray-400 hover:border-primary-500/40 hover:text-gray-200 transition-all"
        >
          <Search className="w-4 h-4" />
          Search everything
          <span className="ml-auto text-[10px] font-mono text-gray-600">/</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-1">
        {NAV_ITEMS.map(item => {
          const active = isActive(item)
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative ${
                active
                  ? 'bg-primary-500/15 text-primary-200 border border-primary-500/30'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <item.icon className={`w-[18px] h-[18px] ${active ? 'text-primary-300' : 'text-gray-500 group-hover:text-gray-300'}`} />
              {item.label}
              {item.badge === 'unread' && totalUnread > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </Link>
          )
        })}

        {['admin', 'superadmin'].includes(user?.role) && (
          <Link
            to="/admin"
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              location.pathname.startsWith('/admin')
                ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
                : 'text-gray-400 hover:text-gray-100 hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <Shield className="w-[18px] h-[18px] text-amber-400/70" />
            Admin
          </Link>
        )}
      </nav>

      {/* User + status */}
      <div className="p-3 border-t border-white/[0.06] relative" ref={statusRef}>
        {statusOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 glass-strong rounded-2xl border border-white/10 p-3 shadow-float z-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Set status</p>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {STATUS_PRESETS.map(preset => (
                <button
                  key={preset.text}
                  onClick={() => handleSetStatus(preset.emoji, preset.text)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/[0.06] transition-colors ${
                    myStatus?.customStatus === preset.text ? 'bg-primary-500/15 text-primary-200' : ''
                  }`}
                >
                  <span>{preset.emoji}</span> {preset.text}
                  {myStatus?.customStatus === preset.text && <Check className="w-4 h-4 ml-auto text-primary-300" />}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2 pt-2 border-t border-white/[0.06]">
              <input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && customText.trim() && handleSetStatus('💬', customText.trim())}
                placeholder="Custom status..."
                className="input !py-1.5 text-sm flex-1"
                maxLength={60}
              />
              <button
                onClick={() => customText.trim() && handleSetStatus('💬', customText.trim())}
                className="btn btn-primary !px-3 !py-1.5"
              >
                <SmilePlus className="w-4 h-4" />
              </button>
            </div>
            {myStatus?.customStatus && (
              <button onClick={handleClearStatus} className="w-full mt-2 text-xs text-red-400 hover:text-red-300 py-1">
                Clear status
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setStatusOpen(!statusOpen)}
            className="relative flex-1 flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-white/[0.04] transition-colors text-left"
          >
            <div className="relative shrink-0">
              <img src={user?.avatar} alt={user?.name} className="w-9 h-9 rounded-full ring-2 ring-primary-500/30" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-dark-200" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-200 truncate">{user?.name}</p>
              {myStatus?.customStatus ? (
                <p className="text-[11px] text-gray-500 truncate">{myStatus.statusEmoji} {myStatus.customStatus}</p>
              ) : (
                <p className="text-[11px] text-gray-600 flex items-center gap-1"><ChevronDown className="w-3 h-3" /> Set status</p>
              )}
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
            title="Logout"
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-dark-100 aurora-bg noise">
      <div className="blob -top-40 left-1/4 h-[30rem] w-[30rem] bg-primary-600/20 animate-aurora" />
      <div className="blob top-1/3 -right-32 h-96 w-96 bg-accent-600/15 animate-aurora-slow" />
      <div className="blob bottom-0 -left-24 h-80 w-80 bg-cyan-500/10 animate-aurora" />

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col z-40 glass-strong border-r border-white/[0.06]">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 flex-col glass-strong border-r border-white/[0.06] flex">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 glass-strong flex items-center justify-between px-4 py-3">
        <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-gray-300 hover:text-white">
          <Menu className="w-6 h-6" />
        </button>
        <Link to="/app" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold font-display">MeetClone</span>
        </Link>
        <NotificationBell />
      </div>

      {/* Content */}
      <main className={`lg:ml-64 relative ${wide ? '' : 'max-w-6xl'}`}>
        <div className="hidden lg:block absolute top-4 right-6 z-30">
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  )
}
