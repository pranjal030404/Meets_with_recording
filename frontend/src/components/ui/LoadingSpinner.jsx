export default function LoadingSpinner({
  size = 'md',
  className = '',
  text = ''
}) {
  const sizes = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
    xl: 'h-16 w-16 border-4'
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div
        className={`
          ${sizes[size]}
          rounded-full
          border-primary-500
          border-t-transparent
          animate-spin
        `}
      />
      {text && (
        <p className="text-gray-400 text-sm">{text}</p>
      )}
    </div>
  )
}

export function PageLoader({ text = 'Loading...' }) {
  return (
    <div className="min-h-screen bg-dark-100 flex items-center justify-center">
      <LoadingSpinner size="lg" text={text} />
    </div>
  )
}

export function InlineLoader({ size = 'sm' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  }

  return (
    <span className={`inline-block ${sizes[size]} border-2 border-current border-t-transparent rounded-full animate-spin`} />
  )
}
