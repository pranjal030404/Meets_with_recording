import { create } from 'zustand';
import api from '../lib/api';

const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  // Fetch notifications
  fetchNotifications: async (unreadOnly = false) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/notifications', {
        params: { unreadOnly, limit: 50 }
      });
      
      set({
        notifications: response.data.data.notifications,
        unreadCount: response.data.data.unreadCount,
        loading: false
      });
      return response.data.data;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch notifications', 
        loading: false 
      });
      throw error;
    }
  },

  // Mark notification as read
  markAsRead: async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      
      set(state => ({
        notifications: state.notifications.map(n => 
          n._id === notificationId ? { ...n, isRead: true, readAt: new Date() } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1)
      }));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  },

  // Mark all as read
  markAllAsRead: async () => {
    try {
      await api.put('/notifications/read-all');
      
      set(state => ({
        notifications: state.notifications.map(n => ({ ...n, isRead: true, readAt: new Date() })),
        unreadCount: 0
      }));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  },

  // Delete notification
  deleteNotification: async (notificationId) => {
    try {
      await api.delete(`/notifications/${notificationId}`);
      
      set(state => {
        const notification = state.notifications.find(n => n._id === notificationId);
        return {
          notifications: state.notifications.filter(n => n._id !== notificationId),
          unreadCount: notification && !notification.isRead 
            ? Math.max(0, state.unreadCount - 1) 
            : state.unreadCount
        };
      });
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  },

  // Add new notification (from socket)
  addNotification: (notification) => {
    set(state => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1
    }));
  },

  // Increment unread count
  incrementUnread: () => {
    set(state => ({ unreadCount: state.unreadCount + 1 }));
  },

  // Clear all notifications
  clearNotifications: () => {
    set({ notifications: [], unreadCount: 0 });
  },

  // Clear error
  clearError: () => set({ error: null })
}));

export default useNotificationStore;
