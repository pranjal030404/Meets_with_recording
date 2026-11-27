/**
 * Give a media element the tracks of one kind from a stream.
 *
 * The app adds tracks to a person's stream as they arrive, and attaches them before any media has come. Safari's
 * engine (WebKit) can then leave the element waiting for ever. So each element gets a stream of its own, replaced when
 * the tracks change, and given a fresh one again if it still has not started once media is there.
 */
export default function attachTracks(element, stream, kind) {
  if (!element) return
  const tracks = stream ? stream.getTracks().filter((track) => track.kind === kind) : []
  const current = element.srcObject?.getTracks() || []
  if (tracks.length === current.length && tracks.every((track) => current.includes(track))) return
  if (!tracks.length) { element.srcObject = null; return }

  let mine
  const attach = () => {
    element.srcObject = mine = new MediaStream(tracks)
    element.play?.().catch(() => {}) // blocked autoplay is retried on the next click
  }
  const stuck = () => element.srcObject === mine && element.readyState === 0 // 0: nothing at all received
  attach()
  for (const track of tracks) track.addEventListener?.('unmute', () => { if (stuck()) attach() }, { once: true })
  const check = (attempt) => setTimeout(() => {
    if (element.srcObject !== mine || element.readyState > 0) return
    if (tracks.some((track) => !track.muted && track.enabled)) attach()
    if (attempt < 6) check(attempt + 1)
  }, attempt * 700)
  check(1)
}

/** Changes whenever the tracks of that kind do: an effect dependency. */
export const trackKey = (stream, kind) => (stream ? stream.getTracks().filter((track) => track.kind === kind).map((track) => track.id).join(' ') : '')
