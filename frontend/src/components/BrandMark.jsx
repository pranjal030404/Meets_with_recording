import { Video } from 'lucide-react'
import branding from '../config/branding'

/**
 * White-label brand mark. Renders the configured logo image when
 * VITE_APP_LOGO_URL is set, otherwise the built-in gradient Video icon.
 * Size: 'sm' (w-8) | 'md' (w-10) | 'lg' (w-14)
 */
export default function BrandMark({ size = 'md', className = '' }) {
  const box = size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-14 h-14 rounded-2xl' : 'w-10 h-10 rounded-xl'

  if (branding.logoUrl) {
    return (
      <span className={`${box} inline-flex items-center justify-center overflow-hidden bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 shrink-0 ${className}`}>
        <img src={branding.logoUrl} alt={branding.appName} className="w-full h-full object-cover" />
      </span>
    )
  }

  return (
    <span className={`${box} inline-flex items-center justify-center bg-gradient-to-br from-primary-400 via-primary-600 to-accent-600 shadow-lg shadow-primary-500/30 shrink-0 transition-transform duration-300 group-hover:scale-105 ${className}`}>
      <Video className={size === 'sm' ? 'w-4 h-4 text-white' : size === 'lg' ? 'h-7 w-7 text-white' : 'w-5 h-5 text-white'} />
    </span>
  )
}
