# Security review (scoped to the scaling work; not a full pentest)

## Fixed in this work
- Socket media handlers now verify ownership: `connectTransport`, `produce` (must own the transport), `resumeConsumer`/`closeConsumer`/`setConsumerLayers` (must own the consumer), `pauseProducer`/`resumeProducer`/`closeProducer` (must own the producer). Previously any authenticated socket could act on another socket's ids.
- `getRouterRtpCapabilities` / `createWebRtcTransport` require an existing, non-ended meeting (no arbitrary router creation) and the correct owner node.
- Subscription budgets enforced server-side.
- Per-socket event rate limiter (token bucket, kicks abusive sockets); socket payload cap 100 MB → 1 MB.
- Rate limiter shared via Redis (was per-process, bypassable by hitting different instances).
- TURN: short-lived per-user credentials; static shared credential no longer sent when `TURN_SECRET` set.
- Auth lookups on primary (suspension takes effect immediately even with replicas).
- Metrics on an internal listener only; signed storage URLs are HMAC + expiry + path-confined (unit tested).

## `/uploads` lockdown (done)
`express.static('/uploads')` replaced by `routes/uploads.js`: every request needs a valid session (HttpOnly `mc_assets` cookie, scoped `Path=/uploads`, set automatically by `protect`; or an `Authorization: Bearer` header; **query-string tokens rejected**) and per-path authorization (`services/uploadAccess.js`):
- `recordings/<room>/*`, `transcripts/<room>/*`: meeting host/co-host or participant.
- `files/<owner>/*`: owner, or via its FileEntry: team member, conversation member, meeting host/participant; soft-deleted files owner-only.
- `tmp/`, `runtime/`, dotfiles, traversal, unknown folders: never served. `Cache-Control: private`, `nosniff`, restrictive CSP, Range supported (video seeking).
No URL format changed, so existing stored links and the frontend keep working. Tests: `tests/uploads.test.js` (real Express server, 6 tests incl. traversal and Range); live boot returns 401 without credentials.
Known gaps: invitees who never joined cannot open recordings (only participants/hosts); admin-console users have no special access; the cookie is only issued after the browser makes one authenticated API call (any page does), so a deep link to a file in a brand-new tab before that call returns 401.

## Open risks (ordered)
1. ~~`/uploads` public~~ **FIXED** (see below). Remaining caveat: files are still on local disk and the 7-day session token doubles as the `mc_assets` cookie value, so a stolen cookie reads files until the JWT expires (HttpOnly + Path=/uploads + Secure limit exposure; no revocation list).
2. ~~JWT not revocable~~ **FIXED for logout** (Redis denylist, all nodes); sign-out-everywhere primitive exists; still 7-day tokens without refresh, revocation fails open if Redis is down unless `SESSION_REVOCATION_FAIL_CLOSED=true`.
3. ~~settings merge of arbitrary keys~~ **FIXED**: whitelist + type checks on create, REST update and socket update.
4. Chat/whiteboard/caption events are only throttled generically (no per-room or content limits); `maxHttpBufferSize` now 1 MB.
5. Waiting-room/admission state is process-local: after node failure admitted guests are restored from Redis, queued guests must re-knock.
6. Participant caps / per-user quotas for meetings are not enforced beyond plan limits already in the app.
7. Input validation is ad hoc per route (no schema layer).
8. CORS for per-node origins relies on `CLIENT_URL` being the single app origin; verify in each environment.
9. TLS, secrets, firewall are deployment responsibilities (documented, not enforced by code).
