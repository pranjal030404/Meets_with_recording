# Load testing

**Status: scripts written, NONE executed** (no k6/Artillery/Playwright installed, no test environment). Reports are produced by running them.

| Layer | Tool | File | Measures |
|---|---|---|---|
| REST | k6 | `tests/load/api/k6-api.js` | login/list/notifications/ice p50/p95/p99, error rate, thresholds as pass/fail |
| Realtime signaling | Artillery (socketio engine) | `tests/load/socket/artillery.yml` + `processor.cjs` | connect success, latency, presence/typing through Redis adapter. *Not media.* Verify the auth-injection line against your Artillery version. |
| Real media | Playwright + headless Chrome fake devices | `tests/load/webrtc/chrome-fake-media.mjs` | join time, connected PCs, loss, jitter, RTT, inbound kbps (real WebRTC through mediasoup) |
| Server-side | Prometheus + Grafana | `infrastructure/` | CPU/mem/bandwidth, event loop, DB pool, Redis, SFU load, consumer score |
| Sizing | calculator | `tests/load/capacity-calc.mjs` | see 100K_CAPACITY_PLAN.md |

## Ladder
100 → 500 → 1,000 → 5,000 → 10,000 → 25,000 → 50,000 → 100,000 (`tests/load/scenarios/ladder.json`, with gates). Run each of the five scenarios
(audio-only, camera, screen-share, webinar, mixed) at each step that the hardware allows; stop at the first failed gate and fix before continuing.
- Opening N WebSockets is **not** a WebRTC test; report socket and media results separately.
- Steps ≥ 5,000 need distributed generators (one machine cannot hold 100K sockets or hundreds of Chrome tabs).
- **Never run against production.** Use a dedicated environment you own; 100K needs explicit authorization and a controlled setup.
- Prepare test accounts in the test environment only; raise `RATE_LIMIT_MAX` there or spread generator IPs (login is limited per IP).

## Report per step (copy to `tests/load/reports/<date>-<step>-<scenario>.md`)
Environment (hosts, cores, NIC, versions) · scenario · users/meetings · API p50/p95/p99 · error rate · join time p50/p95 · socket connect success · WebRTC connect success · packet loss p95 · jitter p95 · consumer score p50 · node CPU/mem/bandwidth peak · DB pool waiting / slow queries · Redis latency/ops · recovery time after failure drill · gate pass/fail · conclusions.
