import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  Plus, Send, Paperclip, Smile, Hash, Users, Phone, X, BellOff, Bell,
  Pin, Bookmark, Forward, Pencil, Trash2, Reply, ListChecks,
  CheckCheck, Loader2, Search, CornerDownLeft
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useConversationStore } from '../store/conversationStore'
import { useFileStore } from '../store/fileStore'
import { useTaskStore } from '../store/taskStore'
import { useMeetingStore } from '../store/meetingStore'
import { usePresenceStore } from '../store/presenceStore'
import AppShell from '../components/AppShell'
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
  const [pinnedMessages, setPinnedMessages] = useState([])

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
    <div className="flex h-[calc(100vh-0px)] lg:h-screen">
      {/* Conversation list */}
      <div className="w-full max-w-[300px] shrink-0 border-r border-white/[0.06] bg-dark-200/40 backdrop-blur-sm flex flex-col h-full mt-[60px] lg:mt-0">
        <div className="p-4 flex items-center justify-between">
          <h1 className="text-lg font-bold font-display">Chat</h1>
          <button onClick={() => setShowNewChat(true)} className="btn btn-primary !px-3 !py-2" title="New conversation">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {conversations.length === 0 && !isLoading && (
            <div className="text-center text-sm text-gray-500 px-4 py-10">
              No conversations yet.<br />Start one with a teammate.
            </div>
          )}
          {conversations.map(conv => {
            const isActive = conv.id === activeId
            return (
              <button
                key={conv.id}
                onClick={() => openConv(conv)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                  isActive ? 'bg-primary-500/15 border border-primary-500/30' : 'hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Avatar user={conv.type === 'direct' ? conv.partner : null} name={conv.title} isGroup={conv.type === 'group'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-primary-100' : 'text-gray-200'}`}>{conv.title}</p>
                    {conv.unreadCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{conv.lastMessagePreview || 'No messages yet'}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Conversation view */}
      <div className="flex-1 flex flex-col min-w-0 mt-[60px] lg:mt-0">
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
  const [file, setFile] = useState(null)
  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const { statuses } = usePresenceStore()

  const uploadFile = useFileStore(s => s.upload)

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

  const handleSend = async () => {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    onTyping(conversation.id, false)
    const res = await onSend({ content })
    if (!res.success) toast.error(res.message)
  }

  const handleSendFile = async () => {
    if (!file) return
    const res = await uploadFile(file, { conversationId: conversation.id })
    if (res.success) {
      await onSend({
        content: file.name,
        type: 'file',
        fileUrl: res.file.url,
        fileName: res.file.originalName,
        fileType: res.file.mimeType,
        fileSize: Number(res.file.size)
      })
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } else {
      toast.error(res.message)
    }
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

  const partnerStatus = conversation.partner ? statuses[conversation.partner.id] : null
  const typingNames = Object.values(typingUsers).map(t => t.name)

  return (
    <>
      {/* Header */}
      <div className="h-[68px] shrink-0 glass-strong border-b border-white/[0.06] flex items-center gap-3 px-5">
        <Avatar user={conversation.type === 'direct' ? conversation.partner : null} name={conversation.title} isGroup={conversation.type === 'group'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold font-display truncate">{conversation.title}</h2>
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
                : conversation.partner.isOnline ? 'Active now' : 'Away'
              : conversation.members?.slice(0, 3).map(m => m.user?.name).join(', ') + ((conversation.members?.length || 0) > 3 ? ` +${conversation.members.length - 3}` : '')}
          </p>
        </div>
        {conversation.type === 'direct' && (
          <button onClick={onStartHuddle} className="p-2 rounded-xl text-gray-400 hover:bg-primary-500/10 hover:text-primary-300 transition-all" title="Start huddle">
            <Phone className="w-[18px] h-[18px]" />
          </button>
        )}
        <button onClick={onToggleMute} className="p-2 rounded-xl text-gray-400 hover:bg-white/[0.06] transition-all" title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? <BellOff className="w-[18px] h-[18px]" /> : <Bell className="w-[18px] h-[18px]" />}
        </button>
        <button onClick={fetchPinned} className="p-2 rounded-xl text-gray-400 hover:bg-white/[0.06] transition-all" title="Pinned messages">
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
            {group.items.map(m => (
              <MessageRow
                key={m.id}
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
            ))}
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
      <div className="shrink-0 border-t border-white/[0.06] bg-dark-200/40 backdrop-blur-sm p-4">
        {file && (
          <div className="flex items-center gap-2 mb-2 rounded-xl bg-dark-300/60 border border-white/[0.06] px-3 py-2 max-w-sm">
            <Paperclip className="w-4 h-4 text-primary-300" />
            <span className="text-sm text-gray-300 truncate flex-1">{file.name}</span>
            <button onClick={() => setFile(null)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
            <button onClick={handleSendFile} className="btn btn-primary !px-3 !py-1.5 text-xs">Send file</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl text-gray-400 hover:text-primary-300 hover:bg-primary-500/10 transition-all"
            title="Attach a file"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <textarea
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={1}
            placeholder={`Message ${conversation.title}...`}
            className="input !rounded-2xl resize-none max-h-32 py-3"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="btn btn-primary !px-4 !py-3 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )
}

// ============================================================
// Message row
// ============================================================

function MessageRow({
  message: m, isMine, user, editing, editDraft, setEditDraft, onSubmitEdit, onCancelEdit,
  reactionOpen, onToggleReactions, menuOpen, onToggleMenu,
  onReact, onEdit, onDelete, onPin, onSave, onForward, onThread, onCreateTask, canModerate
}) {
  const sender = m.sender || {}
  const reactions = m.reactions || []
  const grouped = reactions.reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || { count: 0, mine: false }
    acc[r.emoji].count++
    if (r.userId === user.id) acc[r.emoji].mine = true
    return acc
  }, {})

  return (
    <div className={`group flex gap-3 px-2 py-1 rounded-xl hover:bg-white/[0.02] ${m.isPinned ? 'bg-amber-500/[0.04]' : ''}`}>
      <div className="w-9 shrink-0 pt-1">
        {sender.avatar ? (
          <img src={sender.avatar} alt={sender.name} className="w-9 h-9 rounded-full" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center text-xs font-bold text-white">
            {(sender.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-200">{sender.name || 'Unknown'}</span>
          <span className="text-[11px] text-gray-600">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          {m.editedAt && <span className="text-[10px] text-gray-600">(edited)</span>}
          {m.isPinned && <Pin className="w-3 h-3 text-amber-400" />}
          {m.forwardedFromId && <Forward className="w-3 h-3 text-gray-600" />}
        </div>

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
          <a
            href={`${import.meta.env.DEV ? 'http://localhost:5000' : ''}${m.fileUrl}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-2.5 rounded-xl bg-dark-300/60 border border-white/[0.08] px-4 py-2.5 hover:border-primary-500/40 transition-colors"
          >
            <Paperclip className="w-4 h-4 text-primary-300" />
            <span className="text-sm text-gray-200">{m.fileName}</span>
          </a>
        ) : (
          <p className={`text-sm mt-0.5 whitespace-pre-wrap break-words ${m.isDeleted ? 'text-gray-600 italic' : 'text-gray-300'}`}>
            {m.content}
          </p>
        )}

        {/* Reactions */}
        {Object.keys(grouped).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {Object.entries(grouped).map(([emoji, info]) => (
              <button
                key={emoji}
                onClick={() => onReact(m.id, emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
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
            <div className="absolute top-8 right-0 z-30 glass-strong border border-white/10 rounded-xl p-1.5 flex gap-0.5 shadow-float" onClick={e => e.stopPropagation()}>
              {REACTION_SET.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onReact(m.id, emoji); onToggleReactions() }}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 text-base transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
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
    <div className="mt-2 rounded-2xl bg-gradient-to-br from-primary-500/10 to-accent-500/5 border border-primary-500/25 p-4 max-w-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-accent-600 flex items-center justify-center">
          <Phone className="w-5 h-5 text-white" />
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
    <div className="w-full max-w-[380px] shrink-0 border-l border-white/[0.06] bg-dark-200/60 backdrop-blur-sm flex flex-col h-full mt-[60px] lg:mt-0">
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-strong rounded-3xl border border-white/10 w-full max-w-md p-6 shadow-float max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold font-display">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/[0.06]"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Avatar({ user, name, isGroup }) {
  if (isGroup) {
    return (
      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shrink-0">
        <Users className="w-5 h-5 text-white/90" />
      </div>
    )
  }
  const label = name || user?.name || '?'
  return user?.avatar ? (
    <div className="relative shrink-0">
      <img src={user.avatar} alt={label} className="w-10 h-10 rounded-full" />
      {user.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-dark-200" />}
    </div>
  ) : (
    <div className="relative shrink-0">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br ${user?.isOnline ? 'from-primary-500 to-accent-600' : 'from-dark-300 to-dark-400'}`}>
        {label.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
      </div>
      {user?.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-dark-200" />}
    </div>
  )
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
        <button onClick={() => setMode('direct')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${mode === 'direct' ? 'bg-primary-500/20 text-primary-200 border border-primary-500/40' : 'bg-white/[0.04] text-gray-400 border border-transparent'}`}>
          Direct message
        </button>
        <button onClick={() => setMode('group')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${mode === 'group' ? 'bg-primary-500/20 text-primary-200 border border-primary-500/40' : 'bg-white/[0.04] text-gray-400 border border-transparent'}`}>
          Group chat
        </button>
      </div>

      {mode === 'group' && (
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" className="input mb-3" />
      )}

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teammates..." className="input pl-9" />
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
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
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
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
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
      setTeamMembers((res.data.data.team?.members || res.data.data.members || []).map(m => ({
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
        <div className="grid grid-cols-2 gap-3">
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
