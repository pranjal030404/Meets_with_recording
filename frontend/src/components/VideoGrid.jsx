import { useRef, useEffect } from 'react'
import { MicOff, VideoOff, Pin, Maximize2 } from 'lucide-react'

export default function VideoGrid({
  localStream,
  localVideoRef,
  peerStreams,
  user,
  participants,
  isMuted,
  isVideoOff,
  screenShareStream,
  screenShareUser
}) {
  const participantCount = peerStreams.size + 1 // +1 for local user

  const getGridClass = () => {
    if (screenShareStream || screenShareUser) {
      return 'grid-screen-share'
    }
    if (participantCount === 1) return 'grid-1'
    if (participantCount === 2) return 'grid-2'
    if (participantCount <= 4) return 'grid-3-4'
    if (participantCount <= 6) return 'grid-5-6'
    return 'grid-many'
  }

  // If screen sharing is active, show screen share layout
  if (screenShareUser) {
    return (
      <div className="h-full p-4 flex gap-4">
        {/* Main screen share area */}
        <div className="flex-1 bg-dark-300 rounded-xl flex items-center justify-center relative">
          <div className="text-center">
            <div className="w-20 h-20 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl font-semibold">
                {screenShareUser.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <p className="text-lg">{screenShareUser.name} is sharing their screen</p>
          </div>
        </div>

        {/* Side panel with participants */}
        <div className="w-60 flex flex-col gap-2 overflow-y-auto">
          {/* Local video */}
          <VideoTile
            stream={localStream}
            user={user}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            isLocal={true}
            videoRef={localVideoRef}
            small={true}
          />

          {/* Remote videos */}
          {Array.from(peerStreams.entries()).map(([socketId, { stream, user: peerUser }]) => (
            <VideoTile
              key={socketId}
              stream={stream}
              user={peerUser}
              isMuted={false}
              isVideoOff={false}
              small={true}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`participants-grid h-full ${getGridClass()}`}>
      {/* Local video */}
      <VideoTile
        stream={localStream}
        user={user}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isLocal={true}
        videoRef={localVideoRef}
      />

      {/* Remote videos */}
      {Array.from(peerStreams.entries()).map(([socketId, { stream, user: peerUser }]) => {
        const participant = participants.find(
          p => p.user._id === peerUser?._id
        )
        
        return (
          <VideoTile
            key={socketId}
            stream={stream}
            user={peerUser}
            isMuted={participant?.isMuted}
            isVideoOff={participant?.isVideoOff}
          />
        )
      })}
    </div>
  )
}

function VideoTile({ stream, user, isMuted, isVideoOff, isLocal, videoRef, small }) {
  const internalVideoRef = useRef(null)
  const ref = videoRef || internalVideoRef

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
    }
  }, [stream])

  const tileClasses = small
    ? 'aspect-video bg-dark-300 rounded-xl relative overflow-hidden'
    : 'video-container relative overflow-hidden'

  return (
    <div className={tileClasses}>
      {isVideoOff ? (
        <div className="w-full h-full flex items-center justify-center bg-dark-300">
          <div className={`${small ? 'w-12 h-12' : 'w-20 h-20'} bg-primary-600 rounded-full flex items-center justify-center`}>
            <span className={`${small ? 'text-lg' : 'text-2xl'} font-semibold`}>
              {user?.name?.charAt(0).toUpperCase() || '?'}
            </span>
          </div>
        </div>
      ) : (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
          style={isLocal ? { transform: 'scaleX(-1)' } : {}}
        />
      )}

      {/* Name badge */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2">
        <span className="bg-black/60 px-2 py-1 rounded text-sm">
          {user?.name || 'Unknown'} {isLocal && '(You)'}
        </span>
        {isMuted && (
          <span className="bg-red-600 p-1 rounded">
            <MicOff className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* Video off indicator */}
      {isVideoOff && (
        <div className="absolute top-2 right-2">
          <span className="bg-red-600 p-1 rounded">
            <VideoOff className="w-3 h-3" />
          </span>
        </div>
      )}
    </div>
  )
}
