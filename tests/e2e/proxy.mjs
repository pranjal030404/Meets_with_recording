// The production shape: browser -> Apache (https, repository vhost) -> `serve` for the app, backend for /api, /uploads,
// /socket.io. meet.test is mapped to this machine inside the browser; the name is reserved and resolves nowhere else.
import { chromium, firefox } from 'playwright';
const SITE = 'https://meet.test:18443', PASSWORD = 'Qa-Passw0rd!';
const results = []; const must = (c, m) => { if (!c) throw new Error(m); };
const check = async (id, title, fn) => { try { const note = await fn(); results.push('PASS'); console.log('PASS', id, title, note || ''); } catch (e) { results.push('FAIL'); console.log('FAIL', id, title, String(e.message).replace(/\s+/g, ' ').slice(0, 300)); } };
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP meet.test 127.0.0.1', '--ignore-certificate-errors', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const problems = [], sockets = [];
const seat = async () => {
  const c = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['camera', 'microphone'], viewport: { width: 1440, height: 900 } });
  const p = await c.newPage(); p.setDefaultTimeout(15000);
  p.on('pageerror', (e) => problems.push(e.message));
  p.on('console', (m) => { if (/Content.Security.Policy/i.test(m.text())) problems.push(m.text().slice(0, 200)); });
  p.on('websocket', (w) => sockets.push(w.url()));
  return p;
};
const signUp = async (p, name) => {
  const email = `proxy.${name}.${Date.now()}@example.test`;
  await p.goto(`${SITE}/signup`); await p.locator('#name').fill(`Proxy ${name}`); await p.locator('#email').fill(email);
  await p.locator('#password').fill(PASSWORD); await p.locator('#confirm').fill(PASSWORD);
  await p.getByRole('button', { name: 'Create account' }).click(); await p.waitForURL(/\/app/);
  return email;
};
const a = await seat(), b = await seat(); let emailA, emailB;
await check('PX-01', 'security headers on the page and the API', async () => {
  const page = await a.goto(`${SITE}/`); const h = page.headers();
  for (const k of ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'strict-transport-security', 'permissions-policy']) must(h[k], `page lacks ${k}`);
  const api = await a.evaluate(async () => { const r = await fetch('/api/health'); return { h: Object.fromEntries(r.headers), body: await r.json() }; });
  must(api.h['strict-transport-security'] && !api.h['x-powered-by'], 'API headers wrong');
  // process details are for the server itself; the curl lines below check a visitor from another address
});
await check('PX-02', 'sign up; the session cookie is Secure, HttpOnly, SameSite=Strict through the proxy', async () => {
  emailA = await signUp(a, 'a'); emailB = await signUp(b, 'b');
  const jar = (await a.context().cookies(`${SITE}/api/x`)).find((c) => c.name === 'mc_session');
  must(jar?.secure && jar.httpOnly && jar.sameSite === 'Strict', JSON.stringify(jar && { ...jar, value: '' }));
});
await check('PX-03', 'live messages arrive over a secure websocket', async () => {
  const peer = await b.evaluate(() => JSON.parse(localStorage.getItem('user')));
  const me = await a.evaluate(() => JSON.parse(localStorage.getItem('user')));
  await a.goto(`${SITE}/chat`); await a.waitForTimeout(1500);
  const conv = await b.evaluate(async (userId) => (await (await fetch('/api/conversations', { method: 'POST', headers: { 'X-Client': 'web', 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'direct', userId }) })).json()).data.conversation.id, me.id);
  await b.evaluate(async (id) => fetch(`/api/conversations/${id}/messages`, { method: 'POST', headers: { 'X-Client': 'web', 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'through-the-proxy' }) }), conv);
  await a.getByText('through-the-proxy').first().waitFor();
  must(sockets.some((u) => u.startsWith('wss://meet.test:18443/socket.io/')), `no websocket: ${sockets}`);
  return peer.id ? '' : '';
});
await check('PX-04', 'a file uploads and is served back only to its owner', async () => {
  const out = await a.evaluate(async () => {
    const f = new FormData(); f.append('file', new Blob(['proxy-bytes'], { type: 'text/plain' }), 'p.txt');
    const up = await (await fetch('/api/files/upload', { method: 'POST', headers: { 'X-Client': 'web' }, body: f })).json();
    return { url: up.data.file.url, mine: await (await fetch(up.data.file.url)).text() };
  });
  must(out.mine === 'proxy-bytes', out.mine);
  must((await b.evaluate(async (u) => (await fetch(u)).status, out.url)) === 403, 'another account could read it');
});
await check('PX-05', 'two people join a call and see each other', async () => {
  const room = await a.evaluate(async () => (await (await fetch('/api/meetings', { method: 'POST', headers: { 'X-Client': 'web', 'Content-Type': 'application/json' }, body: '{"title":"Proxy call"}' })).json()).data.meeting.roomId);
  for (const p of [a, b]) { await p.goto(`${SITE}/join/${room}`); await p.waitForLoadState('networkidle').catch(() => {}); await p.getByRole('button', { name: /join now|ask to join/i }).click(); await p.waitForURL(/\/meeting\//); await p.waitForTimeout(1500); }
  // cameras start off after a direct join: turn them on
  for (const p of [a, b]) await p.getByRole('button', { name: /^(Start video|Turn on camera)/i }).first().click().catch(() => {});
  const playing = async (p) => p.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).length);
  let n = [0, 0];
  for (let i = 0; i < 40 && Math.min(...n) < 2; i++) { await a.waitForTimeout(500); n = [await playing(a), await playing(b)]; }
  must(Math.min(...n) >= 2, `videos playing: ${n}`);
  return `videos playing: ${n}`;
});
await check('PX-06', 'a page refresh keeps the session; sign-out ends it', async () => {
  await a.goto(`${SITE}/app`); await a.reload(); await a.waitForURL(/\/app/);
  await a.getByRole('button', { name: /log ?out/i }).first().click(); await a.waitForURL(`${SITE}/`);
  must((await a.evaluate(async () => (await fetch('/api/auth/me', { headers: { 'X-Client': 'web' } })).status)) === 401, 'still signed in');
});
await check('PX-07', 'the admin console signs in', async () => {
  await a.goto(`${SITE}/admin`); await a.locator('input[type=email]').fill('qa-admin@example.test'); await a.locator('input[type=password]').fill('QaAdmin!2026');
  await a.locator('button[type=submit]').click(); await a.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
});
await check('PX-08', 'no script errors or content-policy violations', async () => must(!problems.length, problems.slice(0, 3).join(' | ')));
await browser.close();
console.log(`proxy: ${results.filter((r) => r === 'PASS').length}/${results.length}`);
