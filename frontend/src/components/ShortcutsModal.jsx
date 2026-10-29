import { X } from 'lucide-react'

const SHORTCUTS = [
  ['Toggle microphone', 'Ctrl+D'],
  ['Toggle camera', 'Ctrl+E'],
  ['Share screen', 'Ctrl+Shift+S'],
  ['Raise / lower hand', 'Ctrl+Shift+H'],
  ['Toggle chat', 'Ctrl+Shift+C'],
  ['Toggle participants', 'Ctrl+Shift+P'],
  ['Toggle captions', 'Ctrl+Shift+U'],
  ['Show this list', '?'],
]

export default function ShortcutsModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold font-display">Keyboard shortcuts</h3>
          <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-2 text-sm">
          {SHORTCUTS.map(([label, keys]) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-gray-300">{label}</span>
              <kbd className="bg-dark-400 px-2 py-0.5 rounded text-xs">{keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
