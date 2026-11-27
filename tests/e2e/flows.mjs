// End-to-end web workflows driven through the UI. Results are verified against the API where possible.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:15000', PASSWORD = 'Qa-Passw0rd!', OUT = process.argv[2];
fs.mkdirSync(`${OUT}/screenshots`, { recursive: true });
const api = async (m, p, token, body) => (await fetch(BASE + p, { method: m, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) })).json();
const rnd = () => Math.random().toString(36).slice(2, 8);
const acct = async (n) => { const email = `flow.${n}.${rnd()}@example.test`; const r = await api('POST', '/api/auth/signup', null, { name: `Flow ${n} ${rnd()}`, email, password: PASSWORD }); return { email, ...r.data.user, token: r.data.token }; };
const results = [];
const must = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const me = await acct('me'), peer = await acct('peer');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const go = async (r) => { await page.goto(BASE + r); await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {}); };
const pause = (ms = 900) => page.waitForTimeout(ms);
async function flow(id, title, fn) {
  errors.length = 0;
  try { const note = await fn(); must(!errors.length, `page error: ${errors[0]}`); results.push({ id, title, status: 'PASS', note: note || '' }); }
  catch (e) { results.push({ id, title, status: 'FAIL', note: e.message.split('\n').slice(0, 2).join(' ').slice(0, 300) }); await page.screenshot({ path: `${OUT}/screenshots/${id}.png` }).catch(() => {}); }
  const r = results.at(-1); console.log(r.status, id, title, r.note);
}
const signIn = async (who) => { await page.locator('#email').fill(who.email); await page.locator('#password').fill(PASSWORD); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL(/\/app/); };
const submit = () => page.locator('form button[type=submit]').last().click();
const meetings = async () => (await api('GET', '/api/meetings?limit=100', me.token)).data.meetings;
const toInput = (h) => { const d = new Date(Date.now() + h * 3600e3); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

await flow('UI-101', 'sign up through the form', async () => {
  await go('/signup');
  const email = `flow.form.${rnd()}@example.test`;
  await page.locator('#name').or(page.locator('[name=name]')).first().fill('Form User');
  await page.locator('#email').or(page.locator('[name=email]')).first().fill(email);
  await page.locator('[name=password], #password').first().fill(PASSWORD);
  await page.locator('[name=confirm], #confirm').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/app/);
  await page.getByTitle('Logout').first().click(); await page.waitForURL((u) => u.pathname === '/'); await pause();
});
await flow('UI-102', 'sign in, start an instant meeting', async () => {
  await go('/login'); await signIn(me);
  await page.getByRole('button', { name: /new meeting/i }).first().click();
  await page.waitForURL(/\/(join|meeting)\//);
  must((await meetings()).length === 1, 'no meeting was created');
});
await flow('UI-103', 'schedule a weekly repeating meeting from the calendar', async () => {
  await go('/calendar');
  await page.getByRole('button', { name: /schedule meeting/i }).first().click();
  const d = page.getByRole('dialog', { name: 'Schedule meeting' });
  await d.getByPlaceholder('Catch-up').fill('Flow weekly');
  await d.locator('input[type=datetime-local]').fill(toInput(48));
  await d.locator('select').last().selectOption('weekly');
  await d.locator('input[type=number]').fill('3');
  await d.locator('button[type=submit]').click(); await pause(1500);
  const n = (await meetings()).filter((m) => m.title === 'Flow weekly').length;
  must(n === 3, `expected 3 dates, got ${n}`);
});
await flow('UI-104', 'history shows one card for the series; edit all dates', async () => {
  await go('/history');
  must(await page.getByText('Flow weekly', { exact: true }).count() === 1, `series shown ${await page.getByText('Flow weekly', { exact: true }).count()} times`);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const f = page.locator('form.modal-content');
  await f.locator('select').selectOption('series');
  await f.locator('input').first().fill('Flow renamed');
  await f.getByRole('button', { name: /save changes/i }).click(); await pause(1500);
  const n = (await meetings()).filter((m) => m.title === 'Flow renamed').length;
  must(n === 3, `renamed ${n} of 3`);
});
await flow('UI-105', 'invite by email from history, then cancel all dates', async () => {
  await go('/history');
  await page.getByRole('button', { name: 'Invite', exact: true }).first().click();
  await page.locator('.modal-backdrop input, .modal-backdrop textarea').first().fill(peer.email);
  await page.locator('.modal-backdrop').getByRole('button', { name: /invite|send/i }).last().click(); await pause(1500);
  const invited = (await meetings()).filter((m) => m.title === 'Flow renamed' && m.inviteeIds.includes(peer.id)).length;
  must(invited === 3, `invitee saved on ${invited} of 3 dates`);
  await go('/history');
  await page.getByRole('button', { name: 'Cancel all' }).first().click(); await pause(1500);
  const left = (await meetings()).filter((m) => m.title === 'Flow renamed' && m.status !== 'cancelled').length;
  must(left === 0, `${left} dates still scheduled`);
});
let teamId;
await flow('UI-106', 'create a team, add a channel, send a message, invite a member', async () => {
  await go('/teams');
  await page.getByRole('button', { name: /create team/i }).first().click();
  await page.getByPlaceholder('My Team').fill('Flow team'); await submit(); await pause();
  const t = (await api('GET', '/api/teams', me.token)).find((x) => x.name === 'Flow team'); must(t, 'team not created'); teamId = t.id;
  await go(`/teams/${teamId}`);
  await page.getByTitle('Add channel').first().click();
  await page.getByPlaceholder('design-reviews').fill('flow-channel'); await submit(); await pause();
  await page.locator('input[placeholder^="Message #"]').fill('flow team message'); await page.getByTitle('Send message').click(); await pause();
  must(await page.getByText('flow team message').count(), 'message not shown');
  await page.getByRole('button', { name: 'Invite' }).first().click();
  await page.getByPlaceholder('member@example.com').fill(peer.email); await submit(); await pause();
  must((await api('GET', `/api/teams/${teamId}`, me.token)).members.length === 2, 'member not added');
});
await flow('UI-107', 'join a team with an invite code', async () => {
  const other = await acct('owner');
  const t = await api('POST', '/api/teams', other.token, { name: `Joinable ${rnd()}` });
  await go('/teams');
  await page.getByRole('button', { name: /join team/i }).first().click();
  await page.getByPlaceholder('Enter team invite code').fill(t.inviteCode); await submit(); await pause(1500);
  must((await api('GET', '/api/teams', me.token)).some((x) => x.id === t.id), 'UI accepted the code but I am not a member');
});
await flow('UI-108', 'create a task, move it to in progress and done', async () => {
  await go('/tasks');
  await page.getByRole('button', { name: /new task/i }).first().click();
  await page.getByPlaceholder('Task title').fill('Flow task'); await page.getByRole('button', { name: 'Create task', exact: true }).click(); await pause();
  await page.getByRole('button', { name: /in progress/i }).first().click(); await pause();
  await page.getByRole('button', { name: /done/i }).first().click(); await pause();
  const t = (await api('GET', '/api/tasks?scope=mine', me.token)).data.tasks.find((x) => x.title === 'Flow task');
  must(t?.status === 'done', `status=${t?.status}`);
});
await flow('UI-109', 'team tabs on tasks and files prompt for a team without an error', async () => {
  const seen = [];
  for (const [route, label] of [['/tasks', 'Team tasks'], ['/files', 'Team files']]) {
    await go(route); await page.getByRole('button', { name: label }).click(); await pause(1200);
    const toast = await page.locator('[role=status]').allInnerTexts();
    if (toast.join('').trim()) seen.push(`${route}: "${toast.join(' ').trim().slice(0, 80)}"`);
  }
  must(!seen.length, `error shown before a team is chosen -> ${seen.join('; ')}`);
});
let downloadStatus;
await flow('UI-110', 'upload, download, trash and restore a file', async () => {
  await go('/files');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'flow.txt', mimeType: 'text/plain', buffer: Buffer.from('flow') }); await pause(1500);
  must(await page.getByText('flow.txt').count(), 'upload not listed');
  const [resp] = await Promise.all([ctx.waitForEvent('response', { predicate: (r) => r.url().endsWith('/download'), timeout: 5000 }), page.getByTitle('Download').first().click()]);
  const status = resp.status();
  for (const extra of ctx.pages().slice(1)) { await extra.screenshot({ path: `${OUT}/screenshots/UI-110-download.png` }).catch(() => {}); await extra.close(); }
  downloadStatus = status;
  await page.getByTitle('Delete').first().click(); await pause();
  await page.getByRole('button', { name: /trash/i }).first().click(); await pause();
  await page.getByTitle('Restore').first().click(); await pause();
  must((await api('GET', '/api/files', me.token)).data.files.some((f) => (f.originalName || f.name) === 'flow.txt'), 'not restored');
  must(downloadStatus === 200, `upload, trash and restore work, but clicking Download returns HTTP ${downloadStatus}`);
});
await flow('UI-111', 'direct message: open, send, save', async () => {
  const conv = (await api('POST', '/api/conversations', peer.token, { type: 'direct', userId: me.id })).data.conversation.id;
  await api('POST', `/api/conversations/${conv}/messages`, peer.token, { content: 'from peer' });
  await go(`/chat/${conv}`);
  await page.locator(`textarea[placeholder^="Message "]`).fill('reply from me'); await page.getByRole('button', { name: 'Send message' }).click(); await pause();
  const msgs = (await api('GET', `/api/conversations/${conv}/messages`, peer.token)).data.messages;
  must(msgs.some((m) => m.content === 'reply from me'), 'message not delivered');
  await page.getByText('from peer', { exact: true }).last().hover(); await page.getByTitle('Save', { exact: true }).first().click(); await pause();
  must((await api('GET', '/api/messages/saved', me.token)).data.saved.length === 1, 'not saved');
});
await flow('UI-112', 'global search finds the task', async () => {
  await go('/search'); await page.getByPlaceholder('Search', { exact: true }).fill('Flow task'); await page.keyboard.press('Enter'); await pause(1500);
  must(await page.getByText('Flow task').count(), 'no result');
});
await flow('UI-113', 'edit profile', async () => {
  await go('/app'); await page.getByText('Set status').first().click(); await page.getByTitle('Edit profile').first().click();
  await page.getByPlaceholder('e.g. Product Designer').fill('Flow Engineer');
  await page.getByRole('button', { name: /save/i }).first().click(); await pause(1200);
  must((await api('GET', '/api/auth/me', me.token)).data.user.title === 'Flow Engineer', 'title not saved');
});
await flow('UI-114', 'after sign-out, the next user on the same browser never sees the previous user\'s data', async () => {
  const secret = `SECRET-${rnd()}`;
  await api('POST', '/api/meetings', me.token, { title: secret, scheduledAt: new Date(Date.now() + 864e5).toISOString() });
  const conv = (await api('POST', '/api/conversations', peer.token, { type: 'direct', userId: me.id })).data.conversation.id;
  await api('POST', `/api/conversations/${conv}/messages`, peer.token, { content: `${secret}-dm` });
  await go('/history'); await page.getByText(secret).first().waitFor();
  await page.locator('a[href="/chat"]').first().click(); await pause(1200);
  await page.getByTitle('Logout').first().click(); await pause(1200);
  const next = await acct('next');
  await page.locator('a[href="/login"]').first().click();        // client-side navigation: no reload
  await signIn(next);
  await page.route('**/api/**', async (route) => { await new Promise((r) => setTimeout(r, 4000)); await route.continue().catch(() => {}); }); // slow network
  const seen = [];
  for (const href of ['/history', '/chat', '/teams']) {
    await page.locator(`a[href="${href}"]`).first().click(); await pause(700);
    const text = await page.locator('body').innerText();
    if (text.includes(secret) || (href === '/teams' && text.includes('Flow team'))) { seen.push(href); await page.screenshot({ path: `${OUT}/screenshots/UI-114${href.replace('/', '-')}.png` }); }
  }
  await page.unrouteAll({ behavior: 'ignoreErrors' }); await pause(6000);
  await page.locator('a[href="/chat"]').first().click(); await pause(2000);
  const still = (await page.locator('body').innerText()).includes(secret);
  must(!seen.length, `the previous user's data is visible to the new user on: ${seen.join(', ')}; still there after the network settled: ${still}`);
});
await flow('UI-115', 'admin console: sign in, create a user, open each section', async () => {
  await page.evaluate(() => localStorage.clear()); await page.goto('about:blank'); await ctx.clearCookies(); await go('/admin'); // leave the signed-in page before dropping its cookie
  await page.locator('#admin-email, [name=admin-email]').first().fill('qa-admin@example.test');
  await page.locator('#admin-password, [name=admin-password]').first().fill('QaAdmin!2026');
  await page.getByRole('button', { name: /sign in/i }).click(); await pause(2000);
  const visited = [];
  for (const tab of ['Users', 'Meetings', 'Roles', 'Admins', 'History', 'Settings', 'Overview']) {
    const b = page.getByRole('button', { name: new RegExp(`^${tab}`, 'i') }).first();
    if (await b.count()) { await b.click(); await pause(700); visited.push(tab); }
  }
  must(visited.length >= 5, `only found ${visited}`);
  await page.getByRole('button', { name: /^users/i }).first().click(); await pause();
  await page.getByRole('button', { name: /add user/i }).first().click();
  const email = `flow.admin.${rnd()}@example.test`;
  await page.getByPlaceholder('Full name').fill('Admin Made'); await page.getByPlaceholder('Email', { exact: true }).fill(email);
  await page.locator('input[placeholder^="Password"]').fill(PASSWORD); await page.getByRole('button', { name: 'Create', exact: true }).click(); await pause(1500);
  must((await api('POST', '/api/auth/login', null, { email, password: PASSWORD })).success, 'created user cannot sign in');
  return `sections: ${visited.join(', ')}`;
});
fs.writeFileSync(`${OUT}/ui-flows.json`, JSON.stringify(results, null, 1));
await browser.close();
