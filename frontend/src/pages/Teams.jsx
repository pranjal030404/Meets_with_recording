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
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading teams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Teams</h1>
          <p className="text-gray-600 mt-2">Manage your team workspaces</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowJoinModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition"
          >
            <Users className="w-5 h-5" />
            Join Team
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-5 h-5" />
            Create Team
          </button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-lg">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No teams yet</h3>
          <p className="text-gray-600 mb-6">Create a team or join one using an invite code</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Your First Team
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Join a Team
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map(team => (
            <div key={team._id} className="bg-white rounded-lg shadow-md hover:shadow-lg transition p-6 border border-gray-200">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{team.name}</h3>
                  {team.description && (
                    <p className="text-gray-600 text-sm line-clamp-2">{team.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <Users className="w-4 h-4" />
                <span>{team.memberCount || team.members?.length || 0} members</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/teams/${team._id}`)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                >
                  Open Team
                </button>
                {team.owner?._id !== user._id && (
                  <button
                    onClick={() => handleLeaveTeam(team._id, team.name)}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition"
                    title="Leave Team"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>

              {team.owner?._id === user._id && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Create Team</h2>
            <form onSubmit={handleCreateTeam}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Team Name *</label>
                <input
                  type="text"
                  value={newTeamData.name}
                  onChange={(e) => setNewTeamData({ ...newTeamData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  placeholder="My Team"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={newTeamData.description}
                  onChange={(e) => setNewTeamData({ ...newTeamData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Join Team</h2>
            <form onSubmit={handleJoinTeam}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Invite Code</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Join Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Teams;
