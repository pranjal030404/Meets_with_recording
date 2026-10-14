import { useState, useCallback, useRef } from 'react'
import { useFileStore } from '../store/fileStore'

/**
 * Shared hook for chat file attachments: picks a file, uploads it via
 * fileStore (which posts to /api/files/upload with scope metadata), and
 * returns the FileEntry for the message payload.
 *
 * Usage:
 *   const { fileInputRef, pendingFile, isUploading, pick, clearPending, sendAttachment } = useChatUpload(scopeGetter)
 *   // pick() opens the file dialog; sendAttachment(scope) uploads + returns the entry
 */
export default function useChatUpload(scopeGetter = () => ({})) {
  const [pendingFile, setPendingFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef(null)

  const upload = useFileStore(s => s.upload)

  const pick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const clearPending = useCallback(() => {
    setPendingFile(null)
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const onFileChange = useCallback((e) => {
    setPendingFile(e.target.files[0] || null)
  }, [])

  const sendAttachment = useCallback(async () => {
    if (!pendingFile) return null
    setIsUploading(true)
    setProgress(15)
    try {
      const scope = typeof scopeGetter === 'function' ? scopeGetter() : {}
      const res = await upload(pendingFile, scope)
      if (!res.success) return null
      setProgress(100)
      return res.file
    } finally {
      setIsUploading(false)
    }
  }, [pendingFile, scopeGetter, upload])

  return { fileInputRef, pendingFile, setPendingFile, isUploading, progress, pick, clearPending, onFileChange, sendAttachment }
}
