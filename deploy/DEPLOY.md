# VPS deploy (PM2 + Apache) — meet.arthvex.co.in

Ports: backend 5004, frontend 5005 (check free: `ss -ltnp | grep -E ':(5004|5005)\b'`).

## 1. Backend
```bash
cd /var/www/Meets_with_recording/backend
nano .env            # set NODE_ENV=production, MEDIASOUP_ANNOUNCED_IP=<VPS public IP>
npm run db:setup     # first time only: creates DB + runs migrations
pm2 start ecosystem.config.cjs --env production
```

## 2. Frontend
```bash
cd /var/www/Meets_with_recording/frontend
npm ci
npm run build
pm2 start ecosystem.config.cjs
```
(Leave VITE_API_URL / VITE_SOCKET_URL empty: production uses same-origin.)

## 3. Save PM2 state
```bash
pm2 save
pm2 startup     # once, run the command it prints
```

## 4. Apache + HTTPS
```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl
sudo certbot certonly --apache -d meet.arthvex.co.in   # DNS A record must point to VPS
sudo cp deploy/apache/meet.arthvex.co.in.conf /etc/apache2/sites-available/
sudo a2ensite meet.arthvex.co.in
sudo apachectl configtest && sudo systemctl reload apache2
```

## 5. Firewall (required for video/audio)
mediasoup media does NOT go through Apache. Open on both `ufw` and your
cloud provider's security group:
```bash
sudo ufw allow 40000:49999/udp
sudo ufw allow 40000:49999/tcp
```

## Update later
```bash
git pull
(cd backend && npm i && pm2 restart meetclone-backend)
(cd frontend && npm i && npm run build && pm2 restart meetclone-frontend)
```

## Load balancer / nginx (alternative to Apache)
`deploy/nginx/meet.arthvex.co.in.conf` is a ready config: HTTPS, HTTP->HTTPS, WebSocket upgrade for
Socket.IO, sticky routing (`ip_hash`), `/healthz` probe and upload size limits.
```bash
sudo cp deploy/nginx/meet.arthvex.co.in.conf /etc/nginx/sites-available/
sudo ln -s ../sites-available/meet.arthvex.co.in.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
Set `TRUST_PROXY=1` in `backend/.env` (default in production) so the app sees real client IPs
(rate limiting is per IP). Use ONE of Apache or nginx on 80/443, not both.

`GET /api/health` returns 200 normally and **503 while the node is draining** (pm2 reload / SIGTERM),
so a balancer stops sending new users to it. Media (UDP/TCP 40000-49999) bypasses the balancer.

### Scaling out (more than one backend node)
Do NOT just add nodes: mediasoup rooms live in one process's memory, so everyone in a meeting must
land on the node that owns it. Before adding a second `server` line in the upstream:
1. Run Redis and set `REDIS_URL` on every node (Socket.IO then relays events between nodes).
2. Give each node its own `MEDIASOUP_ANNOUNCED_IP` and open its media port range.
3. Route a room to one node (e.g. hash on the room id) rather than by client IP.
Until then, keep a single backend and scale by raising `MEDIASOUP_NUM_WORKERS` (uses more CPU cores).

## Load balancing with PM2 (2 nodes on this VPS)
Preset: `backend/ecosystem.vps.config.cjs` (nodes on 5010/5011, hostnames `node1.meet.arthvex.co.in`, `node2.meet.arthvex.co.in`)
+ `deploy/nginx/meet.arthvex.co.in.multinode.conf`. Frontend stays `meetclone-frontend` (static, port 5005).
```bash
# 1. DNS: A records for node1.meet / node2.meet -> VPS IP (meet already exists)
# 2. Redis (required with >1 node)
sudo apt install -y redis-server && sudo systemctl enable --now redis-server
# 3. backend/.env  ->  REDIS_URL=redis://127.0.0.1:6379  CLIENT_URL=https://meet.arthvex.co.in  TRUST_PROXY=1
#                      MEDIASOUP_ANNOUNCED_IP=<VPS public IP>   (JWT_SECRET is shared: same .env for both nodes)
# 4. Cert covering all three names
sudo certbot certonly --nginx -d meet.arthvex.co.in -d node1.meet.arthvex.co.in -d node2.meet.arthvex.co.in
# 5. nginx (stop Apache first if it owns 80/443; other sites on this VPS must keep their own server blocks)
sudo cp deploy/nginx/meet.arthvex.co.in.multinode.conf /etc/nginx/sites-available/meet.arthvex.co.in.conf
sudo nginx -t && sudo systemctl reload nginx
# 6. Swap the single backend for the two nodes
cd backend && pm2 delete meetclone-backend
pm2 start ecosystem.vps.config.cjs --env production && pm2 save
```
Firewall: UDP+TCP 40000-49999 stays open (split into 40000-44999 / 45000-49999 per node). Check: `pm2 ls`, `curl -s https://meet.arthvex.co.in/healthz`.
Deploys: `deploy/scripts/rolling-restart.sh` (pull, migrate, build, then restarts node 1, waits for health, then node 2). Never `pm2 restart all` here: it also bounces your other apps and both nodes at once.
Verify anytime: `deploy/scripts/check-lb.sh` (checks all three hostnames, both local ports, Redis and PM2 state).
The nginx file also has rate limits (auth 5 r/s, API 20 r/s per IP), 1 GB streamed uploads for recordings, HSTS and per-node `/healthz`.

