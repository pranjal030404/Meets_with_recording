import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

// Pages
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Meeting from './pages/Meeting'
import JoinMeeting from './pages/JoinMeeting'
import MeetingHistory from './pages/MeetingHistory'
import Teams from './pages/Teams'
import TeamDetail from './pages/TeamDetail'
import Calendar from './pages/Calendar'

// Protected Route Component
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

// Public Route (redirect to home if authenticated)
function PublicRoute({ children }) {
  const { isAuthenticated } = useAuthStore()

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return children
}

export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      } />
      <Route path="/signup" element={
        <PublicRoute>
          <Signup />
        </PublicRoute>
      } />

      {/* Protected Routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <Home />
        </ProtectedRoute>
      } />
      <Route path="/meeting/:roomId" element={
        <ProtectedRoute>
          <Meeting />
        </ProtectedRoute>
      } />
      <Route path="/join" element={
        <ProtectedRoute>
          <JoinMeeting />
        </ProtectedRoute>
      } />
      <Route path="/join/:roomId" element={
        <ProtectedRoute>
          <JoinMeeting />
        </ProtectedRoute>
      } />
      <Route path="/history" element={
        <ProtectedRoute>
          <MeetingHistory />
        </ProtectedRoute>
      } />
      <Route path="/teams" element={
        <ProtectedRoute>
          <Teams />
        </ProtectedRoute>
      } />
      <Route path="/teams/:teamId" element={
        <ProtectedRoute>
          <TeamDetail />
        </ProtectedRoute>
      } />
      <Route path="/calendar" element={
        <ProtectedRoute>
          <Calendar />
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
