/**
 * Background blur and virtual background. The camera is cut out on this device (MediaPipe selfie
 * segmentation, served from our own site) and only the composed picture is sent.
 */
const KEY = 'meeting-background'
let image = null // the chosen picture; kept for this visit only

export const savedBackground = () => {
  let mode = 'off'
  try { mode = localStorage.getItem(KEY) || 'off' } catch { /* storage unavailable */ }
  // a picture does not survive a reload: blur instead of showing the real room
  return { mode: mode === 'image' && !image ? 'blur' : mode }
}

export const saveBackground = (mode, file) => {
  if (file) {
    const next = new Image()
    next.src = URL.createObjectURL(file)
    image = next
  }
  try { localStorage.setItem(KEY, mode) } catch { /* storage unavailable */ }
}

let segmenterPromise = null
const loadSegmenter = () => {
  segmenterPromise ||= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
    const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    // CPU on purpose: the model is tiny, while on machines without real graphics acceleration the
    // GPU path runs in software and freezes the page
    return ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/mediapipe/selfie_segmenter.tflite', delegate: 'CPU' },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
      outputCategoryMask: false
    })
  })()
  segmenterPromise.catch(() => { segmenterPromise = null })
  return segmenterPromise
}

let lastTimestamp = 0 // MediaPipe wants strictly increasing times across all calls

// A worker keeps ticking when the tab is in the background, where page timers slow to once a second.
// One tick per request, so a slow machine skips frames instead of queueing them up.
const tickerSource = `onmessage = (e) => setTimeout(() => postMessage(0), e.data)`
const FRAME_MS = 1000 / 24
const MAX_WIDTH = 640 // composing larger frames costs far more CPU than it adds in quality

/**
 * Returns the track to publish. With effects off that is the camera itself; otherwise a processed
 * track whose stop() also stops the camera. `rawTrack` and `release()` let the effect be swapped.
 */
export async function withBackground(raw) {
  const { mode } = savedBackground()
  if (mode === 'off') return raw
  let segmenter
  try {
    segmenter = await loadSegmenter()
  } catch (error) {
    throw new Error(`Background effects unavailable: ${error.message}`)
  }

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = new MediaStream([raw])
  await video.play()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const mask = document.createElement('canvas')
  const maskCtx = mask.getContext('2d')
  const small = document.createElement('canvas')
  const smallCtx = small.getContext('2d')
  const fit = () => {
    const width = Math.min(MAX_WIDTH, video.videoWidth || MAX_WIDTH)
    const height = Math.round(width * (video.videoHeight || 360) / (video.videoWidth || 640))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
  }
  fit()

  const compose = (result) => {
    const confidence = result.confidenceMasks?.[0]
    if (!confidence) return
    if (mask.width !== confidence.width || mask.height !== confidence.height) {
      mask.width = confidence.width
      mask.height = confidence.height
    }
    const values = confidence.getAsFloat32Array()
    const pixels = maskCtx.createImageData(mask.width, mask.height)
    for (let i = 0; i < values.length; i++) pixels.data[i * 4 + 3] = values[i] * 255
    maskCtx.putImageData(pixels, 0, 0)

    const { width, height } = canvas
    ctx.save()
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(mask, 0, 0, width, height) // the person's outline...
    ctx.globalCompositeOperation = 'source-in'
    ctx.drawImage(video, 0, 0, width, height) // ...filled with the person
    ctx.globalCompositeOperation = 'destination-over' // everything else goes behind
    const picture = savedBackground().mode === 'image' && image?.complete && image.naturalWidth ? image : null
    if (picture) {
      const scale = Math.max(width / picture.naturalWidth, height / picture.naturalHeight)
      const w = picture.naturalWidth * scale
      const h = picture.naturalHeight * scale
      ctx.drawImage(picture, (width - w) / 2, (height - h) / 2, w, h)
    } else {
      // shrink and stretch: blurs in every browser (Safari ignores canvas filters, which would
      // have sent the room unblurred)
      small.width = Math.max(1, Math.round(width / 24))
      small.height = Math.max(1, Math.round(height / 24))
      smallCtx.drawImage(video, 0, 0, small.width, small.height)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(small, 0, 0, width, height)
    }
    ctx.restore()
  }

  const draw = () => {
    if (!video.videoWidth) return
    fit()
    lastTimestamp = Math.max(lastTimestamp + 1, Math.round(performance.now()))
    // a failed frame is skipped: the last good one stays, the raw camera is never drawn on its own
    try { segmenter.segmentForVideo(video, lastTimestamp, compose) } catch (error) { console.warn('Segmentation failed:', error.message) }
  }

  const url = URL.createObjectURL(new Blob([tickerSource], { type: 'text/javascript' }))
  const ticker = new Worker(url)
  const tick = () => {
    const started = performance.now()
    draw()
    // always leave the page some time to breathe
    ticker.postMessage(Math.max(10, FRAME_MS - (performance.now() - started)))
  }
  ticker.onmessage = tick
  const [track] = canvas.captureStream(24).getVideoTracks()
  tick()

  const stopTrack = track.stop.bind(track)
  let released = false
  const release = () => {
    if (released) return
    released = true
    ticker.terminate()
    URL.revokeObjectURL(url)
    video.pause()
    video.srcObject = null
    raw.removeEventListener('ended', onEnded)
    stopTrack()
  }
  const onEnded = () => { release(); track.dispatchEvent(new Event('ended')) }
  raw.addEventListener('ended', onEnded) // camera unplugged
  track.rawTrack = raw
  track.release = release
  track.stop = () => { release(); raw.stop() }
  return track
}
