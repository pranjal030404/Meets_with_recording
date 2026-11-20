# Monitoring

| Piece | Where | Status |
|---|---|---|
| App metrics (`prom-client`): HTTP duration/active by route pattern, event-loop lag, CPU/memory/GC, Socket.IO connected/connections/disconnects(reason)/events/rate-limited, SFU workers/routers/transports/producers/consumers/per-worker load/in+out bitrate/worker deaths/subscription allowed+denied/consumer score/producer loss+jitter, DB pool + slow queries, Redis up, BullMQ job counts | `backend/src/observability/metrics.js` | IMPLEMENTED AND UNIT-TESTED (exposition content); verified on a real boot only as far as noted in the final report |
| Internal-only listener | `METRICS_PORT` (+`METRICS_HOST`, default 127.0.0.1, optional `METRICS_TOKEN`); **disabled unless METRICS_PORT is set**; never on the public port | IMPLEMENTED |
| Prometheus config + 14 alert rules | `infrastructure/prometheus/` | CONFIGURATION PROVIDED (YAML parses; `promtool` not run) |
| Exporters for Redis / MariaDB / host / coturn | scrape jobs defined; exporters themselves are installed by you | CONFIGURATION PROVIDED |
| 8 Grafana dashboards (platform, API, WebSocket, SFU, meeting quality, MariaDB, Redis, queues) | `infrastructure/grafana/dashboards/*.json` (generated, valid JSON, datasource variable) | CONFIGURATION PROVIDED, **never imported into Grafana** |
| JSON logs | `LOG_FORMAT=json` (console wrapper) + `infrastructure/loki/promtail.yml` | IMPLEMENTED (wrapper); Loki/promtail CONFIGURATION PROVIDED |
| OpenTelemetry traces | `src/observability/tracing.mjs`, loaded with `node --import` when `OTEL_EXPORTER_OTLP_ENDPOINT` is set | see final report for install/verification status |

Run Prometheus, Grafana, Loki on a private network; put Grafana behind SSO/VPN. Do not scrape over the public internet.

## Metric caveats (read before trusting a graph)
- `sfu_consumer_score` and the packet-loss/jitter histograms are **sampled** (≤500 consumers per scrape, ≤50 producers per 15 s), not exhaustive.
- Bitrate gauges sum the first 200 transports per 15 s sample; they under-report on a node with more transports than that.
- Packet loss/jitter here are measured at the SFU **ingress** (producer side). Loss on the SFU→viewer leg is not measured server-side; use client getStats (`tests/load/webrtc`) for end-to-end.
- Alert thresholds are starting points, not tuned.
