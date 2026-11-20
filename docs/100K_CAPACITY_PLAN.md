# 100K concurrent participants - capacity plan

**Nothing here is measured.** MEASURED: none. ESTIMATE: arithmetic from the calculator below. ASSUMPTION: inputs marked so.
Per RULE 10, 100,000 concurrent participants is **not claimed as supported**; it is a target to be validated by the ladder in `docs/LOAD_TESTING.md`.

## How the numbers are produced
`node tests/load/capacity-calc.mjs [--consumers-per-core N --nic-gbps 10 --nic-util 0.6 --cores-per-node 8]`
Inputs from the repo (REPO): Opus ≤64 kbps; camera simulcast 200 / 700 / 2500 kbps (3 layers, `mediasoupClient.js`); screen share ≤4 Mbps;
subscription budgets per mode (`subscriptionPolicy.js`: small 12v/12a, medium 16v/50a, large 9v/25a, webinar 6v/6a).
ASSUMPTIONS: viewers get thumbnails (200 kbps layer) for 80% of video subscriptions and the 2.5 Mbps layer for 20% (speaker/pinned);
audio at 20% speaking duty; **a screen share is active in every screen-share/mixed/webinar meeting (upper bound)**; NIC 10 Gbps at 60% usable.
**CPU capacity (consumers per core) is deliberately NOT defaulted** - it is the single most important number to measure; the `nodes by CPU` column stays empty until you pass `--consumers-per-core`.

## Results at 100,000 users (ESTIMATE, bandwidth only)
| Scenario | Meetings | Audio prod | Video prod | Consumers | Egress Gbps | Ingress Gbps | Nodes by NIC alone |
|---|---|---|---|---|---|---|---|
| audio-only (8/meeting) | 12,500 | 100,000 | 0 | 700,000 | 8.96 | 6.4 | 2 |
| camera meetings (8/meeting) | 12,500 | 100,000 | 100,000 | 1,400,000 | 470.96 | 346.4 | 79 |
| screen sharing (12/meeting) | 8,334 | 100,000 | 50,000 | 1,700,000 | 744.08 | 208.4 | 125 |
| mixed interactive (25) | 4,000 | 30,000 | 60,000 | 2,200,000 | 1332.96 | 221.92 | 223 |
| webinar (1000 / 3 presenters) | 100 | 300 | 300 | 500,000 | 534.56 | 1.44 | 90 |

### What this says (conclusions that follow from the arithmetic, not from a benchmark)
- **Audio-only at 100K is plausible** on a handful of NIC-bound nodes; the binding limit is then CPU/consumers (700K audio consumers) - measure it.
- **Camera meetings at 100K need hundreds of Gbps of egress** even with thumbnails and subscription budgets (~79 × 10 Gbps nodes by NIC alone, more by CPU). Egress is dominated by the 20% of streams at the high layer. Cutting the high-layer share, capping resolution for non-speakers, or limiting concurrent video publishers moves this directly. A single-region 100K all-camera target is a very large deployment; treat "100K participants" as meaning *mostly audio / mostly thumbnails* until measured.
- **Screen share duty cycle is the biggest bandwidth lever** (4 Mbps × every viewer). Real duty cycle is far below 100%; measure it.
- **Webinar** egress is dominated by presenter video + screen to every attendee; a CDN/HLS path (NOT implemented) is the standard way to serve >1000 viewers cheaply. The current design (SFU fan-out) is feasible for hundreds-to-low-thousands per room, not 100K in one room.
- A meeting is bound to **one node and one worker (one core)** (no `pipeToRouter` yet): a single 1,000-viewer room is capped by one core regardless of fleet size.

## Non-media load (ESTIMATE formulas; fill with measurements)
| Quantity | Formula | At 100K (assumptions in brackets) |
|---|---|---|
| Socket.IO connections | = concurrent users | 100,000 sockets (assume ≤ ~10-20K per Node process after measuring → ≥5–10 processes) |
| Meeting join rate | users / avg session length | 100,000 / 3,600 s ≈ 28 joins/s average (assume 1 h sessions); peak at top-of-hour can be 10-50× |
| API request rate | users × req/user/s | assume 0.2 req/s/user ≈ 20,000 req/s (the 100/min per-IP default limiter would throttle NAT'd offices: tune) |
| Redis | presence heartbeat 20 s + adapter fan-out | ≥ 5,000 presence writes/s + pub/sub; measure ops/s and adapter latency |
| MariaDB | auth read per request (primary) + writes | auth lookups dominate; cache or JWT-claims needed before ~5-10K req/s (audit D-2, not yet done) |
| TURN | fraction relayed × media bitrate | assume 10-15% relayed → proportionally 10-15% of media bandwidth through coturn |
| Storage | recordings × bitrate × duration | e.g. 1% recording at 1.5 Mbps ≈ 0.7 GB/h per recorded meeting hour |

## Required validation (in order)
1. Measure consumers/core and Mbps/core on your hardware (`tests/load/webrtc`, single node, ramp until CPU 70% or loss > 2%).
2. Fill `--consumers-per-core`; set `SFU_MAX_CONSUMERS/…` from it.
3. Socket connections per process; Redis ops/s; auth lookup cost; DB pool waiting.
4. Walk the ladder 100 → 100K (`tests/load/scenarios/ladder.json`), one report per step in `tests/load/reports/`.
