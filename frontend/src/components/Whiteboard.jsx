import { useEffect, useRef, useState } from 'react'
import { X, Pen, Eraser, Trash2, Download, Palette, Minus, Plus, Circle, Square, Type, Slash } from 'lucide-react'
import { getSocket } from '../lib/socket'
import toast from 'react-hot-toast'

const COLORS = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF']

const BOARD = { width: 1600, height: 900 }
const SHAPES = ['line', 'rect', 'ellipse']
const TOOLS = [
  ['pen', Pen, 'Pen'], ['line', Slash, 'Line'], ['rect', Square, 'Rectangle'],
  ['ellipse', Circle, 'Ellipse'], ['text', Type, 'Text'], ['eraser', Eraser, 'Eraser']
]

// One stroke as sent over the socket (the phone app draws the same format)
const paintStroke = (ctx, { x0, y0, x1, y1, color, width, tool, text }) => {
  const ink = tool === 'eraser' ? '#FFFFFF' : color
  if (tool === 'text') {
    ctx.fillStyle = ink
    ctx.font = `${16 + width * 4}px sans-serif`
    ctx.textBaseline = 'top'
    ctx.fillText(text || '', x0, y0)
    return
  }
  ctx.strokeStyle = ink
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (tool === 'rect') ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
  else if (tool === 'ellipse') ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2)
  else { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1) }
  ctx.stroke()
}

