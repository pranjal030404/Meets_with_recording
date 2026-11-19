import { useRef, useEffect, useState } from 'react'
import { useMeetingStore } from '../store/meetingStore'
import { Mic, MicOff, VideoOff, Pin, PinOff, Hand, Maximize2, User, Star } from 'lucide-react'

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
  const mediaEntries = Array.from((remoteStreams || new Map()).entries())
  // Everyone in the meeting gets a tile, even if no media from them has arrived (camera/mic off,
  // permission denied, or their connection to the media server hasn't come up yet).
  const selfId = getUserId(user)
  const mediaIds = new Set(mediaEntries.map(([id]) => id))
  const placeholderEntries = (participants || [])
    .filter(p => {
      const id = getUserId(p.user)
      return id && id !== selfId && !mediaIds.has(id)
    })
    .map(p => [getUserId(p.user), { stream: null, user: p.user }])
  const remoteEntries = [...mediaEntries, ...placeholderEntries]
  const hideSelf = useMeetingStore((s) => s.hideSelf)
  const participantCount = Math.max(1, remoteEntries.length + (hideSelf ? 0 : 1))

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
    const screenSrcStream = isLocalScreenShare ? screenStream : screenShareEntry?.[1]?.screenStream
    const findParticipant = (id) => participants.find(p => getUserId(p.user) === id)
    return (
      <div className="h-full p-4 flex flex-col lg:flex-row gap-4">
        <div className="flex-1 bg-dark-300 rounded-2xl flex items-center justify-center relative shadow-xl overflow-hidden">
          {screenSrcStream ? (
            <ScreenVideo stream={screenSrcStream} muted={isLocalScreenShare} />
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
  const mirrorSelf = useMeetingStore((s) => s.mirrorSelf)
  const hideSelf = useMeetingStore((s) => s.hideSelf)

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
    }
  }, [stream, isVideoOff, stream?.getVideoTracks().length])

  // A remote tile with no live video track (camera off / nothing received) shows the avatar, not a black box
  const [, forceRender] = useState(0)
  useEffect(() => {
    if (!stream || isLocal) return
    const bump = () => forceRender(n => n + 1)
    stream.addEventListener('addtrack', bump)
    stream.addEventListener('removetrack', bump)
    return () => { stream.removeEventListener('addtrack', bump); stream.removeEventListener('removetrack', bump) }
  }, [stream, isLocal])
  const hasRemoteVideo = !!stream?.getVideoTracks().some(t => t.readyState === 'live')

  // Remote audio plays through a dedicated <audio> element that is always mounted. Previously the
  // sound only came from the <video>, which isn't rendered while a camera is off -> no audio at all.
  const audioRef = useRef(null)
  useEffect(() => {
    const el = audioRef.current
    if (!el || isLocal || !stream) return
    if (el.srcObject !== stream) el.srcObject = stream
    el.play?.().catch(() => {})
    // Re-attempt when tracks arrive later (audio producer is consumed after video) or after a gesture
    const retry = () => el.play?.().catch(() => {})
    stream.addEventListener('addtrack', retry)
    document.addEventListener('click', retry, { once: true })
    return () => { stream.removeEventListener('addtrack', retry); document.removeEventListener('click', retry) }
  }, [stream, isLocal])

  const tileClasses = small
    ? 'min-w-40 lg:min-w-0 aspect-video bg-dark-300 rounded-xl relative overflow-hidden flex-shrink-0 transition-all duration-300'
    : 'video-container relative overflow-hidden transition-all duration-300'

  const localSpeaking = useMeetingStore(st => st.isSpeaking)
  const localLevel = useMeetingStore(st => st.audioLevel)

  if (isLocal && hideSelf && !isPinned) return null

  return (
    <div
      className={`${tileClasses} animate-scale-in ${isHovered ? 'ring-2 ring-primary-500/80 ring-offset-2 ring-offset-dark-100' : ''} ${isActiveSpeaker && !small ? 'ring-2 ring-emerald-400/80 ring-offset-2 ring-offset-dark-100 speaking-border' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isVideoOff || !stream || (!isLocal && !hasRemoteVideo) ? (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-dark-300 to-dark-400/60">
          <div className={`${small ? 'w-14 h-14' : 'w-24 h-24'} bg-gradient-to-br from-primary-500 to-accent-600 rounded-full flex items-center justify-center shadow-glow`}>
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
          muted
          data-local={isLocal ? 'true' : 'false'}
          className="w-full h-full object-contain bg-dark-300"
          style={isLocal && mirrorSelf ? { transform: 'scaleX(-1)' } : {}}
        />
      )}

      {!isLocal && <audio ref={audioRef} autoPlay playsInline />}

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
          {isMuted ? (
            <span className="bg-red-600 p-1.5 rounded-lg shadow-lg">
              <MicOff className="w-3.5 h-3.5 text-white" />
            </span>
          ) : (
            <MicActivity talking={isLocal ? localSpeaking : isActiveSpeaker} level={isLocal ? localLevel : 0.6} />
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


// Mic badge shown while unmuted: bars bounce with the voice level while talking.
function MicActivity({ talking, level = 0.6 }) {
  const bars = [0.5, 1, 0.7]
  return (
    <span className={`flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-lg backdrop-blur-sm transition-colors ${talking ? 'bg-emerald-500/90' : 'bg-black/60'}`}
      title={talking ? 'Speaking' : 'Mic on'}>
      <Mic className="w-3.5 h-3.5 text-white" />
      {talking && (
        <span className="flex items-end gap-[2px] h-3">
          {bars.map((b, i) => (
            <span key={i} className="w-[3px] rounded-full bg-white transition-[height] duration-100"
              style={{ height: `${Math.max(25, Math.min(100, level * 100 * b + 30))}%` }} />
          ))}
        </span>
      )}
    </span>
  )
}

// Attaches the stream only when it changes. An inline ref callback re-ran on every parent render
// (the meeting timer ticks each second), reloading the video and making the shared screen flicker.
function ScreenVideo({ stream, muted }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.srcObject !== stream) {
      el.srcObject = stream
      el.play?.().catch(() => {})
    }
  }, [stream])
  // Muted for your own share so shared-tab audio doesn't echo back at you.
  return <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-contain bg-dark-300" />
}
