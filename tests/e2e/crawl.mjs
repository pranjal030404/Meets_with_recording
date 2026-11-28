// Visits every web route with seeded data, inventories visible controls, clicks each button once (fresh load each time).
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:15000', PASSWORD = 'Qa-Passw0rd!', OUT = process.argv[2];
const api = async (m, p, token, body, form) => (await fetch(BASE + p, { method: m, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) }, body: form || (body && JSON.stringify(body)) })).json();
const acct = async (n) => { const email = `crawl.${n}.${Math.random().toString(36).slice(2, 8)}@example.test`; const r = await api('POST', '/api/auth/signup', null, { name: `Crawl ${n}`, email, password: PASSWORD }); return { email, ...r.data.user, token: r.data.token }; };
const me = await acct('me'), peer = await acct('peer');
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const team = await api('POST', '/api/teams', me.token, { name: 'Crawl team' });
await api('POST', `/api/teams/${team.id}/invite`, me.token, { email: peer.email });
await api('POST', '/api/meetings', me.token, { title: 'Crawl repeating', scheduledAt: day(1), recurrence: { frequency: 'daily', dates: [day(1), day(2), day(3)] }, invitees: [{ userId: peer.id }] });
await api('POST', '/api/meetings', peer.token, { title: 'Crawl invitation', scheduledAt: day(2), invitees: [{ userId: me.id }] });
await api('POST', '/api/tasks', me.token, { title: 'Crawl task', dueDate: day(1), teamId: team.id });
const f = new FormData(); f.append('file', new Blob(['hello'], { type: 'text/plain' }), 'crawl.txt'); await api('POST', '/api/files/upload', me.token, null, f);
const conv = (await api('POST', '/api/conversations', peer.token, { type: 'direct', userId: me.id })).data.conversation.id;
await api('POST', `/api/conversations/${conv}/messages`, peer.token, { content: 'Crawl hello' });
const admin = (await api('POST', '/api/admin/auth/login', null, { email: 'qa-admin@example.test', password: 'QaAdmin!2026' })).data.token;

const routes = ['/app', '/join', '/history', '/teams', `/teams/${team.id}`, '/calendar', '/billing', '/chat', `/chat/${conv}`, '/tasks', '/files', '/search', '/pricing'];
const anon = ['/', '/login', '/signup', '/verify-email', '/pricing', '/admin'];
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const rows = [], pages = [];
const SEL = 'button, [role=button], [role=tab], [role=menuitem], summary';
const SKIP = /sign out|log ?out/i;

async function open(ctx, route) {
  const p = await ctx.newPage(); const problems = []; let requests = 0;
  p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|favicon|Notification|status of 4\d\d/.test(m.text())) problems.push(`console: ${m.text().slice(0, 160)}`); });
  p.on('response', (r) => { if (r.url().startsWith(`${BASE}/api`)) { requests++; if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(BASE.length).replace(/[0-9a-f-]{36}/g, ':id')}`); } });
  const dialogs = []; p.on('dialog', (d) => { dialogs.push(d.message().slice(0, 80)); d.dismiss(); });
  await p.goto(BASE + route); await p.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {}); await p.waitForTimeout(250);
  return { p, problems, dialogs, count: () => requests };
}
const describe = (p) => p.$$eval(SEL, (els) => els.map((e, i) => ({ i, visible: !!(e.offsetWidth || e.offsetHeight) && getComputedStyle(e).visibility !== 'hidden', disabled: !!e.disabled,
  name: (e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50) })));
const snapshot = (p) => p.evaluate(() => location.pathname + '|' + document.body.innerHTML.length + '|' + document.body.innerText.slice(0, 4000) + '|' + [...document.querySelectorAll('[class]')].map((e) => e.className.toString().length).reduce((a, b) => a + b, 0));

async function crawl(route, init) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'] });
  if (init) { await ctx.addCookies([init.cookie]); await ctx.addInitScript(init.fn, init.arg); }
  const first = await open(ctx, route);
  const buttons = (await describe(first.p)).filter((b) => b.visible);
  const fields = await first.p.$$eval('input, select, textarea', (els) => els.filter((e) => e.offsetWidth).map((e) => `${e.tagName.toLowerCase()}[${e.type || ''}] ${e.name || e.id || e.placeholder || ''}`.trim()));
  const links = await first.p.$$eval('a[href]', (els) => [...new Set(els.filter((e) => e.offsetWidth).map((e) => e.getAttribute('href').replace(/[0-9a-f-]{36}/g, ':id')))]);
  const unnamed = buttons.filter((b) => !b.name).length;
  pages.push({ route: route.replace(/[0-9a-f-]{36}/g, ':id'), landed: new URL(first.p.url()).pathname.replace(/[0-9a-f-]{36}/g, ':id'), buttons: buttons.length, unnamed, fields, links, loadProblems: first.problems });
  await first.p.close();
  const seen = new Map();
  for (const b of buttons) {
    const n = (seen.get(b.name) || 0) + 1; seen.set(b.name, n);
    const row = { route: route.replace(/[0-9a-f-]{36}/g, ':id'), control: b.name || `(unnamed #${b.i})` };
    if (n > 2 && b.name) { row.result = 'not clicked (repeat)'; rows.push(row); continue; }
    if (b.disabled) { row.result = 'disabled'; rows.push(row); continue; }
    if (SKIP.test(b.name)) { row.result = 'not clicked (sign out)'; rows.push(row); continue; }
    const s = await open(ctx, route);
    try {
      s.problems.length = 0;
      const before = await snapshot(s.p), req = s.count();
      const target = (await describe(s.p)).filter((x) => x.visible && x.name === b.name)[n - 1];
      if (!target) throw new Error('control not present on reload');
      await (await s.p.$$(SEL))[target.i].click({ timeout: 2500 });
      await s.p.waitForTimeout(600);
      const changed = (await snapshot(s.p)) !== before || s.count() > req;
      row.result = s.problems.length ? 'problem' : changed ? 'responded' : 'no visible effect';
      if (s.problems.length) row.detail = [...new Set(s.problems)].slice(0, 3);
      else if (s.dialogs.length) { row.result = 'asked to confirm'; row.detail = s.dialogs; }
    } catch (e) { row.result = 'could not click'; row.detail = [e.message.split('\n')[0].slice(0, 120)]; }
    rows.push(row); await s.p.close();
  }
  await ctx.close();
  console.log(route, buttons.length);
}
// signed in as the web app is: the session cookie plus the cached profile
const signedIn = { cookie: { name: 'mc_session', value: me.token, domain: '127.0.0.1', path: '/api', httpOnly: true, sameSite: 'Strict' }, fn: (u) => { localStorage.setItem('user', u); }, arg: JSON.stringify({ id: me.id, name: me.name, email: me.email }) };
for (const r of routes) await crawl(r, signedIn);
for (const r of anon) await crawl(r);
fs.writeFileSync(OUT, JSON.stringify({ pages, controls: rows }, null, 1));
await browser.close();
