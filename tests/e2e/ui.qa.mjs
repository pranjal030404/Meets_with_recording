/**
 * Browser QA: rendering, responsive widths, auth UI, protected routes, accessibility (axe),
 * stored-link XSS, and a real two-person call through the SFU with fake camera/microphone.
 *
 *   cd tests/e2e && npm install && npx playwright install
 *   QA_BASE_URL=http://127.0.0.1:15000 QA_OUT=../../qa-reports/evidence node ui.qa.mjs [chromium,firefox,webkit]
 *
 * The server under test needs MEDIASOUP_ANNOUNCED_IP=127.0.0.1 and a DISPOSABLE database. Localhost only.
 */
import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const BASE = process.env.QA_BASE_URL || '';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw new Error('QA_BASE_URL must be a local server');
const OUT = process.env.QA_OUT || 'qa-output';
fs.mkdirSync(`${OUT}/screenshots`, { recursive: true });

const engines = { chromium, firefox, webkit };
const wanted = (process.argv[2] || 'chromium,firefox,webkit').split(',');
const results = [];
const axe = {};
const PASSWORD = 'Qa-Passw0rd!';
const rnd = () => Math.random().toString(36).slice(2, 8);

async function check(browser, id, title, fn) {
  const started = new Date().toISOString();
  try {
    const note = await fn();
    results.push({ browser, id, title, status: 'PASS', note: note || '', started });
  } catch (e) {
    results.push({ browser, id, title, status: 'FAIL', note: String(e.message).split('\n')[0].slice(0, 900), started });
  }
  const r = results.at(-1);
  console.log(`${r.status} [${browser}] ${id} ${title}${r.note ? ` -- ${r.note}` : ''}`);
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

const api = async (method, path, token, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
};
const account = async (name) => {
  const email = `ui.${name}.${rnd()}@example.test`;
  const r = await api('POST', '/api/auth/signup', null, { name: `UI ${name}`, email, password: PASSWORD });
  return { email, token: r.data.token, id: r.data.user.id };
};

function watch(page) {
  const problems = [];
  // The app's error boundary logs "UI crashed:"; record the underlying error text.
  page.addInitScript(() => {
    const orig = console.error.bind(console);
    console.error = (...a) => {
      if (String(a[0]).includes('UI crashed')) orig(`UI crashed detail: ${a.map((x) => (x && x.message) ? `${x.name}: ${x.message} ${String(x.stack).slice(0, 300)}` : String(x)).join(' ')}`);
      else orig(...a);
    };
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', async (m) => {
    if (m.type() !== 'error' || /fonts\.g|favicon|Notification permission/.test(m.text())) return; // permission prompt has its own check
    const parts = await Promise.all(m.args().map((a) => a.evaluate((v) => (v && v.stack) ? `${v.message} ${v.stack.slice(0, 300)}` : String(v)).catch(() => '')));
    problems.push(`console: ${parts.join(' ') || m.text()}`);
  });
  page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  return problems;
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
async function signIn(page, who) {
  await page.goto(`${BASE}/login`);
  await page.fill('#email', who.email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/app/, { timeout: 10000 });
}
async function axeScan(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  axe[label] = r.violations.map((v) => ({
    rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
    sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
}

const PUBLIC = ['/', '/login', '/signup']; // pricing and billing are hidden while limits are off
const PRIVATE = ['/app', '/history', '/calendar', '/teams', '/chat', '/tasks', '/files', '/search', '/join'];

for (const name of wanted) {
  let browser;
  try {
    browser = await engines[name].launch(name === 'chromium'
      ? { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] }
      : name === 'firefox'
        ? { firefoxUserPrefs: { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true,
        'media.peerconnection.ice.loopback': true, 'media.peerconnection.ice.obfuscate_host_addresses': false } }
        : {});
  } catch (e) {
    results.push({ browser: name, id: 'UI-000', title: 'browser launches', status: 'BLOCKED', note: e.message.split('\n')[0] });
    console.log(`BLOCKED ${name}: ${e.message.split('\n')[0]}`);
    continue;
  }
  const version = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  const user = await account(`${name}main`);

  await check(name, 'UI-001', `public pages render without errors (${version})`, async () => {
    for (const p of PUBLIC) {
      problems.length = 0;
      await page.goto(BASE + p); await settle(page);
      must((await page.locator('#root *').count()) > 5, `${p} is blank`);
      must(!problems.length, `${p}: ${problems[0]}`);
      if (name === 'chromium') { await axeScan(page, p); await page.screenshot({ path: `${OUT}/screenshots/${p.replace(/\W/g, '') || 'landing'}.png` }); }
    }
  });

  await check(name, 'UI-002', 'protected routes redirect anonymous visitors to /login', async () => {
    for (const p of PRIVATE) {
      await page.goto(BASE + p);
      await page.waitForURL(/\/login/, { timeout: 5000 });
    }
  });

  await check(name, 'UI-003', 'wrong password stays on the form and shows an error', async () => {
    await page.goto(`${BASE}/login`);
    await page.fill('#email', user.email);
    await page.fill('#password', 'wrong-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText(/invalid email or password/i).first().waitFor({ timeout: 5000 });
    must(page.url().endsWith('/login'), page.url());
  });

  await check(name, 'UI-004', 'signup form validates then creates an account', async () => {
    await page.goto(`${BASE}/signup`);
    await page.fill('#name', 'UI Signup');
    await page.fill('#email', `ui.form.${rnd()}@example.test`);
    await page.fill('#password', PASSWORD);
    await page.fill('#confirm', 'different');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByText('Passwords do not match', { exact: true }).waitFor({ timeout: 4000 });
    await page.fill('#confirm', PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(/\/app/, { timeout: 10000 });
    await page.evaluate(() => localStorage.clear());
    await page.goto('about:blank'); // leave first: dropping the cookie under a signed-in page redirects it mid-navigation
    await page.context().clearCookies();
  });

  await check(name, 'UI-005', 'login, session survives reload', async () => {
    await signIn(page, user);
    await page.reload(); await settle(page);
    must(page.url().includes('/app'), page.url());
  });

  for (const p of PRIVATE) {
    await check(name, `UI-PAGE${p}`, `${p} loads with no script errors or 5xx`, async () => {
      problems.length = 0;
      await page.goto(BASE + p); await settle(page); await page.waitForTimeout(400);
      must(!page.url().includes('/login'), 'bounced to login');
      must((await page.locator('#root *').count()) > 5, 'blank page');
      must(!problems.length, problems[0]);
      if (name === 'chromium') { await axeScan(page, p); await page.screenshot({ path: `${OUT}/screenshots/${p.slice(1)}.png` }); }
    });
  }

  for (const [w, h] of [[768, 1024], [375, 812], [320, 640]]) {
    await check(name, `UI-RESP-${w}`, `no horizontal page scroll at ${w}px`, async () => {
      await page.setViewportSize({ width: w, height: h });
      const bad = [];
      for (const p of ['/', ...PRIVATE]) {
        await page.goto(BASE + p); await settle(page);
        const px = await overflow(page);
        if (px > 1) { bad.push(`${p} +${px}px`); await page.screenshot({ path: `${OUT}/screenshots/overflow-${name}-${w}-${p.replace(/\W/g, '') || 'landing'}.png` }); }
        else if (w === 375 && name === 'chromium' && ['/app', '/chat'].includes(p)) await page.screenshot({ path: `${OUT}/screenshots/mobile-${p.slice(1)}.png` });
      }
      must(!bad.length, bad.join(', '));
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await check(name, 'UI-010', 'notification permission is only requested after a user gesture', async () => {
    const c = await browser.newContext(); const p = await c.newPage();
    await p.addInitScript(() => {
      window.__asked = 0;
      if (!window.Notification) return;
      Object.defineProperty(Notification, 'permission', { get: () => 'default' });
      Notification.requestPermission = () => { if (!navigator.userActivation?.isActive) window.__asked++; return Promise.resolve('default'); };
    });
    await signIn(p, user);
    await p.goto(`${BASE}/app`); await settle(p); await p.waitForTimeout(500);
    const n = await p.evaluate(() => window.__asked);
    await c.close();
    must(n === 0, `permission requested ${n} time(s) on page load without any click`);
  });

  await check(name, 'UI-006', 'keyboard-only sign in with visible focus', async () => {
    const kb = await browser.newContext(); const p = await kb.newPage();
    await p.goto(`${BASE}/login`);
    await p.locator('#email').focus();
    await p.keyboard.type(user.email);
    await p.keyboard.press('Tab');
    await p.keyboard.type(PASSWORD);
    await p.keyboard.press('Enter');
    await p.waitForURL(/\/app/, { timeout: 10000 });
    await settle(p);
    await p.getByRole('button', { name: /new meeting/i }).first().waitFor();
    await p.keyboard.press('Tab');
    const f = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${document.activeElement.tagName} ${s.outlineStyle} ${s.boxShadow}`; });
    await kb.close();
    must(!/BODY/.test(f) && !/ none none$/.test(f), `no visible focus indicator: ${f}`);
    return f.slice(0, 60);
  });

  await check(name, 'UI-007', 'two people join a call and receive each other\'s video through the SFU', async () => {
    const guest = await account(`${name}guest`);
    const m = (await api('POST', '/api/meetings', user.token, { title: 'UI call' })).data.meeting;
    const seats = [];
    try {
      for (const who of [user, guest]) {
        const c = await browser.newContext(name === 'chromium' ? { permissions: ['camera', 'microphone'] } : {});
        const p = await c.newPage(); const errs = watch(p);
        await signIn(p, who);
        await p.goto(`${BASE}/join/${m.roomId}`); await settle(p);
        for (const label of ['Turn on camera', 'Unmute']) {
          const b = p.getByTitle(label).first();
          if (await b.count()) await b.click().catch(() => {});
        }
        await p.getByRole('button', { name: /join now|ask to join/i }).click();
        await p.waitForURL(/\/meeting\//, { timeout: 15000 });
        for (const label of [/^turn on camera/i, /^unmute/i]) {
          const b = p.getByRole('button', { name: label }).first();
          if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
        }
        seats.push({ c, p, errs });
        await p.waitForTimeout(1500);
      }
      await seats[0].p.waitForTimeout(6000);
      const seen = [];
      for (const s of seats) {
        seen.push(await s.p.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0 && !v.paused).length));
      }
      if (name === 'chromium') await seats[0].p.screenshot({ path: `${OUT}/screenshots/meeting-two-participants.png` });
      const errs = seats.flatMap((s) => s.errs).slice(0, 3).join(' | ').replace(/\s+/g, ' ');
      must(seen.every((n) => n >= 2), `playing video elements per participant: ${seen}. ${errs}`);
      return `playing videos per participant: ${seen}`;
    } finally {
      for (const s of seats) await s.c.close();
    }
  });

  await check(name, 'UI-008', 'a chat attachment link can never execute script', async () => {
    const peer = await account(`${name}peer`);
    const conv = (await api('POST', '/api/conversations', peer.token, { type: 'direct', userId: user.id })).data.conversation.id;
    await api('POST', `/api/conversations/${conv}/messages`, peer.token, {
      content: 'Quarterly report', type: 'file', fileName: 'report.pdf', fileType: 'application/pdf',
      fileUrl: "javascript:window.__qaXss=1",
    });
    await page.goto(`${BASE}/chat/${conv}`); await settle(page);
    const link = page.locator('a[href^="javascript:"]').first();
    if (!(await link.count())) return 'no javascript: link rendered';
    await page.screenshot({ path: `${OUT}/screenshots/xss-attachment-${name}.png` });
    const popup = context.waitForEvent('page', { timeout: 1500 }).catch(() => null);
    await link.click();
    const opened = await popup;
    await page.waitForTimeout(500);
    const ran = await page.evaluate(() => window.__qaXss === 1);
    if (opened) await opened.close();
    await link.click({ modifiers: [] }).catch(() => {});
    throw new Error(`javascript: URL rendered as a clickable href; executed in this browser on click: ${ran}`);
  });

  await check(name, 'UI-009', 'logout returns to a public page and blocks back-navigation', async () => {
    await page.goto(`${BASE}/app`); await settle(page);
    let out = page.getByRole('button', { name: /sign out|log ?out/i }).first();
    if (!(await out.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /account|profile|menu|UI /i }).first().click();
      out = page.getByText(/sign out|log ?out/i).first();
    }
    await out.click();
    await page.waitForTimeout(800);
    await page.goto(`${BASE}/app`);
    await page.waitForURL(/\/login/, { timeout: 5000 });
  });

  await browser.close();
}

fs.writeFileSync(`${OUT}/ui-results-${wanted.join('-')}.json`, JSON.stringify(results, null, 1));
if (Object.keys(axe).length) fs.writeFileSync(`${OUT}/axe-results.json`, JSON.stringify(axe, null, 1));
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\ntotal=${results.length} pass=${count('PASS')} fail=${count('FAIL')} blocked=${count('BLOCKED')}`);
