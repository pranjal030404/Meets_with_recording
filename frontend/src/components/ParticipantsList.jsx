import { X, Mic, MicOff, Video, VideoOff, Crown, MoreVertical, UserMinus, VolumeX } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { getSocket } from '../lib/socket'
import toast from 'react-hot-toast'

export default function ParticipantsList({ participants, user, isHost, onClose }) {
  return (
    <div className="w-80 bg-dark-200 border-l border-dark-400 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-dark-400 flex items-center justify-between">
        <h2 className="font-semibold">Participants ({participants.length + 1})</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-dark-400 rounded transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Current user (You) */}
        <ParticipantItem
          participant={{
            user,
            role: isHost ? 'host' : 'participant'
          }}
          isCurrentUser={true}
          isHost={isHost}
          canControl={false}
        />

        {/* Other participants */}
        {participants.map((participant) => (
          <ParticipantItem
            key={participant.user._id}
            participant={participant}
            isCurrentUser={false}
            isHost={isHost}
            canControl={isHost}
          />
        ))}
      </div>
    </div>
  )
}

function ParticipantItem({ participant, isCurrentUser, isHost, canControl }) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  const { user, isMuted, isVideoOff, role, socketId } = participant

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMuteUser = () => {
    const socket = getSocket()
    if (socket && socketId) {
      socket.emit('host:mute-user', { targetSocketId: socketId, roomId: '' })
      toast.success(`Muted ${user.name}`)
    }
    setShowMenu(false)
  }

  const handleRemoveUser = () => {
    const socket = getSocket()
    if (socket && socketId) {
      socket.emit('host:remove-user', { targetSocketId: socketId, roomId: '' })
      toast.success(`Removed ${user.name} from meeting`)
    }
    setShowMenu(false)
  }

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-dark-300 rounded-lg transition-colors">
      {/* Avatar */}
      <div className="relative">
        <img
          src={user.avatar}
          alt={user.name}
          className="w-10 h-10 rounded-full"
        />
        {role === 'host' && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
            <Crown className="w-3 h-3 text-black" />
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

      {/* Status indicators */}
      <div className="flex items-center gap-1">
        {isMuted && (
          <span className="p-1 bg-red-600/20 rounded" title="Muted">
            <MicOff className="w-4 h-4 text-red-500" />
          </span>
        )}
        {isVideoOff && (
          <span className="p-1 bg-red-600/20 rounded" title="Camera off">
            <VideoOff className="w-4 h-4365 text-red-500" />
          </span>
        )}
      </div>

      {/* Host controls */}
      {canControl && !isCurrentUser && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-dark-400 rounded transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-dark-300 rounded-lg shadow-lg py-1 min-w-[140px] z-10 animate-fade-in">
              <button
                onClick={handleMuteUser}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-dark-400 transition-colors text-left text-sm"
              >
                <VolumeX className="w-4 h-4" />
                Mute
              </button>
              <button
                onClick={handleRemoveUser}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-dark-400 transition-colors text-left text-sm text-red-400"
              >
                <UserMinus className="w-4 h-4" />
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