## Backups

`deploy/scripts/backup.sh` writes the database and uploaded files to `~/meet-backups/<time>/`. The deploy scripts run it before they migrate. Also run it daily from cron, and copy the result to another machine:

```cron
15 2 * * * cd /path/to/app && bash deploy/scripts/backup.sh >> $HOME/meet-backup.log 2>&1
```

Check that a set can be restored with `bash deploy/scripts/restore-check.sh <set-dir> <new-database-name>`.

## Rolling back

`update.sh` prints the commit it started from. To go back:

1. `git checkout <that commit>`
2. `(cd backend && npm ci --omit=dev)` and `(cd frontend && npm ci && npm run build)`
3. Restart the PM2 apps.

Migrations 020 to 022 and 024 only add tables and indexes, so older code runs against the newer database. 023 adds foreign keys, which older code also works with, with one exception: it could be refused if it tried to store a reference to something that does not exist. Do not restore the backup unless data was damaged: it discards everything written since.

When you go forward again after older code has been running, rebuild the membership index once: `cd backend && node src/database/migrate.js 020`.

## Go-live checklist

In this order:

1. **Passwords, today, on the site that is running now.** Admin console, Admins: give every administrator a new private password. This needs no deploy.
2. **Node 22.** `node -v` on the server must be 20.19+ or 22.12+.
3. **Rehearse** steps 4 to 9 on a second copy of the app with a copy of the database, if at all possible. `update.sh` installs new dependencies into the folder the site runs from, so a failure part way is better found there. In that copy, `cd backend && npm ci && npm run preflight` lists what is wrong with the settings: fix every `MUST FIX`, read every `WARNING`. The server refuses to start in production with a missing, short or example `JWT_SECRET` (changing it signs everyone out). If an administrator still has a published password: `npm run set-admin-password -- <email>`.
4. **Email.** Set `SMTP_*` and `MAIL_FROM`, publish SPF and DKIM, then send a test from Admin console, Settings.
5. **Calls.** Set `MEDIASOUP_ANNOUNCED_IP`, open the UDP and TCP media port range in the firewall, and run a TURN server with `TURN_SECRET` and `TURN_URLS`. Close the application ports themselves to the outside.
6. **Backups.** Add the cron line above and restore one copy on another machine.
7. **Monitoring.** Add `deploy/scripts/healthcheck.sh` to cron, and an uptime check from outside on `/api/health`. (`/healthz` and `/readyz` reach the app only if the proxy forwards them.)
8. **Deploy.** The first time, run `git pull --ff-only` and then `bash deploy/scripts/update.sh`: the script already on the server does not back up, check or migrate, and the new one does. If it stops at the check, fix what it names and run it again before restarting anything.
9. **Check.** Sign up, sign in, reset a password; two people on different networks see and hear each other; record and play back; upload a file.
10. **Data integrity.** The upgrade adds foreign keys without changing any data. `cd backend && npm run check-integrity` lists rows that point at something missing (and so kept a constraint from being added). After a backup, `npm run check-integrity -- --fix` repairs them.
11. **Afterwards.** Optionally `npm run rotate-invite-codes`. Have the privacy and terms text in `frontend/src/pages/Legal.jsx` checked, then set `LEGAL_NAME` and `LEGAL_CONTACT` to publish it.

Optional virus scanning: install ClamAV, run `clamd` listening on localhost, set `CLAMAV_HOST=127.0.0.1`. Uploads are refused while it cannot be reached.

## Sign-in sessions

The web app keeps its session in an `HttpOnly` cookie, so:

- **Everyone using the website signs in once more** after this version is deployed. The mobile app is unaffected.
- Serve the web app and `/api` from the same site over https. The cookie is `SameSite=Strict` and `Secure`; the proxy must pass cookies and the `X-Client` header through (Apache and nginx do by default).
- Rolling back to an older version signs web users out as well.

## Android release key

Once: `bash app/android/create-keystore.sh`, then back up the keystore and `app/android/key.properties` somewhere safe and offline. Build with `flutter build apk --release` (or `appbundle` for the Play Store). Without the key the build is signed with the debug key and says so. People who installed a debug-signed APK must uninstall it once before the properly signed one will install.

On-device test, against a disposable server: see the top of `app/integration_test/device_smoke_test.dart`.
