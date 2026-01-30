import { create } from 'zustand'
import api from '../lib/api'

export const useChatStore = create((set, get) => ({
  messages: [],
  isLoading: false,
  unreadCount: 0,
  typingUsers: [],

  loadMessages: async (roomId) => {
    set({ isLoading: true })
    try {
      const response = await api.get(`/chat/${roomId}/messages`)
      const { messages } = response.data.data

      set({ messages, isLoading: false })
      return { success: true }
    } catch (error) {
      set({ isLoading: false })
      return { success: false, message: error.response?.data?.message }
    }
  },

  addMessage: (message) => {
    const { messages } = get()
    set({ messages: [...messages, message] })
  },

  sendMessage: async (roomId, content, recipientId = null) => {
    try {
      const response = await api.post(`/chat/${roomId}/messages`, {
        content,
        recipientId
      })
      return { success: true, message: response.data.data.message }
    } catch (error) {
      return { success: false, message: error.response?.data?.message }
    }
  },

  deleteMessage: async (messageId) => {
    try {
      await api.delete(`/chat/messages/${messageId}`)
      const { messages } = get()
      set({
        messages: messages.map(m =>
          m._id === messageId
            ? { ...m, isDeleted: true, content: 'This message was deleted' }
            : m
        )
      })
      return { success: true }
    } catch (error) {
      return { success: false, message: error.response?.data?.message }
    }
  },

  addReaction: async (messageId, emoji) => {
    try {
      const response = await api.post(`/chat/messages/${messageId}/react`, { emoji })
      const { message } = response.data.data

      const { messages } = get()
      set({
        messages: messages.map(m => m._id === messageId ? message : m)
      })
      return { success: true }
    } catch (error) {
      return { success: false, message: error.response?.data?.message }
    }
  },

  setTypingUser: (userId, userName, isTyping) => {
    const { typingUsers } = get()
    
    if (isTyping) {
      const exists = typingUsers.find(u => u.userId === userId)
      if (!exists) {
        set({ typingUsers: [...typingUsers, { userId, userName }] })
      }
    } else {
      set({ typingUsers: typingUsers.filter(u => u.userId !== userId) })
    }
  },

  incrementUnread: () => {
    set({ unreadCount: get().unreadCount + 1 })
  },

  clearUnread: () => {
    set({ unreadCount: 0 })
  },

  clearMessages: () => {
    set({ messages: [], unreadCount: 0, typingUsers: [] })
  }
}))
