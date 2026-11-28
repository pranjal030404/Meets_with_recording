// A call on a two-node cluster, in real browsers: the meeting lives on node B while the page is served by node A,
// then node B is killed and the call has to carry on from node A.
//
// Both servers need the same database, JWT_SECRET and Redis, plus for each:
//   node A: PORT=15000 NODE_ID=a NODE_PUBLIC_URL=http://127.0.0.1:15000 CLIENT_URL=http://127.0.0.1:15000
//   node B: PORT=15001 NODE_ID=b NODE_PUBLIC_URL=http://127.0.0.1:15001 CLIENT_URL=http://127.0.0.1:15000
// Run:  REDIS_CLI="podman exec qa-redis redis-cli" NODE_B_PID=<pid> node two-node.mjs
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
import { api, acct, BASE, PASSWORD } from './call-lib.mjs';

const { REDIS_CLI = 'redis-cli', NODE_B_PID } = process.env;
if (!NODE_B_PID) throw new Error('Set NODE_B_PID to the process id of node B (it gets killed)');

let failed = 0;
const check = (ok, what) => { console.log(ok ? 'PASS' : 'FAIL', what); if (!ok) failed++; };
const until = async (fn, ms) => {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
};

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const host = await acct('host'), guest = await acct('guest');
const meeting = (await api('POST', '/api/meetings', host.token, { title: 'Two nodes' })).data.meeting;
execSync(`${REDIS_CLI} set meeting:node:${meeting.roomId} b EX 3600`);
execSync(`${REDIS_CLI} sadd sfu:node-meetings:b ${meeting.roomId}`);

const seat = async (who) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const sockets = [];
  page.on('websocket', (ws) => { sockets.push(ws); ws.opened = Date.now(); ws.on('framereceived', () => { ws.spoke = Date.now(); }); });
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
  // ports of the connections opened since `since` that the server has answered on
  const live = (since = 0) => sockets.filter((s) => s.opened >= since && s.spoke && !s.isClosed()).map((s) => new URL(s.url()).port);
  return { page, live };
};

const H = await seat(host), G = await seat(guest);

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
const bothSee = async () => (await remoteMoves(H.page)) && (await remoteMoves(G.page));
const chat = async (from, to, text) => {
  const input = from.page.locator('input[placeholder*="essage" i], textarea[placeholder*="essage" i]').first();
  if (!(await input.isVisible())) await from.page.getByRole('button', { name: 'Chat', exact: true }).first().click();
  await input.fill(text);
  await input.press('Enter');
  const other = to.page.locator('input[placeholder*="essage" i], textarea[placeholder*="essage" i]').first();
  if (!(await other.isVisible())) await to.page.getByRole('button', { name: 'Chat', exact: true }).first().click();
  return until(async () => (await to.page.locator('body').innerText()).includes(text), 8000);
};

check(H.live().includes('15001') && G.live().includes('15001'), `both connect to the owning node B (host ${H.live()}, guest ${G.live()})`);
check(await until(bothSee, 20000), 'both see their own and the other picture through node B');
check(await chat(H, G, 'hello from B'), 'in-meeting chat works on node B');

const killed = Date.now();
process.kill(Number(NODE_B_PID), 'SIGKILL');
console.log('node B killed');

const moved = await until(async () => H.live(killed).includes('15000') && G.live(killed).includes('15000'), 120000);
check(moved, `both open a working connection to node A after the failure (${Math.round((Date.now() - killed) / 1000)} s)`);
check(await until(bothSee, 60000), 'pictures flow again through node A');
check(await chat(G, H, 'hello after failover'), 'chat works after the failover');

await browser.close();
process.exit(failed ? 1 : 0);
