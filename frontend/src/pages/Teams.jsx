import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Settings, LogOut, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import useTeamStore from '../store/teamStore';
import { useAuthStore } from '../store/authStore';

const Teams = () => {
  const navigate = useNavigate();
  const { teams, loading, fetchTeams, createTeam, joinTeam, leaveTeam } = useTeamStore();
  const { user } = useAuthStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newTeamData, setNewTeamData] = useState({ name: '', description: '' });
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    try {
      const team = await createTeam(newTeamData);
      toast.success('Team created successfully!');
      setShowCreateModal(false);
      setNewTeamData({ name: '', description: '' });
      navigate(`/teams/${team._id}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create team');
    }
  };

  const handleJoinTeam = async (e) => {
    e.preventDefault();
    try {
      const result = await joinTeam(inviteCode);
      toast.success(`Joined ${result.team.name}!`);
      setShowJoinModal(false);
      setInviteCode('');
      navigate(`/teams/${result.team._id}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Invalid invite code');
    }
  };

  const handleLeaveTeam = async (teamId, teamName) => {
    if (window.confirm(`Are you sure you want to leave "${teamName}"?`)) {
      try {
        await leaveTeam(teamId, user._id);
        toast.success('Left team successfully');
      } catch (error) {
        toast.error('Failed to leave team');
      }
    }
  };

  if (loading && teams.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading teams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-100 px-4 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Teams</h1>
            <p className="text-gray-400 mt-2">Manage your team workspaces</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowJoinModal(true)}
              className="btn btn-secondary"
            >
              <Users className="w-5 h-5" />
              Join Team
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              <Plus className="w-5 h-5" />
              Create Team
            </button>
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="text-center py-16 bg-dark-200 rounded-2xl border border-dark-400">
            <Users className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No teams yet</h3>
            <p className="text-gray-400 mb-6">Create a team or join one using an invite code</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
              >
                Create Your First Team
              </button>
              <button
                onClick={() => setShowJoinModal(true)}
                className="btn btn-secondary"
              >
                Join a Team
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map(team => (
              <div key={team._id} className="bg-dark-200 rounded-2xl p-6 border border-dark-400 hover:border-primary-500 transition-all duration-200 hover:shadow-lg hover:shadow-primary-500/10">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-2">{team.name}</h3>
                    {team.description && (
                      <p className="text-gray-400 text-sm line-clamp-2">{team.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
                  <Users className="w-4 h-4" />
                  <span>{team.memberCount || team.members?.length || 0} members</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/teams/${team._id}`)}
                    className="flex-1 btn btn-primary text-sm"
                  >
                    Open Team
                  </button>
                  {team.owner?._id !== user._id && (
                    <button
                      onClick={() => handleLeaveTeam(team._id, team.name)}
                      className="px-4 py-2 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/10 transition"
                      title="Leave Team"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {team.owner?._id === user._id && (
                  <div className="mt-3 pt-3 border-t border-dark-400">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary-600/20 text-primary-400">
                      Owner
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 className="text-2xl font-bold mb-4 text-white">Create Team</h2>
            <form onSubmit={handleCreateTeam}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Team Name *</label>
                <input
                  type="text"
                  value={newTeamData.name}
                  onChange={(e) => setNewTeamData({ ...newTeamData, name: e.target.value })}
                  className="input"
                  required
                  placeholder="My Team"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={newTeamData.description}
                  onChange={(e) => setNewTeamData({ ...newTeamData, description: e.target.value })}
                  className="input"
                  rows="3"
                  placeholder="Optional description..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewTeamData({ name: '', description: '' });
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                >
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Team Modal */}
      {showJoinModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 className="text-2xl font-bold mb-4 text-white">Join Team</h2>
            <form onSubmit={handleJoinTeam}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">Invite Code</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="input"
                  required
                  placeholder="Enter team invite code"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setInviteCode('');
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                >
                  Join Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default Teams;
