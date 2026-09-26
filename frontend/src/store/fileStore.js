import { create } from 'zustand';
import api from '../lib/api';

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export { formatBytes };

export const useFileStore = create((set, get) => ({
  files: [],
  trash: [],
  storage: { personalBytes: 0 },
  isLoading: false,
  isUploading: false,
  error: null,

  fetchFiles: async ({ scope = 'mine', teamId, search } = {}) => {
    set({ isLoading: true, error: null });
    try {
      const params = { scope };
      if (teamId) params.teamId = teamId;
      if (search) params.search = search;
      const res = await api.get('/files', { params });
      set({ files: res.data.data.files, isLoading: false });
      return { success: true };
    } catch (error) {
      set({ isLoading: false, error: error.response?.data?.message || 'Failed to load files' });
      return { success: false, message: error.response?.data?.message || 'Failed to load files' };
    }
  },

  fetchStorage: async () => {
    try {
      const res = await api.get('/files/storage/summary');
      set({ storage: res.data.data });
    } catch { /* non-fatal */ }
  },

  upload: async (file, { teamId, conversationId } = {}) => {
    set({ isUploading: true });
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (teamId) formData.append('teamId', teamId);
      if (conversationId) formData.append('conversationId', conversationId);

      const res = await api.post('/files/upload', formData);
      const entry = res.data.data.file;
      set(state => ({
        isUploading: false,
        files: [entry, ...state.files],
        storage: { ...state.storage, personalBytes: (state.storage.personalBytes || 0) + Number(entry.size || 0) }
      }));
      return { success: true, file: entry };
    } catch (error) {
      set({ isUploading: false });
      return { success: false, message: error.response?.data?.message || 'Failed to upload file' };
    }
  },

  deleteFile: async (fileId) => {
    try {
      await api.delete(`/files/${fileId}`);
      set(state => ({
        files: state.files.filter(f => f.id !== fileId),
        trash: state.trash.filter(f => f.id !== fileId)
      }));
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to delete file' };
    }
  },

  restoreFile: async (fileId) => {
    try {
      await api.put(`/files/${fileId}/restore`);
      set(state => ({ trash: state.trash.filter(f => f.id !== fileId) }));
      get().fetchFiles({ scope: 'mine' });
      get().fetchStorage();
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to restore file' };
    }
  },

  fetchTrash: async () => {
    try {
      const res = await api.get('/files/trash/list');
      set({ trash: res.data.data.files });
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to load trash' };
    }
  },

  downloadUrl: (fileId) => `${api.defaults.baseURL}/files/${fileId}/download`
}));
