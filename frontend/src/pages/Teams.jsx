import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, LogOut, Sparkles, ArrowRight, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import useTeamStore from '../store/teamStore';
import { useAuthStore } from '../store/authStore';

const AVATAR_GRADIENTS = [
  'from-primary-400 via-primary-600 to-accent-600',
  'from-emerald-400 via-teal-500 to-cyan-600',
  'from-fuchsia-400 via-purple-500 to-indigo-600',
  'from-amber-400 via-orange-500 to-rose-500',
  'from-sky-400 via-blue-500 to-indigo-600',
  'from-rose-400 via-pink-500 to-fuchsia-600',
];

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
      <div className="flex items-center justify-center h-screen bg-dark-100 aurora-bg">
        <div className="blob w-96 h-96 bg-primary-600/20 animate-aurora -top-20" />
        <div className="relative text-center">
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
          </div>
          <p className="mt-4 text-gray-400 animate-pulse">Loading teams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-100 px-4 sm:px-6 py-8 aurora-bg noise">
      {/* Animated background */}
      <div className="blob -top-40 left-1/4 h-96 w-96 bg-primary-600/15 animate-aurora" />
      <div className="blob bottom-0 -right-24 h-80 w-80 bg-accent-600/10 animate-aurora-slow" />

      <div className="relative max-w-7xl mx-auto">
        <div className="flex flex-wrap justify-between items-end gap-6 mb-10 animate-fade-in-up">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-400/25 bg-primary-500/10 px-3.5 py-1.5 text-xs font-semibold text-primary-200 mb-4">
              <Sparkles className="h-3.5 w-3.5" />
              Collaborate together
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight">
              Your <span className="gradient-text">Teams</span>
            </h1>
            <p className="text-gray-400 mt-2">Manage your team workspaces</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowJoinModal(true)} className="btn btn-secondary">
              <LogIn className="w-5 h-5" />
              Join Team
            </button>
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
              <Plus className="w-5 h-5" />
              Create Team
            </button>
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="text-center py-20 bg-dark-200/60 backdrop-blur-sm rounded-3xl border border-white/[0.06] animate-fade-in-up stagger-2">
            <div className="inline-flex w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-500/15 to-accent-500/10 border border-white/[0.06] items-center justify-center mb-6 animate-float">
              <Users className="w-9 h-9 text-primary-300" />
            </div>
            <h3 className="text-2xl font-bold font-display mb-2">No teams yet</h3>
            <p className="text-gray-400 mb-8">Create a team or join one using an invite code</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={() => setShowCreateModal(true)} className="btn btn-primary px-6 py-3">
                Create Your First Team
              </button>
              <button onClick={() => setShowJoinModal(true)} className="btn btn-secondary px-6 py-3">
                Join a Team
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team, i) => {
              const gradient = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length];
              const isOwner = team.owner?._id === user._id;
              return (
                <div
                  key={team._id}
                  className={`group relative bg-dark-200/70 backdrop-blur-sm rounded-2xl p-6 border border-white/[0.06] transition-all duration-300 hover:border-primary-500/30 hover:shadow-glow hover:-translate-y-1 animate-fade-in-up`}
                  style={{ animationDelay: `${Math.min(i * 0.08, 0.4)}s` }}
                >
                  {/* Hover glow accent */}
                  <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${gradient} opacity-[0.07] blur-2xl group-hover:opacity-[0.15] transition-opacity duration-500 pointer-events-none`} />

                  <div className="flex items-start gap-4 mb-5">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3 shrink-0`}>
                      <span className="text-xl font-bold text-white font-display">
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
                      Open Team
                      <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
                    </button>
                    {!isOwner && (
                      <button
                        onClick={() => handleLeaveTeam(team._id, team.name)}
                        className="px-4 py-2.5 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/10 hover:border-red-500/50 transition-all duration-300 hover:scale-105"
                        title="Leave Team"
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
            <h2 className="text-2xl font-bold font-display mb-5">Create Team</h2>
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
            <h2 className="text-2xl font-bold font-display mb-5">Join Team</h2>
            <form onSubmit={handleJoinTeam}>
              <div className="mb-6 group">
                <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Invite Code</label>
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
