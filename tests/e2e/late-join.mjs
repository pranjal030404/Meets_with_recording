// Someone joining a running call must get every stream that is already there, even when another update about the room
// (here: who is speaking) arrives at the same moment. That update is injected right behind the list of existing streams,
// which makes a timing fault happen every time instead of now and then.
import { chromium } from 'playwright';
import { api, acct, BASE, PASSWORD } from './call-lib.mjs';

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const host = await acct('host'), guest = await acct('guest');
const meeting = (await api('POST', '/api/meetings', host.token, { title: 'Late join' })).data.meeting;
let injected = 0;

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

const seat = async (who, inject) => {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  if (inject) {
    await page.routeWebSocket(/socket\.io/, (ws) => {
      const server = ws.connectToServer();
      server.onMessage((message) => {
        ws.send(message);
        if (String(message).startsWith('42["mediasoup:existingProducers"')) { injected++; ws.send('42["media:active-speakers",{"userIds":[]}]'); }
      });
    });
  }
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

await seat(host, false);
const late = await seat(guest, true);
await late.waitForTimeout(6000);
const sees = await remoteMoves(late);
const ok = injected > 0 && sees;
console.log(ok ? 'PASS' : 'FAIL', `late joiner sees the person already there (update injected ${injected} time(s), video ${sees ? 'moving' : 'missing'})`);
await browser.close();
process.exit(ok ? 0 : 1);
