/**
 * Pop-out window: keeps the meeting on screen while you work in another tab or app. Uses Document
 * Picture-in-Picture (with mic / camera / leave buttons) and falls back to plain video PiP.
 * The picture is the same whole-meeting composite the recording uses, so it works with cameras off.
 */
import { createCompositeVideo } from './compositeRecorder'
import { useMeetingStore, meetingTiles } from '../store/meetingStore'

let current = null // { close }
let opening = false

export const popOutSupported = () => 'documentPictureInPicture' in window || !!document.pictureInPictureEnabled

export function closePopOut() {
  current?.close()
}

const finish = (composite, extra) => {
  let done = false
  return () => {
    if (done) return
    done = true
    current = null
    composite.stop()
    extra?.()
    useMeetingStore.setState({ isPiP: false })
  }
}

async function openWindow(composite, onLeave) {
  const win = await window.documentPictureInPicture.requestWindow({ width: 380, height: 270 })
  const doc = win.document
  doc.body.style.cssText = 'margin:0;display:flex;flex-direction:column;height:100vh;background:#0e0f11;font:600 13px system-ui,sans-serif'
  const video = doc.createElement('video')
  video.muted = true // meeting sound keeps playing from the main tab
  video.autoplay = true
  video.playsInline = true
  video.style.cssText = 'flex:1;min-height:0;width:100%;object-fit:contain'
  video.srcObject = composite.stream

  const bar = doc.createElement('div')
  bar.style.cssText = 'display:flex;gap:8px;justify-content:center;padding:8px'
  const button = (onClick) => {
    const b = doc.createElement('button')
    b.style.cssText = 'border:0;border-radius:999px;padding:8px 14px;cursor:pointer;color:#fff;font:inherit'
    b.onclick = onClick
    bar.appendChild(b)
    return b
  }
  const mic = button(() => useMeetingStore.getState().toggleMute())
  const cam = button(() => useMeetingStore.getState().toggleVideo())
  const leave = button(() => { win.close(); onLeave?.() })
  const paint = ({ isMuted, isVideoOff }) => {
    mic.textContent = isMuted ? 'Unmute' : 'Mute'
    mic.style.background = isMuted ? '#dc2626' : '#374151'
    cam.textContent = isVideoOff ? 'Camera on' : 'Camera off'
    cam.style.background = isVideoOff ? '#dc2626' : '#374151'
  }
  leave.textContent = 'Leave'
  leave.style.background = '#dc2626'
  paint(useMeetingStore.getState())
  const unsubscribe = useMeetingStore.subscribe(paint)
  doc.body.append(video, bar)
  video.play().catch(() => {})

  const cleanup = finish(composite, unsubscribe)
  win.addEventListener('pagehide', cleanup)
  return { close: () => { win.close(); cleanup() } }
}

async function openVideo(composite) {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none'
  video.srcObject = composite.stream
  document.body.appendChild(video)
  const cleanup = finish(composite, () => video.remove())
  try {
    await video.play()
    if (!video.videoWidth) await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }))
    await video.requestPictureInPicture()
  } catch (error) {
    cleanup()
    throw error
  }
  video.addEventListener('leavepictureinpicture', cleanup)
  return {
    close: () => {
      if (document.pictureInPictureElement === video) document.exitPictureInPicture().catch(() => {})
      cleanup()
    }
  }
}

export async function openPopOut({ onLeave } = {}) {
  if (current || opening || !popOutSupported()) return false
  opening = true
  const composite = createCompositeVideo(() => meetingTiles())
  try {
    current = 'documentPictureInPicture' in window ? await openWindow(composite, onLeave) : await openVideo(composite)
    useMeetingStore.setState({ isPiP: true })
    return true
  } catch (error) {
    composite.stop()
    console.warn('Pop-out unavailable:', error.message)
    return false
  } finally {
    opening = false
  }
}

/**
 * Pop out by itself when the person switches away. Chrome calls this handler only for tabs using the
 * camera or mic; other browsers ignore it and keep the manual menu item. Returns a cleanup function.
 */
export function enableAutoPopOut({ onLeave }) {
  let auto = false
  const setHandler = (handler) => {
    try { navigator.mediaSession?.setActionHandler('enterpictureinpicture', handler) } catch { /* not supported */ }
  }
  setHandler(async () => { auto = await openPopOut({ onLeave }) })
  const onVisible = () => {
    // coming back closes the window we opened ourselves, never one the person asked for
    if (document.visibilityState === 'visible' && auto) { auto = false; closePopOut() }
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    setHandler(null)
    document.removeEventListener('visibilitychange', onVisible)
    closePopOut()
  }
}
