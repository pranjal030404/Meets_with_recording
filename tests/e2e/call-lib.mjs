import { chromium } from 'playwright';
export const BASE = 'http://127.0.0.1:15000', PASSWORD = 'Qa-Passw0rd!';
export const api = async (m, p, token, body) => (await fetch(BASE + p, { method: m, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) })).json();
const rnd = () => Math.random().toString(36).slice(2, 8);
export const acct = async (n) => { const email = `call.${n}.${rnd()}@example.test`; const r = await api('POST', '/api/auth/signup', null, { name: `Call ${n}`, email, password: PASSWORD }); return { email, ...r.data.user, token: r.data.token }; };
export async function startCall() {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--auto-accept-this-tab-capture', '--auto-select-desktop-capture-source=Entire screen'] });
  const host = await acct('host'), guest = await acct('guest');
  const meeting = (await api('POST', '/api/meetings', host.token, { title: 'Call controls' })).data.meeting;
  const seats = [];
  for (const who of [host, guest]) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'], acceptDownloads: true });
    const p = await c.newPage(); p.setDefaultTimeout(5000);
    const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.accept());
    p.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(BASE.length)}`); });
    await p.goto(`${BASE}/login`); await p.locator('#email').fill(who.email); await p.locator('#password').fill(PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(/\/app/);
    await p.goto(`${BASE}/join/${meeting.roomId}`); await p.waitForLoadState('networkidle').catch(() => {});
    await p.getByRole('button', { name: /join now|ask to join/i }).click(); await p.waitForURL(/\/meeting\//, { timeout: 15000 });
    await p.waitForTimeout(2500);
    seats.push({ p, c, errors, who });
  }
  return { browser, host: seats[0], guest: seats[1], meeting };
}
export const names = (p) => p.$$eval('button', (els) => els.filter((e) => e.offsetWidth).map((e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || '(unnamed)').trim().replace(/\s+/g, ' ').slice(0, 50)));
