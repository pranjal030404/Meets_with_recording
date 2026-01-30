import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { 
  Video, 
  Clock, 
  Users, 
  ArrowLeft,
  Calendar,
  ExternalLink,
  Trash2
} from 'lucide-react'
import { useMeetingStore } from '../store/meetingStore'
import { useAuthStore } from '../store/authStore'

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
    <div className="min-h-screen bg-dark-100">
      {/* Header */}
      <header className="bg-dark-200 border-b border-dark-400">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                <Video className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold">Meeting History</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {['all', 'active', 'ended', 'scheduled'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg capitalize transition-colors ${
                filter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-300 text-gray-400 hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-20">
            <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No meetings yet</h3>
            <p className="text-gray-400 mb-6">Your meeting history will appear here</p>
            <Link to="/" className="btn btn-primary inline-flex">
              Start a new meeting
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {meetings.map((meeting) => (
              <MeetingCard 
                key={meeting._id} 
                meeting={meeting} 
                currentUserId={user?._id}
                navigate={navigate}
                formatDate={formatDate}
                getDuration={getDuration}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function MeetingCard({ meeting, currentUserId, navigate, formatDate, getDuration }) {
  const isHost = meeting.host?._id === currentUserId
  const participantCount = meeting.participants?.length || 0

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'ended': return 'bg-gray-500'
      case 'scheduled': return 'bg-blue-500'
      default: return 'bg-gray-500'
    }
  }

  const handleJoinOrView = () => {
    if (meeting.status === 'active') {
      navigate(`/meeting/${meeting.roomId}`)
    }
  }

  return (
    <div className="bg-dark-200 rounded-xl p-6 hover:bg-dark-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold">{meeting.title}</h3>
            <span className={`px-2 py-0.5 rounded text-xs capitalize ${getStatusColor(meeting.status)} bg-opacity-20 text-white`}>
              {meeting.status}
            </span>
            {isHost && (
              <span className="px-2 py-0.5 rounded text-xs bg-primary-600/20 text-primary-400">
                Host
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {formatDate(meeting.createdAt)}
            </div>
            {meeting.endedAt && (
              <div className="flex items-center gap-2">
                <span>Duration:</span>
                {getDuration(meeting.startedAt, meeting.endedAt)}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {participantCount} participant{participantCount !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-500">
            Room ID: <code className="bg-dark-400 px-2 py-0.5 rounded">{meeting.roomId}</code>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {meeting.status === 'active' && (
            <button
              onClick={handleJoinOrView}
              className="btn btn-primary"
            >
              <ExternalLink className="w-4 h-4" />
              Rejoin
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
