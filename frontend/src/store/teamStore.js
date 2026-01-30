import { create } from 'zustand';
import api from '../lib/api';

const useTeamStore = create((set, get) => ({
  teams: [],
  currentTeam: null,
  teamMembers: [],
  teamMessages: {},
  loading: false,
  error: null,

  // Fetch all user teams
  fetchTeams: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/teams');
      set({ teams: response.data, loading: false });
      return response.data;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to fetch teams', loading: false });
      throw error;
    }
  },

  // Fetch team by ID
  fetchTeam: async (teamId) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/teams/${teamId}`);
      set({ currentTeam: response.data, teamMembers: response.data.members, loading: false });
      return response.data;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to fetch team', loading: false });
      throw error;
    }
  },

  // Create a new team
  createTeam: async (teamData) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/teams', teamData);
      const newTeam = response.data;
      set(state => ({ 
        teams: [newTeam, ...state.teams],
        loading: false 
      }));
      return newTeam;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to create team', loading: false });
      throw error;
    }
  },

  // Update team
  updateTeam: async (teamId, updates) => {
    set({ loading: true, error: null });
    try {
      const response = await api.put(`/teams/${teamId}`, updates);
      const updatedTeam = response.data;
      
      set(state => ({
        teams: state.teams.map(t => t._id === teamId ? updatedTeam : t),
        currentTeam: state.currentTeam?._id === teamId ? updatedTeam : state.currentTeam,
        loading: false
      }));
      return updatedTeam;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to update team', loading: false });
      throw error;
    }
  },

  // Delete team
  deleteTeam: async (teamId) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/teams/${teamId}`);
      set(state => ({
        teams: state.teams.filter(t => t._id !== teamId),
        currentTeam: state.currentTeam?._id === teamId ? null : state.currentTeam,
        loading: false
      }));
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to delete team', loading: false });
      throw error;
    }
  },

  // Invite member to team
  inviteMember: async (teamId, email, role = 'member') => {
    try {
      const response = await api.post(`/teams/${teamId}/invite`, { email, role });
      const updatedTeam = response.data.team;
      
      set(state => ({
        teams: state.teams.map(t => t._id === teamId ? updatedTeam : t),
        currentTeam: state.currentTeam?._id === teamId ? updatedTeam : state.currentTeam,
        teamMembers: updatedTeam.members
      }));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Join team by invite code
  joinTeam: async (inviteCode) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post(`/teams/join/${inviteCode}`);
      const team = response.data.team;
      
      set(state => ({
        teams: [team, ...state.teams],
        loading: false
      }));
      return response.data;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to join team', loading: false });
      throw error;
    }
  },

  // Update member role
  updateMemberRole: async (teamId, userId, role) => {
    try {
      const response = await api.put(`/teams/${teamId}/members/${userId}/role`, { role });
      const updatedTeam = response.data.team;
      
      set(state => ({
        teams: state.teams.map(t => t._id === teamId ? updatedTeam : t),
        currentTeam: state.currentTeam?._id === teamId ? updatedTeam : state.currentTeam,
        teamMembers: updatedTeam.members
      }));
    } catch (error) {
      throw error;
    }
  },

  // Remove member from team
  removeMember: async (teamId, userId) => {
    try {
      const response = await api.delete(`/teams/${teamId}/members/${userId}`);
      const updatedTeam = response.data.team;
      
      set(state => ({
        teams: state.teams.map(t => t._id === teamId ? updatedTeam : t),
        currentTeam: state.currentTeam?._id === teamId ? updatedTeam : state.currentTeam,
        teamMembers: updatedTeam.members
      }));
    } catch (error) {
      throw error;
    }
  },

  // Leave team
  leaveTeam: async (teamId, userId) => {
    try {
      await api.delete(`/teams/${teamId}/members/${userId}`);
      set(state => ({
        teams: state.teams.filter(t => t._id !== teamId),
        currentTeam: state.currentTeam?._id === teamId ? null : state.currentTeam
      }));
    } catch (error) {
      throw error;
    }
  },

  // Fetch team messages
  fetchTeamMessages: async (teamId, channelType = 'general') => {
    try {
      const response = await api.get(`/chat/team/${teamId}/messages`, {
        params: { channelType, limit: 100 }
      });
      
      set(state => ({
        teamMessages: {
          ...state.teamMessages,
          [`${teamId}-${channelType}`]: response.data.data.messages
        }
      }));
      return response.data.data.messages;
    } catch (error) {
      throw error;
    }
  },

  // Send team message
  sendTeamMessage: async (teamId, channelType, content, type = 'text', meetingId = null) => {
    try {
      const response = await api.post(`/chat/team/${teamId}/messages`, {
        content,
        channelType,
        type,
        meetingId
      });
      
      const message = response.data.data.message;
      const key = `${teamId}-${channelType}`;
      
      set(state => ({
        teamMessages: {
          ...state.teamMessages,
          [key]: [...(state.teamMessages[key] || []), message]
        }
      }));
      return message;
    } catch (error) {
      throw error;
    }
  },

  // Add message to store (from socket)
  addTeamMessage: (teamId, channelType, message) => {
    const key = `${teamId}-${channelType}`;
    set(state => ({
      teamMessages: {
        ...state.teamMessages,
        [key]: [...(state.teamMessages[key] || []), message]
      }
    }));
  },

  // Regenerate invite code
  regenerateInviteCode: async (teamId) => {
    try {
      const response = await api.post(`/teams/${teamId}/regenerate-code`);
      const newCode = response.data.inviteCode;
      
      set(state => ({
        teams: state.teams.map(t => 
          t._id === teamId ? { ...t, inviteCode: newCode } : t
        ),
        currentTeam: state.currentTeam?._id === teamId 
          ? { ...state.currentTeam, inviteCode: newCode } 
          : state.currentTeam
      }));
      return newCode;
    } catch (error) {
      throw error;
    }
  },

  // Clear current team
  clearCurrentTeam: () => set({ currentTeam: null, teamMembers: [] }),

  // Clear error
  clearError: () => set({ error: null })
}));

export default useTeamStore;
