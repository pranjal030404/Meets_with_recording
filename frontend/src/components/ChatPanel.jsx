import Avatar from './Avatar'
import { useState, useRef, useEffect } from 'react'
import { X, Send, MessageSquare, Smile, Paperclip, Reply, Loader2 } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import { getSocket } from '../lib/socket'
import FileAttachment from './FileAttachment'
import AttachMenu from './AttachMenu'
import useChatUpload from '../hooks/useChatUpload'
import toast from 'react-hot-toast'

const CHAT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏', '🤔', '💯']

export default function ChatPanel({ roomId, onClose }) {
  const { user } = useAuthStore()
  const { messages, typingUsers, sendMessage, loadMessages } = useChatStore()
  const [newMessage, setNewMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const emojiPickerRef = useRef(null)

  // File attachment support (uploads scoped to this meeting via roomId)
  const { pendingFile, isUploading, selectFile, clearPending, sendAttachment } = useChatUpload(() => ({ roomId }))

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load messages on mount
  useEffect(() => {
    loadMessages(roomId)
  }, [roomId])

  // Close emoji picker on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) setShowEmojiPicker(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSendMessage = async (e) => {
    e.preventDefault()

    // Attachment-only or attachment+text send
    if (pendingFile) {
      const socket = getSocket()
      const file = await sendAttachment()
      if (!file) {
        toast.error('File upload failed')
        return
      }
      if (socket) {
        const payload = {
          roomId,
          content: newMessage.trim(),
          attachment: {
            fileId: file.id,
            url: file.url,
            name: file.originalName,
            mimeType: file.mimeType,
            size: Number(file.size),
          },
        }
        if (replyingTo) payload.replyTo = replyingTo._id
        socket.emit('chat:send', payload)
      }
      clearPending()
      setNewMessage('')
      setReplyingTo(null)
      handleStopTyping()
      return
    }

    if (!newMessage.trim()) return

    const socket = getSocket()
    if (socket) {
      const payload = { roomId, content: newMessage.trim() }
      if (replyingTo) payload.replyTo = replyingTo._id
      socket.emit('chat:send', payload)
    }

    setNewMessage('')
    setReplyingTo(null)
    handleStopTyping()
  }

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true)
      const socket = getSocket()
      if (socket) socket.emit('chat:typing', { roomId, isTyping: true })
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => handleStopTyping(), 2000)
  }

  const handleStopTyping = () => {
    setIsTyping(false)
    const socket = getSocket()
    if (socket) socket.emit('chat:typing', { roomId, isTyping: false })
  }

  const insertEmoji = (emoji) => {
    setNewMessage(prev => prev + emoji)
    setShowEmojiPicker(false)
  }

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="side-panel bg-dark-200 border-l border-white/[0.06]">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2.5"><span className="w-8 h-8 rounded-lg bg-primary-500/15 text-primary-400 flex items-center justify-center"><MessageSquare className="w-4 h-4" /></span> Chat</h2>
        <button aria-label="Close" onClick={onClose} className="p-1 hover:bg-dark-400 rounded transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center text-center text-gray-400 text-sm py-12 gap-3">
            <span className="w-12 h-12 rounded-full bg-dark-300 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-gray-500" /></span>
            No messages yet.<br />Start the conversation
          </div>
        ) : (
          messages.map((message) => {
            const msgUserId = message.sender?.id || message.sender?._id
            const curUserId = user?.id || user?._id
            const isOwn = msgUserId === curUserId || message.sender === curUserId
            
            return (
              <div key={message._id} className={`group flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex flex-col min-w-0 max-w-[88%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {!isOwn && (
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar user={message.sender} size="xs" />
                      <span className="text-xs text-gray-400">{message.sender.name}</span>
                    </div>
                  )}

                  {/* Reply preview */}
                  {message.replyTo && (
                    <div className={`text-xs px-2 py-1 mb-0.5 rounded-t-lg border-l-2 border-primary-500 bg-dark-400/50 ${isOwn ? 'text-right' : ''}`}>
                      <span className="text-gray-500">
                        {typeof message.replyTo === 'object' ? message.replyTo.content?.slice(0, 50) : 'Reply'}
                      </span>
                    </div>
                  )}

                  <div className="relative">
                    <div className={`chat-message !max-w-full !mb-0 !px-3.5 !py-2.5 ${isOwn ? 'own' : 'other'}`}>
                      {message.type === 'file' && message.fileUrl ? (
                        <FileAttachment
                          fileUrl={message.fileUrl}
                          fileName={message.fileName}
                          fileType={message.fileType}
                          fileSize={message.fileSize}
                        />
                      ) : (
                        <p className="text-[15px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]">
                          {message.isDeleted ? (
                            <span className="italic text-gray-400">{message.content}</span>
                          ) : (
                            message.content
                          )}
                        </p>
                      )}
                      <span className={`text-[11px] mt-1 block text-right ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>{formatTime(message.createdAt)}</span>
                    </div>

                    {/* Reply button on hover */}
                    <button onClick={() => setReplyingTo(message)}
                      className="absolute -top-2 right-0 hidden group-hover:flex [@media(hover:none)]:flex p-1 bg-dark-300 rounded hover:bg-dark-400 transition-colors">
                      <Reply className="w-3 h-3 text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="text-sm text-gray-400 italic">
            {typingUsers.map(u => u.userName).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply preview bar */}
      {replyingTo && (
        <div className="px-4 py-2 bg-dark-300 border-t border-dark-400 flex items-center gap-2">
          <Reply className="w-4 h-4 text-primary-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-primary-400 font-medium">
              Replying to {replyingTo.sender?.name || 'message'}
            </p>
            <p className="text-xs text-gray-400 truncate">{replyingTo.content}</p>
          </div>
          <button aria-label="Cancel reply" onClick={() => setReplyingTo(null)} className="p-0.5 hover:bg-dark-400 rounded">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Pending attachment preview bar */}
      {pendingFile && (
        <div className="px-4 py-2 bg-dark-300 border-t border-dark-400 flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-primary-400 flex-shrink-0" />
          <span className="flex-1 min-w-0 text-xs text-gray-300 truncate">{pendingFile.name}</span>
          {isUploading ? (
            <Loader2 className="w-4 h-4 text-primary-300 animate-spin" />
          ) : (
            <button aria-label="Remove attachment" onClick={clearPending} className="p-0.5 hover:bg-dark-400 rounded">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-1 bg-dark-300 border border-white/[0.06] rounded-full pl-1.5 pr-1.5 py-1.5 focus-within:border-primary-500/70 transition-colors">
          <div className="relative" ref={emojiPickerRef}>
            <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 hover:bg-dark-400 rounded-full transition-colors" title="Emoji">
              <Smile className="w-5 h-5 text-gray-400" />
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-full mb-3 left-0 bg-dark-300 border border-white/[0.06] rounded-xl p-2 grid grid-cols-5 gap-1 min-w-[180px] z-20">
                {CHAT_EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => insertEmoji(emoji)}
                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-dark-400 rounded transition-colors">
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <AttachMenu onFile={selectFile} disabled={isUploading} />
          <input
            type="text"
            value={newMessage}
            onChange={(e) => { setNewMessage(e.target.value); handleTyping() }}
            placeholder="Message"
            className="flex-1 min-w-0 bg-transparent px-1 py-1 text-sm focus:outline-none placeholder:text-gray-500"
          />
          <button type="submit" disabled={(!newMessage.trim() && !pendingFile) || isUploading}
            aria-label="Send message"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-primary-500 hover:from-primary-400 hover:to-primary-600 text-ink transition-colors disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed">
            <Send className="w-4 h-4 -ml-0.5" />
          </button>
        </div>
      </form>
    </div>
  )
}
