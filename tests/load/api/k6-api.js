// k6 REST load test. Run ONLY against a dedicated test environment you own.
//   k6 run -e BASE_URL=https://test.example.com -e USERS_FILE=./users.json -e VUS=500 -e DURATION=5m tests/load/api/k6-api.js
// users.json: [{"email":"...","password":"..."}, ...]  (create the accounts in the TEST env; the app rate-limits login per IP,
// so raise RATE_LIMIT_MAX on the test env or spread load generators across IPs).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend } from 'k6/metrics';

const users = new SharedArray('users', () => JSON.parse(open(__ENV.USERS_FILE || './users.json')));
const BASE = __ENV.BASE_URL || 'http://localhost:5000';
const loginTime = new Trend('login_duration', true);
const listTime = new Trend('meetings_list_duration', true);

export const options = {
  scenarios: { api: { executor: 'ramping-vus', stages: [
    { duration: __ENV.RAMP || '2m', target: parseInt(__ENV.VUS) || 100 },
    { duration: __ENV.DURATION || '5m', target: parseInt(__ENV.VUS) || 100 },
    { duration: '1m', target: 0 } ] } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1000', 'p(99)<2500'] }, // pass/fail gates: adjust to your SLO
};

export default function () {
  const u = users[(__VU - 1) % users.length];
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: u.email, password: u.password }), { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } });
  loginTime.add(login.timings.duration);
  if (!check(login, { 'login 200': (r) => r.status === 200 })) { sleep(1); return; }
  const token = login.json('data.token') || login.json('token');
  const h = { headers: { Authorization: `Bearer ${token}` } };
  for (let i = 0; i < 10; i++) {
    const m = http.get(`${BASE}/api/meetings?limit=20`, { ...h, tags: { name: 'meetings_list' } }); listTime.add(m.timings.duration);
    http.get(`${BASE}/api/notifications?cursor=start&limit=20`, { ...h, tags: { name: 'notifications' } });
    http.get(`${BASE}/api/webrtc/ice-servers`, { ...h, tags: { name: 'ice' } });
    sleep(1 + Math.random());
  }
}
