import { create } from 'zustand';
import api from '../lib/api';

export const useTaskStore = create((set, get) => ({
  tasks: [],
  stats: { todo: 0, inProgress: 0, done: 0, overdue: 0 },
  teams: [], // teams for scoping/assignment
  isLoading: false,
  error: null,

  fetchTasks: async ({ scope = 'mine', teamId, status, priority } = {}) => {
    set({ isLoading: true, error: null });
    try {
      const params = { scope };
      if (teamId) params.teamId = teamId;
      if (status && status !== 'all') params.status = status;
      if (priority && priority !== 'all') params.priority = priority;
      const res = await api.get('/tasks', { params });
      set({ tasks: res.data.data.tasks, isLoading: false });
      return { success: true };
    } catch (error) {
      set({ isLoading: false, error: error.response?.data?.message || 'Failed to load tasks' });
      return { success: false, message: error.response?.data?.message || 'Failed to load tasks' };
    }
  },

  fetchStats: async () => {
    try {
      const res = await api.get('/tasks/stats/summary');
      set({ stats: res.data.data });
    } catch { /* non-fatal */ }
  },

  fetchTeams: async () => {
    try {
      const res = await api.get('/teams');
      set({ teams: res.data.data.teams || res.data.data });
    } catch { /* non-fatal */ }
  },

  createTask: async (payload) => {
    try {
      const res = await api.post('/tasks', payload);
      set(state => ({ tasks: [res.data.data.task, ...state.tasks] }));
      get().fetchStats();
      return { success: true, task: res.data.data.task };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to create task' };
    }
  },

  updateTask: async (taskId, updates) => {
    try {
      const res = await api.put(`/tasks/${taskId}`, updates);
      const updated = res.data.data.task;
      set(state => ({
        tasks: state.tasks.map(t => (t.id === taskId ? updated : t))
      }));
      get().fetchStats();
      return { success: true, task: updated };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to update task' };
    }
  },

  deleteTask: async (taskId) => {
    try {
      await api.delete(`/tasks/${taskId}`);
      set(state => ({ tasks: state.tasks.filter(t => t.id !== taskId) }));
      get().fetchStats();
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to delete task' };
    }
  },

  fetchSubtasks: async (taskId) => {
    try {
      const res = await api.get(`/tasks/${taskId}`);
      return { success: true, ...res.data.data };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to load subtasks' };
    }
  },

  createSubtask: async (taskId, title) => {
    try {
      const res = await api.post(`/tasks/${taskId}/subtasks`, { title });
      return { success: true, subtask: res.data.data.subtask };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to create subtask' };
    }
  }
}));
