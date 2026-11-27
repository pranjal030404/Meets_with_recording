/**
 * Dependency-free API load probe (k6 is not required). LOCAL servers only.
 *   QA_BASE_URL=http://127.0.0.1:15000 node tests/load/api/qa-load.mjs [secondsPerStep=8] [out.json]
 * Start the server with a very high RATE_LIMIT_MAX, otherwise you measure the limiter.
 */
import fs from 'node:fs';

const BASE = process.env.QA_BASE_URL || '';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw new Error('QA_BASE_URL must be a local server');
const SECONDS = Number(process.argv[2]) || 8;
const PASSWORD = 'Qa-Passw0rd!';
const email = `load.${Date.now()}@example.test`;
const signup = await (await fetch(`${BASE}/api/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Load', email, password: PASSWORD }) })).json();
const auth = { Authorization: `Bearer ${signup.data.token}`, 'Content-Type': 'application/json' };

const scenarios = {
  health: () => fetch(`${BASE}/api/health`),
  me: () => fetch(`${BASE}/api/auth/me`, { headers: auth }),
  meetings: () => fetch(`${BASE}/api/meetings?limit=20`, { headers: auth }),
  teams: () => fetch(`${BASE}/api/teams`, { headers: auth }),
  search: () => fetch(`${BASE}/api/search?q=meeting`, { headers: auth }),
  login: () => fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) }),
};
const only = process.env.QA_SCENARIOS?.split(',');
const pct = (a, p) => a.length ? Math.round(a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] * 10) / 10 : null;

const out = [];
for (const [name, call] of Object.entries(scenarios)) {
  if (only && !only.includes(name)) continue;
  for (const concurrency of [1, 10, 50]) {
    const times = []; let errors = 0; const statuses = {};
    const end = performance.now() + SECONDS * 1000;
    const started = performance.now();
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (performance.now() < end) {
        const t = performance.now();
        try {
          const r = await call(); await r.arrayBuffer();
          statuses[r.status] = (statuses[r.status] || 0) + 1;
          if (r.status >= 400) errors++;
        } catch { errors++; }
        times.push(performance.now() - t);
      }
    }));
    const elapsed = (performance.now() - started) / 1000;
    times.sort((a, b) => a - b);
    const row = {
      scenario: name, concurrency, requests: times.length, rps: Math.round(times.length / elapsed),
      avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length * 10) / 10,
      median: pct(times, 50), p90: pct(times, 90), p95: pct(times, 95), p99: pct(times, 99),
      errorRate: `${(100 * errors / times.length).toFixed(2)}%`, statuses,
    };
    out.push(row);
    console.log(`${name.padEnd(9)} c=${String(concurrency).padEnd(3)} rps=${String(row.rps).padEnd(5)} avg=${row.avg} p50=${row.median} p90=${row.p90} p95=${row.p95} p99=${row.p99} err=${row.errorRate}`);
  }
}
if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({ at: new Date().toISOString(), seconds: SECONDS, rows: out }, null, 1));
