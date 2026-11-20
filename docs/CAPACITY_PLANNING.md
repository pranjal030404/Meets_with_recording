# Capacity Planning (current system, pre-scaling)

**No benchmarks have been run.** Every number below is labelled ESTIMATE or ASSUMPTION and must be replaced by measurements from `tests/load/` (not yet created). Do not use this to claim support for any user count.

## What limits the current single instance (reasoned from code)
| Resource | Limiting factor | Evidence |
|---|---|---|
| Meeting size | Consumers per meeting = N×(N−1)×streams, all on **one mediasoup worker (one core)** | `consume` has no subscription limit; one Router per room |
| Sockets per process | Node event loop + `User.findByPk` per handshake + DB write per connect/disconnect | `io.use`, `connection` handler |
| DB | Pool 50 connections; auth read per request; presence writes | `database/index.js` |
| Disk/NIC | Uploads + recordings served by Node | `routes/file.js`, `express.static` |
| Transcription | Local Whisper in API host | `transcriptionService.js` |

## Planning model (ASSUMPTIONS to validate)
Parameters you must measure on your hardware, then fill in:
- `C_audio` = CPU cost per audio consumer; `C_video(layer)` = CPU per video consumer per simulcast layer.
- `B_video(layer)`: simulcast bitrate. Config in repo: ~2.7 Mbps for three layers per camera is stated in a code comment (`maxIncomingBitrate`), per-layer values are *not* in the repo.
- Egress per SFU = Σ consumers × layer bitrate. Ingress = Σ producers × (sum of simulcast layers).

Formulas (for use after measuring):
```
consumers_meeting(N, k) = N × (A + V_k)      # A audio streams subscribed, V_k video streams (k = limit)
SFU_nodes   = ceil( total_consumers / consumers_per_node_measured / headroom )
egress_Gbps = total_video_consumers × avg_layer_Mbps / 1000
```
Worked example (illustrative only, ESTIMATE): 100 participants in all-video mesh, every consumer at 0.5 Mbps → 9,900 × 0.5 = ~4.9 Gbps egress for one meeting — far beyond one worker/NIC. With last-N=9 video subscriptions: 100 × 9 × 0.5 = 450 Mbps. This is why selective subscription (roadmap Phase 3) is the first media change, not more nodes.

## Required measurements before any sizing claim
1. Socket.IO handshake rate and steady-state memory per 1,000 connections (single node, Redis adapter on/off).
2. REST p50/p95/p99 for login, meeting join, message list at fixed RPS.
3. mediasoup: consumers per worker at target CPU (e.g. 60%), per layer; transports per worker; port usage (range 40000–49999 = 10,000 ports shared by all workers).
4. DB: queries/sec of auth read; message insert rate; pool saturation point.
5. Redis: ops/sec with adapter + presence at 10K/50K connections.
