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
npm install serve
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
