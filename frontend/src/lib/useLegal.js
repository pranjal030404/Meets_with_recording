import { useEffect, useState } from 'react'
import api from './api'

let known
const load = () => (known ??= api.get('/config').then((r) => r.data.data.legal || false).catch(() => { known = undefined; return false }))

/** The operator's details once the server has them, false when it has none (the pages stay hidden), null while asking. */
export default function useLegal() {
  const [legal, setLegal] = useState(null)
  useEffect(() => { let on = true; load().then((v) => on && setLegal(v)); return () => { on = false } }, [])
  return legal
}
