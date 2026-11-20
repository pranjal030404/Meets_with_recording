// REAL WebRTC load: N headless Chrome bots with fake camera/mic join one meeting and report getStats() summaries.
// One bot ~ one browser tab: expect ~100-300 MB RAM and a few % of a core each, so a single generator machine tops out at
// tens of bots. For thousands, run this on a fleet of generator hosts. A WebSocket-only test is NOT a media test.
//   npm i -D playwright && npx playwright install chromium
//   APP_URL=https://test.example.com ROOM_ID=<existing meeting roomId> BOTS=20 DURATION_S=120 USERS_FILE=users.json node tests/load/webrtc/chrome-fake-media.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const APP = process.env.APP_URL, ROOM = process.env.ROOM_ID;
const BOTS = parseInt(process.env.BOTS) || 5, DURATION = (parseInt(process.env.DURATION_S) || 60) * 1000;
if (!APP || !ROOM) { console.error('APP_URL and ROOM_ID required'); process.exit(1); }
const users = JSON.parse(fs.readFileSync(process.env.USERS_FILE || './users.json', 'utf8'));

const hook = () => { // runs in every page before app scripts: keep a handle on every RTCPeerConnection
  const O = window.RTCPeerConnection; window.__pcs = [];
  window.RTCPeerConnection = function (...a) { const pc = new O(...a); window.__pcs.push(pc); return pc; };
  window.RTCPeerConnection.prototype = O.prototype;
};
const summarize = async () => {
  const out = { inBytes: 0, outBytes: 0, lost: 0, packets: 0, jitter: [], rtt: [], connected: 0, pcs: window.__pcs.length };
  for (const pc of window.__pcs) {
    if (pc.connectionState === 'connected') out.connected++;
    for (const s of (await pc.getStats()).values()) {
      if (s.type === 'inbound-rtp') { out.inBytes += s.bytesReceived || 0; out.lost += s.packetsLost || 0; out.packets += s.packetsReceived || 0; if (s.jitter != null) out.jitter.push(s.jitter); }
      if (s.type === 'outbound-rtp') out.outBytes += s.bytesSent || 0;
      if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.currentRoundTripTime != null) out.rtt.push(s.currentRoundTripTime);
    }
  }
  return out;
};

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
await Promise.all(Array.from({ length: BOTS }, async (_, i) => {
  const t0 = Date.now(); const u = users[i % users.length];
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await ctx.addInitScript(hook);
  const page = await ctx.newPage();
  try {
    const login = await (await fetch(`${APP}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u) })).json();
    const token = login?.data?.token || login?.token, user = login?.data?.user || login?.user;
    await page.addInitScript(([t, usr]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(usr)); }, [token, user]);
    await page.goto(`${APP}/meeting/${ROOM}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__pcs.some((pc) => pc.connectionState === 'connected'), null, { timeout: 30000 });
    const joinMs = Date.now() - t0;
    await page.waitForTimeout(DURATION);
    results.push({ bot: i, ok: true, joinMs, ...(await page.evaluate(summarize)) });
  } catch (e) { results.push({ bot: i, ok: false, error: e.message }); }
  await ctx.close();
}));
await browser.close();

const ok = results.filter((r) => r.ok), pct = (a, p) => a.length ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : null;
const report = {
  at: new Date().toISOString(), bots: BOTS, durationS: DURATION / 1000, connectedBots: ok.length, successRate: ok.length / BOTS,
  joinMs: { p50: pct(ok.map((r) => r.joinMs), 0.5), p95: pct(ok.map((r) => r.joinMs), 0.95) },
  packetLossRatio: ok.reduce((a, r) => a + r.lost, 0) / Math.max(1, ok.reduce((a, r) => a + r.packets + r.lost, 0)),
  jitterP95: pct(ok.flatMap((r) => r.jitter), 0.95), rttP95: pct(ok.flatMap((r) => r.rtt), 0.95),
  avgInboundKbps: ok.reduce((a, r) => a + r.inBytes * 8 / 1000 / (DURATION / 1000), 0) / Math.max(1, ok.length),
  failures: results.filter((r) => !r.ok).map((r) => r.error).slice(0, 10),
};
fs.mkdirSync('tests/load/reports', { recursive: true });
const f = `tests/load/reports/webrtc-${BOTS}bots-${Date.now()}.json`; fs.writeFileSync(f, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2), '\nreport:', f);
