// Critical journeys through the web UI that the other scripts do not drive. The server under test must be started with
// SMTP_HOST=127.0.0.1 SMTP_PORT=12526 SMTP_USER=qa SMTP_PASS=qa (this script is the mail server).
import { chromium } from 'playwright';
import net from 'node:net';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:15000', PASSWORD = 'Qa-Passw0rd!', OUT = process.argv[2];
fs.mkdirSync(`${OUT}/screenshots`, { recursive: true });
const mail = [];
const sink = net.createServer((c) => {
  let buf = '', data = '', inData = false, to = [];
  const say = (s) => c.write(`${s}\r\n`); say('220 sink'); c.on('error', () => {});
  c.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
    if (inData) { if (line === '.') { inData = false; mail.push({ to, raw: data.replace(/=\n/g, '') }); data = ''; to = []; say('250 ok'); } else data += `${line}\n`; continue; }
    if (/^EHLO|^HELO/i.test(line)) say('250-sink\r\n250 AUTH PLAIN'); else if (/^AUTH/i.test(line)) say('235 ok'); else if (/^RCPT/i.test(line)) { to.push(line.match(/<(.*)>/)?.[1]); say('250 ok'); }
    else if (/^DATA/i.test(line)) { inData = true; say('354 go'); } else if (/^QUIT/i.test(line)) { say('221 bye'); c.end(); } else say('250 ok'); } });
});
await new Promise((r) => sink.listen(12526, '127.0.0.1', r));
const codeFor = async (email) => { for (let i = 0; i < 60; i++) { const m = [...mail].reverse().find((x) => x.to.includes(email)); const c = m?.raw.match(/is (\d{6})/)?.[1]; if (c) return c; await new Promise((r) => setTimeout(r, 100)); } throw new Error('no code mailed'); };
const api = async (m, p, token, body) => (await fetch(BASE + p, { method: m, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) })).json();
const acct = async (n) => { const email = `j.${n}.${Math.random().toString(36).slice(2, 8)}@example.test`; const r = await api('POST', '/api/auth/signup', null, { name: `J ${n}`, email, password: PASSWORD }); return { email, ...r.data.user, token: r.data.token }; };
const must = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const results = []; const open = [];
const seat = async () => { const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] }); open.push(c); const p = await c.newPage(); p.setDefaultTimeout(8000); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message)); return p; };
const signIn = async (p, who, password = PASSWORD) => { await p.goto(`${BASE}/login`); await p.locator('#email').fill(who.email); await p.locator('#password').fill(password); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(/\/app/); };
const enterRoom = async (p, roomId) => { await p.goto(`${BASE}/join/${roomId}`); await p.waitForLoadState('networkidle').catch(() => {}); await p.getByRole('button', { name: /join now|ask to join/i }).click(); };
async function journey(id, title, fn) {
  try { const note = await fn(); results.push({ id, title, status: 'PASS', note: note || '' }); }
  catch (e) { results.push({ id, title, status: 'FAIL', note: e.message.replace(/\s+/g, ' ').slice(0, 300) }); let i = 0; for (const c of open) for (const p of c.pages()) await p.screenshot({ path: `${OUT}/screenshots/${id}-${i++}.png` }).catch(() => {}); }
  const r = results.at(-1); console.log(r.status, id, title, r.note);
  while (open.length) await open.pop().close();
}

