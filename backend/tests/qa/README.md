# Black-box QA suite

Tests describe the **correct** behaviour, so a failing test is an open defect (see `qa-reports/17-bug-register.md`).
Not run by `npm test`. These tests create data and `crash.qa.js` deliberately probes for process crashes:
**only run them against a disposable database on your own machine.** Non-localhost URLs are refused.

```bash
# 1. a throw-away database + .env (copy the backend folder so your real .env and uploads/ stay untouched)
# 2. server under test:           NODE_ENV=production PORT=15000 RATE_LIMIT_MAX=100000 node src/index.js
# 3. second server for billing:   UNLOCK_ALL_FEATURES=false PORT=15002 METRICS_PORT=19465 ... node src/index.js
cd backend
export QA_BASE_URL=http://127.0.0.1:15000
export QA_BILLING_URL=http://127.0.0.1:15002
export QA_APP_DIR=/path/to/the/disposable/backend/copy   # enables filesystem and crash tests
node --test --test-concurrency=1 --test-force-exit tests/qa/*.qa.js
```

Admin credentials default to `qa-admin@example.test` / `QaAdmin!2026` (override with `QA_ADMIN_EMAIL`, `QA_ADMIN_PASSWORD`);
seed them with `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` before `npm run migrate`.

## Round 2 additions (see `qa-reports/round2/`)
- `coverage.qa.js` endpoints and events the first suite never reached
- `security2.qa.js` authorisation matrix, isolation, admin and entitlement cases (`QA_MATRIX_OUT=file.json` saves the matrix)
- `fuzz.qa.js` every socket event with an empty and a `null` payload (starts its own server; needs `QA_APP_DIR`)
- `changes.qa.js`, `recurrence-web.qa.js` regression cases for repeating meetings
- browser scripts in `tests/e2e/`: `node flows.mjs <outdir>`, `node call.mjs <outdir>`, `node crawl.mjs <out.json>` (server on 127.0.0.1:15000)

- `restfuzz.qa.js` wrong-typed bodies and query strings on the REST routes; reads must still work afterwards
- `account.qa.js` data export, account deletion, refused upload types
- `websession.qa.js` the web session cookie, its forgery protection and socket tickets
- `lockout.qa.js` strangers guessing a password cannot lock the owner out
