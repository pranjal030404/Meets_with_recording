/**
 * Shared helpers for the black-box QA suite (backend/tests/qa).
 *
 * These tests CREATE and DELETE data, so they only run against a disposable server on this machine:
 *   QA_BASE_URL=http://127.0.0.1:15000 node --test --test-concurrency=1 tests/qa/*.qa.js
 * Not part of `npm test` (which globs tests/*.test.js). See README.md in this folder.
 */
import { io as connect } from 'socket.io-client';
import crypto from 'node:crypto';

export const BASE = process.env.QA_BASE_URL || '';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  throw new Error('Set QA_BASE_URL to a disposable LOCAL server, e.g. http://127.0.0.1:15000 (remote hosts are refused)');
}
export const ADMIN = {
  email: process.env.QA_ADMIN_EMAIL || 'qa-admin@example.test',
  password: process.env.QA_ADMIN_PASSWORD || 'QaAdmin!2026',
};
export const PASSWORD = 'Qa-Passw0rd!';
export const uid = () => crypto.randomBytes(6).toString('hex');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(method, path, { token, body, form, headers = {}, base = BASE, redirect = 'manual' } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = typeof body === 'string' ? body : JSON.stringify(body); }
  const res = await fetch(base + path, { method, headers: h, body: payload, redirect });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json, text, headers: res.headers };
}

export async function newUser(label = 'user', opts = {}) {
  const email = `qa.${label}.${uid()}@example.test`;
  const name = `QA ${label} ${uid().slice(0, 4)}`;
  const r = await api('POST', '/api/auth/signup', { body: { name, email, password: PASSWORD }, ...opts });
  if (r.status !== 201) throw new Error(`signup failed ${r.status} ${r.text}`);
  return { id: r.body.data.user.id, token: r.body.data.token, email, name };
}

export async function newMeeting(host, extra = {}) {
  const r = await api('POST', '/api/meetings', { token: host.token, body: { title: `QA meeting ${uid()}`, ...extra } });
  if (r.status !== 201) throw new Error(`create meeting failed ${r.status} ${r.text}`);
  return r.body.data.meeting;
}
export const getMeeting = async (user, roomId) => (await api('GET', `/api/meetings/${roomId}`, { token: user.token })).body?.data?.meeting;
export const join = (user, roomId) => api('POST', `/api/meetings/${roomId}/join`, { token: user.token });

export async function newTeam(owner, extra = {}) {
  const r = await api('POST', '/api/teams', { token: owner.token, body: { name: `QA team ${uid()}`, ...extra } });
  if (r.status !== 201) throw new Error(`create team failed ${r.status} ${r.text}`);
  return r.body;
}
export const getTeam = async (user, id) => (await api('GET', `/api/teams/${id}`, { token: user.token })).body;
export async function addMember(owner, team, user, role = 'member') {
  const r = await api('POST', `/api/teams/${team.id}/invite`, { token: owner.token, body: { email: user.email, role } });
  if (r.status !== 200) throw new Error(`invite failed ${r.status} ${r.text}`);
}

export async function newDm(a, b) {
  const r = await api('POST', '/api/conversations', { token: a.token, body: { type: 'direct', userId: b.id } });
  return r.body.data.conversation.id;
}
export async function sendDm(user, conversationId, content, extra = {}) {
  const r = await api('POST', `/api/conversations/${conversationId}/messages`, { token: user.token, body: { content, ...extra } });
  return r.body?.data?.message;
}

export async function adminToken() {
  const r = await api('POST', '/api/admin/auth/login', { body: ADMIN });
  if (r.status !== 200) throw new Error(`admin login failed ${r.status} ${r.text}`);
  return r.body.data.token;
}

export function fileForm(field, name, content, type = 'application/octet-stream', fields = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  f.append(field, new Blob([content], { type }), name);
  return f;
}

// ---------- sockets ----------
const open = new Set();
export function socket(user, base = BASE) {
  return new Promise((resolve, reject) => {
    const s = connect(base, { auth: { token: user.token }, transports: ['websocket'], reconnection: false });
    s.log = [];
    s.onAny((event, data) => s.log.push({ event, data }));
    s.once('connect', () => { open.add(s); resolve(s); });
    s.once('connect_error', (e) => { s.close(); reject(e); });
  });
}
export const closeSockets = () => { for (const s of open) s.close(); open.clear(); };
export const got = (s, event) => s.log.filter((e) => e.event === event);
export async function waitFor(s, event, ms = 2500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = got(s, event)[0];
    if (hit) return hit.data ?? true;
    await sleep(25);
  }
  return null;
}
export async function enter(user, roomId) {
  const s = await socket(user);
  s.emit('room:join', { roomId });
  await Promise.race([waitFor(s, 'room:participants'), waitFor(s, 'room:waiting-for-host'), waitFor(s, 'error')]);
  return s;
}
