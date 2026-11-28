// A running meeting while Redis goes away and comes back. The server under test has REDIS_URL set; REDIS_STOP and
// REDIS_START are shell commands that take that Redis down and bring it back.
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
import { api, acct, BASE, PASSWORD } from './call-lib.mjs';

const { REDIS_STOP, REDIS_START } = process.env;
if (!REDIS_STOP || !REDIS_START) throw new Error('Set REDIS_STOP and REDIS_START');
let failed = 0;
const check = (ok, what) => { console.log(ok ? 'PASS' : 'FAIL', what); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Another person's picture is moving. A received track is told apart from this browser's own (fake) camera by its
// label, so a person's own preview, which keeps playing when the call is dead, cannot count.
const remoteMoves = (page) => page.evaluate(async () => {
  const videos = [...document.querySelectorAll('video')].filter((v) => {
    const track = v.srcObject?.getVideoTracks()[0];
    return track && !/fake/i.test(track.label) && v.videoWidth > 0 && !v.paused;
  });
  const before = videos.map((v) => v.currentTime);
  await new Promise((r) => setTimeout(r, 1500));
  return videos.some((v, i) => v.isConnected && v.currentTime > before[i]);
});

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const host = await acct('host'), guest = await acct('guest'), third = await acct('third');
const meeting = (await api('POST', '/api/meetings', host.token, { title: 'Redis outage' })).data.meeting;
const seat = async (who) => {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`${BASE}/login`);
  await page.locator('#email').fill(who.email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/app/);
  await page.goto(`${BASE}/join/${meeting.roomId}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByRole('button', { name: /join now|ask to join/i }).click();
  await page.waitForURL(/\/meeting\//, { timeout: 15000 });
  await page.waitForTimeout(3000);
  for (const name of [/^Unmute/, /^Turn on camera/]) {
    const button = page.getByRole('button', { name }).first();
    if (await button.count()) await button.click();
  }
  return page;
};
const chat = async (from, to, text) => {
  const box = (page) => page.locator('input[placeholder*="essage" i], textarea[placeholder*="essage" i]').first();
  for (const page of [from, to]) if (!(await box(page).isVisible())) await page.getByRole('button', { name: 'Chat', exact: true }).first().click();
  await box(from).fill(text);
  await box(from).press('Enter');
  for (let i = 0; i < 16; i++) { if ((await to.locator('body').innerText()).includes(text)) return true; await sleep(500); }
  return false;
};
const timed = async (call) => { const t = Date.now(); try { const r = await call(); return `${r.success === false ? 'refused' : 'ok'} in ${Date.now() - t} ms`; } catch (e) { return `error ${e.message.slice(0, 40)}`; } };

const H = await seat(host), G = await seat(guest);
await sleep(3000);
check(await remoteMoves(H) && await remoteMoves(G) && await chat(H, G, 'before outage'), 'call and chat work with Redis up');

execSync(REDIS_STOP);
console.log('Redis stopped');
await sleep(20000);
check(await remoteMoves(H) && await remoteMoves(G), 'video keeps flowing 20 s into the outage');
check(await chat(H, G, 'during outage'), 'chat still arrives during the outage');
const me = await timed(() => api('GET', '/api/auth/me', host.token));
check(me.startsWith('ok'), `a signed-in request is answered during the outage (${me})`);
const login = await timed(() => api('POST', '/api/auth/login', null, { email: third.email, password: PASSWORD }));
check(login.startsWith('ok'), `somebody can sign in during the outage (${login})`);

execSync(REDIS_START);
console.log('Redis started');
await sleep(15000);
check(await remoteMoves(H) && await remoteMoves(G), 'video flows after Redis returns');
check(await chat(G, H, 'after outage'), 'chat works after Redis returns');
const T = await seat(third);
await sleep(5000);
check(await remoteMoves(T), 'somebody new can join and see the others');
await browser.close();
process.exit(failed ? 1 : 0);
