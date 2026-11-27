import fs from 'node:fs';
import { startCall, api } from './call-lib.mjs';
const OUT = process.argv[2]; fs.mkdirSync(`${OUT}/screenshots`, { recursive: true });
let browser, host, guest, meeting, H, G; const results = [];
const must = (c, m) => { if (!c) throw new Error(m); };
const wait = (ms = 900) => H.waitForTimeout(ms);
const btn = (p, name, exact = true) => p.getByRole('button', { name, exact }).first();
const more = async (p, item) => { await btn(p, 'More').click(); await p.waitForTimeout(300); await p.getByRole('button', { name: item }).first().click(); await p.waitForTimeout(700); };
const text = (p) => p.locator('body').innerText();
const unused = async () => { for (const p of [H, G]) { await p.keyboard.press('Escape').catch(() => {}); for (const b of await p.getByRole('button', { name: /^close/i }).all()) if (await b.isVisible()) await b.click({ timeout: 1000 }).catch(() => {}); } };
async function step(id, title, fn) {
  if (process.env.ONLY && !process.env.ONLY.includes(id)) return;
  ({ browser, host, guest, meeting } = await startCall()); H = host.p; G = guest.p;
  host.errors.length = 0; guest.errors.length = 0;
  try { const note = await fn(); const e = [...host.errors, ...guest.errors]; must(!e.length, e.slice(0, 2).join('; ')); results.push({ id, title, status: 'PASS', note: note || '' }); }
  catch (e) { results.push({ id, title, status: 'FAIL', note: e.message.replace(/\s+/g, ' ').slice(0, 500) }); await H.screenshot({ path: `${OUT}/screenshots/${id}-host.png` }).catch(() => {}); await G.screenshot({ path: `${OUT}/screenshots/${id}-guest.png` }).catch(() => {}); }
  const r = results.at(-1); console.log(r.status, id, title, r.note); await browser.close();
}
await step('UI-201', 'in-call chat reaches the other person', async () => {
  await btn(H, 'Chat').click(); await btn(G, 'Chat').click(); await wait(500);
  const box = H.locator('input[placeholder*="essage" i], textarea[placeholder*="essage" i]').first();
  await box.fill('call hello'); await box.press('Enter'); await wait();
  must((await text(G)).includes('call hello'), 'guest did not receive it');
});
await step('UI-202', 'raise hand is visible to the host', async () => {
  await btn(G, 'Raise hand').click(); await wait(); await btn(H, 'Participants').click(); await wait(500);
  must(await H.locator('[title*="hand" i], [aria-label*="hand" i]').count() > 1 || /hand/i.test(await text(H)), 'no indication');
});
await step('UI-203', 'emoji reaction', async () => {
  await btn(G, 'Reactions').click(); await wait(400);
  await G.locator('button').filter({ hasText: '👍' }).first().click(); await wait(300);
  must((await text(H)).includes('👍'), 'host saw no reaction');
});
await step('UI-204', 'turn microphone and camera on and off', async () => {
  for (const n of [/^Unmute/, /^Turn on camera/]) await H.getByRole('button', { name: n }).first().click();
  await wait(2000);
  const playing = await G.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0 && !v.paused).length);
  must(playing >= 1, 'guest received no video');
  await H.getByRole('button', { name: /^(Turn off camera|Stop camera)/ }).first().click(); await wait(500);
});
await step('UI-205', 'screen share reaches the other person and can be stopped', async () => {
  const before = await G.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).length);
  await btn(H, 'Share screen').click(); await wait(3000);
  const during = await G.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0).length);
  must(during > before, `guest video count ${before} -> ${during}`);
  await H.getByRole('button', { name: /stop (sharing|presenting|screen)/i }).first().click(); await wait(1000);
});
await step('UI-206', 'layouts and pin work, and the host can remove a spotlight again', async () => {
  for (const n of ['Speaker view', 'Sidebar view', 'Grid view']) { await btn(H, n).click(); await wait(500); }
  const guestTile = () => H.getByText('Call guest', { exact: true }).first().hover();
  await guestTile(); await H.getByTitle('Pin').first().click(); await wait(600);
  await H.mouse.move(1, 1); await guestTile(); await H.getByTitle('Unpin').first().click(); await wait(600);
  await H.mouse.move(1, 1); await guestTile(); await H.getByTitle('Spotlight').first().click(); await wait(800);
  await H.mouse.move(1, 1); await guestTile(); await wait(300);
  const undo = await H.getByTitle(/remove spotlight|stop spotlight|unspotlight/i).count();
  const again = H.getByTitle('Spotlight').first(); if (await again.count()) { await again.click(); await wait(800); }
  must(undo > 0, 'no control removes the spotlight (store action clearSpotlight is never called by any component)');
});
await step('UI-207', 'meeting details, settings and device panels open', async () => {
  await btn(H, 'Meeting details').click(); await wait(500);
  must(/Meeting code/i.test(await text(H)), 'no details panel');
  await more(H, /^Meeting settings/); must(/Host controls/i.test(await text(H)), 'no host controls');
  await more(H, /^Audio & Video settings/); must(await H.locator('select').count() >= 2, 'no device lists');
});
await step('UI-208', 'whiteboard drawing reaches the other person', async () => {
  await more(H, /^Whiteboard/); await more(G, /^Whiteboard/);
  const box = await H.locator('canvas').last().boundingBox();
  const ink = () => G.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => c.toDataURL()).join('|'));
  const before = await ink();
  await H.mouse.move(box.x + 80, box.y + 80); await H.mouse.down(); await H.mouse.move(box.x + 300, box.y + 220, { steps: 12 }); await H.mouse.up(); await wait();
  must((await ink()) !== before, 'guest canvas did not change');
});
await step('UI-209', 'host creates a poll, guest votes', async () => {
  await more(H, /^Polls/); await H.getByRole('button', { name: /(new|create).*poll/i }).first().click().catch(() => {});
  const inputs = H.locator('input[placeholder*="question" i], textarea[placeholder*="question" i]');
  await inputs.first().fill('Ship today?');
  const opts = H.locator('input[placeholder*="option" i]'); await opts.nth(0).fill('Yes'); await opts.nth(1).fill('No');
  await H.getByRole('button', { name: /^(launch|start|create)( poll)?$/i }).last().click(); await wait();
  await more(G, /^Polls/); await G.getByText('Yes', { exact: true }).first().click();
  const vote = G.getByRole('button', { name: /^(vote|submit)/i }).first(); if (await vote.count()) await vote.click(); await wait(1200);
  const polls = (await api('GET', `/api/polls/meeting/${meeting.id}`, host.who.token)).data.polls;
  must(polls[0].options.reduce((n, o) => n + Number(o.votes), 0) === 1, `vote not recorded: ${JSON.stringify(polls[0].options).slice(0, 120)}`);
});
await step('UI-210', 'guest asks a question, host sees it', async () => {
  await more(G, /^Q&A/); const box = G.locator('input[placeholder*="question" i], textarea[placeholder*="question" i]').first();
  await box.fill('When is the demo?'); await box.press('Enter'); await wait(); await more(H, /^Q&A/);
  must((await text(H)).includes('When is the demo?'), 'host does not see it');
});
await step('UI-211', 'shared notes sync', async () => {
  await more(H, /^Meeting notes/); await more(G, /^Meeting notes/);
  await H.locator('textarea').first().fill('note from host'); await wait(1200);
  must(await G.locator('textarea').first().inputValue() === 'note from host', 'guest notes differ');
});
await step('UI-212', 'record, stop, and the recording is stored on the meeting', async () => {
  await H.getByRole('button', { name: /^Unmute/ }).first().click(); await H.getByRole('button', { name: /^Turn on camera/ }).first().click(); await wait(1500);
  await more(H, /^Start recording/); await wait(6000);
  const posted = H.waitForResponse((r) => r.url().endsWith('/recordings') && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
  const saved = H.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await more(H, /^Stop recording/);
  const [resp, dl] = await Promise.all([posted, saved]);
  must(resp, `no upload was sent; local copy ${dl ? 'was' : 'was not'} downloaded; page said: ${(await text(H)).match(/[^\n]*record[^\n]*/i)?.[0]}`);
  must(resp.status() === 201, `upload returned ${resp.status()}`);
  await wait(1500);
  const m = (await api('GET', `/api/meetings/${meeting.roomId}`, host.who.token)).data.meeting;
  must((m.recordings || []).length === 1, `recordings stored: ${(m.recordings || []).length}`);
  return `size=${m.recordings[0].size} bytes, local copy ${dl ? 'downloaded' : 'not downloaded'}`;
});
await step('UI-213', 'background effects panel opens', async () => { await more(H, /^Background effects/); must(/blur/i.test(await text(H)), 'no options'); });
await step('UI-214', 'meeting tools: start a timer, other person sees it', async () => {
  await btn(H, 'Meeting tools').click(); await wait(500); await H.getByText(/^Timer/).first().click(); await wait(500);
  await H.getByRole('button', { name: /^start/i }).first().click(); await wait(1200);
  must(/\d{1,2}:\d{2}/.test(await text(G)), 'guest sees no countdown');
});
await step('UI-215', 'captions toggle, shortcuts, attendance download, hide and unmirror self view', async () => {
  await btn(H, 'Show captions').click(); await wait(400);
  await more(H, /^Keyboard shortcuts/); await H.keyboard.press('Escape'); await H.mouse.click(5, 450); await wait(400);
  const [dl] = await Promise.all([H.waitForEvent('download'), more(H, /^Download attendance/)]);
  must(fs.statSync(await dl.path()).size > 0, 'empty attendance file');
  await more(H, /^Unmirror my video/); await more(H, /^Hide my video tile/);
});
await step('UI-216', 'host leaves; the guest is told the meeting ended', async () => {
  await H.getByTitle('Leave meeting').click(); await wait(800);
  const end = H.getByRole('button', { name: /end (meeting )?for (all|everyone)|^leave( meeting)?$/i }).first(); if (await end.count()) await end.click(); await wait(2500);
  const m = (await api('GET', `/api/meetings/${meeting.roomId}`, host.who.token)).data.meeting;
  must(m.status === 'ended', `meeting status after host left: ${m.status}`);
});
await step('UI-217', 'recording with every mic and camera off still stores something, or says it cannot', async () => {
  await more(H, /^Start recording/); await wait(6000);
  const posted = H.waitForResponse((r) => r.url().endsWith('/recordings') && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
  await more(H, /^Stop recording/); const resp = await posted;
  must(resp && resp.status() === 201, resp ? `upload ${resp.status()}` : 'no upload was sent; page said: ' + (await text(H)).match(/[^\n]*recording[^\n]*/i)?.[0]);
});
fs.writeFileSync(`${OUT}/ui-call${process.env.ONLY ? '-rerun' : ''}.json`, JSON.stringify(results, null, 1));
