import useBilling from './lib/useBilling'
import lazyPage from './lib/lazyPage'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, Suspense } from 'react'
import { useAuthStore } from './store/authStore'
import { useAdminStore } from './store/adminStore'

// Pages are code-split: each route downloads only when visited (the first load used to ship the whole app)
const Landing = lazyPage(() => import('./pages/Landing'))
const Login = lazyPage(() => import('./pages/Login'))
const ForgotPassword = lazyPage(() => import('./pages/ForgotPassword'))
const Signup = lazyPage(() => import('./pages/Signup'))
const VerifyEmail = lazyPage(() => import('./pages/VerifyEmail'))
const Home = lazyPage(() => import('./pages/Home'))
const Meeting = lazyPage(() => import('./pages/Meeting'))
const JoinMeeting = lazyPage(() => import('./pages/JoinMeeting'))
const MeetingHistory = lazyPage(() => import('./pages/MeetingHistory'))
const Teams = lazyPage(() => import('./pages/Teams'))
const TeamDetail = lazyPage(() => import('./pages/TeamDetail'))
const Calendar = lazyPage(() => import('./pages/Calendar'))
const Pricing = lazyPage(() => import('./pages/Pricing'))
const Billing = lazyPage(() => import('./pages/Billing'))
const Chat = lazyPage(() => import('./pages/Chat'))
const Tasks = lazyPage(() => import('./pages/Tasks'))
const Files = lazyPage(() => import('./pages/Files'))
const Search = lazyPage(() => import('./pages/Search'))
const Admin = lazyPage(() => import('./pages/Admin'))
const AdminLogin = lazyPage(() => import('./pages/AdminLogin'))
const Legal = lazyPage(() => import('./pages/Legal'))

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

// Pricing and billing exist only where there are paid plans
function PaidOnly({ children }) {
  const billing = useBilling()
  if (billing === null) return null
  return billing ? children : <Navigate to="/" replace />
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
      <Route path="/pricing" element={<PaidOnly><Pricing /></PaidOnly>} />

      {/* Public Routes */}
      <Route path="/login" element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      } />
      <Route path="/forgot-password" element={
        <PublicRoute>
          <ForgotPassword />
        </PublicRoute>
      } />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/privacy" element={<Legal page="privacy" />} />
      <Route path="/terms" element={<Legal page="terms" />} />
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
          <PaidOnly><Billing /></PaidOnly>
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
