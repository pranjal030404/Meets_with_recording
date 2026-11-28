// A two-person call forced through TURN, as for someone whose network allows nothing else. The server under test needs
// TURN_SECRET and TURN_URLS pointing at a coturn started with `--use-auth-secret --static-auth-secret=<the same>`, and
// MEDIASOUP_ANNOUNCED_IP set to a LAN address the TURN server may relay to.
import { chromium } from 'playwright';
import { api, acct, BASE, PASSWORD } from './call-lib.mjs';

let failed = 0;
const check = (ok, what) => { console.log(ok ? 'PASS' : 'FAIL', what); if (!ok) failed++; };
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const host = await acct('host'), guest = await acct('guest');
const meeting = (await api('POST', '/api/meetings', host.token, { title: 'Through TURN' })).data.meeting;

const seat = async (who) => {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  // every connection of this browser may use relayed addresses only
  await context.addInitScript(() => {
    const Real = window.RTCPeerConnection;
    window.__peers = [];
    window.RTCPeerConnection = class extends Real {
      constructor(config, ...rest) { super({ ...config, iceTransportPolicy: 'relay' }, ...rest); window.__peers.push(this); }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
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
const H = await seat(host), G = await seat(guest);
await H.waitForTimeout(8000);

// bytes that arrived and the kind of address they arrived through
const received = (page) => page.evaluate(async () => {
  let bytes = 0; const kinds = new Set();
  for (const peer of window.__peers) {
    const stats = await peer.getStats();
    for (const s of stats.values()) {
      if (s.type === 'inbound-rtp' && s.kind === 'video') bytes += s.bytesReceived;
      if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated) kinds.add(stats.get(s.localCandidateId)?.candidateType);
    }
  }
  return { bytes, kinds: [...kinds] };
});
for (const [who, page] of [['host', H], ['guest', G]]) {
  const first = await received(page);
  await page.waitForTimeout(2000);
  const second = await received(page);
  check(second.bytes > first.bytes, `${who} keeps receiving video (${first.bytes} -> ${second.bytes} bytes)`);
  check(second.kinds.length === 1 && second.kinds[0] === 'relay', `${who} is connected through the relay only (${second.kinds})`);
}
await browser.close();
process.exit(failed ? 1 : 0);
