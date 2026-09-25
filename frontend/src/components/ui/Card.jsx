import { forwardRef } from 'react'

const Card = forwardRef(({
  children,
  className = '',
  hover = false,
  padding = 'md',
  gradient = false,
  ...props
}, ref) => {
  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  }

  return (
    <div
      ref={ref}
      className={`
        relative rounded-2xl
        ${gradient ? 'gradient-border' : 'bg-dark-200/80 backdrop-blur-sm border border-white/[0.06]'}
        shadow-card
        ${hover ? 'card-hover cursor-pointer' : ''}
        ${paddings[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
})

Card.displayName = 'Card'

export function CardHeader({ children, className = '' }) {
  return (
    <div className={`mb-4 ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }) {
  return (
    <h3 className={`text-xl font-semibold text-white font-display ${className}`}>
      {children}
    </h3>
  )
}

export function CardDescription({ children, className = '' }) {
  return (
    <p className={`text-gray-400 text-sm mt-1.5 leading-relaxed ${className}`}>
      {children}
    </p>
  )
}

export function CardContent({ children, className = '' }) {
  return (
    <div className={className}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className = '' }) {
  return (
    <div className={`mt-4 pt-4 border-t border-white/[0.06] ${className}`}>
      {children}
    </div>
  )
}

export default Card
