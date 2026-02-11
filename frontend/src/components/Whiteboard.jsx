import { useEffect, useRef, useState } from 'react'
import { X, Pen, Eraser, Trash2, Download, Palette, Minus, Plus, Circle, Square, Type } from 'lucide-react'
import { getSocket } from '../lib/socket'
import toast from 'react-hot-toast'

const COLORS = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF']

export default function Whiteboard({ roomId, onClose }) {
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [tool, setTool] = useState('pen') // pen, eraser, line, circle, rectangle, text
  const [color, setColor] = useState('#000000')
  const [lineWidth, setLineWidth] = useState(3)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [lastX, setLastX] = useState(0)
  const [lastY, setLastY] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const socket = getSocket()

    // Set canvas size to match container
    const resizeCanvas = () => {
      const container = canvas.parentElement
      canvas.width = container.offsetWidth
      canvas.height = container.offsetHeight
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    resizeCanvas()

    // Drawing function
    const draw = (x0, y0, x1, y1, color, width, currentTool, emit = true) => {
      ctx.strokeStyle = currentTool === 'eraser' ? '#FFFFFF' : color
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()

      if (emit && socket) {
        socket.emit('whiteboard:draw', { roomId, x0, y0, x1, y1, color, width, tool: currentTool })
      }
    }

    // Mouse/Touch event handlers
    const getCoordinates = (e) => {
      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left
      const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top
      return { x, y }
    }

    const handleStart = (e) => {
      e.preventDefault()
      setIsDrawing(true)
      const { x, y } = getCoordinates(e)
      setLastX(x)
      setLastY(y)
    }

    const handleMove = (e) => {
      if (!isDrawing) return
      e.preventDefault()
      const { x, y } = getCoordinates(e)
      draw(lastX, lastY, x, y, color, lineWidth, tool)
      setLastX(x)
      setLastY(y)
    }

    const handleEnd = () => {
      setIsDrawing(false)
    }

    canvas.addEventListener('mousedown', handleStart)
    canvas.addEventListener('mousemove', handleMove)
    canvas.addEventListener('mouseup', handleEnd)
    canvas.addEventListener('mouseleave', handleEnd)
    canvas.addEventListener('touchstart', handleStart)
    canvas.addEventListener('touchmove', handleMove)
    canvas.addEventListener('touchend', handleEnd)

    // Socket listeners for remote drawing
    socket.on('whiteboard:draw', ({ x0, y0, x1, y1, color: remoteColor, width: remoteWidth, tool: remoteTool }) => {
      draw(x0, y0, x1, y1, remoteColor, remoteWidth, remoteTool, false)
    })

    socket.on('whiteboard:clear', () => {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    })

    return () => {
      canvas.removeEventListener('mousedown', handleStart)
      canvas.removeEventListener('mousemove', handleMove)
      canvas.removeEventListener('mouseup', handleEnd)
      canvas.removeEventListener('mouseleave', handleEnd)
      canvas.removeEventListener('touchstart', handleStart)
      canvas.removeEventListener('touchmove', handleMove)
      canvas.removeEventListener('touchend', handleEnd)
      socket.off('whiteboard:draw')
      socket.off('whiteboard:clear')
    }
  }, [isDrawing, tool, color, lineWidth, lastX, lastY, roomId])

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
      <div className="bg-dark-200 rounded-2xl w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl">
        {/* Toolbar */}
        <div className="p-4 border-b border-dark-400 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold mr-4">Collaborative Whiteboard</h2>
            
            {/* Tool Buttons */}
            <button
              onClick={() => setTool('pen')}
              className={`p-2 rounded-lg transition-colors ${tool === 'pen' ? 'bg-primary-600' : 'bg-dark-400 hover:bg-dark-500'}`}
              title="Pen"
            >
              <Pen className="w-5 h-5" />
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`p-2 rounded-lg transition-colors ${tool === 'eraser' ? 'bg-primary-600' : 'bg-dark-400 hover:bg-dark-500'}`}
              title="Eraser"
            >
              <Eraser className="w-5 h-5" />
            </button>

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
                <div className="absolute top-full mt-2 left-0 bg-dark-300 p-3 rounded-lg shadow-xl z-10 flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setColor(c); setShowColorPicker(false) }}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-primary-400 scale-110' : 'border-dark-500'}`}
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
            className="absolute inset-0 cursor-crosshair touch-none"
            style={{ touchAction: 'none' }}
          />
        </div>

        {/* Tips */}
        <div className="p-3 border-t border-dark-400 text-xs text-gray-400 text-center">
          💡 Tip: All participants can draw simultaneously. Click "Save" to download your whiteboard.
        </div>
      </div>
    </div>
  )
}
