import { ChevronLeft, ChevronRight } from 'lucide-react'

// A row in the tools list (icon, title, one-line description, chevron)
export function ToolRow({ icon, title, description, onClick, disabled = false, trailing }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
        disabled
          ? 'bg-dark-300/40 text-gray-500 cursor-not-allowed'
          : 'bg-dark-300/70 hover:bg-dark-400/80 text-gray-100'
      }`}
    >
      <span className={`shrink-0 ${disabled ? 'opacity-50' : 'text-primary-400'}`}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className={`block text-xs truncate ${disabled ? 'text-gray-600' : 'text-gray-400'}`}>{description}</span>
      </span>
      {trailing}
      {!disabled && !trailing && <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
    </button>
  )
}

export function BackHeader({ title, onBack }) {
  return (
    <button onClick={onBack} className="flex items-center gap-1 px-3 py-3 text-sm font-semibold text-gray-200 hover:text-white">
      <ChevronLeft className="w-4 h-4" /> {title}
    </button>
  )
}

export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`w-full py-2.5 rounded-full text-sm font-semibold bg-primary-500 hover:bg-primary-400 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  )
}

export function DangerButton({ children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`w-full py-2.5 rounded-full text-sm font-semibold bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors ${className}`}
    >
      {children}
    </button>
  )
}

export const selectClass =
  'w-full bg-dark-300 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-gray-100 outline-none focus:border-primary-500/60'
