export default function CaptionsOverlay({ captions = [] }) {
  if (captions.length === 0) return null

  // Show only the last 3 captions
  const recentCaptions = captions.slice(-3)

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-20 pointer-events-none">
      <div className="bg-black/80 backdrop-blur-md rounded-xl p-3 space-y-1">
        {recentCaptions.map((caption, i) => (
          <div key={`${caption.userId}-${caption.timestamp}`}
            className={`text-sm ${i === recentCaptions.length - 1 ? 'text-white' : 'text-gray-400'}`}>
            <span className="font-semibold text-primary-400">{caption.userName}: </span>
            <span>{caption.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
