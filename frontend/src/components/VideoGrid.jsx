import { useRef, useEffect, useState } from 'react'
import { MicOff, VideoOff, Pin, Maximize2, User } from 'lucide-react'

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
      <div className="h-full p-4 flex flex-col lg:flex-row gap-4">
        {/* Main screen share area */}
        <div className="flex-1 bg-dark-300 rounded-2xl flex items-center justify-center relative shadow-xl">
          <div className="text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
              <span className="text-4xl font-semibold text-white">
                {screenShareUser.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <p className="text-lg text-white">{screenShareUser.name} is sharing their screen</p>
            <p className="text-sm text-gray-400 mt-1">Screen share will appear here</p>
          </div>
        </div>

        {/* Side panel with participants - scrollable on mobile */}
        <div className="lg:w-64 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden pb-2 lg:pb-0">
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
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
    }
  }, [stream])

  const tileClasses = small
    ? 'min-w-40 lg:min-w-0 aspect-video bg-dark-300 rounded-xl relative overflow-hidden flex-shrink-0 transition-all duration-300'
    : 'video-container relative overflow-hidden transition-all duration-300'

  return (
    <div 
      className={`${tileClasses} ${isHovered ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-dark-100' : ''}`}
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
          className="w-full h-full object-contain bg-dark-300"
          style={isLocal ? { transform: 'scaleX(-1)' } : {}}
        />
      )}

      {/* Gradient overlay for better text visibility */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

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
        
        {/* Video off indicator */}
        {isVideoOff && (
          <span className="bg-red-600/90 backdrop-blur-sm p-1.5 rounded-lg shadow-lg">
            <VideoOff className="w-3.5 h-3.5 text-white" />
          </span>
        )}
      </div>

      {/* Speaking indicator ring - shows when audio is detected */}
      {!isMuted && !small && (
        <div className="absolute inset-0 rounded-xl border-2 border-transparent speaking-border pointer-events-none" />
      )}
    </div>
  )
}
