import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Users, Hash, Bell, Copy, Check, UserPlus, Settings, ArrowLeft,
  Mail, Shield, User as UserIcon, Trash2, MessageSquare, Video
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
      <div className="flex flex-col items-center justify-center h-screen bg-dark-100">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400 mb-4">You are not a member of this team</p>
          <button
            onClick={() => navigate('/teams')}
            className="btn btn-primary"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Teams
          </button>
        </div>
      </div>
    );
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
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
      <div className="bg-dark-200 border-b border-dark-400 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/teams')}
              className="p-2 hover:bg-dark-400 rounded-lg transition text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">{currentTeam.name}</h1>
              <p className="text-sm text-gray-400">{currentTeam.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwnerOrAdmin && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="btn btn-primary"
              >
                <UserPlus className="w-4 h-4" />
                Invite
              </button>
            )}
            <button
              onClick={() => setShowMembers(!showMembers)}
              className="p-2 hover:bg-dark-400 rounded-lg text-gray-400 hover:text-white transition"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Channels Sidebar */}
        <div className="w-64 bg-dark-200 border-r border-dark-400 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Channels</h3>
            {currentTeam.channels?.map(channel => (
              <button
                key={channel._id}
                onClick={() => setActiveChannel(channel.type)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left mb-1 transition ${
                  activeChannel === channel.type
                    ? 'bg-primary-600/20 text-primary-400'
                    : 'hover:bg-dark-400 text-gray-400 hover:text-white'
                }`}
              >
                <Hash className="w-4 h-4" />
                <span className="text-sm font-medium">{channel.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-dark-100">
          <div className="border-b border-dark-400 px-6 py-3 bg-dark-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold text-white">
                {currentTeam.channels?.find(c => c.type === activeChannel)?.name || activeChannel}
              </h2>
            </div>
            {activeChannel === 'meetings' && (
              <button
                onClick={handleShareMeetingLink}
                className="btn btn-primary text-sm"
              >
                <Video className="w-4 h-4" />
                Schedule Meeting
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-600" />
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg._id} className="flex gap-3">
                  <img
                    src={msg.sender?.avatar}
                    alt={msg.sender?.name}
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-white">{msg.sender?.name}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-gray-300 mt-1">{msg.content}</p>
                    {msg.type === 'meeting_link' && msg.meetingData && (
                      <div className="mt-2 p-3 bg-primary-600/10 border border-primary-500/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Video className="w-4 h-4 text-primary-400" />
                          <span className="font-semibold text-white">{msg.meetingData.title}</span>
                        </div>
                        {msg.meetingData.scheduledAt && (
                          <p className="text-sm text-gray-400">
                            {new Date(msg.meetingData.scheduledAt).toLocaleString()}
                          </p>
                        )}
                        <a
                          href={msg.meetingData.link}
                          className="inline-block mt-2 text-sm text-primary-400 hover:text-primary-300 transition"
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
          <div className="border-t border-dark-400 p-4 bg-dark-200">
            <form onSubmit={handleSendMessage}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={`Message #${currentTeam.channels?.find(c => c.type === activeChannel)?.name || activeChannel}`}
                  className="input flex-1"
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Members Sidebar */}
        {showMembers && (
          <div className="w-80 bg-dark-200 border-l border-dark-400 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Members ({teamMembers.length})</h3>
              </div>

              {/* Invite Code Section */}
              {isOwnerOrAdmin && (
                <div className="mb-4 p-3 bg-primary-600/10 rounded-lg border border-primary-500/30">
                  <p className="text-xs font-medium text-gray-400 mb-2">Invite Code</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-2 py-1 bg-dark-400 border border-dark-500 rounded text-sm text-white font-mono">
                      {currentTeam.inviteCode}
                    </code>
                    <button
                      onClick={handleCopyInviteCode}
                      className="p-1 hover:bg-dark-400 rounded transition"
                      title="Copy code"
                    >
                      {copiedCode ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-primary-400" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Members List */}
              <div className="space-y-2">
                {teamMembers.map(member => (
                  <div key={member.user._id} className="flex items-center justify-between p-2 hover:bg-dark-400 rounded-lg transition">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative">
                        <img
                          src={member.user.avatar}
                          alt={member.user.name}
                          className="w-8 h-8 rounded-full"
                        />
                        {member.user.isOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-dark-200 rounded-full"></span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{member.user.name}</p>
                        <p className="text-xs text-gray-500">{member.role}</p>
                      </div>
                    </div>
                    {isOwnerOrAdmin && member.role !== 'owner' && member.user._id !== user._id && (
                      <button
                        onClick={() => handleRemoveMember(member.user._id, member.user.name)}
                        className="p-1 text-red-400 hover:bg-red-500/10 rounded transition"
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
            <h2 className="text-2xl font-bold mb-4 text-white">Invite Member</h2>
            <form onSubmit={handleInviteMember}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input"
                  required
                  placeholder="member@example.com"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="input"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="guest">Guest</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                >
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