export default function Whiteboard({ roomId, onClose }) {
  const canvasRef = useRef(null)
  const previewRef = useRef(null) // shape outline while dragging
  const [tool, setTool] = useState('pen')
  const [text, setText] = useState('')
  const [color, setColor] = useState('#000000')
  const [lineWidth, setLineWidth] = useState(3)
  const [showColorPicker, setShowColorPicker] = useState(false)
  // pen settings are read from a ref so changing them never re-creates (and wipes) the canvas
  const pen = useRef({ tool, color, lineWidth, text })
  pen.current = { tool, color, lineWidth, text }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const socket = getSocket()
    let last = null // previous point while the pointer is down

    // One fixed board for everyone (the phone app uses the same), scaled to fit each screen.
    // Setting width/height clears the canvas, so this must not re-run.
    canvas.width = BOARD.width
    canvas.height = BOARD.height
    const wipe = () => {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    wipe()

    const point = (e) => {
      // the element is letterboxed (object-contain): map the pointer into board coordinates
      const rect = canvas.getBoundingClientRect()
      const scale = Math.min(rect.width / BOARD.width, rect.height / BOARD.height)
      return {
        x: (e.clientX - rect.left - (rect.width - BOARD.width * scale) / 2) / scale,
        y: (e.clientY - rect.top - (rect.height - BOARD.height * scale) / 2) / scale
      }
    }
    const preview = previewRef.current
    preview.width = BOARD.width
    preview.height = BOARD.height
    const previewCtx = preview.getContext('2d')
    const clearPreview = () => previewCtx.clearRect(0, 0, BOARD.width, BOARD.height)
    const commit = (stroke) => {
      paintStroke(ctx, stroke)
      socket?.emit('whiteboard:draw', { roomId, ...stroke })
    }
    // the stroke from the last point to here, with the current pen
    const strokeTo = (next) => {
      const { tool: t, color: c, lineWidth: w } = pen.current
      return { x0: last.x, y0: last.y, x1: next.x, y1: next.y, color: c, width: t === 'eraser' ? w * 8 : w, tool: t }
    }

    const handleStart = (e) => {
      e.preventDefault()
      const { tool: t, color: c, lineWidth: w, text: words } = pen.current
      if (t === 'text') {
        const at = point(e)
        if (!words.trim()) return toast('Type the text in the box first, then click the board')
        return commit({ x0: at.x, y0: at.y, x1: at.x, y1: at.y, color: c, width: w, tool: t, text: words.trim() })
      }
      canvas.setPointerCapture?.(e.pointerId)
      last = point(e)
    }
    const handleMove = (e) => {
      if (!last) return
      e.preventDefault()
      const next = point(e)
      if (SHAPES.includes(pen.current.tool)) {
        clearPreview()
        paintStroke(previewCtx, strokeTo(next))
        return
      }
      commit(strokeTo(next))
      last = next
    }
    const handleEnd = (e) => {
      if (last && SHAPES.includes(pen.current.tool)) {
        clearPreview()
        if (e.type === 'pointerup') commit(strokeTo(point(e)))
      }
      last = null
    }

    canvas.addEventListener('pointerdown', handleStart)
    canvas.addEventListener('pointermove', handleMove)
    canvas.addEventListener('pointerup', handleEnd)
    canvas.addEventListener('pointercancel', handleEnd)

    const onRemoteDraw = (d) => paintStroke(ctx, d)
    socket?.on('whiteboard:draw', onRemoteDraw)
    socket?.on('whiteboard:clear', wipe)
    const onHistory = ({ strokes }) => { wipe(); strokes.forEach(onRemoteDraw) }
    socket?.on('whiteboard:history', onHistory)
    socket?.emit('whiteboard:request', { roomId })

    return () => {
      canvas.removeEventListener('pointerdown', handleStart)
      canvas.removeEventListener('pointermove', handleMove)
      canvas.removeEventListener('pointerup', handleEnd)
      canvas.removeEventListener('pointercancel', handleEnd)
      socket?.off('whiteboard:draw', onRemoteDraw)
      socket?.off('whiteboard:clear', wipe)
      socket?.off('whiteboard:history', onHistory)
    }
  }, [roomId])

  const clearCanvas = () => {
    const socket = getSocket()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (socket) socket.emit('whiteboard:clear', { roomId })
    toast.success('Whiteboard cleared')
  }

  const downloadCanvas = () => {
    const canvas = canvasRef.current
    const dataURL = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataURL
    a.download = `whiteboard-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success('Whiteboard saved')
  }

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-200 rounded-2xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-dark-400 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold mr-4">Collaborative whiteboard</h2>
            
            {/* Tool Buttons */}
            {TOOLS.map(([id, Icon, label]) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                className={`p-2 rounded-lg transition-colors ${tool === id ? 'bg-primary-600 text-ink' : 'bg-dark-400 hover:bg-dark-500'}`}
                title={label}
                aria-label={label}
                aria-pressed={tool === id}
              >
                <Icon className="w-5 h-5" />
              </button>
            ))}
            {tool === 'text' && (
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                placeholder="Type, then click the board"
                aria-label="Whiteboard text"
                className="rounded-lg bg-dark-400 px-3 py-1.5 text-sm text-white placeholder:text-gray-500"
              />
            )}

            {/* Line Width */}
            <div className="flex items-center gap-2 ml-4">
              <button onClick={() => setLineWidth(Math.max(1, lineWidth - 1))} className="p-2 bg-dark-400 hover:bg-dark-500 rounded-lg">
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-sm w-8 text-center">{lineWidth}</span>
              <button onClick={() => setLineWidth(Math.min(20, lineWidth + 1))} className="p-2 bg-dark-400 hover:bg-dark-500 rounded-lg">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Color Picker */}
            <div className="relative ml-4">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="p-2 bg-dark-400 hover:bg-dark-500 rounded-lg flex items-center gap-2"
              >
                <Palette className="w-5 h-5" />
                <div className="w-6 h-6 rounded border-2 border-white" style={{ backgroundColor: color }} />
              </button>
              {showColorPicker && (
                <div className="absolute top-full mt-2 left-0 bg-dark-300 p-3 rounded-lg z-10 flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setColor(c); setShowColorPicker(false) }}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? 'border-primary-400 scale-110' : 'border-dark-500'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={clearCanvas} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2 transition-colors">
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
            <button onClick={downloadCanvas} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" />
              Save
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-dark-400 hover:bg-dark-500 rounded-lg flex items-center gap-2 transition-colors">
              <X className="w-4 h-4" />
              Close
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none object-contain"
            style={{ touchAction: 'none' }}
          />
          <canvas ref={previewRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        </div>

        {/* Tips */}
        <div className="p-3 border-t border-dark-400 text-xs text-gray-400 text-center">
          Everyone can draw at once. Select Save to download the whiteboard.
        </div>
      </div>
    </div>
  )
}
