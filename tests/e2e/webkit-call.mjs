// Safari's engine (WebKit) as the second participant: live messages, receiving a call, on desktop and an iPhone profile.
import { chromium, webkit, devices } from 'playwright';
const BASE = 'http://127.0.0.1:15000', PASSWORD = 'Qa-Passw0rd!';
const must = (c, m) => { if (!c) throw new Error(m); };
const api = async (m, p, t, b) => (await fetch(BASE + p, { method: m, headers: { ...(t && { Authorization: `Bearer ${t}` }), ...(b && { 'Content-Type': 'application/json' }) }, body: b && JSON.stringify(b) })).json();
const account = async (n) => { const email = `wk.${n}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.test`; const r = await api('POST', '/api/auth/signup', null, { name: `Wk ${n}`, email, password: PASSWORD }); return { email, token: r.data.token, id: r.data.user.id }; };
const results = [];
const check = async (id, title, fn) => { try { const note = await fn(); results.push(1); console.log('PASS', id, title, note || ''); } catch (e) { results.push(0); console.log('FAIL', id, title, String(e.message).replace(/\s+/g, ' ').slice(0, 300)); } };
const cr = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const wk = await webkit.launch();
for (const [label, options] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['iPhone 14 profile', devices['iPhone 14']]]) {
  const host = await account('host'), guest = await account('guest');
  const h = await (await cr.newContext({ permissions: ['camera', 'microphone'] })).newPage();
  const g = await (await wk.newContext(options)).newPage();
  const errors = []; g.on('pageerror', (e) => errors.push(e.message));
  for (const p of [h, g]) p.setDefaultTimeout(20000);
  const signIn = async (p, who) => { await p.goto(`${BASE}/login`); await p.locator('#email').fill(who.email); await p.locator('#password').fill(PASSWORD); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(/\/app/); };
  await check('WK-01', `${label}: sign in, refresh, and receive a live message`, async () => {
    await signIn(g, guest); await g.reload(); await g.waitForURL(/\/app/);
    await g.goto(`${BASE}/chat`); await g.waitForTimeout(2000);
    const conv = (await api('POST', '/api/conversations', host.token, { type: 'direct', userId: guest.id })).data.conversation.id;
    await api('POST', `/api/conversations/${conv}/messages`, host.token, { content: 'live-in-webkit' });
    await g.getByText('live-in-webkit').first().waitFor();
  });
  await check('WK-02', `${label}: join a call and receive the other person's video`, async () => {
    await signIn(h, host);
    const room = (await api('POST', '/api/meetings', host.token, { title: 'WebKit call' })).data.meeting.roomId;
    for (const p of [h, g]) { await p.goto(`${BASE}/join/${room}`); await p.waitForTimeout(1500); await p.getByRole('button', { name: /join now/i }).click(); await p.waitForURL(/\/meeting\//); await p.waitForTimeout(1500); }
    await h.getByRole('button', { name: /^(Start video|Turn on camera)/i }).first().click().catch(() => {});
    let state = [];
    for (let i = 0; i < 40; i++) { await g.waitForTimeout(500); state = await g.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).map((v) => `${v.videoWidth}x${v.videoHeight}`)); if (state.length) break; }
    must(state.length >= 1, `no remote video; host sees cameras: ${await h.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).length)}`);
    return `received ${state}`;
  });
  await check('WK-03', `${label}: no page wider than the screen on the main pages`, async () => {
    const wide = [];
    for (const path of ['/app', '/chat', '/teams', '/calendar', '/files', '/tasks', '/history']) { await g.goto(BASE + path); await g.waitForTimeout(900); if (await g.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) wide.push(path); }
    must(!wide.length, wide.join(', '));
  });
  console.log(`INFO ${label} page errors: ${errors.length ? errors.map((e) => e.slice(0, 160)).join(' | ') : 'none'}`);
}
await cr.close(); await wk.close();
console.log(`webkit-call: ${results.filter(Boolean).length}/${results.length}`);
