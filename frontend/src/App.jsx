import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

// Pages
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Meeting from './pages/Meeting'
import JoinMeeting from './pages/JoinMeeting'
import MeetingHistory from './pages/MeetingHistory'
import Teams from './pages/Teams'
import TeamDetail from './pages/TeamDetail'
import Calendar from './pages/Calendar'
import Pricing from './pages/Pricing'
import Billing from './pages/Billing'

// Protected Route Component
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-100 flex items-center justify-center">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
          <div className="absolute inset-2.5 rounded-full border-2 border-accent-500/30 border-b-transparent animate-spin [animation-duration:1.6s]" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

// Public Route (redirect to app if authenticated)
function PublicRoute({ children }) {
  const { isAuthenticated } = useAuthStore()

  if (isAuthenticated) {
    return <Navigate to="/app" replace />
  }

  return children
}

export default function App() {
  return (
    <Routes>
      {/* Landing page */}
      <Route path="/" element={<Landing />} />

      {/* Pricing (public, also viewable when logged in) */}
      <Route path="/pricing" element={<Pricing />} />

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
      <Route path="/app" element={
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
      <Route path="/billing" element={
        <ProtectedRoute>
          <Billing />
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
