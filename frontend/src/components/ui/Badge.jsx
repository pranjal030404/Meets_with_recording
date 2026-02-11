const variants = {
  primary: 'bg-primary-600/20 text-primary-400 border-primary-500/30',
  secondary: 'bg-dark-400 text-gray-300 border-dark-500',
  success: 'bg-green-600/20 text-green-400 border-green-500/30',
  danger: 'bg-red-600/20 text-red-400 border-red-500/30',
  warning: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  info: 'bg-blue-600/20 text-blue-400 border-blue-500/30'
}

const sizes = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-xs',
  lg: 'px-3 py-1 text-sm'
}

export default function Badge({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  dot = false
}) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full border
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  )
}
