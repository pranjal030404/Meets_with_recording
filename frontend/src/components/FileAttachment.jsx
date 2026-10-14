import { useState } from 'react'
import { File as FileIcon, Download, Play, ImageIcon, FileText, Film, Music, Archive } from 'lucide-react'
import { formatBytes } from '../store/fileStore'

/** Resolve an upload URL against the backend origin in dev. */
export const assetUrl = (url) => {
  if (!url) return ''
  if (url.startsWith('http') || url.startsWith('blob:')) return url
  return `${import.meta.env.DEV ? 'http://localhost:5000' : ''}${url}`
}

const IMAGE_TYPES = /^image\//
const VIDEO_TYPES = /^video\//
const AUDIO_TYPES = /^audio\//

const iconFor = (mime = '', name = '') => {
  const lower = mime.toLowerCase()
  if (IMAGE_TYPES.test(lower)) return ImageIcon
  if (VIDEO_TYPES.test(lower)) return Film
  if (AUDIO_TYPES.test(lower)) return Music
  if (lower.includes('pdf') || lower.includes('word') || lower.includes('text') || lower.includes('sheet')) return FileText
  if (lower.includes('zip') || lower.includes('rar') || lower.includes('tar')) return Archive
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return ImageIcon
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return Film
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return Music
  return FileIcon
}

/**
 * Rich attachment bubble shared by every chat surface.
 * Images/videos render inline previews; audio gets a player;
 * everything else gets a styled download card.
 */
export default function FileAttachment({ fileUrl, fileName, fileType, fileSize }) {
  const url = assetUrl(fileUrl)
  const mime = fileType || ''
  const [loaded, setLoaded] = useState(false)

  if (!url) return null

  const isImage = IMAGE_TYPES.test(mime) || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName || '')
  const isVideo = VIDEO_TYPES.test(mime) || /\.(mp4|webm|mov)$/i.test(fileName || '')
  const isAudio = AUDIO_TYPES.test(mime) || /\.(mp3|wav|ogg|m4a)$/i.test(fileName || '')
  const sizeLabel = fileSize ? formatBytes(Number(fileSize)) : ''

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mt-1.5 max-w-xs group/img relative">
        {!loaded && (
          <div className="absolute inset-0 rounded-2xl bg-dark-300/60 border border-white/[0.06] animate-pulse" />
        )}
        <img
          src={url}
          alt={fileName || 'Image'}
          onLoad={() => setLoaded(true)}
          className="rounded-2xl border border-white/[0.08] max-h-72 w-auto object-cover transition-transform duration-300 group-hover/img:scale-[1.02]"
        />
        <span className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm opacity-0 group-hover/img:opacity-100 transition-opacity">
          <Download className="w-3.5 h-3.5 text-white" />
        </span>
      </a>
    )
  }

  if (isVideo) {
    return (
      <div className="mt-1.5 max-w-sm">
        <video
          src={url}
          controls
          preload="metadata"
          className="rounded-2xl border border-white/[0.08] max-h-72 w-full bg-black"
        />
        <FileMetaRow fileName={fileName} sizeLabel={sizeLabel} href={url} />
      </div>
    )
  }

  if (isAudio) {
    return (
      <div className="mt-1.5 max-w-sm rounded-2xl bg-dark-300/60 border border-white/[0.08] p-3">
        <FileMetaRow fileName={fileName} sizeLabel={sizeLabel} href={url} Icon={Music} />
        <audio src={url} controls className="w-full mt-2 h-9" preload="metadata" />
      </div>
    )
  }

  const Icon = iconFor(mime, fileName)
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-1.5 flex items-center gap-3 rounded-2xl bg-dark-300/60 border border-white/[0.08] px-4 py-3 hover:border-primary-500/40 transition-colors max-w-sm group/file"
    >
      <span className="w-10 h-10 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary-300" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-gray-200 truncate">{fileName || 'Attachment'}</span>
        {sizeLabel && <span className="block text-[11px] text-gray-500">{sizeLabel}</span>}
      </span>
      <Download className="w-4 h-4 text-gray-500 group-hover/file:text-primary-300 transition-colors shrink-0" />
    </a>
  )
}

function FileMetaRow({ fileName, sizeLabel, href, Icon = Play }) {
  return (
    <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
      <Icon className="w-3.5 h-3.5 text-primary-300" />
      <a href={href} target="_blank" rel="noreferrer" className="truncate hover:text-gray-200 transition-colors">
        {fileName}
      </a>
      {sizeLabel && <span className="text-gray-600 shrink-0">· {sizeLabel}</span>}
    </div>
  )
}
