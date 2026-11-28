import { lazy } from 'react'

const KEY = 'reloaded-for-chunk'

// Starting a navigation makes some browsers (Firefox) fail the imports still in flight.
// Reloading then would cancel the page the person is on their way to.
let leaving = false
window.addEventListener('beforeunload', () => { leaving = true })
window.addEventListener('pageshow', () => { leaving = false })

/** React.lazy that survives a chunk which can no longer be fetched: one full reload, then give up. */
export default function lazyPage(load) {
  return lazy(() => load().then(
    (module) => { sessionStorage.removeItem(KEY); return module },
    (error) => {
      if (leaving) return new Promise(() => {})
      if (sessionStorage.getItem(KEY)) throw error
      sessionStorage.setItem(KEY, '1')
      window.location.reload()
      return new Promise(() => {}) // the page is going away
    }
  ))
}
