import { create } from 'zustand';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

// Presence: online users + custom statuses
export const usePresenceStore = create((set) => ({
  onlineUserIds: [],
  statuses: {}, // userId -> { customStatus, statusEmoji, statusExpiresAt }

  setOnlineList: (ids) => set({ onlineUserIds: [...new Set(ids)] }),
  addOnline: (userId) => set(state => ({
    onlineUserIds: state.onlineUserIds.includes(userId) ? state.onlineUserIds : [...state.onlineUserIds, userId]
  })),
  removeOnline: (userId) => set(state => ({
    onlineUserIds: state.onlineUserIds.filter(id => id !== userId)
  })),
  setStatus: ({ userId, customStatus, statusEmoji }) => set(state => ({
    statuses: { ...state.statuses, [userId]: { customStatus, statusEmoji } }
  })),

  isOnline: (userId) => get().onlineUserIds.includes(userId),

  updateMyStatus: async ({ customStatus, statusEmoji, statusExpiresAt }) => {
    try {
      const res = await api.put('/auth/status', { customStatus, statusEmoji, statusExpiresAt });
      set(state => ({
        statuses: { ...state.statuses, [res.data.data.user.id]: { customStatus, statusEmoji } }
      }));
      return { success: true, user: res.data.data.user };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to update status' };
    }
  }
}));

// Socket wiring for presence — returns an unbind function
export function bindPresenceSocket(myUserId) {
  const socket = getSocket();
  if (!socket) return () => {};
  const store = usePresenceStore;

  const onList = ({ onlineUserIds }) => store.getState().setOnlineList(onlineUserIds || []);
  const onOnline = ({ userId }) => { if (userId !== myUserId) store.getState().addOnline(userId); };
  const onOffline = ({ userId }) => store.getState().removeOnline(userId);
  const onStatus = (payload) => store.getState().setStatus(payload);

  socket.on('presence:list', onList);
  socket.on('presence:online', onOnline);
  socket.on('presence:offline', onOffline);
  socket.on('presence:status', onStatus);

  return () => {
    socket.off('presence:list', onList);
    socket.off('presence:online', onOnline);
    socket.off('presence:offline', onOffline);
    socket.off('presence:status', onStatus);
  };
}
