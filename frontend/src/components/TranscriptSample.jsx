const LINES = [
  { time: '00:01:12', speaker: 'Aisha', color: 'bg-primary-400', text: 'Quick agenda: sprint demo, then blockers.' },
  { time: '00:01:26', speaker: 'Marcus', color: 'bg-emerald-400', text: 'Demo is ready. Sharing my screen now.' },
  { time: '00:02:03', speaker: 'Sam', color: 'bg-amber-400', text: 'Can you zoom into the timeline view?' },
  { time: '00:02:41', speaker: 'Aisha', color: 'bg-primary-400', text: 'Noted. Marcus sends the notes by Friday.' },
]

/** What the product produces: a timestamped record of who said what. Labelled as a sample. */
export default function TranscriptSample({ className = '' }) {
  return (
    <figure className={`card p-5 ${className}`}>
      <figcaption className="flex items-center justify-between text-sm text-gray-400">
        <span>Weekly standup · sample transcript</span>
        <span className="timecode">00:12:48</span>
      </figcaption>
      <ol className="mt-4 divide-y divide-white/[0.06]">
        {LINES.map((l) => (
          <li key={l.time} className="grid grid-cols-[4.5rem_1fr] gap-3 py-3 first:pt-0 last:pb-0">
            <time className="timecode pt-0.5">{l.time}</time>
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-gray-100">
                <span className={`h-1.5 w-1.5 rounded-full ${l.color}`} />
                {l.speaker}
              </p>
              <p className="mt-0.5 text-sm text-gray-400">{l.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  )
}
