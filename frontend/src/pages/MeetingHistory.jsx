import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Video,
  Clock,
  Users,
  Calendar,
  ExternalLink,
  Download,
  FileText,
  FileJson,
  Subtitles,
  CircleDot,
  Sparkles,
  Loader2,
  CheckSquare
} from 'lucide-react'
import { useMeetingStore } from '../store/meetingStore'
import { useAuthStore } from '../store/authStore'
import { useTaskStore } from '../store/taskStore'
import AppShell from '../components/AppShell'
import api from '../lib/api'
import toast from 'react-hot-toast'

export default function MeetingHistory() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { meetings, getMeetings, isLoading } = useMeetingStore()
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadMeetings()
  }, [filter])

  const loadMeetings = async () => {
    const status = filter === 'all' ? null : filter
    await getMeetings(status)
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getDuration = (start, end) => {
    if (!start || !end) return 'N/A'
    const diff = new Date(end) - new Date(start)
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m`
  }

  return (
    <AppShell wide>
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display tracking-tight">Meetings</h1>
          <p className="text-gray-500 mt-1">Your past &amp; scheduled meetings, recordings, transcripts and AI summaries.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8 animate-fade-in-up stagger-1">
          {['all', 'active', 'ended', 'scheduled'].map((status, i) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all duration-300 border animate-scale-in stagger-${i + 1} ${
                filter === status
                  ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white border-transparent shadow-lg shadow-primary-500/30'
                  : 'bg-dark-300/70 border-white/[0.06] text-gray-400 hover:text-white hover:border-primary-500/30 hover:-translate-y-0.5'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
            </div>
          </div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-24 animate-fade-in-up stagger-2">
            <div className="inline-flex w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-500/15 to-accent-500/10 border border-white/[0.06] items-center justify-center mb-6 animate-float">
              <Calendar className="w-9 h-9 text-primary-300" />
            </div>
            <h3 className="text-2xl font-bold font-display mb-2">No meetings yet</h3>
            <p className="text-gray-400 mb-8">Your meeting history will appear here</p>
            <Link to="/app" className="btn btn-primary inline-flex px-6 py-3">
              Start a new meeting
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {meetings.map((meeting, i) => (
              <MeetingCard
                key={meeting._id}
                meeting={meeting}
                currentUserId={user?._id}
                navigate={navigate}
                formatDate={formatDate}
                getDuration={getDuration}
                index={i}
              />
            ))}
          </div>
        )}
      </main>
    </AppShell>
  )
}

function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl
  }

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000'
  return `${apiBase}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

function formatRecordingDuration(seconds) {
  const duration = Number(seconds)
  if (!Number.isFinite(duration) || duration <= 0) return 'N/A'

  const rounded = Math.floor(duration)
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60

  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

function MeetingCard({ meeting, currentUserId, navigate, formatDate, getDuration, index = 0 }) {
  const isHost = meeting.host?._id === currentUserId
  const participantCount = meeting.participants?.length || 0
  const recordings = Array.isArray(meeting.recordings) ? [...meeting.recordings].reverse() : []

  const getStatusStyle = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500/15 text-green-300 border-green-400/30'
      case 'ended': return 'bg-gray-500/15 text-gray-300 border-gray-400/25'
      case 'scheduled': return 'bg-blue-500/15 text-blue-300 border-blue-400/30'
      default: return 'bg-gray-500/15 text-gray-300 border-gray-400/25'
    }
  }

  const handleJoinOrView = () => {
    if (meeting.status === 'active') {
      navigate(`/meeting/${meeting.roomId}`)
    }
  }

  return (
    <div
      className={`group relative bg-dark-200/70 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-6 transition-all duration-300 hover:border-primary-500/25 hover:shadow-glow hover:-translate-y-0.5 animate-fade-in-up`}
      style={{ animationDelay: `${Math.min(index * 0.07, 0.35)}s` }}
    >
      {/* Left accent line */}
      <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-gradient-to-b from-primary-500 to-accent-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <h3 className="text-lg font-semibold font-display">{meeting.title}</h3>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${getStatusStyle(meeting.status)}`}>
              {meeting.status}
            </span>
            {isHost && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary-500/15 text-primary-300 border border-primary-400/25">
                Host
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-400/70" />
              {formatDate(meeting.createdAt)}
            </div>
            {meeting.endedAt && (
              <div className="flex items-center gap-2">
                <span>Duration:</span>
                <span className="text-gray-200 font-medium">{getDuration(meeting.startedAt, meeting.endedAt)}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary-400/70" />
              {participantCount} participant{participantCount !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-500">
            Room ID: <code className="bg-dark-300 border border-white/[0.06] px-2 py-0.5 rounded-md font-mono text-xs text-primary-300">{meeting.roomId}</code>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {meeting.status === 'active' && (
            <button onClick={handleJoinOrView} className="btn btn-primary group/btn">
              <ExternalLink className="w-4 h-4 transition-transform duration-300 group-hover/btn:rotate-12" />
              Rejoin
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <div className="flex items-center justify-between mb-3.5">
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-primary-400" />
            Recordings & Transcripts
          </h4>
          <span className="text-xs text-gray-500">
            {recordings.length} file set{recordings.length !== 1 ? 's' : ''}
          </span>
        </div>

        {recordings.length === 0 ? (
          <p className="text-sm text-gray-500">No recordings uploaded for this meeting yet.</p>
        ) : (
          <div className="space-y-3">
            {recordings.map((recording, index) => {
              const recordingUrl = toAbsoluteUrl(recording.url)
              const transcript = recording.transcription || {}
              const transcriptFiles = transcript.files || {}

              const transcriptLinks = [
                { label: 'JSON', url: toAbsoluteUrl(transcriptFiles.json?.url), icon: FileJson },
                { label: 'TXT', url: toAbsoluteUrl(transcriptFiles.txt?.url), icon: FileText },
                { label: 'SRT', url: toAbsoluteUrl(transcriptFiles.srt?.url), icon: Subtitles },
                { label: 'VTT', url: toAbsoluteUrl(transcriptFiles.vtt?.url), icon: CircleDot }
              ].filter(file => file.url)

              return (
                <div key={`${recording.filename || 'recording'}-${index}`} className="bg-dark-300/60 border border-white/[0.04] rounded-xl p-3.5 transition-all duration-300 hover:border-primary-500/20">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {recording.originalName || recording.filename || `Recording ${index + 1}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Duration: <span className="text-gray-200 font-medium">{formatRecordingDuration(recording.duration)}</span>
                        {recording.createdAt ? ` • Uploaded ${formatDate(recording.createdAt)}` : ''}
                      </p>
                    </div>

                    {recordingUrl && (
                      <a
                        href={recordingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary text-xs shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Recording
                      </a>
                    )}
                  </div>

                  <div className="mt-2.5 text-xs">
                    <span className={`px-2.5 py-1 rounded-full border font-medium ${
                      transcript.status === 'completed'
                        ? 'bg-green-500/10 text-green-300 border-green-400/25'
                        : transcript.status === 'failed'
                        ? 'bg-red-500/10 text-red-300 border-red-400/25'
                        : 'bg-yellow-500/10 text-yellow-300 border-yellow-400/25'
                    }`}>
                      Transcript: {transcript.status || 'pending'}
                    </span>
                  </div>

                  {transcriptLinks.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {transcriptLinks.map((file) => {
                        const Icon = file.icon
                        return (
                          <a
                            key={`${recording.filename || 'rec'}-${file.label}`}
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-400/70 border border-white/[0.06] hover:bg-primary-500/15 hover:border-primary-500/30 hover:-translate-y-0.5 text-gray-200 text-xs font-medium transition-all duration-200"
                          >
                            <Icon className="w-3.5 h-3.5 text-primary-300" />
                            {file.label}
                          </a>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* AI Summary */}
      <AiSummaryPanel meeting={meeting} navigate={navigate} />
    </div>
  )
}

function AiSummaryPanel({ meeting, navigate }) {
  const [summary, setSummary] = useState(meeting.aiSummary || null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [createdTasks, setCreatedTasks] = useState([])

  const generate = async (regenerate = false) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.post(`/ai/meetings/${meeting.roomId}/summary`, { regenerate })
      setSummary(res.data.data.summary)
      if (regenerate) toast.success('Summary regenerated')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate summary')
    } finally {
      setIsLoading(false)
    }
  }

  const createTaskFromItem = async (item) => {
    const res = await useTaskStore.getState().createTask({
      title: item.title,
      meetingId: meeting._id,
      description: 'Action item from AI meeting summary'
    })
    if (res.success) {
      setCreatedTasks(list => [...list, item.title])
      toast.success('Task created')
    } else {
      toast.error(res.message)
    }
  }

  if (!summary) {
    return (
      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <button
          onClick={() => generate(false)}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500/15 to-primary-500/15 border border-fuchsia-400/30 text-sm font-medium text-fuchsia-200 hover:from-fuchsia-500/25 hover:to-primary-500/25 transition-all disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {isLoading ? 'Analyzing transcript...' : 'Generate AI Summary'}
        </button>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mt-5 border-t border-white/[0.06] pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-fuchsia-300" />
          AI Summary
          {summary.model && <span className="text-[10px] font-normal text-gray-600">({summary.model})</span>}
        </h4>
        <button onClick={() => generate(true)} disabled={isLoading} className="text-xs text-gray-500 hover:text-fuchsia-300 transition-colors disabled:opacity-50">
          {isLoading ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>

      <p className="text-sm text-gray-300 leading-relaxed mb-3">{summary.summary}</p>

      {summary.keyPoints?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Key points</p>
          <ul className="space-y-1">
            {summary.keyPoints.map((point, i) => (
              <li key={i} className="text-sm text-gray-400 flex gap-2">
                <span className="text-primary-400 mt-0.5">•</span> {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.decisions?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Decisions</p>
          <ul className="space-y-1">
            {summary.decisions.map((d, i) => (
              <li key={i} className="text-sm text-emerald-300/90 flex gap-2">
                <CheckSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.actionItems?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Action items</p>
          <div className="space-y-1.5">
            {summary.actionItems.map((item, i) => {
              const done = createdTasks.includes(item.title)
              return (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-dark-300/50 border border-white/[0.05] px-3.5 py-2">
                  <span className="text-sm text-gray-300">
                    {item.title}
                    {item.assigneeHint && <span className="text-gray-600"> · {item.assigneeHint}</span>}
                  </span>
                  <button
                    onClick={() => createTaskFromItem(item)}
                    disabled={done}
                    className={`text-xs px-3 py-1 rounded-lg border transition-all shrink-0 ${
                      done
                        ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                        : 'border-primary-500/30 text-primary-300 hover:bg-primary-500/15'
                    }`}
                  >
                    {done ? 'Task created' : 'Create task'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
