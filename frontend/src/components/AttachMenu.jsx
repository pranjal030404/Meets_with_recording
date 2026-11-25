import { useEffect, useRef, useState } from 'react'
import { Paperclip, Image as ImageIcon, Camera, FileText, Music, File as FileIcon, X } from 'lucide-react'
import toast from 'react-hot-toast'

const CHOICES = [
  { label: 'Photo or video', icon: ImageIcon, accept: 'image/*,video/*' },
  { label: 'Camera', icon: Camera, camera: true },
  { label: 'Document', icon: FileText, accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.odt,.ods,.odp' },
  { label: 'Audio', icon: Music, accept: 'audio/*' },
  { label: 'Any file', icon: FileIcon, accept: '' }
]

/** Paperclip button with a menu of attachment sources. Hands the chosen File to onFile. */
export default function AttachMenu({ onFile, disabled }) {
  const [open, setOpen] = useState(false)
  const [camera, setCamera] = useState(false)
  const inputRef = useRef(null)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  const choose = (choice) => {
    setOpen(false)
    if (choice.camera) return setCamera(true)
    inputRef.current.accept = choice.accept
    inputRef.current.click()
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <input ref={inputRef} type="file" className="hidden"
        onChange={(e) => { const file = e.target.files[0]; e.target.value = ''; if (file) onFile(file) }} />
      <button type="button" onClick={() => setOpen(o => !o)} disabled={disabled}
        className="p-2.5 rounded-xl text-gray-400 hover:text-primary-300 hover:bg-primary-500/10 transition-colors disabled:opacity-50"
        title="Attach" aria-label="Attach" aria-haspopup="menu" aria-expanded={open}>
        <Paperclip className="w-5 h-5" />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full left-0 mb-2 w-48 rounded-xl bg-dark-300 border border-white/10 shadow-xl py-1.5 z-30">
          {CHOICES.map((choice) => (
            <button key={choice.label} type="button" role="menuitem" onClick={() => choose(choice)}
              className="w-full flex items-center gap-3 px-3.5 py-2 text-sm text-gray-200 hover:bg-primary-500/15 text-left">
              <choice.icon className="w-4 h-4 text-primary-300" />
              {choice.label}
            </button>
          ))}
        </div>
      )}
      {camera && <CameraCapture onClose={() => setCamera(false)} onFile={onFile} />}
    </div>
  )
}

// A live preview, because desktop browsers ignore <input capture> and just open the file picker
function CameraCapture({ onClose, onFile }) {
  const videoRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stream = null
    let closed = false
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
        if (closed) return stream.getTracks().forEach(t => t.stop())
        videoRef.current.srcObject = stream
      } catch (err) {
        if (closed) return
        toast.error(err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Could not open the camera')
        onClose()
      }
    }
    start()
    return () => { closed = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  const capture = () => {
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return toast.error('Could not take the photo')
      onFile(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      onClose()
    }, 'image/jpeg', 0.9)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-label="Take a photo">
      <div className="w-full max-w-lg rounded-2xl bg-dark-200 border border-white/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold font-display">Take a photo</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <video ref={videoRef} autoPlay muted playsInline onLoadedMetadata={() => setReady(true)} className="w-full aspect-video rounded-xl bg-black object-contain" />
        <button type="button" onClick={capture} disabled={!ready} className="btn btn-primary w-full mt-3">
          <Camera className="w-4 h-4" /> Capture
        </button>
      </div>
    </div>
  )
}