await journey('UI-301', 'forgotten password: request a code, set a new one, sign in with it', async () => {
  const u = await acct('forgot'); const p = await seat();
  await p.goto(`${BASE}/login`); await p.getByRole('link', { name: 'Forgot password?' }).click(); await p.waitForURL(/forgot-password/); await p.getByRole('button', { name: 'Email me a code' }).waitFor();
  await p.locator('#email').fill(u.email); await p.getByRole('button', { name: 'Email me a code' }).click();
  await p.locator('#code').fill(await codeFor(u.email)); await p.locator('#new-password').fill('Brand-new-77');
  await p.getByRole('button', { name: 'Set new password' }).click(); await p.waitForURL(/\/login/);
  await signIn(p, u, 'Brand-new-77');
});
await journey('UI-302', 'change password from the profile; this session keeps receiving live messages', async () => {
  const u = await acct('change'), peer = await acct('peer'); const p = await seat(); await signIn(p, u);
  await p.getByText('Set status').first().click(); await p.getByTitle('Edit profile').first().click();
  await p.getByRole('button', { name: 'Change password' }).click();
  await p.locator('#currentPassword').fill(PASSWORD); await p.locator('#newPassword').fill('Changed-88'); await p.locator('[id^=confirm]').fill('Changed-88');
  await p.getByRole('button', { name: 'Email me a code' }).click();
  await p.locator('#otp').fill(await codeFor(u.email)); await p.getByRole('button', { name: 'Update password' }).click();
  await p.getByText('Password changed').waitFor();
  await p.keyboard.press('Escape'); await p.goto(`${BASE}/chat`); await p.waitForTimeout(1500);
  const conv = (await api('POST', '/api/conversations', peer.token, { type: 'direct', userId: u.id })).data.conversation.id;
  await api('POST', `/api/conversations/${conv}/messages`, peer.token, { content: 'live-after-change' });
  await p.getByText('live-after-change').first().waitFor();
});
await journey('UI-307', 'after a page refresh live messages arrive, even when the session check is slow', async () => {
  const u = await acct('reload'), peer = await acct('slow'); const p = await seat(); await signIn(p, u);
  // the app shell must not depend on this answer having arrived before it subscribes
  await p.route('**/api/auth/me', async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.continue(); });
  await p.goto(`${BASE}/chat`); await p.waitForTimeout(5000);
  const conv = (await api('POST', '/api/conversations', peer.token, { type: 'direct', userId: u.id })).data.conversation.id;
  await api('POST', `/api/conversations/${conv}/messages`, peer.token, { content: 'live-after-refresh' });
  await p.getByText('live-after-refresh').first().waitFor();
});
await journey('UI-308', 'download my data, then delete the account from the profile', async () => {
  const u = await acct('leaver'); const p = await seat(); await signIn(p, u);
  await p.getByText('Set status').first().click(); await p.getByTitle('Edit profile').first().click();
  const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download my data' }).click()]);
  must(JSON.parse(fs.readFileSync(await download.path())).profile.email === u.email, 'export holds the wrong profile');
  await p.getByRole('button', { name: 'Delete account' }).click();
  await p.locator('#delete-password').fill(PASSWORD); await p.getByRole('button', { name: 'Delete for good' }).click();
  await p.waitForURL(`${BASE}/`);
  const again = await api('POST', '/api/auth/login', null, { email: u.email, password: PASSWORD });
  must(again.success === false, 'the account can still sign in');
  must(await p.evaluate(() => !localStorage.getItem('token')), 'a session token was left behind');
  must(!p.errors.length, p.errors.join(' | '));
});
await journey('UI-309', 'page scripts cannot reach the session; chat, files and the admin console still work', async () => {
  const u = await acct('cookie'), peer = await acct('cpeer'); const p = await seat();
  // a browser still holding a token from the earlier version must drop it
  await p.goto(`${BASE}/login`); await p.evaluate(() => { localStorage.setItem('token', 'old'); localStorage.setItem('user', '{"id":"old"}'); });
  await p.goto(`${BASE}/login`); await p.locator('#email').waitFor();
  must(await p.evaluate(() => !localStorage.getItem('token') && !localStorage.getItem('user')), 'old token kept');
  await signIn(p, u);
  const readable = await p.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  must(!/eyJ[A-Za-z0-9_-]{10,}\./.test(readable), 'a token is readable by page scripts');
  const cookie = (await p.context().cookies(`${BASE}/api/x`)).find((c) => c.name === 'mc_session');
  must(cookie?.httpOnly && cookie.sameSite === 'Strict', 'session cookie is not protected');
  await p.reload(); await p.goto(`${BASE}/chat`); await p.waitForTimeout(1500);
  const conv = (await api('POST', '/api/conversations', peer.token, { type: 'direct', userId: u.id })).data.conversation.id;
  await api('POST', `/api/conversations/${conv}/messages`, peer.token, { content: 'live-by-cookie' });
  await p.getByText('live-by-cookie').first().waitFor();
  await p.getByRole('button', { name: /log ?out|sign ?out/i }).first().click(); await p.waitForURL(`${BASE}/`);
  must(!(await p.context().cookies(`${BASE}/api/x`)).some((c) => c.name === 'mc_session' && c.value), 'cookie left after sign-out');
  await p.goto(`${BASE}/app`); await p.waitForURL(/\/login/);
  await p.goto(`${BASE}/admin`);
  await p.locator('input[type=email]').fill('qa-admin@example.test'); await p.locator('input[type=password]').fill('QaAdmin!2026');
  await p.locator('button[type=submit]').click(); await p.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  await p.reload(); await p.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  must(!/eyJ[A-Za-z0-9_-]{10,}\./.test(await p.evaluate(() => JSON.stringify({ ...localStorage }) + document.cookie)), 'admin token readable');
  must(!p.errors.length, p.errors.join(' | '));
});
await journey('UI-310', 'privacy notice and terms are linked from sign-up and readable (server has LEGAL_NAME set)', async () => {
  const p = await seat();
  await p.goto(`${BASE}/signup`);
  await p.getByRole('link', { name: 'Privacy notice' }).click(); await p.getByRole('heading', { name: 'Privacy notice', level: 1 }).waitFor();
  await p.getByText('QA Operator', { exact: false }).first().waitFor();
  await p.goto(`${BASE}/terms`); await p.getByRole('heading', { name: 'Terms of service', level: 1 }).waitFor();
  await p.goto(`${BASE}/`); await p.getByRole('link', { name: 'Terms of service' }).first().waitFor();
  must(!p.errors.length, p.errors.join(' | '));
});
await journey('UI-303', 'waiting room: guest knocks, host admits, guest sees earlier chat and can reply', async () => {
  const h = await acct('host'), g = await acct('guest');
  const m = (await api('POST', '/api/meetings', h.token, { title: 'Lobby', settings: { waitingRoom: true } })).data.meeting;
  const hp = await seat(), gp = await seat(); await signIn(hp, h); await signIn(gp, g);
  await enterRoom(hp, m.roomId); await hp.waitForURL(/\/meeting\//); await hp.waitForTimeout(2000);
  await api('POST', `/api/chat/${m.roomId}/messages`, h.token, { content: 'said-before-admission' });
  await enterRoom(gp, m.roomId); await gp.getByRole('heading', { name: 'Waiting for the host' }).waitFor();
  await hp.getByTitle('Admit').first().click(); await gp.getByRole('heading', { name: 'Waiting for the host' }).waitFor({ state: 'hidden' });
  await gp.getByRole('button', { name: 'Chat', exact: true }).click();
  await gp.getByText('said-before-admission').waitFor();
  const box = gp.locator('input[placeholder*="essage" i], textarea[placeholder*="essage" i]').first(); await box.fill('guest-is-in'); await box.press('Enter');
  await hp.getByRole('button', { name: 'Chat', exact: true }).click(); await hp.getByText('guest-is-in').waitFor();
  must(!gp.errors.length, gp.errors[0]);
});
await journey('UI-304', 'waiting room: a denied guest is sent away', async () => {
  const h = await acct('host'), g = await acct('guest');
  const m = (await api('POST', '/api/meetings', h.token, { settings: { waitingRoom: true } })).data.meeting;
  const hp = await seat(), gp = await seat(); await signIn(hp, h); await signIn(gp, g);
  await enterRoom(hp, m.roomId); await hp.waitForURL(/\/meeting\//); await enterRoom(gp, m.roomId); await gp.getByRole('heading', { name: 'Waiting for the host' }).waitFor();
  await hp.getByTitle('Deny').first().click(); await gp.waitForURL(/\/app/); await gp.getByText(/denied/i).first().waitFor();
});
await journey('UI-305', 'locked and restricted meetings explain the refusal', async () => {
  const h = await acct('host'), g = await acct('guest');
  const p = await seat(); await signIn(p, g);
  const locked = (await api('POST', '/api/meetings', h.token, { settings: { isLocked: true } })).data.meeting;
  await enterRoom(p, locked.roomId); await p.getByText(/locked/i).first().waitFor();
  const closed = (await api('POST', '/api/meetings', h.token, { title: 'Board only', settings: { allowLinkRequests: false } })).data.meeting;
  await p.goto(`${BASE}/join/${closed.roomId}`); await p.getByText(/restricted/i).first().waitFor();
  must(!(await p.locator('body').innerText()).includes('Board only'), 'title of a restricted meeting shown to an outsider');
});
await journey('UI-306', 'six people in one call all receive each other\'s video', async () => {
  const people = []; for (let i = 0; i < 6; i++) people.push(await acct(`six${i}`));
  const m = (await api('POST', '/api/meetings', people[0].token, { title: 'Six' })).data.meeting;
  const pages = [];
  for (const who of people) {
    const p = await seat(); await signIn(p, who); await enterRoom(p, m.roomId); await p.waitForURL(/\/meeting\//); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /^Turn on camera/ }).first().click(); pages.push(p);
  }
  await pages[0].waitForTimeout(8000);
  const seen = []; for (const p of pages) seen.push(await p.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0 && !v.paused).length));
  await pages[0].screenshot({ path: `${OUT}/screenshots/six-people.png` });
  must(seen.every((n) => n >= 6), `playing videos per participant: ${seen}`);
  return `playing videos per participant: ${seen}`;
});
fs.writeFileSync(`${OUT}/ui-journeys.json`, JSON.stringify(results, null, 1));
await browser.close(); sink.close();
