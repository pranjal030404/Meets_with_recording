// The background-effect engine is served from our own site, not a CDN: copy it out of node_modules.
import { cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
cpSync(`${root}node_modules/@mediapipe/tasks-vision/wasm`, `${root}public/mediapipe/wasm`, { recursive: true })
