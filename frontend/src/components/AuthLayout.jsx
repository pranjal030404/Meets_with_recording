import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import branding from '../config/branding'
import BrandMark from './BrandMark'
import TranscriptSample from './TranscriptSample'

/** Shared frame for every signed-out form: transcript on the left, form card on the right. */
export default function AuthLayout({ title, subtitle, children, aside = true }) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-dark-100 px-4 py-8">
      <div className={`grid w-full items-center gap-12 ${aside ? 'max-w-md lg:max-w-5xl lg:grid-cols-2 lg:gap-16' : 'max-w-md'}`}>
        {aside && (
          <section className="hidden lg:block">
            <p className="max-w-md font-display text-4xl font-semibold leading-tight text-gray-100">
              Meetings you can record, transcribe and search later
            </p>
            <TranscriptSample className="mt-8" />
          </section>
        )}

        <section className="card p-6 sm:p-8">
          <Link to="/" className="mb-6 inline-flex items-center gap-3">
            <BrandMark />
            <span className="font-display text-lg font-semibold">{branding.appName}</span>
          </Link>
          <h1 className="font-display text-2xl font-semibold text-gray-100">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </section>
      </div>
    </div>
  )
}

/** Labelled input with a leading icon; pass `reveal`/`onReveal` for password fields. */
export function Field({ id, label, icon: Icon, reveal, onReveal, type = 'text', ...props }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" strokeWidth={1.5} />
        <input id={id} type={reveal ? 'text' : type} className={`input min-h-11 pl-10 ${onReveal ? 'pr-11' : ''}`} {...props} />
        {onReveal && (
          <button
            type="button"
            onClick={onReveal}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-500 transition-colors hover:text-white"
          >
            {reveal ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
          </button>
        )}
      </div>
    </div>
  )
}

export function FormError({ children }) {
  return <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{children}</div>
}

export function SubmitButton({ busy, busyLabel, children }) {
  return (
    <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full">
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
      {busy ? busyLabel : children}
    </button>
  )
}
