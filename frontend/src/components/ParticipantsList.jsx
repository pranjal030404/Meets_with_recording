import { X, Mic, MicOff, Video, VideoOff, Crown, MoreVertical, UserMinus, VolumeX, Hand, VideoIcon, Shield, Check, XCircle } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { getSocket } from '../lib/socket'
import toast from 'react-hot-toast'

export default function ParticipantsList({
  participants,
  user,
  isHost,
  roomId,
  handRaisedUsers = [],
  waitingRoomUsers = [],
  onClose,
  onAdmit,
  onDeny
}) {
  const [tab, setTab] = useState('participants') // 'participants' | 'waiting'

  const isHandRaised = (userId) => handRaisedUsers.some(h => h.userId === userId)

  return (
    <div className="w-80 bg-dark-200 border-l border-dark-400 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-dark-400 flex items-center justify-between">
        <h2 className="font-semibold">Participants ({participants.length + 1})</h2>
        <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs (show waiting room tab for host if there are waiting users) */}
      {isHost && waitingRoomUsers.length > 0 && (
        <div className="flex border-b border-dark-400">
          <button
            onClick={() => setTab('participants')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === 'participants' ? 'text-primary-400 border-b-2 border-primary-400' : 'text-gray-400 hover:text-white'}`}
          >
            In Meeting
          </button>
          <button
            onClick={() => setTab('waiting')}
            className={`flex-1 py-2 text-sm font-medium transition-colors relative ${tab === 'waiting' ? 'text-primary-400 border-b-2 border-primary-400' : 'text-gray-400 hover:text-white'}`}
          >
            Waiting ({waitingRoomUsers.length})
            <span className="absolute top-1 right-4 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
          </button>
        </div>
      )}

      {/* Participants List */}
      {tab === 'participants' ? (
        <div className="flex-1 overflow-y-auto p-2">
          {/* Current user (You) */}
          <ParticipantItem
            participant={{ user, role: isHost ? 'host' : 'participant' }}
            isCurrentUser={true}
            isHost={isHost}
            canControl={false}
            isHandRaised={false}
            roomId={roomId}
          />

          {/* Hand raised users first */}
          {participants
            .sort((a, b) => {
              const aRaised = isHandRaised(a.user?.id || a.user?._id)
              const bRaised = isHandRaised(b.user?.id || b.user?._id)
              if (aRaised && !bRaised) return -1
              if (!aRaised && bRaised) return 1
              return 0
            })
            .map((participant) => (
              <ParticipantItem
                key={participant.user?.id || participant.user?._id}
                participant={participant}
                isCurrentUser={false}
                isHost={isHost}
                canControl={isHost}
                isHandRaised={isHandRaised(participant.user?.id || participant.user?._id)}
                roomId={roomId}
              />
            ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {/* Admit All button */}
          {waitingRoomUsers.length > 1 && (
            <button
              onClick={() => waitingRoomUsers.forEach(u => onAdmit(u.socketId))}
              className="w-full mb-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm font-medium transition-colors"
            >
              Admit All ({waitingRoomUsers.length})
            </button>
          )}
          {waitingRoomUsers.map(({ user: waitingUser, socketId }) => (
            <div key={socketId} className="flex items-center gap-3 p-3 hover:bg-dark-300 rounded-lg transition-colors">
              <img src={waitingUser.avatar} alt={waitingUser.name} className="w-10 h-10 rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{waitingUser.name}</p>
                <p className="text-xs text-gray-400">Waiting to join</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => onAdmit(socketId)}
                  className="p-1.5 bg-green-600 hover:bg-green-700 rounded-lg transition-colors" title="Admit">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => onDeny(socketId)}
                  className="p-1.5 bg-red-600 hover:bg-red-700 rounded-lg transition-colors" title="Deny">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ParticipantItem({ participant, isCurrentUser, isHost, canControl, isHandRaised, roomId }) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  const { user, isMuted, isVideoOff, role, socketId } = participant

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMuteUser = () => {
    const socket = getSocket()
    if (socket && socketId) {
      socket.emit('host:mute-user', { targetSocketId: socketId, roomId })
      toast.success(`Muted ${user.name}`)
    }
    setShowMenu(false)
  }

  const handleForceVideoOff = () => {
    const socket = getSocket()
    if (socket && socketId) {
      socket.emit('host:force-video-off', { targetSocketId: socketId, roomId })
      toast.success(`Turned off ${user.name}'s camera`)
    }
    setShowMenu(false)
  }

  const handleRequestUnmute = () => {
    const socket = getSocket()
    if (socket && socketId) {
      socket.emit('host:request-unmute', { targetSocketId: socketId, roomId })
      toast.success(`Asked ${user.name} to unmute`)
    }
    setShowMenu(false)
  }

  const handleRemoveUser = () => {
    const socket = getSocket()
    if (socket && socketId) {
      socket.emit('host:remove-user', { targetSocketId: socketId, roomId })
      toast.success(`Removed ${user.name} from meeting`)
    }
    setShowMenu(false)
  }

  const handleMakeCoHost = () => {
    const socket = getSocket()
    if (socket && socketId) {
      socket.emit('host:make-cohost', { targetSocketId: socketId, roomId })
      toast.success(`Made ${user.name} a co-host`)
    }
    setShowMenu(false)
  }

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-dark-300 rounded-lg transition-colors">
      {/* Avatar */}
      <div className="relative">
        <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
        {role === 'host' && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
            <Crown className="w-3 h-3 text-black" />
          </div>
        )}
        {role === 'co-host' && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
            <Shield className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {user.name} {isCurrentUser && <span className="text-gray-400">(You)</span>}
        </p>
        <p className="text-xs text-gray-400 capitalize">{role || 'Participant'}</p>
      </div>

      {/* Hand raise indicator */}
      {isHandRaised && (
        <span className="text-lg animate-bounce" title="Hand raised">✋</span>
      )}

      {/* Status indicators */}
      <div className="flex items-center gap-1">
        {isMuted && (
          <span className="p-1 bg-red-600/20 rounded" title="Muted">
            <MicOff className="w-3.5 h-3.5 text-red-500" />
          </span>
        )}
        {isVideoOff && (
          <span className="p-1 bg-red-600/20 rounded" title="Camera off">
            <VideoOff className="w-3.5 h-3.5 text-red-500" />
          </span>
        )}
      </div>

      {/* Host controls */}
      {canControl && !isCurrentUser && (
        <div className="relative" ref={menuRef}>
          <button onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-dark-400 rounded transition-colors">
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-dark-300 rounded-lg shadow-lg py-1 min-w-[180px] z-10 animate-fade-in">
              <button onClick={handleMuteUser}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-dark-400 transition-colors text-left text-sm">
                <VolumeX className="w-4 h-4" /> Mute
              </button>
              <button onClick={handleForceVideoOff}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-dark-400 transition-colors text-left text-sm">
                <VideoOff className="w-4 h-4" /> Turn off camera
              </button>
              {isMuted && (
                <button onClick={handleRequestUnmute}
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-dark-400 transition-colors text-left text-sm">
                  <Mic className="w-4 h-4" /> Ask to unmute
                </button>
              )}
              <button onClick={handleMakeCoHost}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-dark-400 transition-colors text-left text-sm">
                <Shield className="w-4 h-4" /> Make co-host
              </button>
              <hr className="my-1 border-dark-400" />
              <button onClick={handleRemoveUser}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-dark-400 transition-colors text-left text-sm text-red-400">
                <UserMinus className="w-4 h-4" /> Remove from meeting
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
