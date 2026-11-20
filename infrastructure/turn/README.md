# TURN (coturn) without containers

Why TURN at all: mediasoup is reachable on UDP/TCP 40000–49999 of the SFU host. Clients on networks that block those
ports can only connect through a relay on 443/TCP-TLS. Most users connect directly; TURN is the fallback.

## Install (Debian/Ubuntu)
```bash
sudo apt install coturn
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
sudo cp turnserver.conf.template /etc/turnserver.conf && sudo $EDITOR /etc/turnserver.conf   # fill placeholders
sudo systemctl enable --now coturn
```
Secret: `openssl rand -hex 32` → put the SAME value in coturn (`static-auth-secret`) and `backend/.env` (`TURN_SECRET`).

## Backend env
```
TURN_SECRET=<same secret>
TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp
TURN_TTL_SEC=3600
STUN_URLS=stun:turn.example.com:3478
```
The frontend fetches these (authenticated) from `GET /api/webrtc/ice-servers` when joining a meeting. Rotating the secret invalidates credentials already issued (coturn here accepts one secret): do it in a quiet window; clients fetch fresh credentials on their next join.

## Firewall / security group (per TURN host)
| Port | Proto | Purpose | Exposure |
|---|---|---|---|
| 3478 | UDP+TCP | STUN/TURN | public |
| 5349 (or 443) | TCP | TURN over TLS | public |
| 50000–59999 | UDP | relay allocations | public |
| 9641 | TCP | Prometheus metrics | **localhost/private only** |

## Regional deployment
Run one coturn per region with its own hostname (`turn-eu.example.com`). The endpoint returns the list from `TURN_URLS`; to
return the nearest one, run backend nodes per region with region-specific `TURN_URLS`. (Geo-DNS for a single hostname also works.)

## Testing (must be done before relying on it)
1. Direct path: join a call from a normal network; `chrome://webrtc-internals` should show candidate type `host/srflx` to the SFU.
2. Relay path: in Chrome devtools set a test with `iceTransportPolicy: "relay"` (or block UDP 40000–49999 on a test client) and confirm
   candidate type `relay` and working media. **Not yet tested in this repository** (no TURN host was available).
3. Bandwidth: watch coturn Prometheus metrics (`turn_total_traffic_*`) and the NIC counters on the TURN host.
