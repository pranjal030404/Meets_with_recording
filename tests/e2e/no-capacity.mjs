// Joining while no node can take the meeting (as just after a restart, or when Redis has only just come back): the page
// has to get in by itself once there is room, without a reload. The server under test has REDIS_URL set and a slow
// heartbeat, NODE_HEARTBEAT_MS=15000 NODE_TTL_MS=60000, so the gap made here lasts several seconds.
// Run:  REDIS_CLI="podman exec qa-redis redis-cli" node no-capacity.mjs
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
import { api, acct, BASE, PASSWORD } from './call-lib.mjs';

const { REDIS_CLI = 'redis-cli' } = process.env;
const redis = (command) => execSync(`${REDIS_CLI} ${command}`).toString().trim();
let failed = 0;
const check = (ok, what) => { console.log(ok ? 'PASS' : 'FAIL', what); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Another person's picture is moving; a received track is told apart from this browser's own (fake) camera by its label
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
const host = await acct('host'), guest = await acct('guest');
const meeting = (await api('POST', '/api/meetings', host.token, { title: 'No capacity' })).data.meeting;

const prejoin = async (who) => {
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
  return page;
};
const enter = async (page) => {
  await page.getByRole('button', { name: /join now|ask to join/i }).click();
  await page.waitForURL(/\/meeting\//);
};
const unmute = async (page) => {
  for (const name of [/^Unmute/, /^Turn on camera/]) {
    const button = page.getByRole('button', { name }).first();
    if (await button.count()) await button.click();
  }
};

const H = await prejoin(host);
// forget every node's record; the next heartbeat writes it back
for (const key of redis("--raw keys 'sfu:node:*'").split('\n').filter(Boolean)) redis(`del ${key}`);
await enter(H);
await sleep(3000);
check(redis(`exists meeting:node:${meeting.roomId}`) === '0', 'the server had no room for the meeting when the host joined');
// no reload, no click: wait out the gap
let placed = false;
for (let i = 0; i < 60 && !placed; i++) { await sleep(1000); placed = redis(`exists meeting:node:${meeting.roomId}`) === '1'; }
check(placed, 'the meeting was taken on once there was room');
await sleep(5000);
await unmute(H);
const G = await prejoin(guest);
await enter(G);
await sleep(3000);
await unmute(G);
await sleep(5000);
check(await remoteMoves(H) && await remoteMoves(G), 'host and guest see each other without anybody reloading');
await browser.close();
process.exit(failed ? 1 : 0);
