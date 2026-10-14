import { X, Copy, Users, Clock, Link, Key, Shield, User } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

export default function MeetingDetailsPanel({
  meeting,
  user,
  participants = [],
  roomId,
  isHost,
  isCoHost,
  onClose,
  onOpenSettings
}) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  const myRole = isHost ? 'Host' : isCoHost ? 'Co-host' : 'Participant'

  const handleCopy = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'link') {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      } else {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2000)
      }
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  const meetingLink = meeting?.meetingLink || `${window.location.origin}/meeting/${roomId}`

  const formatTime = (date) => {
    if (!date) return 'N/A'
    try {
      return new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return date
    }
  }

  return (
    <div className="w-80 bg-dark-200 border-l border-dark-400 flex flex-col">
      <div className="p-4 border-b border-dark-400 flex items-center justify-between">
        <h2 className="font-semibold">Meeting details</h2>
        <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold font-display">{meeting?.title || 'Meeting'}</h3>
          {meeting?.description && (
            <p className="text-sm text-gray-400">{meeting.description}</p>
          )}
        </div>

        <div className="bg-dark-300/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Your role</span>
            <span className="text-sm font-medium">{myRole}</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Host</span>
            <span className="text-sm font-medium">{meeting?.host?.name || '—'}</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Link className="w-4 h-4" />
            <span>Meeting link</span>
          </div>
          <div className="flex gap-2">
            <code className="flex-1 bg-dark-300 border border-dark-400 rounded px-2 py-1 text-xs truncate" title={meetingLink}>
              {meetingLink}
            </code>
            <button
              onClick={() => handleCopy(meetingLink, 'link')}
              className="px-2 py-1 bg-dark-400 hover:bg-dark-500 rounded text-xs transition-colors"
            >
              {copiedLink ? 'Copied' : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Key className="w-4 h-4" />
            <span>Meeting code</span>
          </div>
          <div className="flex gap-2">
            <code className="flex-1 bg-dark-300 border border-dark-400 rounded px-2 py-1 text-xs font-mono">
              {roomId}
            </code>
            <button
              onClick={() => handleCopy(roomId, 'code')}
              className="px-2 py-1 bg-dark-400 hover:bg-dark-500 rounded text-xs transition-colors"
            >
              {copiedCode ? 'Copied' : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Users className="w-4 h-4" />
            <span>Participants ({participants.length + 1})</span>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto bg-dark-300/40 rounded p-2">
            <div className="flex items-center gap-2 py-1">
              <img src={user?.avatar} alt={user?.name} className="w-6 h-6 rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{user?.name} (You)</p>
              </div>
              <span className="text-xs text-gray-400 capitalize">{myRole.toLowerCase()}</span>
            </div>
            {participants.map((p) => (
              <div key={p.user?.id || p.user?._id} className="flex items-center gap-2 py-1">
                <img src={p.user?.avatar} alt={p.user?.name} className="w-6 h-6 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{p.user?.name}</p>
                </div>
                <span className="text-xs text-gray-400 capitalize">{p.role || 'participant'}</span>
              </div>
            ))}
          </div>
        </div>

        {(meeting?.scheduledAt || meeting?.createdAt) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-4 h-4" />
              <span>Time</span>
            </div>
            <div className="bg-dark-300/40 rounded p-2 space-y-1 text-xs text-gray-300">
              {meeting?.scheduledAt && (
                <div>Scheduled: {formatTime(meeting.scheduledAt)}</div>
              )}
              {meeting?.createdAt && (
                <div>Created: {formatTime(meeting.createdAt)}</div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Settings</span>
            {(isHost || isCoHost) && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
              >
                Manage settings
              </button>
            )}
          </div>
          <div className="bg-dark-300/40 rounded p-2 space-y-1 text-xs text-gray-300">
            <div>Waiting room: {meeting?.settings?.waitingRoom ? 'On' : 'Off'}</div>
            <div>Screen share: {meeting?.settings?.allowScreenShare !== false ? 'Allowed' : 'Disabled'}</div>
            <div>Chat: {meeting?.settings?.allowChat !== false ? 'Allowed' : 'Disabled'}</div>
            <div>Recording: {meeting?.settings?.allowRecording !== false ? 'Allowed' : 'Disabled'}</div>
            <div>Mute on entry: {meeting?.settings?.muteOnEntry ? 'On' : 'Off'}</div>
            <div>Locked: {meeting?.settings?.isLocked ? 'Yes' : 'No'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
