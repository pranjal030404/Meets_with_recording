import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import api from '../lib/api'
import AuthLayout from '../components/AuthLayout'

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
    <AuthLayout aside={false} title={state === 'loading' ? 'Verifying…' : state === 'ok' ? 'Email verified' : 'Verification failed'}>
      {state === 'loading' && <Loader2 className="h-8 w-8 animate-spin text-primary-300" />}
      {message && (
        <p className="flex items-start gap-2.5 text-sm text-gray-300">
          {state === 'ok' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={1.5} />}
          {state === 'error' && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" strokeWidth={1.5} />}
          {message}
        </p>
      )}
      {state !== 'loading' && <Link to="/login" className="btn btn-primary btn-lg mt-6 w-full">Go to sign in</Link>}
    </AuthLayout>
  )
}
