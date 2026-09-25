import { forwardRef } from 'react'

const variants = {
  primary: 'text-white bg-gradient-to-br from-primary-500 via-primary-600 to-violet-600 bg-[length:160%_160%] hover:bg-right shadow-lg shadow-primary-500/30 hover:shadow-glow',
  secondary: 'text-gray-100 bg-dark-400/50 backdrop-blur border border-dark-500 hover:border-primary-500/40 hover:bg-dark-400/70',
  danger: 'text-white bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/30 hover:shadow-red-500/50',
  success: 'text-white bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/30 hover:shadow-green-500/50',
  ghost: 'bg-transparent hover:bg-dark-400/60 text-gray-400 hover:text-white',
  outline: 'bg-transparent border border-primary-500/60 text-primary-300 hover:bg-primary-500/10 hover:shadow-glow'
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
  icon: 'p-2.5'
}

const Button = forwardRef(({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  loading = false,
  icon: Icon,
  ...props
}, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`
        relative inline-flex items-center justify-center gap-2 font-semibold rounded-xl overflow-hidden
        transition-all duration-300 ease-out
        transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]
        focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-dark-100
        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500
                   bg-gradient-to-r from-transparent via-white/10 to-transparent bg-[length:40%_100%] bg-no-repeat bg-center"
      />
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Loading...</span>
        </>
      ) : (
        <>
          {Icon && <Icon className="w-5 h-5" />}
          {children}
        </>
      )}
    </button>
  )
})

Button.displayName = 'Button'

export default Button
