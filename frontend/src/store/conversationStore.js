import { create } from 'zustand';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

// Workspace chat: DMs & group conversations + threads
export const useConversationStore = create((set, get) => ({
  conversations: [],
  contacts: [],
  activeId: null,
  messages: {}, // conversationId -> Message[]
  threads: {}, // rootMessageId -> { root, replies: [] }
  typingUsers: {}, // conversationId -> { userId: { name, since } }
  isLoading: false,
  isLoadingMessages: false,
  error: null,
  _typingTimers: {},

  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get('/conversations');
      set({ conversations: res.data.data.conversations, isLoading: false });
      return { success: true };
    } catch (error) {
      set({ isLoading: false, error: error.response?.data?.message || 'Failed to load conversations' });
      return { success: false, message: error.response?.data?.message || 'Failed to load conversations' };
    }
  },

  fetchContacts: async () => {
    try {
      const res = await api.get('/conversations/people/contacts');
      set({ contacts: res.data.data.contacts });
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to load contacts' };
    }
  },

  openConversation: async (conversationId) => {
    const prev = get().activeId;
    if (prev && prev !== conversationId) {
      getSocket()?.emit('conversation:leave', { conversationId: prev });
    }
    set({ activeId: conversationId, isLoadingMessages: true });

    try {
      getSocket()?.emit('conversation:join', { conversationId }, (ack) => {
        if (ack && !ack.success) console.warn('conversation join:', ack.error);
      });

      const [convRes] = await Promise.all([
        api.get(`/conversations/${conversationId}`),
        get().fetchMessages(conversationId)
      ]);

      const conversations = get().conversations.map(c =>
        c.id === conversationId ? { ...c, ...convRes.data.data.conversation, unreadCount: 0 } : c
      );
      if (!conversations.find(c => c.id === conversationId)) {
        conversations.unshift({ ...convRes.data.data.conversation, unreadCount: 0 });
      }
      set({ conversations, isLoadingMessages: false });
      get().markRead(conversationId);
      return { success: true, conversation: convRes.data.data.conversation };
    } catch (error) {
      set({ isLoadingMessages: false });
      return { success: false, message: error.response?.data?.message || 'Failed to open conversation' };
    }
  },

  fetchMessages: async (conversationId) => {
    try {
      const res = await api.get(`/conversations/${conversationId}/messages`);
      set(state => ({ messages: { ...state.messages, [conversationId]: res.data.data.messages } }));
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to load messages' };
    }
  },

  markRead: async (conversationId) => {
    try {
      await api.put(`/conversations/${conversationId}/read`);
      set(state => ({
        conversations: state.conversations.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c)
      }));
    } catch { /* non-fatal */ }
  },

  sendMessage: async (conversationId, payload) => {
    try {
      const res = await api.post(`/conversations/${conversationId}/messages`, payload);
      get().addMessage(res.data.data.message);
      return { success: true, message: res.data.data.message };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to send message' };
    }
  },

  addMessage: (message) => {
    const cid = message.conversationId;
    if (!cid) return;
    set(state => {
      const list = state.messages[cid] || [];
      if (list.some(m => m.id === message.id)) return state;
      const isActive = state.activeId === cid;
      const isMine = message.senderId === state._myId;
      return {
        messages: { ...state.messages, [cid]: [...list, message] },
        conversations: state.conversations.map(c => c.id === cid
          ? {
              ...c,
              lastMessagePreview: (message.content || '').slice(0, 190),
              lastMessageAt: message.createdAt,
              unreadCount: (isActive || isMine) ? c.unreadCount : (c.unreadCount || 0) + 1
            }
          : c
        )
      };
    });
    if (get().activeId === cid) get().markRead(cid);
  },

  // Realtime: a message arrived in a conversation that may not be open
  handleIncoming: (message) => {
    const cid = message.conversationId;
    if (!cid) return;
    if (get().messages[cid]) {
      get().addMessage(message);
    } else {
      set(state => ({
        conversations: state.conversations.map(c =>
          c.id === cid
            ? { ...c, lastMessagePreview: (message.content || '').slice(0, 190), lastMessageAt: message.createdAt, unreadCount: (c.unreadCount || 0) + 1 }
            : c
        )
      }));
    }
  },

  handleActivity: ({ conversationId, lastMessagePreview, lastMessageAt }) => {
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId
          ? { ...c, lastMessagePreview, lastMessageAt, unreadCount: state.activeId === conversationId ? c.unreadCount : (c.unreadCount || 0) + 1 }
          : c
      )
    }));
  },

  updateMessage: (message) => {
    set(state => {
      const messages = { ...state.messages };
      for (const [cid, list] of Object.entries(messages)) {
        if (list.some(m => m.id === message.id)) {
          messages[cid] = list.map(m => (m.id === message.id ? message : m));
        }
      }
      const threads = { ...state.threads };
      for (const [rootId, thread] of Object.entries(threads)) {
        if (thread.root?.id === message.id) threads[rootId] = { ...thread, root: message };
        if (thread.replies?.some(m => m.id === message.id)) {
          threads[rootId] = { ...thread, replies: thread.replies.map(m => (m.id === message.id ? message : m)) };
        }
      }
      return { messages, threads };
    });
  },

  removeMessage: ({ messageId, threadRootId }) => {
    set(state => {
      const messages = { ...state.messages };
      for (const [cid, list] of Object.entries(messages)) {
        if (list.some(m => m.id === messageId)) {
          messages[cid] = list.map(m => (m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m));
        }
      }
      const threads = { ...state.threads };
      if (threadRootId && threads[threadRootId]) {
        threads[threadRootId] = {
          ...threads[threadRootId],
          replies: threads[threadRootId].replies.map(m => (m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m))
        };
      }
      return { messages, threads };
    });
  },

  setTyping: (conversationId, userId, userName, isTyping) => {
    set(state => {
      const current = { ...(state.typingUsers[conversationId] || {}) };
      if (isTyping) {
        current[userId] = { name: userName, since: Date.now() };
      } else {
        delete current[userId];
      }
      return { typingUsers: { ...state.typingUsers, [conversationId]: current } };
    });

    // Auto-expire stale typing states
    const timerKey = `${conversationId}:${userId}`;
    const timers = get()._typingTimers;
    if (timers[timerKey]) clearTimeout(timers[timerKey]);
    if (isTyping) {
      const t = setTimeout(() => {
        set(state => {
          const current = { ...(state.typingUsers[conversationId] || {}) };
          delete current[userId];
          return { typingUsers: { ...state.typingUsers, [conversationId]: current } };
        });
      }, 4000);
      set({ _typingTimers: { ...get()._typingTimers, [timerKey]: t } });
    }
  },

  emitTyping: (conversationId, isTyping) => {
    getSocket()?.emit('conversation:typing', { conversationId, isTyping });
  },

  toggleReaction: async (messageId, emoji) => {
    try {
      const res = await api.post(`/messages/${messageId}/react`, { emoji });
      get().updateMessage(res.data.data.message);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to react' };
    }
  },

  editMessage: async (messageId, content) => {
    try {
      const res = await api.put(`/messages/${messageId}`, { content });
      get().updateMessage(res.data.data.message);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to edit message' };
    }
  },

  deleteMessage: async (messageId) => {
    try {
      await api.delete(`/messages/${messageId}`);
      get().removeMessage({ messageId });
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to delete message' };
    }
  },

  togglePin: async (messageId) => {
    try {
      const res = await api.put(`/messages/${messageId}/pin`);
      get().updateMessage(res.data.data.message);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to pin message' };
    }
  },

  toggleSave: async (messageId) => {
    try {
      const res = await api.post(`/messages/${messageId}/save`);
      return { success: true, saved: res.data.data.saved };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to save message' };
    }
  },

  forwardMessage: async (messageId, target) => {
    try {
      await api.post(`/messages/${messageId}/forward`, target);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to forward message' };
    }
  },

  loadThread: async (rootId) => {
    try {
      const res = await api.get(`/messages/${rootId}/thread`);
      set(state => ({ threads: { ...state.threads, [rootId]: { root: res.data.data.root, replies: res.data.data.replies } } }));
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to load thread' };
    }
  },

  sendThreadReply: async (rootId, content) => {
    try {
      const res = await api.post(`/messages/${rootId}/replies`, { content });
      const reply = res.data.data.reply;
      set(state => {
        const thread = state.threads[rootId];
        const threads = { ...state.threads };
        if (thread) threads[rootId] = { ...thread, replies: [...thread.replies, reply] };
        return { threads };
      });
      // Bump reply count on the root message wherever it appears
      set(state => {
        const messages = { ...state.messages };
        for (const [cid, list] of Object.entries(messages)) {
          if (list.some(m => m.id === rootId)) {
            messages[cid] = list.map(m => (m.id === rootId ? { ...m, replyCount: (m.replyCount || 0) + 1 } : m));
          }
        }
        return { messages };
      });
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to reply' };
    }
  },

  addThreadReply: ({ rootId, reply }) => {
    set(state => {
      const threads = { ...state.threads };
      if (threads[rootId] && !threads[rootId].replies.some(m => m.id === reply.id)) {
        threads[rootId] = { ...threads[rootId], replies: [...threads[rootId].replies, reply] };
      }
      const messages = { ...state.messages };
      for (const [cid, list] of Object.entries(messages)) {
        if (list.some(m => m.id === rootId)) {
          messages[cid] = list.map(m => (m.id === rootId ? { ...m, replyCount: (m.replyCount || 0) + 1 } : m));
        }
      }
      return { threads, messages };
    });
  },

  startDirect: async (userId) => {
    try {
      const res = await api.post('/conversations', { type: 'direct', userId });
      const conversation = res.data.data.conversation;
      set(state => ({
        conversations: state.conversations.some(c => c.id === conversation.id)
          ? state.conversations
          : [conversation, ...state.conversations]
      }));
      return { success: true, conversation };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to start conversation' };
    }
  },

  createGroup: async (name, userIds) => {
    try {
      const res = await api.post('/conversations', { type: 'group', name, userIds });
      const conversation = res.data.data.conversation;
      set(state => ({ conversations: [conversation, ...state.conversations] }));
      return { success: true, conversation };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to create group' };
    }
  },

  totalUnread: () => {
    return get().conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  },

  clearActive: () => {
    const activeId = get().activeId;
    if (activeId) getSocket()?.emit('conversation:leave', { conversationId: activeId });
    set({ activeId: null });
  }
}));

