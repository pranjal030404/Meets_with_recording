import { useState, useRef, useEffect } from 'react'
import { X, Send, Smile } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import { getSocket } from '../lib/socket'

export default function ChatPanel({ roomId, onClose }) {
  const { user } = useAuthStore()
  const { messages, typingUsers, sendMessage, loadMessages } = useChatStore()
  const [newMessage, setNewMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load messages on mount
  useEffect(() => {
    loadMessages(roomId)
  }, [roomId])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    
    if (!newMessage.trim()) return

    const socket = getSocket()
    if (socket) {
      socket.emit('chat:send', {
        roomId,
        content: newMessage.trim()
      })
    }

    setNewMessage('')
    handleStopTyping()
  }

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true)
      const socket = getSocket()
      if (socket) {
        socket.emit('chat:typing', { roomId, isTyping: true })
      }
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping()
    }, 2000)
  }

  const handleStopTyping = () => {
    setIsTyping(false)
    const socket = getSocket()
    if (socket) {
      socket.emit('chat:typing', { roomId, isTyping: false })
    }
  }

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="w-80 bg-dark-200 border-l border-dark-400 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-dark-400 flex items-center justify-between">
        <h2 className="font-semibold">Chat</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-dark-400 rounded transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.sender._id === user._id || message.sender === user._id
            
            return (
              <div
                key={message._id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] ${isOwn ? 'order-2' : ''}`}>
                  {!isOwn && (
                    <div className="flex items-center gap-2 mb-1">
                      <img
                        src={message.sender.avatar}
                        alt={message.sender.name}
                        className="w-5 h-5 rounded-full"
                      />
                      <span className="text-xs text-gray-400">
                        {message.sender.name}
                      </span>
                    </div>
                  )}
                  <div
                    className={`chat-message ${isOwn ? 'own' : 'other'}`}
                  >
                    <p className="text-sm break-words">
                      {message.isDeleted ? (
                        <span className="italic text-gray-400">{message.content}</span>
                      ) : (
                        message.content
                      )}
                    </p>
                    <span className="text-xs text-gray-400 mt-1 block">
                      {formatTime(message.createdAt)}
                    </span>
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

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-dark-400">
        <div className="flex gap-2">
          <button
            type="button"
            className="p-2 hover:bg-dark-400 rounded-lg transition-colors"
          >
            <Smile className="w-5 h-5 text-gray-400" />
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value)
              handleTyping()
            }}
            placeholder="Type a message..."
            className="flex-1 bg-dark-300 border border-dark-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  )
}
