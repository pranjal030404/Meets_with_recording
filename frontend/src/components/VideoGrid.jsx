import Avatar from './Avatar'
import { useRef, useEffect, useState } from 'react'
import { useMeetingStore } from '../store/meetingStore'
import { Mic, MicOff, VideoOff, Pin, PinOff, Hand, Maximize2, Star } from 'lucide-react'

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
        <div className="flex-1 bg-dark-300 rounded-2xl relative overflow-hidden">
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
        <div className="flex-1 bg-dark-300 rounded-2xl flex items-center justify-center relative overflow-hidden">
          {screenSrcStream ? (
            <ScreenVideo stream={screenSrcStream} muted={isLocalScreenShare} />
          ) : (
            <div className="text-center">
              <div className="w-24 h-24 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl font-semibold text-ink">
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
    ? 'min-w-40 lg:min-w-0 aspect-video bg-dark-300 rounded-xl relative overflow-hidden flex-shrink-0 transition-colors'
    : 'video-container relative overflow-hidden transition-colors'

  const voice = useVoiceActivity(stream, !isMuted)

  if (isLocal && hideSelf && !isPinned) return null

  return (
    <div
      className={`${tileClasses} animate-scale-in ${isHovered ? 'ring-2 ring-primary-500/80 ring-offset-2 ring-offset-dark-100' : ''} ${isActiveSpeaker && !small ? 'ring-2 ring-emerald-400/80 ring-offset-2 ring-offset-dark-100 speaking-border' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isVideoOff || !stream || (!isLocal && !hasRemoteVideo) ? (
        <div className="w-full h-full flex items-center justify-center bg-dark-300">
          <Avatar user={user} size={small ? 'lg' : 'xl'} />
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
        <div className="absolute top-2 left-2 bg-yellow-500 text-black p-1.5 rounded-lg z-10">
          <Hand className="w-4 h-4" />
        </div>
      )}

      {/* Pin/Spotlight controls (on hover) */}
      {isHovered && !small && (
        <div className="absolute top-2 right-2 flex gap-1 z-10">
          {onPin && (
            <button onClick={(e) => { e.stopPropagation(); onPin() }}
              className="p-1.5 bg-black/60 rounded-lg hover:bg-black/80 transition-colors"
              title={isPinned ? 'Unpin' : 'Pin'}>
              {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
          )}
          {tileIsHost && onSpotlight && !isLocal && (
            <button onClick={(e) => { e.stopPropagation(); onSpotlight() }}
              className="p-1.5 bg-black/60 rounded-lg hover:bg-black/80 transition-colors"
              title="Spotlight">
              <Star className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Name badge */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="bg-black/60 px-3 py-1.5 rounded-lg text-sm font-medium text-white">
            {user?.name || 'Unknown'} {isLocal && '(You)'}
          </span>
          {isMuted ? (
            <span className="bg-red-600 p-1.5 rounded-lg">
              <MicOff className="w-3.5 h-3.5 text-white" />
            </span>
          ) : (
            <MicActivity talking={voice.speaking} level={voice.level} />
          )}
        </div>
        {isVideoOff && (
          <span className="bg-red-600/90 p-1.5 rounded-lg">
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


// One shared AudioContext for all tiles (browsers cap how many can exist)
let sharedCtx = null
const getCtx = () => {
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new (window.AudioContext || window.webkitAudioContext)()
  sharedCtx.resume?.().catch(() => {})
  return sharedCtx
}

/** Detects when someone is actually talking by listening to THEIR audio track (works for remote people too). */
function useVoiceActivity(stream, active) {
  const [state, setState] = useState({ speaking: false, level: 0 })
  const trackId = stream?.getAudioTracks().find(t => t.readyState === 'live')?.id
  useEffect(() => {
    if (!active || !trackId) { setState(s => (s.speaking || s.level ? { speaking: false, level: 0 } : s)); return }
    const track = stream.getAudioTracks().find(t => t.id === trackId)
    if (!track) return
    let source, analyser, timer
    try {
      const ctx = getCtx()
      analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source = ctx.createMediaStreamSource(new MediaStream([track]))
      source.connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      let holdUntil = 0
      timer = setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (let i = 0; i < samples.length; i++) { const v = (samples[i] - 128) / 128; sum += v * v }
        const rms = Math.sqrt(sum / samples.length)
        const now = Date.now()
        if (rms > 0.015) holdUntil = now + 350
        const speaking = now < holdUntil
        const level = Math.min(1, rms * 5)
        setState(prev => (prev.speaking === speaking && Math.abs(prev.level - level) < 0.08 ? prev : { speaking, level }))
      }, 100)
    } catch (e) { console.warn('Voice activity unavailable:', e.message) }
    return () => { clearInterval(timer); try { source?.disconnect() } catch {} }
  }, [stream, trackId, active])
  return state
}

// Mic badge shown while unmuted: bars bounce with the voice level while talking.
function MicActivity({ talking, level = 0.6 }) {
  const bars = [0.5, 1, 0.7]
  return (
    <span className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors ${talking ? 'bg-emerald-500 ring-2 ring-emerald-300/60' : 'bg-black/60'}`}
      title={talking ? 'Speaking' : 'Mic on'}>
      <Mic className={`w-3.5 h-3.5 ${talking ? 'text-white' : 'text-emerald-300'}`} />
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
