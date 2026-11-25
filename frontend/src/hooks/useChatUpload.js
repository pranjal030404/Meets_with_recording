import { useState, useCallback, useRef } from 'react'
import { useFileStore } from '../store/fileStore'
import { canMove, UPLOAD_TRANSITIONS } from '../lib/sessionMachine'

/**
 * Shared hook for chat file attachments: picks a file, uploads it via
 * fileStore (which posts to /api/files/upload with scope metadata), and
 * returns the FileEntry for the message payload.
 *
 * Usage:
 *   const { pendingFile, isUploading, selectFile, clearPending, sendAttachment } = useChatUpload(scopeGetter)
 *   // selectFile(file) queues it (see AttachMenu); sendAttachment() uploads + returns the entry
 */
export default function useChatUpload(scopeGetter = () => ({})) {
  // One explicit status instead of pendingFile/isUploading/progress being able to disagree
  // (see UPLOAD_TRANSITIONS): idle -> selected -> uploading -> done | failed
  const [pendingFile, setPendingFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const statusRef = useRef('idle') // sync mirror so two quick clicks can't both start an upload

  const upload = useFileStore(s => s.upload)

  const move = useCallback((next) => {
    if (!canMove(UPLOAD_TRANSITIONS, statusRef.current, next)) return false
    statusRef.current = next
    setStatus(next)
    return true
  }, [])

  const clearPending = useCallback(() => {
    if (statusRef.current === 'uploading') return // can't abandon a file mid-flight
    setPendingFile(null)
    setProgress(0)
    statusRef.current = 'idle'
    setStatus('idle')
  }, [])

  const selectFile = useCallback((file) => {
    if (statusRef.current === 'uploading' || !file) return
    setPendingFile(file)
    setProgress(0)
    statusRef.current = 'selected'
    setStatus('selected')
  }, [])

  const sendAttachment = useCallback(async () => {
    if (!pendingFile || statusRef.current === 'uploading') return null
    if (!move('uploading')) return null
    setProgress(15)
    try {
      const scope = typeof scopeGetter === 'function' ? scopeGetter() : {}
      const res = await upload(pendingFile, scope)
      if (!res.success) { move('failed'); setProgress(0); return null }
      setProgress(100)
      move('done')
      return res.file
    } catch (e) {
      move('failed'); setProgress(0)
      return null
    }
  }, [pendingFile, scopeGetter, upload, move])

  const isUploading = status === 'uploading'
  return { pendingFile, status, isUploading, progress, selectFile, clearPending, sendAttachment }
}
