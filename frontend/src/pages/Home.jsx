import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { 
  Video, 
  Plus, 
  Calendar, 
  Link2, 
  LogOut, 
  User,
  Clock,
  Users
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useMeetingStore } from '../store/meetingStore'
import NotificationBell from '../components/NotificationBell'
import toast from 'react-hot-toast'

export default function Home() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { createMeeting, isLoading } = useMeetingStore()
  const [joinCode, setJoinCode] = useState('')

  const handleNewMeeting = async () => {
    const result = await createMeeting({ title: 'Instant Meeting' })
    
    if (result.success) {
      navigate(`/meeting/${result.meeting.roomId}`)
    } else {
      toast.error(result.message)
    }
  }

  const handleJoinMeeting = (e) => {
    e.preventDefault()
    
    if (!joinCode.trim()) {
      toast.error('Please enter a meeting code')
      return
    }

    // Extract room ID from URL or code
    let roomId = joinCode.trim()
    if (joinCode.includes('/meeting/')) {
      roomId = joinCode.split('/meeting/')[1]
    }

    navigate(`/join/${roomId}`)
  }

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out successfully')
  }

  return (
    <div className="min-h-screen bg-dark-100">
      {/* Header */}
      <header className="bg-dark-200 border-b border-dark-400">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold">MeetClone</span>
          </div>

          <div className="flex items-center gap-4">
            <Link 
              to="/teams" 
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <Users className="w-5 h-5" />
              <span className="hidden sm:inline">Teams</span>
            </Link>

            <Link 
              to="/calendar" 
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <Calendar className="w-5 h-5" />
              <span className="hidden sm:inline">Calendar</span>
            </Link>

            <Link 
              to="/history" 
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <Clock className="w-5 h-5" />
              <span className="hidden sm:inline">History</span>
            </Link>

            <NotificationBell />

            <div className="flex items-center gap-3 pl-4 border-l border-dark-400">
              <div className="flex items-center gap-2">
                <img 
                  src={user?.avatar} 
                  alt={user?.name}
                  className="w-8 h-8 rounded-full"
                />
                <span className="hidden sm:inline text-sm">{user?.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Actions */}
          <div>
            <h1 className="text-4xl font-bold mb-4">
              Video calls and meetings for everyone
            </h1>
            <p className="text-gray-400 text-lg mb-8">
              Connect, collaborate, and celebrate from anywhere with MeetClone
            </p>

            <div className="flex flex-wrap gap-4 mb-8">
              <button
                onClick={handleNewMeeting}
                disabled={isLoading}
                className="btn btn-primary px-6 py-3"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  <>
                    <Video className="w-5 h-5" />
                    New Meeting
                  </>
                )}
              </button>

              <Link to="/join" className="btn btn-secondary px-6 py-3">
                <Plus className="w-5 h-5" />
                Join Meeting
              </Link>
            </div>

            {/* Quick Join */}
            <form onSubmit={handleJoinMeeting} className="flex gap-3">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="input pl-10"
                  placeholder="Enter a meeting code or link"
                />
              </div>
              <button
                type="submit"
                className="btn btn-secondary whitespace-nowrap"
              >
                Join
              </button>
            </form>
          </div>

          {/* Right: Illustration */}
          <div className="hidden lg:block">
            <div className="bg-dark-200 rounded-2xl p-8 relative overflow-hidden">
              <div className="grid grid-cols-2 gap-4">
                {/* Simulated video tiles */}
                <div className="aspect-video bg-dark-300 rounded-xl flex items-center justify-center">
                  <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center">
                    <User className="w-8 h-8" />
                  </div>
                </div>
                <div className="aspect-video bg-dark-300 rounded-xl flex items-center justify-center">
                  <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center">
                    <User className="w-8 h-8" />
                  </div>
                </div>
                <div className="aspect-video bg-dark-300 rounded-xl flex items-center justify-center">
                  <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center">
                    <User className="w-8 h-8" />
                  </div>
                </div>
                <div className="aspect-video bg-dark-300 rounded-xl flex items-center justify-center">
                  <div className="w-16 h-16 bg-yellow-600 rounded-full flex items-center justify-center">
                    <User className="w-8 h-8" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-20">
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything you need for productive meetings
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard 
              icon={<Video className="w-6 h-6" />}
              title="HD Video Calls"
              description="Crystal clear video and audio for your meetings"
            />
            <FeatureCard 
              icon={<Users className="w-6 h-6" />}
              title="Team Workspaces"
              description="Create teams, manage members, and collaborate"
            />
            <FeatureCard 
              icon={<Calendar className="w-6 h-6" />}
              title="Meeting Scheduler"
              description="Schedule meetings with reminders and notifications"
            />
            <FeatureCard 
              icon={<Clock className="w-6 h-6" />}
              title="Smart Reminders"
              description="Never miss a meeting with automated reminders"
            />
          </div>
        </div>
      </main>
    </div>
  )
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="bg-dark-200 rounded-xl p-6 hover:bg-dark-300 transition-colors">
      <div className="w-12 h-12 bg-primary-600/20 rounded-xl flex items-center justify-center text-primary-400 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  )
}
