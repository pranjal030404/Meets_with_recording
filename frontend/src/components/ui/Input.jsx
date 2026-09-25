import { forwardRef } from 'react'

const Input = forwardRef(({
  label,
  error,
  icon: Icon,
  className = '',
  ...props
}, ref) => {
  return (
    <div className="w-full group">
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Icon className="w-5 h-5 text-gray-500 transition-colors group-focus-within:text-primary-400" />
          </div>
        )}
        <input
          ref={ref}
          className={`
            input
            ${Icon ? 'pl-10' : ''}
            ${error ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/15' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-red-400 animate-fade-in">{error}</p>
      )}
    </div>
  )
})

Input.displayName = 'Input'

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <div className="w-full group">
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">
          {label}
        </label>
      )}
      <textarea
        className={`
          input resize-none
          ${error ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/15' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-sm text-red-400 animate-fade-in">{error}</p>
      )}
    </div>
  )
}

export function Select({ label, error, children, className = '', ...props }) {
  return (
    <div className="w-full group">
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">
          {label}
        </label>
      )}
      <select
        className={`
          input
          ${error ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/15' : ''}
          ${className}
        `}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p className="mt-1.5 text-sm text-red-400 animate-fade-in">{error}</p>
      )}
    </div>
  )
}

export default Input
