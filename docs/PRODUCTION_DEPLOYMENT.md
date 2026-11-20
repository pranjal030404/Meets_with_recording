# Production deployment (PM2, no containers)

Status of everything below is tracked in `docs/SCALABILITY_ROADMAP.md`. Single-host, single-node deployment still works exactly as in
`deploy/DEPLOY.md`; this document adds multi-node.

## Topology
```
Browsers ──HTTPS──> nginx (REST + non-meeting sockets, least_conn / ip_hash)       infrastructure/nginx/nginx.conf
        └─HTTPS──> nginx vhost per node  (meeting sockets: the node that OWNS the meeting)   gen-node-vhosts.mjs
        └─UDP/TCP 40000-49999 (slices per node) ──> mediasoup on each node (never through nginx)
        └─TURN (UDP 3478/50000-59999, TLS 5349/443) ──> coturn                       infrastructure/turn/
Nodes ──> Redis (presence, placement, queues, rate limits) · MariaDB (+ optional replicas) · S3-compatible storage (optional)
```
Each PM2 process = one meeting-owner node (signaling + in-meeting state + mediasoup). A meeting lives on one node; the client asks
`GET /api/meetings/:roomId/placement` and connects its socket to that node's `NODE_PUBLIC_URL`.

## 1. Prerequisites
- Node 20+, PM2, nginx, **Redis 6.2+** (`infrastructure/redis/redis.conf.example`; AOF on, `noeviction`), MariaDB/MySQL.
- DNS: app hostname + one hostname per node (`{host}-{i}.meet.example.com`) → the node's public IP; wildcard TLS certificate.
- `backend/.env` (shared by all nodes on the host): `REDIS_URL`, `REDIS_REQUIRED=true`, DB_*, `JWT_SECRET` (**identical on every node**),
  `CLIENT_URL=https://app.example.com` (CORS for the per-node origins), `MEDIASOUP_ANNOUNCED_IP=<this host's public IP>`, `NODE_REGION`, `TURN_*`.
  Never commit it.

## 2. Network / firewall (each node host) - required, media does not pass through nginx
| Port | Proto | Source | Purpose |
|---|---|---|---|
| 443 | TCP | public | nginx (app + node vhosts) |
| `MEDIASOUP_MIN_PORT`–`MAX_PORT` (default 40000–49999) | UDP **and** TCP | public | WebRTC media. With N nodes on a host the range is split into N disjoint slices automatically |
| 5000+i | TCP | localhost only | node HTTP (nginx proxies) |
| 6379 | TCP | app hosts only | Redis |
| 3306 | TCP | app hosts only | MariaDB |
Cloud: the instance's **public IP must be the one in `MEDIASOUP_ANNOUNCED_IP`** (use an elastic/static IP; on NAT clouds mediasoup binds the private IP and announces the public one). Open the same ports in the provider's security group, not only `ufw`.

## 3. Start
```bash
cd backend && npm ci && npm run migrate          # migration 018 adds indexes: run on a quiet DB; idempotent
# 2 nodes on this host, dedicated queue worker, per-node hostnames:
NODES_PER_HOST=2 HOST_ID=h1 NODE_PUBLIC_URL_PATTERN='https://{host}-{i}.meet.example.com' WORKER_PROCESSES=1 \
  pm2 start ecosystem.multinode.config.cjs --env production
pm2 save && pm2 startup
NODES_PER_HOST=2 HOST_ID=h1 NODE_PUBLIC_URL_PATTERN='https://{host}-{i}.meet.example.com' \
  TLS_CERT=... TLS_KEY=... node ../infrastructure/nginx/gen-node-vhosts.mjs | sudo tee /etc/nginx/conf.d/meetclone-nodes.conf
sudo nginx -t && sudo systemctl reload nginx
```
Single node: `pm2 start ecosystem.config.cjs --env production` as before (no Redis required).
Adding a host: same command with a different `HOST_ID`; nodes register themselves in Redis (heartbeat) and receive meetings by capacity.

## 4. Rolling deploys / draining
`pm2 reload` is NOT zero-downtime here (fork mode). Per node, one at a time: `pm2 stop meetclone-node-1` (SIGTERM → `/readyz` fails,
no new meetings, 5 s LB drain, sockets closed, clients auto-reconnect). Participants in meetings owned by that node must rebuild media
(the client does this automatically through `recoverMedia`, ~seconds, **not yet verified in a browser**). Prefer deploying when the node has no active meetings.

## 5. Scaling & failure behaviour (be honest about what PM2 does not do)
- **No autoscaling.** PM2 does not add hosts. Add nodes/hosts by hand or via your cloud's instance-group tooling; capacity-aware placement then uses them.
  Set `SFU_MAX_*` from load-test results so placement stops sending meetings to a full node.
- Node crash: PM2 restarts it (restart_delay 4 s); meanwhile its meetings are re-placed on healthy nodes after the heartbeat TTL (~15 s) and the sweep (≤10 s).
  Media sessions on the dead node cannot migrate; the waiting-room queue is lost.
- Redis down: non-meeting features degrade to per-instance behaviour; `REDIS_REQUIRED=true` makes `/readyz` fail so the LB stops routing to nodes that cannot coordinate.

## 6. Object storage / CDN (optional)
`STORAGE_DRIVER=s3` + `S3_BUCKET`... (private bucket, no public ACLs). Presigned URLs only. The existing upload routes still write to local disk and `/uploads` is served publicly by Express - this is **not yet migrated**.
CDN in front of the bucket (CloudFront signed URLs/cookies) is deployment-side work, not implemented.

## 7. Verification checklist (nothing here has been run by the author)
1. `curl https://node1.../readyz` returns `ready` with `redis.ok=true`, `socketAdapter.ok=true`.
2. Two browsers on different nodes (join via the placement endpoint): both land on the same node's socket (DevTools → WS URL).
3. `pm2 stop` the owning node mid-call: clients show "Reconnecting media…" and recover on another node.
4. TURN relay test per `infrastructure/turn/README.md`.
5. Run `tests/adapter.integration.test.js` and `tests/queue.integration.test.js` with `REDIS_TEST_URL` set.
