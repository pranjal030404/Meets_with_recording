const variants = {
  primary: 'bg-primary-500/15 text-primary-300 border-primary-500/30',
  secondary: 'bg-dark-400/70 text-gray-300 border-white/10',
  success: 'bg-green-500/15 text-green-300 border-green-500/30',
  danger: 'bg-red-500/15 text-red-300 border-red-500/30',
  warning: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  info: 'bg-blue-500/15 text-blue-300 border-blue-500/30'
}

const sizes = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm'
}

export default function Badge({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  dot = false,
  pulse = false
}) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-semibold rounded-full border backdrop-blur-sm
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full bg-current ${pulse ? 'animate-pulse' : ''}`} />
      )}
      {children}
    </span>
  )
}
