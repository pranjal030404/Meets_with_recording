// The second person in a call from another network. node nat-guest.mjs <server url> <env file from device-host.mjs>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [BASE, envFile] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').trim().split('\n').map((l) => l.split('=')));
const browser = await chromium.launch({ args: [...(process.env.NO_UDP ? ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] : []), `--unsafely-treat-insecure-origin-as-secure=${BASE}`, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const p = await (await browser.newContext({ permissions: ['camera', 'microphone'] })).newPage(); p.setDefaultTimeout(30000);
await p.addInitScript(() => { const P = window.RTCPeerConnection; window.__pcs = []; window.RTCPeerConnection = class extends P { constructor(...a) { super(...a); window.__pcs.push(this); } }; });
await p.goto(`${BASE}/login`); await p.locator('#email').fill(env.QA_EMAIL); await p.locator('#password').fill(env.QA_PASSWORD);
await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(/\/app/);
await p.goto(`${BASE}/join/${env.QA_ROOM}`); await p.waitForTimeout(2000); await p.getByRole('button', { name: /join now/i }).click(); await p.waitForURL(/\/meeting\//);
await p.waitForTimeout(2000);
await p.getByRole('button', { name: /^(Start video|Turn on camera)/i }).first().click().catch(() => {});
let videos = 0;
for (let i = 0; i < 60 && videos < 2; i++) { await p.waitForTimeout(500); videos = await p.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).length); }
await p.waitForTimeout(5000);
const paths = await p.evaluate(async () => { const out = new Set(); let received = 0; for (const pc of window.__pcs) { const s = await pc.getStats(); for (const r of s.values()) { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') { const l = s.get(r.localCandidateId), m = s.get(r.remoteCandidateId); out.add(`${l?.protocol} ${l?.candidateType}->${m?.address}`); } if (r.type === 'inbound-rtp' && r.kind === 'video') received += r.framesDecoded || 0; } } return { paths: [...out], received }; });
console.log(JSON.stringify({ guestVideos: videos, framesFromOthers: paths.received, mediaPath: paths.paths }));
await browser.close();
