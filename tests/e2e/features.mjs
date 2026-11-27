// Web features the other scripts do not drive. Server on 127.0.0.1:15000, disposable database only.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:15000', PASSWORD = 'Qa-Passw0rd!', OUT = process.argv[2];
fs.mkdirSync(`${OUT}/screenshots`, { recursive: true });
const api = async (m, p, token, body) => (await fetch(BASE + p, { method: m, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) }, body: body && JSON.stringify(body) })).json();
const rnd = () => Math.random().toString(36).slice(2, 7);
const acct = async (n) => { const name = `F ${n} ${rnd()}`; const email = `f.${n}.${rnd()}${rnd()}@example.test`; const r = await api('POST', '/api/auth/signup', null, { name, email, password: PASSWORD }); return { email, name, ...r.data.user, token: r.data.token }; };
const must = (c, m) => { if (!c) throw new Error(m); };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const results = []; const open = [];
const seat = async (who) => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'] }); open.push(c);
  const p = await c.newPage(); p.setDefaultTimeout(7000); p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message)); p.on('dialog', (d) => d.accept());
  p.on('response', (r) => { if (r.url().startsWith(`${BASE}/api`) && r.status() >= 400) p.errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(BASE.length).replace(/[0-9a-f-]{36}/g, ':id')}`); });
  if (who) { await p.goto(`${BASE}/login`); await p.locator('#email').fill(who.email); await p.locator('#password').fill(PASSWORD); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(/\/app/); }
  return p;
};
const go = async (p, r) => { await p.goto(BASE + r); await p.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); };
const wait = (p, ms = 900) => p.waitForTimeout(ms);
const click = (p, name, exact = true) => p.getByRole('button', { name, exact }).first().click();
async function journey(id, title, fn) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) return;
  try {
    await fn();
    const errors = open.flatMap((c) => c.pages().flatMap((p) => p.errors || []));
    must(!errors.length, `errors on the page: ${[...new Set(errors)].slice(0, 3).join(' ; ')}`);
    results.push({ id, title, status: 'PASS', note: '' });
  } catch (e) {
    results.push({ id, title, status: 'FAIL', note: e.message.replace(/\s+/g, ' ').slice(0, 300) });
    let i = 0; for (const c of open) for (const p of c.pages()) await p.screenshot({ path: `${OUT}/screenshots/${id}-${i++}.png` }).catch(() => {});
  }
  const r = results.at(-1); console.log(r.status, id, title, r.note);
  while (open.length) await open.pop().close();
}

// ---------- chat ----------
const chat = async () => {
  const a = await acct('a'), b = await acct('b');
  const conv = (await api('POST', '/api/conversations', b.token, { type: 'direct', userId: a.id })).data.conversation.id;
  await api('POST', `/api/conversations/${conv}/messages`, b.token, { content: 'from-b' });
  const p = await seat(a); await go(p, `/chat/${conv}`);
  await p.locator('textarea[placeholder^="Message "]').fill('from-a'); await click(p, 'Send message'); await wait(p);
  const msgs = async () => (await api('GET', `/api/conversations/${conv}/messages`, a.token)).data.messages;
  const actions = async (text) => { await p.getByText(text, { exact: true }).last().hover(); };
  return { a, b, conv, p, msgs, actions };
};
await journey('UI-401', 'chat: edit and delete my own message', async () => {
  const { p, msgs, actions } = await chat();
  await actions('from-a'); await p.getByTitle('Edit', { exact: true }).first().click();
  await p.locator('input.input.flex-1').first().fill('edited-a'); await p.locator('input.input.flex-1').first().locator('xpath=following-sibling::button[1]').click(); await wait(p);
  must((await msgs()).some((m) => m.content === 'edited-a'), 'edit not saved');
  await actions('edited-a'); await p.getByTitle('Delete', { exact: true }).first().click(); await wait(p, 1200);
  must(!(await msgs()).some((m) => m.content === 'edited-a'), 'delete did nothing');
});
await journey('UI-402', 'chat: react, reply in a thread, pin list', async () => {
  const { p, a, conv, msgs, actions } = await chat();
  await actions('from-b'); await p.getByTitle('React', { exact: true }).first().click(); await p.getByRole('button', { name: '👍' }).first().click(); await wait(p);
  must((await msgs()).find((m) => m.content === 'from-b').reactions.length === 1, 'reaction not saved');
  await actions('from-b'); await p.getByTitle('Reply in thread').first().click();
  await p.getByPlaceholder('Reply...').fill('threaded'); await p.getByPlaceholder('Reply...').press('Enter'); await wait(p);
  must((await msgs()).find((m) => m.content === 'from-b').replyCount === 1, 'reply not saved');
  await p.getByTitle('Pinned messages').first().click(); await wait(p, 500);
});
await journey('UI-403', 'chat: forward to another chat, create a task from a message, saved list', async () => {
  const { p, a, actions } = await chat(); const c = await acct('c');
  const other = (await api('POST', '/api/conversations', c.token, { type: 'direct', userId: a.id })).data.conversation.id;
  await wait(p);
  await actions('from-b'); await p.getByTitle('Forward', { exact: true }).first().click(); await wait(p, 500);
  await p.getByRole('button', { name: new RegExp(c.name) }).last().click(); await p.getByRole('button', { name: 'Forward', exact: true }).last().click(); await wait(p);
  must((await api('GET', `/api/conversations/${other}/messages`, a.token)).data.messages.some((m) => m.content === 'from-b'), 'not forwarded');
  await actions('from-b'); await p.getByTitle('Create task', { exact: true }).first().click(); await wait(p, 600);
  const create = p.getByRole('button', { name: /create task|create$/i }).last(); if (await create.count()) await create.click(); await wait(p);
  must((await api('GET', '/api/tasks?scope=mine', a.token)).data.tasks.length === 1, 'no task created');
  await actions('from-b'); await p.getByTitle('Save', { exact: true }).first().click(); await wait(p);
  await p.getByTitle('Saved messages').first().click(); await p.getByText('from-b').last().waitFor();
});
await journey('UI-404', 'chat: create a group and attach a file', async () => {
  const a = await acct('a'), b = await acct('b'), c = await acct('c');
  const team = await api('POST', '/api/teams', a.token, { name: 'Grp' });
  for (const u of [b, c]) await api('POST', `/api/teams/${team.id}/invite`, a.token, { email: u.email });
  const p = await seat(a); await go(p, '/chat');
  await click(p, 'New conversation'); await wait(p, 500);
  await click(p, 'Group chat');
  const search = p.getByPlaceholder('Search by name');
  for (const u of [b, c]) { await search.fill(u.name); await p.getByText(u.name).last().click(); await wait(p, 300); }
  await p.getByPlaceholder('Group name').fill('Trio');
  await p.getByRole('button', { name: /create/i }).last().click(); await wait(p, 1500);
  const group = (await api('GET', '/api/conversations', a.token)).data.conversations.find((x) => x.type === 'group');
  must(group && group.members.length === 3, 'group not created with three members');
  await p.locator('input[type=file]').last().setInputFiles({ name: 'g.txt', mimeType: 'text/plain', buffer: Buffer.from('g') }); await click(p, 'Send file'); await wait(p, 1500);
  must((await api('GET', `/api/conversations/${group.id}/messages`, b.token)).data.messages.some((m) => m.fileName === 'g.txt'), 'attachment not delivered');
});

// ---------- teams ----------
const teamWith = async () => {
  const o = await acct('owner'), m = await acct('member');
  const t = await api('POST', '/api/teams', o.token, { name: `Team ${rnd()}` });
  await api('POST', `/api/teams/${t.id}/invite`, o.token, { email: m.email });
  const get = async () => api('GET', `/api/teams/${t.id}`, o.token);
  return { o, m, t, get };
};
await journey('UI-411', 'team: copy and reset invite code, remove a member', async () => {
  const { o, m, t, get } = await teamWith(); const p = await seat(o); await go(p, `/teams/${t.id}`);
  if (!(await p.getByTitle('Regenerate code').count())) await p.getByTitle('Toggle members').click();
  await p.getByTitle('Copy code').first().click(); await p.getByTitle('Regenerate code').first().click(); await wait(p, 1200);
  must((await get()).inviteCode !== t.inviteCode, 'code unchanged');
  await p.getByTitle('Remove member').first().click(); await wait(p, 1200);
  must((await get()).members.length === 1, 'member still there');
});
await journey('UI-412', 'team: add and delete a channel, send a file to it', async () => {
  const { o, t, get } = await teamWith(); const p = await seat(o); await go(p, `/teams/${t.id}`);
  await p.getByTitle('Add channel').first().click(); await p.getByPlaceholder('design-reviews').fill('temp'); await p.locator('form button[type=submit]').last().click(); await wait(p);
  must((await get()).channels.some((c) => c.name === 'temp'), 'channel not added');
  await p.locator('input[type=file]').last().setInputFiles({ name: 't.txt', mimeType: 'text/plain', buffer: Buffer.from('t') }); await click(p, 'Send file'); await wait(p, 1500);
  await p.getByTitle('Delete channel').first().click(); await p.getByRole('button', { name: 'Delete', exact: true }).last().click(); await wait(p);
  must(!(await get()).channels.some((c) => c.name === 'temp'), 'channel still there');
});
await journey('UI-413', 'team: tasks and calendar tabs, team files', async () => {
  const { o, t } = await teamWith(); const p = await seat(o);
  await api('POST', '/api/meetings', o.token, { title: 'Team sync', teamId: t.id, scheduledAt: day(0.05) });
  await api('POST', '/api/tasks', o.token, { title: 'Team job', teamId: t.id });
  await go(p, `/teams/${t.id}`);
  await click(p, 'Tasks'); await p.getByText('Team job').first().waitFor();
  await click(p, 'Calendar'); await p.getByText('Team sync').first().waitFor();
  await go(p, '/files'); await click(p, 'Team files'); await p.locator('select').first().selectOption(t.id);
  await p.locator('input[type=file]').first().setInputFiles({ name: 'tf.txt', mimeType: 'text/plain', buffer: Buffer.from('tf') }); await p.getByText('tf.txt').first().waitFor();
});
await journey('UI-414', 'team: a member leaves, the owner deletes the team', async () => {
  const { o, m, t, get } = await teamWith();
  const mp = await seat(m); await go(mp, '/teams'); await mp.getByTitle('Leave team').first().click(); await wait(mp, 600);
  const confirm = mp.getByRole('button', { name: /^leave/i }).last(); if (await confirm.count()) await confirm.click().catch(() => {}); await wait(mp);
  must((await get()).members.length === 1, 'member did not leave');
  const op = await seat(o); await go(op, `/teams/${t.id}`); await op.getByTitle('Delete team').first().click(); await op.locator(`input[placeholder="${t.name}"]`).fill(t.name); await op.getByRole('button', { name: /delete/i }).last().click(); await wait(op, 1500);
  must(!(await api('GET', '/api/teams', o.token)).some((x) => x.id === t.id), 'team still listed');
});

// ---------- personal ----------
await journey('UI-421', 'tasks: edit, add a subtask, delete', async () => {
  const a = await acct('a'); await api('POST', '/api/tasks', a.token, { title: 'Original' }); const p = await seat(a); await go(p, '/tasks');
  await p.getByText('Original').first().click();
  await p.getByPlaceholder('Add subtask...').fill('Child'); await p.getByPlaceholder('Add subtask...').press('Enter'); await wait(p);
  if (!(await p.getByText('Child').count())) { await p.getByPlaceholder('Add subtask...').locator('xpath=following-sibling::button').click(); await wait(p); }
  await p.getByPlaceholder('Description').last().fill('Described');
  await p.getByRole('button', { name: /save/i }).last().click(); await wait(p);
  const t = (await api('GET', '/api/tasks?scope=mine', a.token)).data.tasks.find((x) => x.title === 'Original');
  const full = (await api('GET', `/api/tasks/${t.id}`, a.token)).data;
  must(full.task.description === 'Described' && full.subtasks.length === 1, `description=${full.task.description} subtasks=${full.subtasks.length}`);
  await p.getByText('Original').first().click(); await p.getByTitle('Delete task').click(); await wait(p);
  must(!(await api('GET', '/api/tasks?scope=mine', a.token)).data.tasks.some((x) => x.title === 'Original'), 'not deleted');
});
await journey('UI-422', 'notifications: open, mark all read, clear', async () => {
  const a = await acct('a'), b = await acct('b');
  const conv = (await api('POST', '/api/conversations', b.token, { type: 'direct', userId: a.id })).data.conversation.id;
  await api('POST', `/api/conversations/${conv}/messages`, b.token, { content: 'ding' });
  const p = await seat(a); await p.getByRole('button', { name: 'Notifications' }).first().click();
  await click(p, 'Mark all read'); await wait(p);
  must((await api('GET', '/api/notifications', a.token)).data.unreadCount === 0, 'still unread');
  await click(p, 'Clear read'); await wait(p);
  must((await api('GET', '/api/notifications', a.token)).data.notifications.length === 0, 'not cleared');
});
await journey('UI-423', 'status: set and clear; profile photo upload', async () => {
  const a = await acct('a'); const p = await seat(a);
  const me = async () => (await api('GET', '/api/auth/me', a.token)).data.user;
  await p.getByText('Set status').first().click(); await p.getByPlaceholder("What's your status?").fill('Heads down'); await click(p, 'Save'); await wait(p);
  must((await me()).customStatus === 'Heads down', 'status not saved');
  await p.getByText('Heads down').first().click(); await click(p, 'Clear status'); await wait(p);
  must(!(await me()).customStatus, 'status not cleared');
  await p.getByText('Set status').first().click(); await p.getByTitle('Edit profile').first().click();
  await p.locator('input[type=file][accept^="image"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG }); await wait(p, 1500);
  must((await me()).avatar?.includes('/uploads/avatars/'), 'photo not saved');
});
await journey('UI-424', 'invitations: accept and decline from the meetings page', async () => {
  const h = await acct('h'), g = await acct('g');
  const m = (await api('POST', '/api/meetings', h.token, { title: 'Invited', scheduledAt: day(1), invitees: [{ userId: g.id }] })).data.meeting;
  const p = await seat(g); await go(p, '/history');
  const state = async () => (await api('GET', `/api/meetings/${m.roomId}`, h.token)).data.meeting.invitees[0].status;
  await click(p, 'Accept'); await wait(p); must(await state() === 'accepted', 'accept not saved');
  await go(p, '/history'); await click(p, 'Decline'); await wait(p); must(await state() === 'declined', 'decline not saved');
});
await journey('UI-425', 'calendar: month navigation; search result opens the item', async () => {
  const a = await acct('a'); await api('POST', '/api/meetings', a.token, { title: 'Findable kickoff', scheduledAt: day(0.05) });
  await api('POST', '/api/teams', a.token, { name: 'Findable team' });
  const p = await seat(a); await go(p, '/calendar'); await p.getByText('Findable kickoff').first().waitFor();
  await click(p, 'Next month'); await click(p, 'Previous month'); await click(p, 'Today');
  await go(p, '/search'); await p.getByPlaceholder('Search', { exact: true }).fill('Findable'); await p.keyboard.press('Enter'); await wait(p, 1200);
  await p.getByText('Findable team').first().click(); await p.waitForURL(/\/teams\//);
});
await journey('UI-426', 'limits off: no billing or pricing anywhere; join the web app by code', async () => {
  const a = await acct('a'), h = await acct('h'); const p = await seat(a);
  must(!(await p.getByRole('link', { name: 'Billing' }).count()), 'Billing is still in the menu');
  await go(p, '/billing'); must(!p.url().includes('billing'), 'billing page still opens');
  const anon = await seat(); await go(anon, '/'); must(!(await anon.getByRole('link', { name: 'Pricing' }).count()), 'Pricing still linked');
  await go(anon, '/pricing'); must(!anon.url().includes('pricing'), 'pricing page still opens');
  const m = (await api('POST', '/api/meetings', h.token, { title: 'By code' })).data.meeting;
  await go(p, '/app'); await p.getByLabel('Meeting code or link').fill(m.roomId); await click(p, 'Join'); await p.waitForURL(new RegExp(m.roomId));
});

// ---------- in a meeting ----------
const call = async (settings) => {
  const h = await acct('host'), g = await acct('guest');
  const m = (await api('POST', '/api/meetings', h.token, { title: 'Controls', ...(settings && { settings }) })).data.meeting;
  const enter = async (who) => { const p = await seat(who); await go(p, `/join/${m.roomId}`); await p.getByRole('button', { name: /join now|ask to join/i }).click(); await p.waitForURL(/\/meeting\//); await wait(p, 2200); return p; };
  const hp = await enter(h), gp = await enter(g);
  return { h, g, m, hp, gp };
};
await journey('UI-431', 'call: breakout rooms - create, guest moves, close all brings them back', async () => {
  const { h, m, hp, gp } = await call();
  await click(hp, 'Meeting tools'); await hp.getByText(/^Breakout rooms/i).first().click(); await wait(hp, 500);
  await hp.getByRole('button', { name: /open (rooms|breakout)|start|create/i }).last().click(); await wait(hp, 1500);
  const rooms = (await api('GET', `/api/breakout/meeting/${m.id}`, h.token)).data.breakoutRooms;
  must(rooms.length >= 1, 'no rooms created');
  const joinBtn = gp.getByRole('button', { name: /^join/i }).first(); await joinBtn.click(); await gp.waitForURL(/--br-/);
  await hp.getByRole('button', { name: /close (all )?rooms|close all|end breakout/i }).first().click(); await gp.waitForURL((u) => !u.href.includes('--br-'), { timeout: 10000 });
});
await journey('UI-432', 'call: host mutes and removes someone from the participant list', async () => {
  const { hp, gp } = await call();
  await gp.getByRole('button', { name: /^Unmute/ }).first().click(); await wait(gp);
  await click(hp, 'Participants'); await wait(hp, 600);
  const menu = () => hp.getByRole('button', { name: /^Actions for/ }).first().click();
  await menu(); await hp.getByRole('button', { name: /mute/i }).filter({ hasText: /mute/i }).first().click();
  await gp.getByRole('button', { name: /^Unmute/ }).first().waitFor(); await wait(hp, 500);
  await menu(); await hp.getByRole('button', { name: /remove/i }).filter({ hasText: /remove/i }).first().click();
  await gp.waitForURL(/\/app/);
});
await journey('UI-433', 'call: attach a file in meeting chat; the other person receives it', async () => {
  const { hp, gp } = await call();
  await click(hp, 'Chat'); await click(gp, 'Chat');
  await hp.locator('input[type=file]').last().setInputFiles({ name: 'call.txt', mimeType: 'text/plain', buffer: Buffer.from('c') });
  await hp.locator('form button[type=submit]').last().click(); await gp.getByText('call.txt').first().waitFor();
});
await journey('UI-434', 'call: copy link, guest leaves and rejoins, host ends for everyone', async () => {
  const { h, m, hp, gp } = await call();
  await hp.getByTitle('Copy meeting link').first().click(); await wait(hp, 400); must((await hp.evaluate(() => navigator.clipboard.readText())).includes(m.roomId), 'link not copied');
  await gp.getByTitle('Leave meeting').click(); await wait(gp, 500);
  await gp.locator('.modal-content').getByRole('button', { name: 'Leave meeting' }).click(); await gp.waitForURL(/\/app/);
  await go(gp, `/join/${m.roomId}`); await gp.getByRole('button', { name: /join now|ask to join/i }).click(); await gp.waitForURL(/\/meeting\//); await wait(gp, 2000);
  await hp.getByTitle('Leave meeting').click(); await hp.getByRole('button', { name: /end (meeting )?for (all|everyone)/i }).first().click(); await gp.waitForURL(/\/app/, { timeout: 10000 });
});

// ---------- admin ----------
await journey('UI-441', 'admin: suspend and reactivate, edit a profile, create a role, view history', async () => {
  const u = await acct('target'); const p = await seat();
  await go(p, '/admin'); await p.locator('#admin-email, [name=admin-email]').first().fill('qa-admin@example.test'); await p.locator('#admin-password, [name=admin-password]').first().fill('QaAdmin!2026'); await click(p, 'Sign in'); await wait(p, 1500);
  await p.getByRole('button', { name: /^users/i }).first().click(); await p.getByPlaceholder('Search users').fill(u.email); await wait(p, 1200);
  const login = () => api('POST', '/api/auth/login', null, { email: u.email, password: PASSWORD });
  await click(p, 'Suspend'); await wait(p, 1200); must(!(await login()).success, 'still able to sign in');
  await p.getByRole('button', { name: /reactivate|activate/i }).first().click(); await wait(p, 1200); must((await login()).success, 'not reactivated');
  await click(p, 'Edit profile'); await p.getByPlaceholder('e.g. Product Designer').fill('Set by admin'); await p.getByRole('button', { name: /save/i }).last().click(); await wait(p, 1200);
  must((await login()).data.user.title === 'Set by admin', 'profile not saved');
  await click(p, 'History'); await wait(p, 800); await p.getByRole('button', { name: 'Close' }).last().click();
  await p.getByRole('button', { name: /roles/i }).first().click(); await p.getByRole('button', { name: /new role|add role|create role/i }).first().click();
  const name = `Role ${rnd()}`; await p.getByPlaceholder('Role name').fill(name); await click(p, 'Save'); await p.getByText(name).first().waitFor();
});

// ---------- host restrictions, huddle, admin accounts, phone width ----------
const toggle = (p, label) => p.getByRole('switch', { name: label }).click();
const openSettings = async (p) => { await click(p, 'More'); await p.getByRole('button', { name: /^Meeting settings/ }).first().click(); await wait(p, 500); };
await journey('UI-451', 'call: host switches off guest chat and screen share; the guest is held to it', async () => {
  const { h, m, hp, gp } = await call();
  await openSettings(hp); await toggle(hp, 'Host management'); await wait(hp, 600); await toggle(hp, 'Share their screen'); await toggle(hp, 'Let participants send messages'); await wait(hp, 1200);
  const s = (await api('GET', `/api/meetings/${m.roomId}`, h.token)).data.meeting.settings;
  must(s.allowChat === false && s.allowScreenShare === false, `saved settings: chat=${s.allowChat} share=${s.allowScreenShare}`);
  await click(gp, 'Share screen'); await gp.getByText(/turned off screen/i).first().waitFor();
  await click(gp, 'Chat'); await wait(gp, 500);
  const box = gp.locator('input[placeholder*="essage" i], textarea[placeholder*="essage" i]').first();
  if (await box.count() && await box.isEditable()) { await box.fill('should-not-arrive'); await box.press('Enter'); await wait(gp, 800); gp.errors.length = 0; }
  const sent = (await api('GET', `/api/chat/${m.roomId}/messages`, h.token)).data.messages;
  must(!sent.some((x) => x.content === 'should-not-arrive'), 'guest message was accepted');
});
await journey('UI-452', 'call: webinar mode makes the guest view-only', async () => {
  const { hp, gp } = await call();
  await openSettings(hp); await toggle(hp, 'Webinar mode'); await wait(hp, 1500);
  await gp.getByRole('button', { name: /^Unmute/ }).first().click(); await gp.getByText(/webinar|view.only|only hosts/i).first().waitFor();
});
await journey('UI-453', 'chat: start a huddle; mute and unmute the conversation', async () => {
  const { p, a, b, conv, msgs } = await chat();
  await p.getByTitle('Mute', { exact: true }).first().click(); await wait(p);
  must((await api('GET', `/api/conversations/${conv}`, a.token)).data.conversation.isMuted, 'not muted');
  await p.getByTitle('Unmute', { exact: true }).first().click(); await wait(p);
  await p.getByTitle('Start huddle').first().click(); await wait(p, 2500);
  must((await msgs()).some((m) => m.type === 'meeting_link'), 'no meeting link posted');
});
await journey('UI-454', 'admin: add and delete an administrator, change a setting page', async () => {
  const p = await seat(); await go(p, '/admin');
  await p.locator('#admin-email, [name=admin-email]').first().fill('qa-admin@example.test'); await p.locator('#admin-password, [name=admin-password]').first().fill('QaAdmin!2026'); await click(p, 'Sign in'); await wait(p, 1500);
  await p.getByRole('button', { name: /^admins/i }).first().click(); await p.getByRole('button', { name: /add admin/i }).first().click();
  const email = `adm.${rnd()}@example.test`;
  await p.getByPlaceholder('Full name').fill('Temp Admin'); await p.getByPlaceholder('Email', { exact: true }).fill(email); await p.locator('input[placeholder^="Password"]').fill('LongEnough-1x'); await click(p, 'Create'); await wait(p, 1200);
  must((await api('POST', '/api/admin/auth/login', null, { email, password: 'LongEnough-1x' })).success, 'new admin cannot sign in');
  await p.locator('tr, li, div').filter({ hasText: email }).last().locator('xpath=ancestor-or-self::*[.//button[contains(., "Delete")]][1]').getByRole('button', { name: /delete/i }).first().click(); await wait(p, 1200);
  must(!(await api('POST', '/api/admin/auth/login', null, { email, password: 'LongEnough-1x' })).success, 'deleted admin can still sign in');
  await p.getByRole('button', { name: /^settings/i }).first().click(); await wait(p, 800);
});
await journey('UI-455', 'phone width: main pages usable, call joins, chat opens', async () => {
  const a = await acct('phone'); const h = await acct('h');
  const m = (await api('POST', '/api/meetings', h.token, { title: 'Small screen' })).data.meeting;
  const c = await browser.newContext({ viewport: { width: 375, height: 740 }, permissions: ['camera', 'microphone'], hasTouch: true, isMobile: true }); open.push(c);
  const p = await c.newPage(); p.setDefaultTimeout(7000); p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(`${BASE}/login`); await p.locator('#email').fill(a.email); await p.locator('#password').fill(PASSWORD); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(/\/app/);
  const wide = [];
  for (const r of ['/app', '/chat', '/teams', '/calendar', '/files', '/tasks', '/history', '/search']) { await go(p, r); if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) wide.push(r); }
  must(!wide.length, `sideways scrolling on ${wide}`);
  await go(p, `/join/${m.roomId}`); await p.getByRole('button', { name: /join now|ask to join/i }).click(); await p.waitForURL(/\/meeting\//); await wait(p, 2500);
  await click(p, 'Chat'); await p.locator('input[placeholder*="essage" i], textarea[placeholder*="essage" i]').first().waitFor();
});

await journey('UI-456', 'a page whose code cannot be fetched (new release) reloads once and recovers', async () => {
  const a = await acct('chunk'); const p = await seat(a);
  let failed = 0;
  await p.route(/\/assets\/Tasks-[^/]*\.js$/, (route) => (failed++ ? route.continue() : route.abort()));
  await p.getByRole('link', { name: 'Tasks' }).first().click(); await p.getByPlaceholder('Task title').or(p.getByText('My tasks')).first().waitFor();
  must(failed >= 2, `chunk requested ${failed} time(s)`); p.errors.length = 0;
});

fs.writeFileSync(`${OUT}/ui-features.json`, JSON.stringify(results, null, 1));
await browser.close();
