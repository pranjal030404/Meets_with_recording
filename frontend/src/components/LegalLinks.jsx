import { Link } from 'react-router-dom'
import useLegal from '../lib/useLegal'

/** Links to the privacy notice and terms; nothing where the operator has not published them. */
export default function LegalLinks({ prefix, className = '' }) {
  if (!useLegal()) return null
  return (
    <span className={className}>
      {prefix}
      <Link to="/privacy" className="underline">Privacy notice</Link>
      {prefix ? ' and ' : ' · '}
      <Link to="/terms" className="underline">{prefix ? 'terms of service' : 'Terms of service'}</Link>
    </span>
  )
}