// Socket wiring — returns an unbind function
export function bindConversationSocket(store) {
  const socket = getSocket();
  if (!socket) return () => {};

  const onMessage = (message) => store.getState().handleIncoming(message);
  const onActivity = (payload) => store.getState().handleActivity(payload);
  const onTyping = ({ conversationId, userId, userName, isTyping }) =>
    store.getState().setTyping(conversationId, userId, userName, isTyping);
  const onUpdated = (message) => store.getState().updateMessage(message);
  const onDeleted = (payload) => store.getState().removeMessage(payload);
  const onThreadReply = ({ rootId, reply }) => store.getState().addThreadReply({ rootId, reply });
  const onNewConversation = () => store.getState().fetchConversations();

  socket.on('conversation:message', onMessage);
  socket.on('conversation:activity', onActivity);
  socket.on('conversation:user-typing', onTyping);
  socket.on('message:updated', onUpdated);
  socket.on('message:deleted', onDeleted);
  socket.on('thread:reply', onThreadReply);
  socket.on('conversation:new', onNewConversation);

  return () => {
    socket.off('conversation:message', onMessage);
    socket.off('conversation:activity', onActivity);
    socket.off('conversation:user-typing', onTyping);
    socket.off('message:updated', onUpdated);
    socket.off('message:deleted', onDeleted);
    socket.off('thread:reply', onThreadReply);
    socket.off('conversation:new', onNewConversation);
  };
}
