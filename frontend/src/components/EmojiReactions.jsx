import { useEffect, useState } from 'react'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '👏', '🎉']

export { REACTION_EMOJIS }

export default function EmojiReactions({ reactions = [] }) {
  return (
    <div className="absolute bottom-20 left-0 right-0 pointer-events-none z-20 overflow-hidden h-64">
      {reactions.map((reaction) => (
        <FloatingEmoji key={reaction.id} emoji={reaction.emoji} userName={reaction.userName} />
      ))}
    </div>
  )
}

function FloatingEmoji({ emoji, userName }) {
  const [position] = useState(() => ({
    left: Math.random() * 80 + 10, // 10-90% from left
    animationDuration: 2 + Math.random() * 1.5, // 2-3.5s
  }))

  return (
    <div
      className="absolute bottom-0 flex flex-col items-center animate-float-up"
      style={{
        left: `${position.left}%`,
        animationDuration: `${position.animationDuration}s`,
      }}
    >
      <span className="text-4xl">{emoji}</span>
      <span className="text-xs text-white bg-black/50 rounded px-1 mt-1">{userName}</span>
    </div>
  )
}
