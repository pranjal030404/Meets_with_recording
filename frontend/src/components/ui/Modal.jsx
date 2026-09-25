import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true
}) {
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl'
  }

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`
          relative bg-dark-200/95 backdrop-blur-xl rounded-2xl p-6 w-full ${sizes[size]}
          border border-white/10
          animate-slide-up
          shadow-float
          max-h-[90vh] overflow-y-auto
        `}
      >
        {/* Top gradient line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-400/60 to-transparent rounded-t-2xl pointer-events-none" />

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between mb-5">
            {title && (
              <h2 className="text-2xl font-bold text-white font-display">{title}</h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-dark-400/70 rounded-xl transition-all duration-200 text-gray-400 hover:text-white hover:rotate-90 ml-auto"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        {children}
      </div>
    </div>
  )
}

export function ModalFooter({ children, className = '' }) {
  return (
    <div className={`flex gap-3 mt-6 ${className}`}>
      {children}
    </div>
  )
}
