import Avatar from '../components/Avatar';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users, Hash, Copy, Check, UserPlus, ArrowLeft,
  Shield, Trash2, MessageSquare, Video, Send, Sparkles,
  Paperclip, X, Loader2, Plus, ListTodo, CalendarDays, AlertTriangle
} from 'lucide-react';
import { TasksPage } from './Tasks';
import TeamCalendar from '../components/TeamCalendar';
import toast from 'react-hot-toast';
import useTeamStore from '../store/teamStore';
import { useAuthStore } from '../store/authStore';
import { getSocket } from '../lib/socket';
import FileAttachment from '../components/FileAttachment';
import useChatUpload from '../hooks/useChatUpload';

// Messages are stored per channel key: built-in channels use their type, custom ones 'custom:<id>'
const channelKey = (c) => (c.type === 'custom' ? `custom:${c.id || c._id}` : c.type);

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
    addTeamMessage,
    deleteTeam,
    createChannel,
    deleteChannel
  } = useTeamStore();

  const [activeChannel, setActiveChannel] = useState('general');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [copiedCode, setCopiedCode] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [showMembers, setShowMembers] = useState(true);
  const [view, setView] = useState('chat'); // chat | tasks | calendar
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelDesc, setChannelDesc] = useState('');
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [teamFetched, setTeamFetched] = useState(false);

  // File attachment support (uploads scoped to this team)
  const {
    fileInputRef, pendingFile, isUploading,
    pick, clearPending, onFileChange, sendAttachment,
  } = useChatUpload(() => ({ teamId }));

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
      const result = await inviteMember(teamId, inviteEmail, inviteRole);
      if (result.pending) toast.success(`Invitation emailed to ${inviteEmail}`);
      else if (result.emailed) toast.success(`Member added and notified by email`);
      else toast.success(`Member added${result.emailError ? ` (email not sent: ${result.emailError})` : ''}`);
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
      toast.success('Invite code copied');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleRegenerateCode = async () => {
    if (window.confirm('Are you sure? The old invite code will no longer work.')) {
      try {
        await regenerateInviteCode(teamId);
        toast.success('Invite code regenerated');
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

    if (pendingFile) {
      const file = await sendAttachment();
      if (!file) {
        toast.error('File upload failed');
        return;
      }
      try {
        await sendTeamMessage(teamId, activeChannel, '', 'file', null, {
          fileId: file.id,
          url: file.url,
          name: file.originalName,
          mimeType: file.mimeType,
          size: Number(file.size),
        });
        clearPending();
      } catch {
        toast.error('Failed to send file');
      }
      return;
    }

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
      <div className="relative flex flex-col items-center justify-center h-screen bg-dark-100">
        <div className="relative text-center">
          <div className="inline-flex w-20 h-20 rounded-2xl bg-red-500/10 border border-red-400/25 items-center justify-center mb-6">
            <Shield className="w-9 h-9 text-red-400" />
          </div>
          <h2 className="text-2xl font-semibold font-display mb-2">Access denied</h2>
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
      <div className="flex items-center justify-center h-screen bg-dark-100">
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
  const isOwner = currentTeam.members?.find(m => m.user._id === user._id)?.role === 'owner';

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!channelName.trim()) return;
    setChannelSaving(true);
    try {
      const created = await createChannel(teamId, channelName.trim(), channelDesc.trim());
      toast.success(`#${created.name} created`);
      setShowChannelModal(false);
      setChannelName(''); setChannelDesc('');
      if (created) setActiveChannel(channelKey(created));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create channel');
    } finally {
      setChannelSaving(false);
    }
  };

  const handleDeleteChannel = async () => {
    const ch = channelToDelete;
    if (!ch) return;
    try {
      await deleteChannel(teamId, ch.id || ch._id);
      toast.success(`#${ch.name} deleted`);
      if (activeChannel === channelKey(ch)) setActiveChannel('general');
      setChannelToDelete(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete channel');
    }
  };

  const handleDeleteTeam = async () => {
    setDeleting(true);
    try {
      await deleteTeam(teamId);
      toast.success('Team deleted');
      navigate('/teams');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to delete team');
      setDeleting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-dark-100">
      {/* Header */}
      <div className="glass-strong border-b border-white/[0.06] px-4 sm:px-6 py-3.5 relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-3 min-w-0 flex-1 basis-56">
            <button
              onClick={() => navigate('/teams')}
              className="group p-2.5 rounded-xl bg-dark-300/80 border border-white/[0.06] text-gray-400 hover:text-white hover:border-primary-500/30 transition-colors shrink-0"
              title="Back to teams"
            >
              <ArrowLeft className="w-5 h-5 transition-transform" />
            </button>
            <div className={`w-11 h-11 rounded-xl bg-dark-400 border border-white/10 flex items-center justify-center shrink-0`}>
              <span className="text-lg font-semibold text-white font-display">
                {currentTeam.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold font-display truncate">{currentTeam.name}</h1>
              <p className="text-sm text-gray-400 truncate">{currentTeam.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-dark-300/60 border border-white/[0.06] p-1">
              {[['chat', 'Chat', MessageSquare], ['tasks', 'Tasks', ListTodo], ['calendar', 'Calendar', CalendarDays]].map(([key, label, Icon]) => (
                <button key={key} onClick={() => setView(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === key ? 'bg-primary-500/20 text-primary-200' : 'text-gray-400 hover:text-gray-200'}`}>
                  <Icon className="w-4 h-4" /><span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            {isOwnerOrAdmin && (
              <button onClick={() => setShowInviteModal(true)} className="btn btn-primary text-sm">
                <UserPlus className="w-4 h-4" />
                Invite
              </button>
            )}
            <button
              onClick={() => setShowMembers(!showMembers)}
              className={`p-2.5 rounded-xl border transition-colors ${
                showMembers
                  ? 'bg-primary-500/15 border-primary-500/30 text-primary-300'
                  : 'bg-dark-300/80 border-white/[0.06] text-gray-400 hover:text-white hover:border-primary-500/30'
              }`}
              title="Toggle members"
            >
              <Users className="w-5 h-5" />
            </button>
            {isOwner && (
              <button
                onClick={() => { setDeleteConfirm(''); setShowDelete(true); }}
                className="p-2.5 rounded-xl border bg-dark-300/80 border-white/[0.06] text-gray-400 hover:text-red-300 hover:border-red-500/40 hover:bg-red-500/10 transition-colors"
                title="Delete team"
                aria-label="Delete team"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Channels Sidebar */}
        <div className={`${view === 'chat' ? 'hidden md:block' : 'hidden'} w-60 bg-dark-200/60 border-r border-white/[0.05] overflow-y-auto animate-slide-in-left`}>
          <div className="p-3.5">
            <div className="flex items-center justify-between mb-2.5 px-2">
              <h3 className="text-[11px] font-semibold text-gray-500">Channels</h3>
              {isOwnerOrAdmin && (
                <button onClick={() => setShowChannelModal(true)} className="p-1 rounded-md text-gray-400 hover:text-primary-300 hover:bg-primary-500/10 transition-colors" title="Add channel" aria-label="Add channel">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
            {currentTeam.channels?.map(channel => (
              <div key={channel.id || channel._id} className="relative group/ch">
              <button
                onClick={() => setActiveChannel(channelKey(channel))}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left mb-1 transition-colors group ${
                  activeChannel === channelKey(channel)
                    ? 'bg-white/[0.08] text-white border border-white/10'
                    : 'hover:bg-dark-300/80 text-gray-400 hover:text-white border border-transparent'
                }`}
              >
                <Hash className={`w-4 h-4 transition-transform ${activeChannel === channelKey(channel) ? 'text-primary-400' : ''}`} />
                <span className="text-sm font-medium truncate">{channel.name}</span>
              </button>
              {isOwnerOrAdmin && channel.type === 'custom' && (
                <button onClick={() => setChannelToDelete(channel)} className="absolute right-2 top-1/2 -translate-y-[60%] p-1 rounded-md text-gray-500 hover:text-red-300 hover:bg-red-500/10 opacity-0 group-hover/ch:opacity-100 focus:opacity-100 transition" title="Delete channel" aria-label={`Delete ${channel.name}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              </div>
            ))}

            {/* Invite code card at bottom of sidebar */}
            {isOwnerOrAdmin && currentTeam.inviteCode && (
              <div className="mt-6 p-3.5 rounded-2xl bg-primary-600/15 border border-primary-500/25">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary-300" />
                  <p className="text-[11px] font-semibold text-gray-400">Invite code</p>
                </div>
                <code className="block px-2.5 py-1.5 bg-dark-300/80 border border-white/[0.06] rounded-lg text-sm text-primary-200 font-mono mb-2.5">
                  {currentTeam.inviteCode}
                </code>
                <button
                  onClick={handleCopyInviteCode}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary-500/20 hover:bg-primary-500/30 text-primary-200 text-xs font-semibold transition-colors"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied!' : 'Copy code'}
                </button>
              </div>
            )}
          </div>
        </div>

        {view === 'tasks' && <div className="flex-1 overflow-y-auto bg-dark-100 min-w-0"><TasksPage teamId={teamId} /></div>}
        {view === 'calendar' && <div className="flex-1 bg-dark-100 min-w-0 overflow-hidden"><TeamCalendar teamId={teamId} /></div>}

        {/* Chat Area */}
        {view === 'chat' && <div className="flex-1 flex flex-col bg-dark-100 min-w-0">
          <div className="border-b border-white/[0.05] px-5 sm:px-6 py-3 bg-dark-200/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Hash className="w-5 h-5 text-primary-400" />
              <select value={activeChannel} onChange={(e) => setActiveChannel(e.target.value)}
                className="md:hidden input !w-auto !py-1.5 text-sm" aria-label="Channel">
                {currentTeam.channels?.map(c => <option key={c.id || c._id} value={channelKey(c)}>#{c.name}</option>)}
              </select>
              <h2 className="hidden md:block font-semibold font-display">
                {currentTeam.channels?.find(c => channelKey(c) === activeChannel)?.name || activeChannel}
              </h2>
              <span className="hidden sm:inline text-xs text-gray-500 bg-dark-300/70 border border-white/[0.05] px-2.5 py-0.5 rounded-full">
                {teamMembers.length} members
              </span>
            </div>
            {activeChannel === 'meetings' && (
              <button onClick={handleShareMeetingLink} className="btn btn-primary text-sm">
                <Video className="w-4 h-4" />
                Schedule meeting
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-16">
                <div className="inline-flex w-16 h-16 rounded-2xl bg-dark-300/70 border border-white/[0.05] items-center justify-center mb-4">
                  <MessageSquare className="w-7 h-7 text-gray-600" />
                </div>
                <p className="font-medium">No messages yet</p>
                <p className="text-sm mt-1 text-gray-600">Start the conversation</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg._id} className="flex gap-3 group">
                  <Avatar user={msg.sender} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-white text-sm">{msg.sender?.name}</span>
                      <span className="timecode">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    {msg.type === 'file' && msg.fileUrl ? (
                      <FileAttachment
                        fileUrl={msg.fileUrl}
                        fileName={msg.fileName}
                        fileType={msg.fileType}
                        fileSize={msg.fileSize}
                      />
                    ) : (
                      <p className="text-gray-300 mt-1 leading-relaxed">{msg.content}</p>
                    )}
                    {msg.type === 'meeting_link' && msg.meetingData && (
                      <div className="mt-2.5 p-4 card max-w-md">
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
            {pendingFile && (
              <div className="flex items-center gap-2 mb-2 rounded-xl bg-dark-300/60 border border-white/[0.06] px-3 py-2 max-w-sm">
                <Paperclip className="w-4 h-4 text-primary-300" />
                <span className="text-sm text-gray-300 truncate flex-1">{pendingFile.name}</span>
                {isUploading ? (
                  <span className="text-xs text-primary-300 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</span>
                ) : (
                  <>
                    <button type="button" onClick={clearPending} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                    <button type="button" onClick={handleSendMessage} className="btn btn-primary !px-3 !py-1.5 text-xs">Send file</button>
                  </>
                )}
              </div>
            )}
            <form onSubmit={handleSendMessage}>
              <div className="flex gap-2.5 group">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={onFileChange}
                />
                <button
                  type="button"
                  onClick={pick}
                  disabled={isUploading}
                  className="p-2.5 rounded-xl text-gray-400 hover:text-primary-300 hover:bg-primary-500/10 transition-colors disabled:opacity-50"
                  title="Attach a file"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={`Message #${currentTeam.channels?.find(c => channelKey(c) === activeChannel)?.name || activeChannel}`}
                  className="input flex-1"
                />
                <button
                  type="submit"
                  className="btn btn-primary !px-4"
                  disabled={!messageInput.trim() && !pendingFile}
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>

        }

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
                <div className="mb-4 p-3.5 rounded-xl bg-primary-600/15 border border-primary-500/25">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-gray-400">Invite code</p>
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
                      className="p-2 hover:bg-primary-500/20 rounded-lg transition-colors"
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
              <div className="space-y-1.5">
                {teamMembers.map(member => (
                  <div key={member.user._id} className="flex items-center justify-between p-2.5 hover:bg-dark-300/80 rounded-xl transition-colors group">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar user={member.user} size="sm" />
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
                        className="p-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
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
            <h2 className="text-2xl font-semibold font-display mb-5">Invite member</h2>
            <form onSubmit={handleInviteMember}>
              <div className="mb-4 group">
                <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Email address</label>
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
                  Send invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showChannelModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowChannelModal(false)} />
          <form onSubmit={handleCreateChannel} className="relative glass-strong rounded-2xl border border-white/10 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold font-display mb-4">Create channel</h3>
            <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
            <div className="relative mb-4">
              <Hash className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input value={channelName} onChange={(e) => setChannelName(e.target.value)} maxLength={40} className="input !pl-10" placeholder="design-reviews" autoFocus required />
            </div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Description <span className="text-gray-500 font-normal">(optional)</span></label>
            <input value={channelDesc} onChange={(e) => setChannelDesc(e.target.value)} maxLength={200} className="input mb-6" placeholder="What is this channel for?" />
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowChannelModal(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={channelSaving || !channelName.trim()} className="btn btn-primary flex-1 disabled:opacity-50">
                {channelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
              </button>
            </div>
          </form>
        </div>
      )}

      {channelToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setChannelToDelete(null)} />
          <div className="relative glass-strong rounded-2xl border border-red-500/20 w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold font-display mb-2">Delete #{channelToDelete.name}?</h3>
            <p className="text-sm text-gray-400 mb-5">The channel is removed for everyone in the team.</p>
            <div className="flex gap-3">
              <button onClick={() => setChannelToDelete(null)} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={handleDeleteChannel} className="btn flex-1 bg-red-600 hover:bg-red-500 text-white"><Trash2 className="w-4 h-4" /> Delete</button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !deleting && setShowDelete(false)} />
          <div className="relative glass-strong rounded-2xl border border-red-500/20 w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-xl bg-red-500/15 text-red-300 flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></span>
              <h3 className="text-lg font-semibold font-display">Delete team</h3>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              <span className="text-white font-medium">{currentTeam.name}</span> will be removed for all {teamMembers.length} members.
              Its channels and invite code stop working. Type the team name to confirm.
            </p>
            <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} className="input mb-5" placeholder={currentTeam.name} autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)} disabled={deleting} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={handleDeleteTeam} disabled={deleting || deleteConfirm.trim() !== currentTeam.name}
                className="btn flex-1 bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete team
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamDetail;
