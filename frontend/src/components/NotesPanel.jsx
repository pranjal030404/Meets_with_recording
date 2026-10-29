import { useState, useEffect, useRef } from 'react'
import { X, Download, StickyNote } from 'lucide-react'
import { getSocket } from '../lib/socket'

/**
 * Shared meeting notes (Teams "Meeting notes"). Everyone in the room edits one text;
 * edits are debounced and the latest write wins. The server replays the current
 * text to anyone who opens the panel late.
 */
export default function NotesPanel({ roomId, title, onClose }) {
  const [text, setText] = useState('')
  const [lastEditor, setLastEditor] = useState(null)
  const sendTimer = useRef(null)

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const onUpdate = ({ text: incoming, userName }) => {
      setText(incoming)
      setLastEditor(userName)
    }
    socket.on('notes:update', onUpdate)
    socket.emit('notes:request', { roomId })
    return () => {
      socket.off('notes:update', onUpdate)
      clearTimeout(sendTimer.current)
    }
  }, [roomId])

  const onChange = (e) => {
    const value = e.target.value
    setText(value)
    setLastEditor(null)
    clearTimeout(sendTimer.current)
    sendTimer.current = setTimeout(() => getSocket()?.emit('notes:update', { roomId, text: value }), 400)
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title || 'meeting').replace(/[^\w-]+/g, '_')}-notes.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="w-80 bg-dark-200 border-l border-dark-400 flex flex-col">
      <div className="p-4 border-b border-dark-400 flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2"><StickyNote className="w-4 h-4" /> Meeting notes</h2>
        <div className="flex items-center gap-1">
          <button onClick={download} disabled={!text} className="p-1 hover:bg-dark-400 rounded disabled:opacity-40" aria-label="Download notes">
            <Download className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={onChange}
        maxLength={20000}
        placeholder="Take notes together. Everyone in the meeting sees and edits this."
        className="flex-1 bg-transparent p-4 text-sm resize-none outline-none"
      />
      <div className="px-4 py-2 text-xs text-gray-500 border-t border-dark-400">
        {lastEditor ? `Last edited by ${lastEditor}` : 'Shared with everyone in this meeting'}
      </div>
    </div>
  )
}
