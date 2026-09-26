import { useEffect, useState, useRef } from 'react'
import {
  UploadCloud, File as FileIcon, FileText, Image as ImageIcon, Film, Music,
  Download, Trash2, RotateCcw, Loader2, Search, FolderOpen, HardDrive, X
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useFileStore, formatBytes } from '../store/fileStore'
import { useTaskStore } from '../store/taskStore'
import AppShell from '../components/AppShell'
import toast from 'react-hot-toast'

const FILE_TYPE_COLORS = {
  image: 'text-emerald-300 bg-emerald-500/10',
  text: 'text-blue-300 bg-blue-500/10',
  video: 'text-fuchsia-300 bg-fuchsia-500/10',
  audio: 'text-amber-300 bg-amber-500/10',
  other: 'text-gray-400 bg-white/[0.05]'
}

const kindOf = (mimeType = '', name = '') => {
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return 'image'
  if (mimeType.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(name)) return 'video'
  if (mimeType.startsWith('audio/') || /\.(mp3|wav|ogg)$/i.test(name)) return 'audio'
  if (mimeType.startsWith('text/') || /\.(txt|md|pdf|docx?|xlsx?|csv|srt|vtt|json)$/i.test(name)) return 'text'
  return 'other'
}

const FileGlyph = ({ mimeType, name, size = 'w-10 h-10' }) => {
  const kind = kindOf(mimeType, name)
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? Film : kind === 'audio' ? Music : kind === 'text' ? FileText : FileIcon
  return (
    <div className={`${size} rounded-xl flex items-center justify-center ${FILE_TYPE_COLORS[kind]}`}>
      <Icon className="w-5 h-5" />
    </div>
  )
}

export default function Files() {
  return (
    <AppShell>
      <FilesPage />
    </AppShell>
  )
}

function FilesPage() {
  const { user } = useAuthStore()
  const { files, trash, storage, isLoading, isUploading, fetchFiles, fetchStorage, upload, deleteFile, restoreFile, fetchTrash, downloadUrl } = useFileStore()
  const { teams, fetchTeams } = useTaskStore()
  const [scope, setScope] = useState('mine')
  const [teamId, setTeamId] = useState('')
  const [search, setSearch] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchStorage()
    fetchTeams()
  }, [])

  useEffect(() => {
    if (!showTrash) fetchFiles({ scope, teamId: teamId || undefined, search: search || undefined })
  }, [scope, teamId, search, showTrash])

  useEffect(() => {
    if (showTrash) fetchTrash()
  }, [showTrash])

  const handleFiles = async (fileList) => {
    for (const f of Array.from(fileList)) {
      const res = await upload(f, { teamId: scope === 'team' ? teamId : undefined })
      if (!res.success) { toast.error(`${f.name}: ${res.message}`); break }
    }
    if (Array.from(fileList).length > 0) toast.success('Upload complete')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  const list = showTrash ? trash : files

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">Files</h1>
          <p className="text-gray-500 mt-1 flex items-center gap-1.5">
            <HardDrive className="w-4 h-4" /> Using {formatBytes(storage.personalBytes)} of personal storage
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTrash(!showTrash)} className={`btn ${showTrash ? 'btn-primary' : 'btn-secondary'}`}>
            <Trash2 className="w-4 h-4" /> Trash
          </button>
          {!showTrash && (
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="btn btn-primary">
              <UploadCloud className="w-4 h-4" /> {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          )}
        </div>
      </div>

      {!showTrash && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-6 rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
            dragOver ? 'border-primary-400 bg-primary-500/10' : 'border-white/10 hover:border-primary-500/40 hover:bg-white/[0.02]'
          }`}
        >
          <UploadCloud className="w-8 h-8 mx-auto text-gray-500 mb-2" />
          <p className="text-sm text-gray-400">Drop files here or click to upload <span className="text-gray-600">(up to 50 MB)</span></p>
          {scope === 'team' && teamId && <p className="text-xs text-primary-300 mt-1">Uploads will be shared with the selected team</p>}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = '' }}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {!showTrash && (
          <>
            <div className="flex rounded-xl bg-dark-300/50 border border-white/[0.06] p-1">
              <button onClick={() => { setScope('mine'); setTeamId('') }} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${scope === 'mine' ? 'bg-primary-500/20 text-primary-200' : 'text-gray-400 hover:text-gray-200'}`}>
                My files
              </button>
              <button onClick={() => setScope('team')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${scope === 'team' ? 'bg-primary-500/20 text-primary-200' : 'text-gray-400 hover:text-gray-200'}`}>
                Team files
              </button>
            </div>
            {scope === 'team' && (
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="input !w-auto !py-2 text-sm">
                <option value="">Select a team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </>
        )}
        {!showTrash && (
          <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files..." className="input pl-9 !py-2 text-sm" />
          </div>
        )}
      </div>

      {/* List */}
      {scope === 'team' && !teamId && !showTrash ? (
        <div className="text-center py-20 text-gray-500">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          Pick a team to browse its files.
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 text-gray-600 animate-spin" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <FileIcon className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          {showTrash ? 'Trash is empty.' : 'No files yet — upload something!'}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(f => (
            <div key={f.id} className="group flex items-center gap-4 rounded-2xl bg-dark-200/50 border border-white/[0.06] px-4 py-3 hover:border-primary-500/30 transition-all">
              <FileGlyph mimeType={f.mimeType} name={f.originalName} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-200 truncate">{f.originalName}</p>
                <p className="text-xs text-gray-500">
                  {formatBytes(Number(f.size))} · {f.owner?.name || 'Unknown'} · {new Date(f.createdAt).toLocaleDateString()}
                  {f.team && ` · ${f.team.name}`}
                </p>
              </div>
              {!showTrash ? (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={downloadUrl(f.id)} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-gray-400 hover:text-primary-300 hover:bg-primary-500/10" title="Download">
                    <Download className="w-4 h-4" />
                  </a>
                  {f.ownerId === user.id && (
                    <button onClick={async () => { const r = await deleteFile(f.id); r.success ? toast.success('Moved to trash') : toast.error(r.message) }} className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <button onClick={async () => { const r = await restoreFile(f.id); r.success ? toast.success('Restored') : toast.error(r.message) }} className="p-2 rounded-lg text-gray-400 hover:text-emerald-300 hover:bg-emerald-500/10" title="Restore">
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
