import { useEffect, useState } from 'react'
import api from './api'

let known // shared by every caller; the answer does not change while the app is open
const load = () => (known ??= api.get('/config').then((r) => r.data.data.billingEnabled).catch(() => { known = undefined; return false }))

/** true/false once the server has said whether paid plans exist; null while asking. */
export default function useBilling() {
  const [enabled, setEnabled] = useState(null)
  useEffect(() => { let on = true; load().then((v) => on && setEnabled(v)); return () => { on = false } }, [])
  return enabled
}
