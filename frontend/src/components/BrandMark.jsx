import branding from '../config/branding'

/**
 * Brand mark: the Arthvex emblem, or the image from VITE_APP_LOGO_URL for white-label builds.
 * Size: 'sm' (w-8) | 'md' (w-10) | 'lg' (w-14)
 */
export default function BrandMark({ size = 'md', className = '' }) {
  const box = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10'

  return <img src={branding.logoUrl || '/logo.png'} alt={branding.appName} className={`${box} shrink-0 object-contain ${className}`} />
}
