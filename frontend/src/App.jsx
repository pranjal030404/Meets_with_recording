import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { useAuthStore } from './store/authStore'
import { useAdminStore } from './store/adminStore'

// Pages are code-split: each route downloads only when visited (the first load used to ship the whole app)
const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const Home = lazy(() => import('./pages/Home'))
const Meeting = lazy(() => import('./pages/Meeting'))
const JoinMeeting = lazy(() => import('./pages/JoinMeeting'))
const MeetingHistory = lazy(() => import('./pages/MeetingHistory'))
const Teams = lazy(() => import('./pages/Teams'))
const TeamDetail = lazy(() => import('./pages/TeamDetail'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Billing = lazy(() => import('./pages/Billing'))
const Chat = lazy(() => import('./pages/Chat'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Files = lazy(() => import('./pages/Files'))
const Search = lazy(() => import('./pages/Search'))
const Admin = lazy(() => import('./pages/Admin'))
const AdminLogin = lazy(() => import('./pages/AdminLogin'))

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

// Admin portal: separate admin session, only reachable via /admin
function AdminRoute() {
  const { admin, isLoading, restore } = useAdminStore()
  useEffect(() => { restore() }, [restore])
  if (isLoading) return null
  return admin ? <Admin /> : <AdminLogin />
}

export default function App() {
  useEffect(() => { useAuthStore.getState().initializeAuth() }, [])
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-100" />}>
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
      <Route path="/verify-email" element={<VerifyEmail />} />
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
      <Route path="/chat" element={
        <ProtectedRoute>
          <Chat />
        </ProtectedRoute>
      } />
      <Route path="/chat/:conversationId" element={
        <ProtectedRoute>
          <Chat />
        </ProtectedRoute>
      } />
      <Route path="/tasks" element={
        <ProtectedRoute>
          <Tasks />
        </ProtectedRoute>
      } />
      <Route path="/files" element={
        <ProtectedRoute>
          <Files />
        </ProtectedRoute>
      } />
      <Route path="/search" element={
        <ProtectedRoute>
          <Search />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={<AdminRoute />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
