import api from '../lib/api'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Plus, Send, Paperclip, Smile, Hash, Users, Phone, X, BellOff, Bell,
  Pin, Bookmark, Forward, Pencil, Trash2, Reply, ListChecks,
  Check, CheckCheck, Loader2, Search, CornerDownLeft
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useConversationStore } from '../store/conversationStore'
import { useTaskStore } from '../store/taskStore'
import { useMeetingStore } from '../store/meetingStore'
import { usePresenceStore, getActiveStatus } from '../store/presenceStore'
import AppShell from '../components/AppShell'
import UserAvatar from '../components/Avatar'
import EmojiPicker from '../components/EmojiPicker'
import ProfileCard from '../components/ProfileCard'
import FileAttachment from '../components/FileAttachment'
import useChatUpload from '../hooks/useChatUpload'
import AttachMenu from '../components/AttachMenu'
import useMentions, { MentionText, mentionedIds } from '../hooks/useMentions'
import toast from 'react-hot-toast'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '✅']

const REACTION_SET = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🚀', '✅']

export default function Chat() {
  return (
    <AppShell wide>
      <ChatWorkspace />
    </AppShell>
  )
}

function ChatWorkspace() {
  const { conversationId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const {
    conversations, contacts, activeId, messages, threads, typingUsers,
    isLoading, isLoadingMessages,
    fetchConversations, fetchContacts, openConversation, clearActive,
    sendMessage, emitTyping, toggleReaction, editMessage, deleteMessage,
    togglePin, toggleSave, forwardMessage,
    loadThread, sendThreadReply, startDirect, createGroup
  } = useConversationStore()

  const active = conversations.find(c => c.id === activeId) || null
  const list = messages[activeId] || []

  const [showNewChat, setShowNewChat] = useState(false)
  const [threadRootId, setThreadRootId] = useState(null)
  const [forwardMessageId, setForwardMessageId] = useState(null)
  const [taskFromMessage, setTaskFromMessage] = useState(null)
  const [showPinned, setShowPinned] = useState(false)
  const [saved, setSaved] = useState(null) // null = closed
  const openSaved = async () => {
    try {
      const { data } = await api.get('/messages/saved')
      setSaved(data.data.saved)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load saved messages')
    }
  }
  const [pinnedMessages, setPinnedMessages] = useState([])
  const [listQuery, setListQuery] = useState('')
  const [listFilter, setListFilter] = useState('all')
  const statuses = usePresenceStore(st => st.statuses)

  const unreadTotal = conversations.filter(c => c.unreadCount > 0).length
  const visibleConversations = conversations.filter(c => {
    if (listFilter === 'unread' && !(c.unreadCount > 0)) return false
    if (listFilter === 'groups' && c.type !== 'group') return false
    const q = listQuery.trim().toLowerCase()
    return !q || (c.title || '').toLowerCase().includes(q) || (c.lastMessagePreview || '').toLowerCase().includes(q)
  })

  useEffect(() => {
    if (conversations.length === 0) fetchConversations()
    fetchContacts()
  }, [])

  useEffect(() => {
    if (conversationId && conversationId !== activeId) {
      openConversation(conversationId)
    } else if (!conversationId && activeId) {
      clearActive()
    }
  }, [conversationId])

  const openConv = (conv) => {
    navigate(`/chat/${conv.id}`)
  }

  const openThread = async (rootId) => {
    setThreadRootId(rootId)
    await loadThread(rootId)
  }

  const closeThread = () => {
    setThreadRootId(null)
    if (searchParams.get('thread')) {
      searchParams.delete('thread')
      setSearchParams(searchParams, { replace: true })
    }
  }

  // Auto-open thread from notification deep-link (?thread=)
  useEffect(() => {
    const t = searchParams.get('thread')
    if (t && activeId) openThread(t)
  }, [searchParams, activeId])

  const fetchPinned = async () => {
    if (!activeId) return
    try {
      const { default: api } = await import('../lib/api')
      const res = await api.get('/messages/pinned', { params: { conversationId: activeId } })
      setPinnedMessages(res.data.data.messages)
      setShowPinned(true)
    } catch {
      toast.error('Failed to load pinned messages')
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] lg:h-screen overflow-hidden">
      {/* Conversation list */}
      <div className={`${active ? 'hidden md:flex' : 'flex'} w-full md:max-w-[300px] min-w-0 shrink-0 border-r border-white/[0.06] bg-dark-200/40 flex-col h-full`}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h1 className="text-lg font-semibold font-display">Chat</h1>
          <button onClick={openSaved} className="btn btn-ghost ml-auto mr-1 !px-3" title="Saved messages" aria-label="Saved messages">
            <Bookmark className="w-4 h-4" />
          </button>
          <button onClick={() => setShowNewChat(true)} className="btn btn-primary !px-3 !py-2" title="New conversation" aria-label="New conversation">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="px-3 pb-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder="Search chats" className="input !py-2 !pl-9 text-sm" />
          </div>
          <div className="flex gap-1">
            {[['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setListFilter(id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  listFilter === id ? 'bg-primary-500/20 border-primary-500/40 text-primary-100' : 'border-white/[0.08] text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                }`}
              >
                {label}{id === 'unread' && unreadTotal > 0 ? ` · ${unreadTotal}` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {conversations.length === 0 && !isLoading && (
            <div className="text-center text-sm text-gray-500 px-4 py-10">
              No conversations yet.<br />Start one with a teammate.
            </div>
          )}
          {conversations.length > 0 && visibleConversations.length === 0 && (
            <p className="text-center text-sm text-gray-500 px-4 py-10">No chats match.</p>
          )}
          {visibleConversations.map(conv => {
            const isActive = conv.id === activeId
            const unread = conv.unreadCount > 0
            const st = conv.type === 'direct' ? getActiveStatus(statuses[conv.partner?.id] || conv.partner) : null
            return (
              <button
                key={conv.id}
                onClick={() => openConv(conv)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors border ${
                  isActive ? 'bg-primary-500/15 border-primary-500/30' : 'hover:bg-white/[0.04] border-transparent'
                }`}
              >
                <Avatar user={conv.type === 'direct' ? conv.partner : null} name={conv.title} isGroup={conv.type === 'group'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${unread ? 'font-semibold text-white' : 'font-medium'} ${isActive ? 'text-primary-100' : unread ? '' : 'text-gray-200'}`}>
                      {conv.title}{st && <span className="ml-1.5" title={st.customStatus}>{st.statusEmoji}</span>}
                    </p>
                    <span className={`timecode shrink-0 !text-[11px] ${unread ? "!text-primary-300" : ""}`}>{relTime(conv.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs truncate ${unread ? 'text-gray-300' : 'text-gray-500'}`}>{conv.lastMessagePreview || 'No messages yet'}</p>
                    {unread && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary-500 text-ink text-[10px] font-semibold flex items-center justify-center shrink-0">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Conversation view */}
      <div className={`${active ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 h-full`}>
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
            <Reply className="w-12 h-12 text-gray-700" />
            <p>Select a conversation or start a new one</p>
          </div>
        ) : (
          <ConversationView
            key={active.id}
            conversation={active}
            messages={list}
            typingUsers={typingUsers[active.id] || {}}
            user={user}
            isLoading={isLoadingMessages}
            onSend={(payload) => sendMessage(active.id, payload)}
            onTyping={emitTyping}
            onReact={toggleReaction}
            onEdit={editMessage}
            onDelete={deleteMessage}
            onPin={togglePin}
            onSave={toggleSave}
            onForward={(mid) => setForwardMessageId(mid)}
            onThread={openThread}
            onCreateTask={(msg) => setTaskFromMessage(msg)}
            onStartHuddle={async () => {
              const result = await useMeetingStore.getState().createMeeting({ title: `Huddle with ${active.title}` })
              if (result.success) {
                await sendMessage(active.id, {
                  content: `🎥 ${result.meeting.title}`,
                  type: 'meeting_link',
                  meetingData: {
                    meetingId: result.meeting.id,
                    title: result.meeting.title,
                    scheduledAt: result.meeting.scheduledAt,
                    link: result.meeting.meetingLink
                  }
                })
                navigate(`/meeting/${result.meeting.roomId}`)
              } else {
                toast.error(result.message || 'Could not start huddle')
              }
            }}
            onToggleMute={async () => {
              try {
                const { default: api } = await import('../lib/api')
                const res = await api.put(`/conversations/${active.id}/mute`)
                toast.success(res.data.data.isMuted ? 'Muted' : 'Unmuted')
                fetchConversations()
              } catch { toast.error('Failed') }
            }}
            isMuted={active.isMuted}
            fetchPinned={fetchPinned}
          />
        )}
      </div>

      {/* Thread panel */}
      {threadRootId && threads[threadRootId] && (
        <ThreadPanel
          thread={threads[threadRootId]}
          user={user}
          onClose={closeThread}
          onReply={(content) => sendThreadReply(threadRootId, content)}
          onReact={toggleReaction}
        />
      )}

      {/* Modals */}
      {saved && (
        <Modal onClose={() => setSaved(null)} title="Saved messages">
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {saved.length === 0 && <p className="text-sm text-gray-500">Nothing saved yet. Use Save on any message.</p>}
            {saved.map(({ savedId, message }) => (
              <button key={savedId} className="card card-hover w-full p-3 text-left"
                onClick={() => { setSaved(null); if (message.conversationId) navigate(`/chat/${message.conversationId}`) }}>
                <p className="text-xs text-gray-500">{message.sender?.name} <span className="timecode">{new Date(message.createdAt).toLocaleString()}</span></p>
                <p className="mt-1 text-sm text-gray-200 break-words">{message.content}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {showNewChat && (
        <NewChatModal
          contacts={contacts}
          onClose={() => setShowNewChat(false)}
          onStartDirect={async (userId) => {
            const res = await startDirect(userId)
            if (res.success) { setShowNewChat(false); navigate(`/chat/${res.conversation.id}`) }
            else toast.error(res.message)
          }}
          onCreateGroup={async (name, userIds) => {
            const res = await createGroup(name, userIds)
            if (res.success) { setShowNewChat(false); navigate(`/chat/${res.conversation.id}`) }
            else toast.error(res.message)
          }}
        />
      )}

      {forwardMessageId && (
        <ForwardModal
          conversations={conversations}
          onClose={() => setForwardMessageId(null)}
          onForward={async (target) => {
            const res = await forwardMessage(forwardMessageId, target)
            if (res.success) { toast.success('Forwarded'); setForwardMessageId(null) }
            else toast.error(res.message)
          }}
        />
      )}

      {taskFromMessage && (
        <TaskFromMessageModal
          message={taskFromMessage}
          onClose={() => setTaskFromMessage(null)}
        />
      )}

      {showPinned && (
        <Modal onClose={() => setShowPinned(false)} title="Pinned messages">
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {pinnedMessages.length === 0 && <p className="text-sm text-gray-500">Nothing pinned yet.</p>}
            {pinnedMessages.map(m => (
              <div key={m.id} className="rounded-xl bg-dark-300/50 border border-white/[0.06] p-3">
                <p className="text-xs text-gray-500 mb-1">{m.sender?.name}</p>
                <p className="text-sm text-gray-200">{m.content}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ============================================================
// Conversation view (messages + composer)
// ============================================================

function ConversationView({
  conversation, messages, typingUsers, user, isLoading,
  onSend, onTyping, onReact, onEdit, onDelete, onPin, onSave, onForward,
  onThread, onCreateTask, onStartHuddle, onToggleMute, isMuted, fetchPinned
}) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [reactionFor, setReactionFor] = useState(null)
  const [menuFor, setMenuFor] = useState(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const { statuses } = usePresenceStore()

  // File attachment support (uploads scoped to this conversation)
  const { pendingFile, isUploading, selectFile, clearPending, sendAttachment } = useChatUpload(() => ({ conversationId: conversation.id }))

  // "@name" tagging
  const people = (conversation.members || []).filter(m => m.user?.name).map(m => ({ ...m.user, id: m.userId }))
  const mentions = useMentions({ value: draft, setValue: setDraft, inputRef, people: people.filter(p => p.id !== user.id) })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, conversation.id])

  useEffect(() => {
    const close = () => { setReactionFor(null); setMenuFor(null) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const handleDraftChange = (e) => {
    setDraft(e.target.value)
    onTyping(conversation.id, true)
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => onTyping(conversation.id, false), 2500)
  }

  const insertEmoji = (emoji) => {
    const el = inputRef.current
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? draft.length
    const next = draft.slice(0, start) + emoji + draft.slice(end)
    setDraft(next)
    requestAnimationFrame(() => { el?.focus(); const pos = start + emoji.length; el?.setSelectionRange(pos, pos) })
  }

  // grow the textarea with its content (up to max-h)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [draft])

  const handleSend = async () => {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    setEmojiOpen(false)
    onTyping(conversation.id, false)
    const res = await onSend({ content, mentions: mentionedIds(content, people) })
    if (!res.success) toast.error(res.message)
  }

  const handleSendFile = async () => {
    const file = await sendAttachment()
    if (!file) {
      toast.error('File upload failed')
      return
    }
    await onSend({
      content: file.originalName,
      type: 'file',
      fileUrl: file.url,
      fileName: file.originalName,
      fileType: file.mimeType,
      fileSize: Number(file.size)
    })
    clearPending()
  }

  const startEdit = (m) => {
    setEditingId(m.id)
    setEditDraft(m.content)
  }

  const submitEdit = async () => {
    if (!editDraft.trim()) return
    const res = await onEdit(editingId, editDraft.trim())
    if (res.success) setEditingId(null)
    else toast.error(res.message)
  }

  // Group messages by day
  const groups = []
  let currentDay = null
  for (const m of messages) {
    const day = new Date(m.createdAt).toDateString()
    if (day !== currentDay) {
      groups.push({ day, items: [] })
      currentDay = day
    }
    groups[groups.length - 1].items.push(m)
  }

  const partnerStatus = conversation.partner ? getActiveStatus(statuses[conversation.partner.id] || conversation.partner) : null
  const partnerOnline = usePresenceStore(st => !!conversation.partner && st.onlineUserIds.includes(conversation.partner.id))
  const [profileFor, setProfileFor] = useState(null)
  const typingNames = Object.values(typingUsers).map(t => t.name)

  return (
    <>
      {/* Header */}
      <div className="h-[68px] shrink-0 glass-strong border-b border-white/[0.06] flex items-center gap-2 sm:gap-3 px-3 sm:px-5">
        <Link to="/chat" className="md:hidden p-2 -ml-1 text-gray-300 hover:text-white shrink-0" aria-label="Back to conversations">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Avatar
          user={conversation.type === 'direct' ? conversation.partner : null}
          name={conversation.title}
          isGroup={conversation.type === 'group'}
          onClick={conversation.type === 'direct' && conversation.partner ? () => setProfileFor(conversation.partner) : undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2
              onClick={conversation.type === 'direct' && conversation.partner ? () => setProfileFor(conversation.partner) : undefined}
              className={`font-semibold font-display truncate ${conversation.type === 'direct' ? 'cursor-pointer hover:text-primary-200' : ''}`}
            >{conversation.title}</h2>
            {conversation.type === 'group' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-400 flex items-center gap-1">
                <Users className="w-3 h-3" /> {conversation.members?.length || 0}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">
            {conversation.type === 'direct' && conversation.partner
              ? partnerStatus?.customStatus
                ? `${partnerStatus.statusEmoji || ''} ${partnerStatus.customStatus}`
                : partnerOnline ? 'Active now' : conversation.partner.lastSeen ? `Last seen ${relTime(conversation.partner.lastSeen)}` : 'Offline'
              : conversation.members?.slice(0, 3).map(m => m.user?.name).join(', ') + ((conversation.members?.length || 0) > 3 ? ` +${conversation.members.length - 3}` : '')}
          </p>
        </div>
        {conversation.type === 'direct' && (
          <button onClick={onStartHuddle} className="p-2 rounded-xl text-gray-400 hover:bg-primary-500/10 hover:text-primary-300 transition-colors" title="Start huddle">
            <Phone className="w-[18px] h-[18px]" />
          </button>
        )}
        <button onClick={onToggleMute} className="p-2 rounded-xl text-gray-400 hover:bg-white/[0.06] transition-colors" title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? <BellOff className="w-[18px] h-[18px]" /> : <Bell className="w-[18px] h-[18px]" />}
        </button>
        <button onClick={fetchPinned} className="p-2 rounded-xl text-gray-400 hover:bg-white/[0.06] transition-colors" title="Pinned messages">
          <Pin className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
        {isLoading && (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-gray-600 animate-spin" /></div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="text-center py-16 text-gray-600">
            <p className="text-sm">This is the beginning of your conversation with <span className="text-gray-400">{conversation.title}</span></p>
          </div>
        )}
        {groups.map(group => (
          <div key={group.day}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[11px] text-gray-500 font-medium">{group.day}</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            {group.items.map((m, idx) => {
              const prev = group.items[idx - 1]
              const compact = !!prev && prev.senderId === m.senderId && !prev.isDeleted
                && !['meeting_link'].includes(prev.type) && !['meeting_link'].includes(m.type)
                && new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000
              return (
              <MessageRow
                key={m.id}
                compact={compact}
                people={people}
                onProfile={(u) => u?.id && setProfileFor(u)}
                message={m}
                isMine={m.senderId === user.id}
                user={user}
                editing={editingId === m.id}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingId(null)}
                reactionOpen={reactionFor === m.id}
                onToggleReactions={() => setReactionFor(reactionFor === m.id ? null : m.id)}
                menuOpen={menuFor === m.id}
                onToggleMenu={() => setMenuFor(menuFor === m.id ? null : m.id)}
                onReact={onReact}
                onEdit={startEdit}
                onDelete={onDelete}
                onPin={onPin}
                onSave={onSave}
                onForward={onForward}
                onThread={onThread}
                onCreateTask={onCreateTask}
                canModerate={conversation.myRole === 'owner'}
              />
              )
            })}
          </div>
        ))}
        {typingNames.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500 px-2 py-2">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0.3s]" />
            </span>
            {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing...
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-white/[0.06] bg-dark-200/40 p-4">
        {pendingFile && (
          <div className="flex items-center gap-2 mb-2 rounded-xl bg-dark-300/60 border border-white/[0.06] px-3 py-2 max-w-sm">
            <Paperclip className="w-4 h-4 text-primary-300" />
            <span className="text-sm text-gray-300 truncate flex-1">{pendingFile.name}</span>
            {isUploading ? (
              <span className="text-xs text-primary-300 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</span>
            ) : (
              <>
                <button onClick={clearPending} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                <button onClick={handleSendFile} className="btn btn-primary !px-3 !py-1.5 text-xs">Send file</button>
              </>
            )}
          </div>
        )}
        <div className="relative flex items-end gap-1.5 rounded-2xl border border-white/[0.08] bg-dark-300/60 px-2 py-1.5 focus-within:border-primary-500/50 focus-within:ring-4 focus-within:ring-primary-500/10 transition-colors">
          {mentions.menu}
          <AttachMenu onFile={selectFile} disabled={isUploading} />
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => { handleDraftChange(e); mentions.onChange(e) }}
            onSelect={mentions.onSelect}
            onKeyDown={(e) => {
              if (mentions.onKeyDown(e)) return
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={1}
            placeholder={`Message ${conversation.title}`}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder-gray-500 py-2.5 max-h-32"
          />
          <div className="relative">
            {emojiOpen && (
              <EmojiPicker className="bottom-full right-0 mb-3" onClose={() => setEmojiOpen(false)} onPick={insertEmoji} />
            )}
            <button
              onClick={() => setEmojiOpen(o => !o)}
              className={`p-2 rounded-xl transition-colors ${emojiOpen ? 'text-primary-300 bg-primary-500/15' : 'text-gray-400 hover:text-primary-300 hover:bg-primary-500/10'}`}
              title="Emoji"
              aria-label="Open emoji picker"
              aria-expanded={emojiOpen}
            >
              <Smile className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="p-2.5 rounded-xl bg-primary-500 text-ink hover:bg-primary-400 disabled:opacity-30 disabled:hover:bg-primary-500 transition-colors"
            title="Send (Enter)"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="hidden sm:block text-[10px] text-gray-600 mt-1.5 px-1"><kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift + Enter</kbd> for a new line</p>
      </div>

      {profileFor && (
        <ProfileCard userId={profileFor.id} initial={profileFor} onClose={() => setProfileFor(null)} />
      )}
    </>
  )
}

// ============================================================
// Message row
// ============================================================

function MessageRow({
  compact = false, onProfile, people = [],
  message: m, isMine, user, editing, editDraft, setEditDraft, onSubmitEdit, onCancelEdit,
  reactionOpen, onToggleReactions, menuOpen, onToggleMenu,
  onReact, onEdit, onDelete, onPin, onSave, onForward, onThread, onCreateTask, canModerate
}) {
  const sender = m.sender || {}
  const [moreOpen, setMoreOpen] = useState(false)
  const reactions = m.reactions || []
  const grouped = reactions.reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || { count: 0, mine: false }
    acc[r.emoji].count++
    if (r.userId === user.id) acc[r.emoji].mine = true
    return acc
  }, {})

  return (
    <div className={`group flex gap-3 px-2 ${compact ? 'py-0.5' : 'pt-2.5 pb-0.5'} rounded-xl hover:bg-white/[0.03] ${m.isPinned ? 'bg-amber-500/[0.05]' : ''}`}>
      <div className="w-9 shrink-0 pt-0.5">
        {compact ? (
          <span className="block text-[10px] text-gray-600 text-right pt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        ) : (
          <button type="button" onClick={() => onProfile?.(sender)} className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400" title="View profile">
            <UserAvatar user={sender} size="sm" className="!block" />
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline gap-2 flex-wrap">
            <button type="button" onClick={() => onProfile?.(sender)} className="text-sm font-semibold text-gray-100 hover:underline">{sender.name || 'Unknown'}</button>
            <span className="timecode !text-[11px]">{new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            {m.editedAt && <span className="text-[10px] text-gray-600">(edited)</span>}
            {m.isPinned && <Pin className="w-3 h-3 text-amber-400 self-center" />}
            {m.forwardedFromId && <Forward className="w-3 h-3 text-gray-600 self-center" />}
          </div>
        )}

        {editing ? (
          <div className="mt-1.5 flex gap-2">
            <input
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmitEdit(); if (e.key === 'Escape') onCancelEdit() }}
              className="input flex-1 !py-2 text-sm"
              autoFocus
            />
            <button onClick={onSubmitEdit} className="btn btn-primary !px-3 !py-1.5 text-xs">Save</button>
            <button onClick={onCancelEdit} className="btn btn-ghost !px-3 !py-1.5 text-xs">Cancel</button>
          </div>
        ) : m.type === 'meeting_link' && m.meetingData ? (
          <MeetingCard data={m.meetingData} />
        ) : m.type === 'file' && m.fileUrl ? (
          <FileAttachment
            fileUrl={m.fileUrl}
            fileName={m.fileName}
            fileType={m.fileType}
            fileSize={m.fileSize}
          />
        ) : (
          <p className={`text-sm mt-0.5 whitespace-pre-wrap break-words ${m.isDeleted ? 'text-gray-600 italic' : 'text-gray-300'}`}>
            <MentionText text={m.content} people={people} />
          </p>
        )}

        {/* Reactions */}
        {Object.keys(grouped).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {Object.entries(grouped).map(([emoji, info]) => (
              <button
                key={emoji}
                onClick={() => onReact(m.id, emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  info.mine ? 'bg-primary-500/20 border-primary-500/40 text-primary-200' : 'bg-white/[0.04] border-white/[0.08] text-gray-400 hover:border-white/20'
                }`}
              >
                <span>{emoji}</span> {info.count}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {!m.isDeleted && !editing && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-start gap-0.5 pt-1 relative">
          <ActionButton icon={Smile} title="React" onClick={onToggleReactions} />
          <ActionButton icon={Reply} title="Reply in thread" onClick={() => onThread(m.id)} />
          <ActionButton icon={ListChecks} title="Create task" onClick={() => onCreateTask(m)} />
          <ActionButton icon={Bookmark} title="Save" onClick={() => onSave(m.id)} />
          <ActionButton icon={Forward} title="Forward" onClick={() => onForward(m.id)} />
          {(isMine || canModerate) && <ActionButton icon={Pencil} title="Edit" onClick={() => onEdit(m)} />}
          {canModerate && <ActionButton icon={Pin} title={m.isPinned ? 'Unpin' : 'Pin'} onClick={() => onPin(m.id)} />}
          {(isMine || canModerate) && <ActionButton icon={Trash2} title="Delete" onClick={() => onDelete(m.id)} danger />}

          {reactionOpen && (
            <div className="absolute top-8 right-0 z-30" onClick={e => e.stopPropagation()}>
              <div className="glass-strong border border-white/10 rounded-xl p-1.5 flex items-center gap-0.5">
                {REACTION_SET.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => { onReact(m.id, emoji); onToggleReactions() }}
                    className="w-8 h-8 rounded-lg hover:bg-white/10 text-base transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  onClick={() => setMoreOpen(o => !o)}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center"
                  title="More emoji"
                  aria-label="More emoji"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {moreOpen && (
                <EmojiPicker
                  className="top-full right-0 mt-1"
                  closeOnPick
                  onClose={() => setMoreOpen(false)}
                  onPick={(emoji) => { onReact(m.id, emoji); setMoreOpen(false); onToggleReactions() }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ActionButton({ icon: Icon, title, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg transition-colors ${danger ? 'hover:bg-red-500/10 hover:text-red-400 text-gray-500' : 'text-gray-500 hover:bg-white/[0.08] hover:text-gray-200'}`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
}

function MeetingCard({ data }) {
  const navigate = useNavigate()
  const roomId = (data.link || '').split('/meeting/')[1]
  return (
    <div className="mt-2 rounded-2xl bg-primary-500/10 border border-primary-500/25 p-4 max-w-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-400 flex items-center justify-center">
          <Phone className="w-5 h-5 text-ink" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-100 truncate">{data.title || 'Meeting'}</p>
          {data.scheduledAt && (
            <p className="text-xs text-gray-500">{new Date(data.scheduledAt).toLocaleString()}</p>
          )}
        </div>
        <button
          onClick={() => roomId ? navigate(`/join/${roomId}`) : data.link && window.open(data.link, '_blank')}
          className="btn btn-primary !px-4 !py-2 text-xs shrink-0"
        >
          Join
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Thread panel
// ============================================================

function ThreadPanel({ thread, user, onClose, onReply, onReact }) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [thread.replies.length])

  const send = async () => {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    const res = await onReply(content)
    if (!res.success) toast.error(res.message)
  }

  return (
    <div className="fixed inset-0 z-40 lg:static lg:z-auto w-full lg:max-w-[380px] shrink-0 border-l border-white/[0.06] bg-dark-200 lg:bg-dark-200/60 flex flex-col h-full">
      <div className="h-[68px] shrink-0 flex items-center justify-between px-4 border-b border-white/[0.06]">
        <div>
          <h3 className="font-semibold font-display text-sm">Thread</h3>
          <p className="text-[11px] text-gray-500">{thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-white/[0.06]"><X className="w-4 h-4" /></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-1">
        <MessageRow
          message={thread.root}
          isMine={thread.root.senderId === user.id}
          user={user}
          editing={false}
          onReact={onReact}
          onToggleReactions={() => {}}
          onToggleMenu={() => {}}
          reactionOpen={false}
          menuOpen={false}
          onEdit={() => {}}
          onDelete={() => {}}
          onPin={() => {}}
          onSave={() => {}}
          onForward={() => {}}
          onThread={() => {}}
          onCreateTask={() => {}}
        />
        <div className="flex items-center gap-2 py-2 text-[11px] text-gray-600">
          <div className="flex-1 h-px bg-white/[0.06]" /> {thread.replies.length} replies <div className="flex-1 h-px bg-white/[0.06]" />
        </div>
        {thread.replies.map(m => (
          <MessageRow
            key={m.id}
            message={m}
            isMine={m.senderId === user.id}
            user={user}
            editing={false}
            onReact={onReact}
            onToggleReactions={() => {}}
            onToggleMenu={() => {}}
            reactionOpen={false}
            menuOpen={false}
            onEdit={() => {}}
            onDelete={() => {}}
            onPin={() => {}}
            onSave={() => {}}
            onForward={() => {}}
            onThread={() => {}}
            onCreateTask={() => {}}
          />
        ))}
      </div>

      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Reply..."
            className="input flex-1 !py-2.5 text-sm"
          />
          <button onClick={send} disabled={!draft.trim()} className="btn btn-primary !px-3 disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Modals
// ============================================================

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative glass-strong rounded-2xl border border-white/10 w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold font-display">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/[0.06]"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Avatar({ user, name, isGroup, size = 'md', onClick }) {
  const online = usePresenceStore(st => (user?.id ? st.onlineUserIds.includes(user.id) : false))
  const body = isGroup ? (
    <div className={`${size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl bg-dark-400 border border-white/10 flex items-center justify-center shrink-0`}>
      <Users className="w-5 h-5 text-white/90" />
    </div>
  ) : (
    <UserAvatar user={user} name={name} size={size} online={user?.id ? online : undefined} />
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400" title="View profile">{body}</button>
  ) : body
}

const relTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5)
  if (days <= 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function NewChatModal({ contacts, onClose, onStartDirect, onCreateGroup }) {
  const [mode, setMode] = useState('direct')
  const [groupName, setGroupName] = useState('')
  const [selected, setSelected] = useState([])
  const [query, setQuery] = useState('')

  const filtered = contacts.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.email.toLowerCase().includes(query.toLowerCase()))

  const toggle = (id) => {
    if (mode === 'direct') return
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <Modal title="New conversation" onClose={onClose}>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('direct')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${mode === 'direct' ? 'bg-primary-500/20 text-primary-200 border border-primary-500/40' : 'bg-white/[0.04] text-gray-400 border border-transparent'}`}>
          Direct message
        </button>
        <button onClick={() => setMode('group')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${mode === 'group' ? 'bg-primary-500/20 text-primary-200 border border-primary-500/40' : 'bg-white/[0.04] text-gray-400 border border-transparent'}`}>
          Group chat
        </button>
      </div>

      {mode === 'group' && (
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" className="input mb-3" />
      )}

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teammates" className="input pl-9" />
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-6">
            No teammates found. Join or create a team first.
          </p>
        )}
        {filtered.map(c => (
          <button
            key={c.id}
            onClick={() => mode === 'direct' ? onStartDirect(c.id) : toggle(c.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
              selected.includes(c.id) ? 'bg-primary-500/15 border border-primary-500/30' : 'hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <Avatar user={c} name={c.name} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-200">{c.name}</p>
              <p className="text-xs text-gray-500">{c.customStatus ? `${c.statusEmoji || ''} ${c.customStatus}` : c.email}</p>
            </div>
            {mode === 'group' && selected.includes(c.id) && <Check className="w-4 h-4 text-primary-300" />}
          </button>
        ))}
      </div>

      {mode === 'group' && (
        <button
          onClick={() => onCreateGroup(groupName, selected)}
          disabled={!groupName.trim() || selected.length === 0}
          className="btn btn-primary w-full mt-4 disabled:opacity-40"
        >
          Create group ({selected.length} members)
        </button>
      )}
    </Modal>
  )
}

function ForwardModal({ conversations, onClose, onForward }) {
  const [target, setTarget] = useState(null)
  return (
    <Modal title="Forward message" onClose={onClose}>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {conversations.map(c => (
          <button
            key={c.id}
            onClick={() => setTarget({ conversationId: c.id })}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
              target?.conversationId === c.id ? 'bg-primary-500/15 border border-primary-500/30' : 'hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <Avatar user={c.type === 'direct' ? c.partner : null} name={c.title} isGroup={c.type === 'group'} />
            <span className="text-sm text-gray-200">{c.title}</span>
            {target?.conversationId === c.id && <CheckCheck className="w-4 h-4 ml-auto text-primary-300" />}
          </button>
        ))}
      </div>
      <button onClick={() => onForward(target)} disabled={!target} className="btn btn-primary w-full mt-4 disabled:opacity-40">
        Forward
      </button>
    </Modal>
  )
}

function TaskFromMessageModal({ message, onClose }) {
  const { createTask, fetchTeams, teams } = useTaskStore()
  const [title, setTitle] = useState(message.content.slice(0, 120))
  const [teamId, setTeamId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')
  const [teamMembers, setTeamMembers] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchTeams() }, [])

  const loadMembers = async (id) => {
    setTeamId(id)
    if (!id) { setTeamMembers([]); return }
    try {
      const { default: api } = await import('../lib/api')
      const res = await api.get(`/teams/${id}`)
      setTeamMembers((res.data?.members || res.data?.data?.team?.members || res.data?.data?.members || []).map(m => ({
        id: m.user?.id || m.userId, name: m.user?.name || m.user
      })).filter(m => m.id))
    } catch { setTeamMembers([]) }
  }

  const submit = async () => {
    setSaving(true)
    const res = await createTask({
      title,
      teamId: teamId || undefined,
      assigneeId: assigneeId || undefined,
      dueDate: dueDate || undefined,
      priority,
      messageId: message.id,
      meetingId: message.meetingId || undefined,
      description: `From message by ${message.sender?.name}: "${message.content.slice(0, 300)}"`
    })
    setSaving(false)
    if (res.success) { toast.success('Task created'); onClose() }
    else toast.error(res.message)
  }

  return (
    <Modal title="Create task from message" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Task title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Team (optional)</label>
            <select value={teamId} onChange={(e) => loadMembers(e.target.value)} className="input">
              <option value="">Personal</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Assignee</label>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="input" disabled={!teamId}>
              <option value="">Me</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <button onClick={submit} disabled={!title.trim() || saving} className="btn btn-primary w-full disabled:opacity-40">
          {saving ? 'Creating...' : 'Create task'}
        </button>
      </div>
    </Modal>
  )
}
