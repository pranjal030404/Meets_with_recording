import { useEffect, useState } from 'react'
import api from '../lib/api'

/** People whose name matches the query (contacts first), looked up as you type. */
export default function usePeopleSearch(query) {
  const [result, setResult] = useState({ q: '', people: [] })
  const q = query.trim()

  useEffect(() => {
    if (q.length < 2) return
    let stale = false
    const timer = setTimeout(() => {
      api.get('/conversations/people/search', { params: { q } })
        .then(res => { if (!stale) setResult({ q, people: res.data.data.people }) })
        .catch(() => { if (!stale) setResult({ q, people: [] }) })
    }, 250)
    return () => { stale = true; clearTimeout(timer) }
  }, [q])

  const current = q.length >= 2 && result.q === q
  return { people: current ? result.people : [], searching: q.length >= 2 && !current }
}
