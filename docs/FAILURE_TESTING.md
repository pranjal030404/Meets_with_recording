# Failure testing

Rule: "actual" is filled only from something that was really executed. WebRTC sessions on a failed SFU node are **lost**; clients must rebuild them.

| Scenario | Expected behaviour | Actual (what was really tested) |
|---|---|---|
| mediasoup worker crash (also a non-primary shard of a sharded room) | rooms on it reported lost (`media:reconnect-required`), worker replaced, other workers unaffected | **Tested** with a real worker + SIGKILL (`tests/mediasoup.real.test.js`): lost rooms reported, replacement spawned. Client rebuild not tested in a browser |
| API/socket node termination | SIGTERM: `/readyz` 503, drain, ordered close; SIGKILL: meetings re-placed after TTL+sweep | SIGTERM ordering **tested on real boots** (all stages ran; stuck stage bounded at 8 s). SIGKILL: **verified live with two real processes on a real Redis** (survivor's sweep removed the dead node); re-placement logic also tested against real Redis (`tests/media.test.js`) |
| SFU node failure | placement skips it, meetings released and re-assigned, clients rebuild media | logic tested (mock Redis); end-to-end not run |
| Redis failure | app stays up, degrades to per-instance, `/readyz` reports redis not ok (fatal only if REDIS_REQUIRED) | **Observed**: boots and serves with Redis unreachable; shutdown completes; adapter/presence/rate-limit fallbacks unit-tested. Mid-flight Redis loss not run |
| Redis → queue unreachable | enqueue fails fast (3 s) and falls back to inline | code path written; not exercised |
| MariaDB primary failover | manual (see DISASTER_RECOVERY) | not run |
| Background worker failure | BullMQ stalled-job detection re-runs job; retries with backoff; failures kept in failed set | **Tested against real Redis** (`tests/queue.integration.test.js`): retries with backoff, failures kept in the failed set, duplicate jobId ignored, concurrency limit. Stalled-job recovery after a worker crash not tested |
| TURN server failure | clients fall back to direct/other TURN URLs; calls on relay drop and ICE-restart | not run (no TURN host) |
| Network interruption | client ICE restart on transport `disconnected`/`failed` (pre-existing) then `recoverMedia` | pre-existing behaviour; not re-tested |
| Region unavailability | no multi-region support | not applicable / not implemented |
