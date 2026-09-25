import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users, Hash, Copy, Check, UserPlus, ArrowLeft,
  Shield, Trash2, MessageSquare, Video, Send, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import useTeamStore from '../store/teamStore';
import { useAuthStore } from '../store/authStore';
import { getSocket } from '../lib/socket';

const TeamDetail = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    currentTeam,
    teamMembers,
    teamMessages,
    fetchTeam,
    inviteMember,
    updateMemberRole,
    removeMember,
    regenerateInviteCode,
    fetchTeamMessages,
    sendTeamMessage,
    addTeamMessage
  } = useTeamStore();

  const [activeChannel, setActiveChannel] = useState('general');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [copiedCode, setCopiedCode] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [showMembers, setShowMembers] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [teamFetched, setTeamFetched] = useState(false);

  // Fetch team data only when teamId changes
  useEffect(() => {
    if (teamId && !accessDenied && !teamFetched) {
      setTeamFetched(true);
      fetchTeam(teamId)
        .catch((error) => {
          if (error.response?.status === 403) {
            setAccessDenied(true);
            toast.error('Access denied: You are not a member of this team');
          } else {
            toast.error('Failed to load team');
            setTeamFetched(false); // Allow retry on other errors
          }
        });
    }
  }, [teamId, accessDenied, teamFetched]);

  // Fetch messages when channel changes
  useEffect(() => {
    if (teamId && currentTeam && !accessDenied) {
      fetchTeamMessages(teamId, activeChannel).catch(() => {
        // Silent fail for messages
      });
    }
  }, [teamId, activeChannel, currentTeam]);

  // Socket connection
  useEffect(() => {
    if (teamId && currentTeam && !accessDenied) {
      const socket = getSocket();
      if (socket) {
        // Join team socket room
        socket.emit('team:join', { teamId });

        // Listen for new messages
        const handleTeamMessage = ({ message, channelType }) => {
          if (channelType === activeChannel) {
            addTeamMessage(teamId, channelType, message);
          }
        };

        socket.on('team:message', handleTeamMessage);

        return () => {
          socket.emit('team:leave', { teamId });
          socket.off('team:message', handleTeamMessage);
        };
      }
    }
  }, [teamId, currentTeam, activeChannel, accessDenied]);

  const handleInviteMember = async (e) => {
    e.preventDefault();
    try {
      await inviteMember(teamId, inviteEmail, inviteRole);
      toast.success('Member invited successfully!');
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('member');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to invite member');
    }
  };

  const handleCopyInviteCode = async () => {
    if (currentTeam?.inviteCode) {
      await navigator.clipboard.writeText(currentTeam.inviteCode);
      setCopiedCode(true);
      toast.success('Invite code copied!');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleRegenerateCode = async () => {
    if (window.confirm('Are you sure? The old invite code will no longer work.')) {
      try {
        await regenerateInviteCode(teamId);
        toast.success('Invite code regenerated!');
      } catch (error) {
        toast.error('Failed to regenerate code');
      }
    }
  };

  const handleRemoveMember = async (userId, userName) => {
    if (window.confirm(`Remove ${userName} from this team?`)) {
      try {
        await removeMember(teamId, userId);
        toast.success('Member removed');
      } catch (error) {
        toast.error('Failed to remove member');
      }
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    try {
      await sendTeamMessage(teamId, activeChannel, messageInput.trim());
      setMessageInput('');
    } catch (error) {
      toast.error('Failed to send message');
    }
  };

  const handleShareMeetingLink = async () => {
    // This will be used to share meeting links in team chat
    navigate(`/meeting/create?teamId=${teamId}`);
  };

  if (accessDenied) {
    return (
      <div className="relative flex flex-col items-center justify-center h-screen bg-dark-100 aurora-bg">
        <div className="blob -top-20 right-1/4 h-80 w-80 bg-red-500/10 animate-aurora" />
        <div className="relative text-center animate-fade-in-up">
          <div className="inline-flex w-20 h-20 rounded-3xl bg-red-500/10 border border-red-400/25 items-center justify-center mb-6 animate-float">
            <Shield className="w-9 h-9 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold font-display mb-2">Access Denied</h2>
          <p className="text-gray-400 mb-8">You are not a member of this team</p>
          <button onClick={() => navigate('/teams')} className="btn btn-primary px-6 py-3">
            <ArrowLeft className="w-4 h-4" />
            Back to Teams
          </button>
        </div>
      </div>
    );
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-100 aurora-bg">
        <div className="blob w-96 h-96 bg-primary-600/20 animate-aurora -top-20" />
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  const isOwnerOrAdmin = currentTeam.members?.find(
    m => m.user._id === user._id
  )?.role === 'owner' || currentTeam.members?.find(
    m => m.user._id === user._id
  )?.role === 'admin';

  const messages = teamMessages[`${teamId}-${activeChannel}`] || [];

  return (
    <div className="h-screen flex flex-col bg-dark-100">
      {/* Header */}
      <div className="glass-strong border-b border-white/[0.06] px-4 sm:px-6 py-3.5 animate-fade-in-down relative z-20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => navigate('/teams')}
              className="group p-2.5 rounded-xl bg-dark-300/80 border border-white/[0.06] text-gray-400 hover:text-white hover:border-primary-500/30 transition-all duration-300 shrink-0"
              title="Back to teams"
            >
              <ArrowLeft className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-0.5" />
            </button>
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 flex items-center justify-center shadow-lg shadow-primary-500/25 shrink-0`}>
              <span className="text-lg font-bold text-white font-display">
                {currentTeam.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold font-display truncate">{currentTeam.name}</h1>
              <p className="text-sm text-gray-400 truncate">{currentTeam.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwnerOrAdmin && (
              <button onClick={() => setShowInviteModal(true)} className="btn btn-primary text-sm">
                <UserPlus className="w-4 h-4" />
                Invite
              </button>
            )}
            <button
              onClick={() => setShowMembers(!showMembers)}
              className={`p-2.5 rounded-xl border transition-all duration-300 ${
                showMembers
                  ? 'bg-primary-500/15 border-primary-500/30 text-primary-300'
                  : 'bg-dark-300/80 border-white/[0.06] text-gray-400 hover:text-white hover:border-primary-500/30'
              }`}
              title="Toggle members"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Channels Sidebar */}
        <div className="hidden md:block w-60 bg-dark-200/60 border-r border-white/[0.05] overflow-y-auto animate-slide-in-left">
          <div className="p-3.5">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5 px-2">Channels</h3>
            {currentTeam.channels?.map(channel => (
              <button
                key={channel._id}
                onClick={() => setActiveChannel(channel.type)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left mb-1 transition-all duration-200 group ${
                  activeChannel === channel.type
                    ? 'bg-gradient-to-r from-primary-600/25 to-primary-600/5 text-primary-200 border border-primary-500/25'
                    : 'hover:bg-dark-300/80 text-gray-400 hover:text-white border border-transparent'
                }`}
              >
                <Hash className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${activeChannel === channel.type ? 'text-primary-400' : ''}`} />
                <span className="text-sm font-medium">{channel.name}</span>
              </button>
            ))}

            {/* Invite code card at bottom of sidebar */}
            {isOwnerOrAdmin && currentTeam.inviteCode && (
              <div className="mt-6 p-3.5 rounded-2xl bg-gradient-to-br from-primary-600/15 to-accent-600/10 border border-primary-500/25">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary-300" />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Invite Code</p>
                </div>
                <code className="block px-2.5 py-1.5 bg-dark-300/80 border border-white/[0.06] rounded-lg text-sm text-primary-200 font-mono mb-2.5">
                  {currentTeam.inviteCode}
                </code>
                <button
                  onClick={handleCopyInviteCode}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary-500/20 hover:bg-primary-500/30 text-primary-200 text-xs font-semibold transition-all duration-200"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-dark-100 min-w-0">
          <div className="border-b border-white/[0.05] px-5 sm:px-6 py-3 bg-dark-200/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Hash className="w-5 h-5 text-primary-400" />
              <h2 className="font-semibold font-display">
                {currentTeam.channels?.find(c => c.type === activeChannel)?.name || activeChannel}
              </h2>
              <span className="hidden sm:inline text-xs text-gray-500 bg-dark-300/70 border border-white/[0.05] px-2.5 py-0.5 rounded-full">
                {teamMembers.length} members
              </span>
            </div>
            {activeChannel === 'meetings' && (
              <button onClick={handleShareMeetingLink} className="btn btn-primary text-sm">
                <Video className="w-4 h-4" />
                Schedule Meeting
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-16 animate-fade-in-up">
                <div className="inline-flex w-16 h-16 rounded-2xl bg-dark-300/70 border border-white/[0.05] items-center justify-center mb-4 animate-float">
                  <MessageSquare className="w-7 h-7 text-gray-600" />
                </div>
                <p className="font-medium">No messages yet</p>
                <p className="text-sm mt-1 text-gray-600">Start the conversation!</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg._id} className="flex gap-3 group animate-fade-in-up">
                  <img
                    src={msg.sender?.avatar}
                    alt={msg.sender?.name}
                    className="w-10 h-10 rounded-full ring-2 ring-white/[0.06] transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-white text-sm">{msg.sender?.name}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-gray-300 mt-1 leading-relaxed">{msg.content}</p>
                    {msg.type === 'meeting_link' && msg.meetingData && (
                      <div className="mt-2.5 p-4 gradient-border rounded-xl max-w-md">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Video className="w-4 h-4 text-primary-400" />
                          <span className="font-semibold text-white text-sm">{msg.meetingData.title}</span>
                        </div>
                        {msg.meetingData.scheduledAt && (
                          <p className="text-sm text-gray-400">
                            {new Date(msg.meetingData.scheduledAt).toLocaleString()}
                          </p>
                        )}
                        <a
                          href={msg.meetingData.link}
                          className="inline-block mt-2.5 text-sm font-semibold text-primary-300 hover:text-primary-200 transition-colors hover:underline underline-offset-4"
                        >
                          Join Meeting →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Message Input */}
          <div className="border-t border-white/[0.05] p-4 bg-dark-200/60">
            <form onSubmit={handleSendMessage}>
              <div className="flex gap-2.5 group">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={`Message #${currentTeam.channels?.find(c => c.type === activeChannel)?.name || activeChannel}`}
                  className="input flex-1"
                />
                <button
                  type="submit"
                  className="btn btn-primary !px-4"
                  disabled={!messageInput.trim()}
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Members Sidebar */}
        {showMembers && (
          <div className="hidden lg:block w-72 bg-dark-200/60 border-l border-white/[0.05] overflow-y-auto animate-slide-in-right">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold font-display flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary-400" />
                  Members
                  <span className="text-sm font-normal text-gray-500">({teamMembers.length})</span>
                </h3>
              </div>

              {/* Invite Code Section */}
              {isOwnerOrAdmin && currentTeam.inviteCode && (
                <div className="mb-4 p-3.5 rounded-xl bg-gradient-to-br from-primary-600/15 to-accent-600/5 border border-primary-500/25">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Invite Code</p>
                    <button
                      onClick={handleRegenerateCode}
                      className="text-[11px] text-primary-400 hover:text-primary-300 transition"
                      title="Regenerate code"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-2.5 py-1.5 bg-dark-300/80 border border-white/[0.06] rounded-lg text-sm text-primary-200 font-mono truncate">
                      {currentTeam.inviteCode}
                    </code>
                    <button
                      onClick={handleCopyInviteCode}
                      className="p-2 hover:bg-primary-500/20 rounded-lg transition-all duration-200 hover:scale-110"
                      title="Copy code"
                    >
                      {copiedCode ? (
                        <Check className="w-4 h-4 text-green-400 animate-pop" />
                      ) : (
                        <Copy className="w-4 h-4 text-primary-400" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Members List */}
              <div className="space-y-1.5">
                {teamMembers.map(member => (
                  <div key={member.user._id} className="flex items-center justify-between p-2.5 hover:bg-dark-300/80 rounded-xl transition-all duration-200 group">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={member.user.avatar}
                          alt={member.user.name}
                          className="w-9 h-9 rounded-full ring-2 ring-white/[0.06] transition-transform duration-300 group-hover:scale-105"
                        />
                        {member.user.isOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-dark-200 rounded-full"></span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{member.user.name}</p>
                        <p className={`text-xs capitalize ${member.role === 'owner' ? 'text-primary-300' : 'text-gray-500'}`}>{member.role}</p>
                      </div>
                    </div>
                    {isOwnerOrAdmin && member.role !== 'owner' && member.user._id !== user._id && (
                      <button
                        onClick={() => handleRemoveMember(member.user._id, member.user.name)}
                        className="p-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 className="text-2xl font-bold font-display mb-5">Invite Member</h2>
            <form onSubmit={handleInviteMember}>
              <div className="mb-4 group">
                <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input"
                  required
                  placeholder="member@example.com"
                />
              </div>
              <div className="mb-6 group">
                <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="input capitalize"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="guest">Guest</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowInviteModal(false)} className="btn btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  <UserPlus className="w-4 h-4" />
                  Send Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamDetail;
