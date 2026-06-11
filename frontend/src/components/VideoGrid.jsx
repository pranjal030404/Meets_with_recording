import { useRef, useEffect, useState } from 'react'
import { MicOff, VideoOff, Pin, PinOff, Hand, Maximize2, User, Star } from 'lucide-react'

const getUserId = (u) => u?.id || u?._id

export default function VideoGrid({
  localStream,
  localVideoRef,
  remoteStreams,
  screenStream,
  user,
  participants,
  isMuted,
  isVideoOff,
  screenShareUser,
  layout = 'grid',
  pinnedUserId,
  spotlightUserId,
  activeSpeakerId,
  handRaisedUsers = [],
  isHandRaised,
  isHost,
  onPinUser,
  onSpotlightUser
}) {
  // Build entries from remoteStreams Map
  const remoteEntries = Array.from((remoteStreams || new Map()).entries())
  const participantCount = remoteEntries.length + 1

  // Determine who should be "focused" (pinned > spotlight > active speaker)
  const focusedUserId = pinnedUserId || spotlightUserId || (layout === 'speaker' ? activeSpeakerId : null)

  const isHandUp = (userId) => handRaisedUsers.some(h => h.userId === userId)

  // Find screen share stream from remote entries
  const screenShareEntry = screenShareUser ? remoteEntries.find(([peerId]) => peerId === screenShareUser.id) : null

  const getGridClass = () => {
    if (screenShareUser || focusedUserId) return 'grid-screen-share'
    if (participantCount === 1) return 'grid-1'
    if (participantCount === 2) return 'grid-2'
    if (participantCount <= 4) return 'grid-3-4'
    if (participantCount <= 9) return 'grid-5-6'
    if (participantCount <= 16) return 'grid-cols-4'
    if (participantCount <= 25) return 'grid-cols-5'
    if (participantCount <= 36) return 'grid-cols-6'
    if (participantCount <= 49) return 'grid-cols-7'
    return 'grid-many'
  }

  // Speaker / spotlight / pinned layout
  if (focusedUserId && !screenShareUser) {
    const isLocalFocused = focusedUserId === user?.id
    const focusedRemote = remoteEntries.find(([peerId]) => peerId === focusedUserId)

    const findParticipant = (id) => participants.find(p => getUserId(p.user) === id)

    return (
      <div className="h-full p-4 flex flex-col lg:flex-row gap-4">
        <div className="flex-1 bg-dark-300 rounded-2xl relative shadow-xl overflow-hidden">
          {isLocalFocused ? (
            <VideoTile
              stream={localStream} user={user} isMuted={isMuted}
              isVideoOff={isVideoOff} isLocal={true} videoRef={localVideoRef}
              isHandRaised={isHandRaised} isActiveSpeaker={activeSpeakerId === getUserId(user)}
              isPinned={pinnedUserId === getUserId(user)} onPin={() => onPinUser?.(getUserId(user))}
            />
          ) : focusedRemote ? (
            <VideoTile
              stream={focusedRemote[1].stream} user={focusedRemote[1].user}
              isMuted={findParticipant(focusedRemote[0])?.isMuted}
              isVideoOff={findParticipant(focusedRemote[0])?.isVideoOff}
              isHandRaised={isHandUp(focusedRemote[0])}
              isActiveSpeaker={activeSpeakerId === focusedRemote[0]}
              isPinned={pinnedUserId === focusedRemote[0]}
              onPin={() => onPinUser?.(focusedRemote[0])}
              isHost={isHost} onSpotlight={() => onSpotlightUser?.(focusedRemote[0])}
            />
          ) : null}
        </div>
        <div className="lg:w-64 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden pb-2 lg:pb-0">
          {!isLocalFocused && (
            <VideoTile stream={localStream} user={user} isMuted={isMuted}
              isVideoOff={isVideoOff} isLocal={true} videoRef={localVideoRef}
              small={true} isHandRaised={isHandRaised}
              isActiveSpeaker={activeSpeakerId === getUserId(user)}
              onPin={() => onPinUser?.(getUserId(user))} />
          )}
          {remoteEntries.filter(([id]) => id !== focusedUserId).map(([peerId, { stream, user: peerUser }]) => {
            const p = findParticipant(getUserId(peerUser))
            return (
              <VideoTile key={peerId} stream={stream} user={peerUser}
                isMuted={p?.isMuted} isVideoOff={p?.isVideoOff} small={true}
                isHandRaised={isHandUp(peerId)}
                isActiveSpeaker={activeSpeakerId === peerId}
                onPin={() => onPinUser?.(peerId)} />
            )
          })}
        </div>
      </div>
    )
  }

  // Screen share layout
  if (screenShareUser) {
    const isLocalScreenShare = user && screenShareUser.id === getUserId(user)
    const screenSrcStream = isLocalScreenShare ? screenStream : screenShareEntry?.[1]?.stream
    const findParticipant = (id) => participants.find(p => getUserId(p.user) === id)
    return (
      <div className="h-full p-4 flex flex-col lg:flex-row gap-4">
        <div className="flex-1 bg-dark-300 rounded-2xl flex items-center justify-center relative shadow-xl overflow-hidden">
          {screenSrcStream ? (
            <video autoPlay playsInline
              ref={(el) => { if (el) el.srcObject = screenSrcStream }}
              className="w-full h-full object-contain bg-dark-300" />
          ) : (
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
                <span className="text-4xl font-semibold text-white">
                  {screenShareUser.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <p className="text-lg text-white">{screenShareUser.name} is sharing their screen</p>
            </div>
          )}
        </div>
        <div className="lg:w-64 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden pb-2 lg:pb-0">
          <VideoTile stream={localStream} user={user} isMuted={isMuted}
            isVideoOff={isVideoOff} isLocal={true} videoRef={localVideoRef}
            small={true} isHandRaised={isHandRaised} />
          {remoteEntries.map(([peerId, { stream, user: peerUser }]) => (
            <VideoTile key={peerId} stream={stream} user={peerUser}
              isMuted={findParticipant(getUserId(peerUser))?.isMuted}
              isVideoOff={findParticipant(getUserId(peerUser))?.isVideoOff}
              small={true} isHandRaised={isHandUp(peerId)} />
          ))}
        </div>
      </div>
    )
  }

  // Grid layout (default)
  const findParticipant = (id) => participants.find(p => getUserId(p.user) === id)
  return (
    <div className={`participants-grid h-full ${getGridClass()}`}>
      <VideoTile stream={localStream} user={user} isMuted={isMuted}
        isVideoOff={isVideoOff} isLocal={true} videoRef={localVideoRef}
        isHandRaised={isHandRaised} isActiveSpeaker={activeSpeakerId === getUserId(user)}
        isPinned={pinnedUserId === getUserId(user)} onPin={() => onPinUser?.(getUserId(user))}
      />
      {remoteEntries.map(([peerId, { stream, user: peerUser }]) => {
        const p = findParticipant(getUserId(peerUser))
        return (
          <VideoTile key={peerId} stream={stream} user={peerUser}
            isMuted={p?.isMuted} isVideoOff={p?.isVideoOff}
            isHandRaised={isHandUp(peerId)}
            isActiveSpeaker={activeSpeakerId === peerId}
            isPinned={pinnedUserId === peerId}
            onPin={() => onPinUser?.(peerId)}
            isHost={isHost} onSpotlight={() => onSpotlightUser?.(peerId)}
          />
        )
      })}
    </div>
  )
}

function VideoTile({ stream, user, isMuted, isVideoOff, isLocal, videoRef, small,
  isHandRaised, isActiveSpeaker, isPinned, onPin, isHost: tileIsHost, onSpotlight }) {
  const internalVideoRef = useRef(null)
  const ref = videoRef || internalVideoRef
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
    }
  }, [stream, isVideoOff])

  const tileClasses = small
    ? 'min-w-40 lg:min-w-0 aspect-video bg-dark-300 rounded-xl relative overflow-hidden flex-shrink-0 transition-all duration-300'
    : 'video-container relative overflow-hidden transition-all duration-300'

  return (
    <div
      className={`${tileClasses} ${isHovered ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-dark-100' : ''} ${isActiveSpeaker && !small ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-dark-100' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isVideoOff ? (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-dark-300 to-dark-400">
          <div className={`${small ? 'w-14 h-14' : 'w-24 h-24'} bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center shadow-lg shadow-primary-500/20`}>
            <span className={`${small ? 'text-xl' : 'text-3xl'} font-semibold text-white`}>
              {user?.name?.charAt(0).toUpperCase() || <User className={small ? 'w-6 h-6' : 'w-10 h-10'} />}
            </span>
          </div>
        </div>
      ) : (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={isLocal}
          data-local={isLocal ? 'true' : 'false'}
          className="w-full h-full object-contain bg-dark-300"
          style={isLocal ? { transform: 'scaleX(-1)' } : {}}
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Hand raised indicator */}
      {isHandRaised && (
        <div className="absolute top-2 left-2 bg-yellow-500 text-black p-1.5 rounded-lg shadow-lg animate-bounce z-10">
          <Hand className="w-4 h-4" />
        </div>
      )}

      {/* Pin/Spotlight controls (on hover) */}
      {isHovered && !small && (
        <div className="absolute top-2 right-2 flex gap-1 z-10">
          {onPin && (
            <button onClick={(e) => { e.stopPropagation(); onPin() }}
              className="p-1.5 bg-black/60 backdrop-blur-sm rounded-lg hover:bg-black/80 transition-colors"
              title={isPinned ? 'Unpin' : 'Pin'}>
              {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
          )}
          {tileIsHost && onSpotlight && !isLocal && (
            <button onClick={(e) => { e.stopPropagation(); onSpotlight() }}
              className="p-1.5 bg-black/60 backdrop-blur-sm rounded-lg hover:bg-black/80 transition-colors"
              title="Spotlight">
              <Star className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Name badge */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm font-medium text-white shadow-lg">
            {user?.name || 'Unknown'} {isLocal && '(You)'}
          </span>
          {isMuted && (
            <span className="bg-red-600 p-1.5 rounded-lg shadow-lg animate-pulse">
              <MicOff className="w-3.5 h-3.5 text-white" />
            </span>
          )}
        </div>
        {isVideoOff && (
          <span className="bg-red-600/90 backdrop-blur-sm p-1.5 rounded-lg shadow-lg">
            <VideoOff className="w-3.5 h-3.5 text-white" />
          </span>
        )}
      </div>

      {/* Speaking indicator */}
      {isActiveSpeaker && !isMuted && !small && (
        <div className="absolute inset-0 rounded-xl border-2 border-green-500 speaking-border pointer-events-none" />
      )}
    </div>
  )
}
