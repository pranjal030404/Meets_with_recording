import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, LogOut, Sparkles, ArrowRight, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import useTeamStore from '../store/teamStore';
import { useAuthStore } from '../store/authStore';
import AppShell from '../components/AppShell';

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
      toast.success('Team created');
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
        <div className="relative text-center">
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
          </div>
          <p className="mt-4 text-gray-400">Loading teams...</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell wide>
      <div>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
        <div className="flex flex-wrap justify-between items-end gap-6 mb-10">
          <div>
<h1 className="page-title">
              Teams
            </h1>
            <p className="page-sub">Manage your team workspaces</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowJoinModal(true)} className="btn btn-secondary">
              <LogIn className="w-5 h-5" />
              Join team
            </button>
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
              <Plus className="w-5 h-5" />
              Create team
            </button>
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="text-center py-20 bg-dark-200/60 rounded-2xl border border-white/[0.06]">
            <div className="inline-flex w-20 h-20 rounded-2xl bg-primary-500/15 border border-white/[0.06] items-center justify-center mb-6">
              <Users className="w-9 h-9 text-primary-300" />
            </div>
            <h3 className="text-2xl font-semibold font-display mb-2">No teams yet</h3>
            <p className="text-gray-400 mb-8">Create a team or join one using an invite code</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={() => setShowCreateModal(true)} className="btn btn-primary px-6 py-3">
                Create your first team
              </button>
              <button onClick={() => setShowJoinModal(true)} className="btn btn-secondary px-6 py-3">
                Join a Team
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team, i) => {
              const isOwner = team.owner?._id === user._id;
              return (
                <div
                  key={team._id}
                  className={`card card-hover p-6`}
                  style={{ animationDelay: `${Math.min(i * 0.08, 0.4)}s` }}
                >

                  <div className="flex items-start gap-4 mb-5">
                    <div className={`w-12 h-12 rounded-xl bg-dark-400 border border-white/10 flex items-center justify-center transition-transform shrink-0`}>
                      <span className="text-xl font-semibold text-white font-display">
                        {team.name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold font-display truncate mb-1">{team.name}</h3>
                      {team.description && (
                        <p className="text-gray-400 text-sm line-clamp-2 leading-relaxed">{team.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-5">
                    <Users className="w-4 h-4 text-primary-400/70" />
                    <span className="font-medium text-gray-300">{team.memberCount || team.members?.length || 0}</span>
                    members
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/teams/${team._id}`)}
                      className="btn btn-primary flex-1 text-sm group/btn"
                    >
                      Open team
                      <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                    </button>
                    {!isOwner && (
                      <button
                        onClick={() => handleLeaveTeam(team._id, team.name)}
                        className="px-4 py-2.5 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/10 hover:border-red-500/50 transition-colors"
                        title="Leave team"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {isOwner && (
                    <div className="mt-4 pt-4 border-t border-white/[0.06]">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary-500/15 text-primary-300 border border-primary-400/25">
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        Owner
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 className="text-2xl font-semibold font-display mb-5">Create team</h2>
            <form onSubmit={handleCreateTeam}>
              <div className="mb-4 group">
                <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Team Name *</label>
                <input
                  type="text"
                  value={newTeamData.name}
                  onChange={(e) => setNewTeamData({ ...newTeamData, name: e.target.value })}
                  className="input"
                  required
                  placeholder="My Team"
                />
              </div>
              <div className="mb-6 group">
                <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Description</label>
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
                <button type="submit" className="btn btn-primary flex-1">
                  <Plus className="w-4 h-4" />
                  Create team
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
            <h2 className="text-2xl font-semibold font-display mb-5">Join team</h2>
            <form onSubmit={handleJoinTeam}>
              <div className="mb-6 group">
                <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Invite code</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="input font-mono"
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
                <button type="submit" className="btn btn-primary flex-1">
                  <LogIn className="w-4 h-4" />
                  Join team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </AppShell>
  );
};

export default Teams;
