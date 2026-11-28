// The other end of the on-device test: creates the phone's account and a meeting, sits in it as a web user,
// and records whether the phone's camera arrives.   node device-host.mjs <out.json>
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:15000', PASSWORD = 'Qa-Passw0rd!';
const api = async (m, p, t, b) => (await fetch(BASE + p, { method: m, headers: { ...(t && { Authorization: `Bearer ${t}` }), ...(b && { 'Content-Type': 'application/json' }) }, body: b && JSON.stringify(b) })).json();
const account = async (name) => { const email = `dev.${name.replace(/\s/g, '').toLowerCase()}.${Date.now()}@example.test`; const r = await api('POST', '/api/auth/signup', null, { name, email, password: PASSWORD }); return { email, token: r.data.token }; };
const host = await account('Webhost Person'), phone = await account('Phone Person');
const room = (await api('POST', '/api/meetings', host.token, { title: 'Device call' })).data.meeting.roomId;
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const p = await (await browser.newContext({ permissions: ['camera', 'microphone'] })).newPage();
await p.goto(`${BASE}/login`); await p.locator('#email').fill(host.email); await p.locator('#password').fill(PASSWORD);
await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(/\/app/);
await p.goto(`${BASE}/join/${room}`); await p.waitForLoadState('networkidle').catch(() => {}); await p.getByRole('button', { name: /join now/i }).click(); await p.waitForURL(/\/meeting\//);
await p.waitForTimeout(1500); await p.getByRole('button', { name: /^(Start video|Turn on camera)/i }).first().click().catch(() => {});
fs.writeFileSync(process.argv[2] + '.env', `QA_EMAIL=${phone.email}\nQA_PASSWORD=${PASSWORD}\nQA_ROOM=${room}\n`);
const seen = { phoneInRoom: false, videos: 0 };
for (let i = 0; i < 900; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  seen.phoneInRoom ||= (await p.getByText('Phone Person').count()) > 0;
  const n = await p.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0 && !v.paused).map((v) => `${v.videoWidth}x${v.videoHeight}`));
  if (n.length > seen.videos) { seen.videos = n.length; seen.sizes = n; await p.screenshot({ path: process.argv[2] + '.png' }); }
  fs.writeFileSync(process.argv[2], JSON.stringify(seen));
  if (fs.existsSync(process.argv[2] + '.stop')) break;
}
await browser.close();
