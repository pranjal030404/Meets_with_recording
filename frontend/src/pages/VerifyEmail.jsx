import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import api from '../lib/api'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [state, setState] = useState(token ? 'loading' : 'error')
  const [message, setMessage] = useState(token ? '' : 'This verification link is missing its token.')

  useEffect(() => {
    if (!token) return
    api.post('/auth/verify-email', { token })
      .then((res) => { setState('ok'); setMessage(res.data.message || 'Email verified.') })
      .catch((err) => { setState('error'); setMessage(err.response?.data?.message || 'Verification failed. Try again.') })
  }, [token])

  return (
    <div className="min-h-screen bg-dark-100 text-slate-100 aurora-bg noise flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-dark-200/80 p-8 text-center shadow-2xl backdrop-blur-xl">
        {state === 'loading' && <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary-300" />}
        {state === 'ok' && <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />}
        {state === 'error' && <XCircle className="mx-auto h-12 w-12 text-red-400" />}
        <h1 className="mt-5 text-2xl font-bold font-display">
          {state === 'loading' ? 'Verifying…' : state === 'ok' ? 'Email verified' : 'Verification failed'}
        </h1>
        {message && <p className="mt-3 text-sm text-slate-300">{message}</p>}
        {state !== 'loading' && (
          <Link to="/login" className="btn btn-primary mt-6 inline-block px-6 py-3">Go to sign in</Link>
        )}
      </div>
    </div>
  )
}
