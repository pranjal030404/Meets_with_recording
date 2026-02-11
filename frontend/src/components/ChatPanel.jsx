import { useState, useRef, useEffect } from 'react'
import { X, Send, Smile, Paperclip, Reply } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import { getSocket } from '../lib/socket'

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
    <div className="w-80 bg-dark-200 border-l border-dark-400 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-dark-400 flex items-center justify-between">
        <h2 className="font-semibold">Chat</h2>
        <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.sender._id === user._id || message.sender === user._id
            
            return (
              <div key={message._id} className={`group flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${isOwn ? 'order-2' : ''}`}>
                  {!isOwn && (
                    <div className="flex items-center gap-2 mb-1">
                      <img src={message.sender.avatar} alt={message.sender.name} className="w-5 h-5 rounded-full" />
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
                    <div className={`chat-message ${isOwn ? 'own' : 'other'}`}>
                      <p className="text-sm break-words">
                        {message.isDeleted ? (
                          <span className="italic text-gray-400">{message.content}</span>
                        ) : (
                          message.content
                        )}
                      </p>
                      <span className="text-xs text-gray-400 mt-1 block">{formatTime(message.createdAt)}</span>
                    </div>

                    {/* Reply button on hover */}
                    <button onClick={() => setReplyingTo(message)}
                      className="absolute -top-2 right-0 hidden group-hover:flex p-1 bg-dark-300 rounded shadow-lg hover:bg-dark-400 transition-colors">
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
          <button onClick={() => setReplyingTo(null)} className="p-0.5 hover:bg-dark-400 rounded">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-dark-400">
        <div className="flex gap-2 items-end">
          <div className="relative" ref={emojiPickerRef}>
            <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2 hover:bg-dark-400 rounded-lg transition-colors">
              <Smile className="w-5 h-5 text-gray-400" />
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-full mb-2 left-0 bg-dark-300 rounded-lg shadow-xl p-2 grid grid-cols-5 gap-1 min-w-[180px] z-20">
                {CHAT_EMOJIS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => insertEmoji(emoji)}
                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-dark-400 rounded transition-colors">
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => { setNewMessage(e.target.value); handleTyping() }}
            placeholder="Type a message..."
            className="flex-1 bg-dark-300 border border-dark-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
          />
          <button type="submit" disabled={!newMessage.trim()}
            className="p-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  )
}
