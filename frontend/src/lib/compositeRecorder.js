/**
 * Draws the whole meeting onto one canvas so a recording shows what everyone saw, not just your own
 * camera: the shared screen large when there is one, otherwise a grid of participant tiles.
 */
const WIDTH = 1280
const HEIGHT = 720
const FPS = 25
const GAP = 8

// A worker keeps ticking when the tab is in the background, where page timers slow to once a second
const tickerSource = `let id; onmessage = (e) => { clearInterval(id); if (e.data) id = setInterval(() => postMessage(0), e.data) }`

/**
 * @param getTiles () => [{ id, name, track, isScreen }] read on every frame, so people can join,
 *                 leave, switch cameras or start sharing while the recording runs.
 */
export function createCompositeVideo(getTiles) {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  const players = new Map() // track id -> detached <video>

  const player = (track) => {
    let video = players.get(track.id)
    if (!video) {
      video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.srcObject = new MediaStream([track])
      video.play().catch(() => {})
      players.set(track.id, video)
    }
    return video
  }

  const drawTile = (tile, x, y, w, h) => {
    ctx.fillStyle = '#211f1d'
    ctx.fillRect(x, y, w, h)
    const video = tile.track?.readyState === 'live' ? player(tile.track) : null
    if (video?.videoWidth) {
      const scale = Math.min(w / video.videoWidth, h / video.videoHeight)
      const vw = video.videoWidth * scale
      const vh = video.videoHeight * scale
      ctx.drawImage(video, x + (w - vw) / 2, y + (h - vh) / 2, vw, vh)
    } else {
      const r = Math.min(w, h) * 0.18
      ctx.fillStyle = '#8f5f1b'
      ctx.beginPath()
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `600 ${Math.round(r)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText((tile.name || '?').charAt(0).toUpperCase(), x + w / 2, y + h / 2)
    }
    ctx.font = '500 18px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const label = tile.name || 'Participant'
    const labelWidth = Math.min(w - 16, ctx.measureText(label).width + 20)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(x + 8, y + h - 38, labelWidth, 30)
    ctx.fillStyle = '#fff'
    ctx.fillText(label, x + 18, y + h - 23, labelWidth - 20)
  }

  const grid = (tiles, x, y, w, h, columns) => {
    const rows = Math.ceil(tiles.length / columns)
    const tw = (w - GAP * (columns - 1)) / columns
    const th = (h - GAP * (rows - 1)) / rows
    tiles.forEach((tile, i) => drawTile(tile, x + (i % columns) * (tw + GAP), y + Math.floor(i / columns) * (th + GAP), tw, th))
  }

  const draw = () => {
    const tiles = getTiles()
    ctx.fillStyle = '#121110'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    const screen = tiles.find((t) => t.isScreen)
    const people = tiles.filter((t) => !t.isScreen).slice(0, 25)
    if (screen) {
      drawTile(screen, GAP, GAP, WIDTH - 256 - GAP * 3, HEIGHT - GAP * 2)
      grid(people.slice(0, 5), WIDTH - 256 - GAP, GAP, 256, Math.min(HEIGHT - GAP * 2, people.slice(0, 5).length * 150), 1)
    } else if (people.length) {
      grid(people, GAP, GAP, WIDTH - GAP * 2, HEIGHT - GAP * 2, Math.ceil(Math.sqrt(people.length)))
    }
  }

  const url = URL.createObjectURL(new Blob([tickerSource], { type: 'text/javascript' }))
  const ticker = new Worker(url)
  ticker.onmessage = draw
  draw()
  const stream = canvas.captureStream(FPS)
  ticker.postMessage(1000 / FPS)

  return {
    stream,
    stop() {
      ticker.terminate()
      URL.revokeObjectURL(url)
      stream.getTracks().forEach((t) => t.stop())
      players.forEach((v) => { v.pause(); v.srcObject = null })
      players.clear()
    }
  }
}
