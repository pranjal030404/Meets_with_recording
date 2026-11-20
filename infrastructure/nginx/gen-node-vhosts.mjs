// Prints one nginx server block per node so browsers can reach each node's Socket.IO directly
// (the NODE_PUBLIC_URL each node advertises). Usage:
//   NODES_PER_HOST=2 HOST_ID=h1 BASE_PORT=5000 NODE_PUBLIC_URL_PATTERN='https://{host}-{i}.meet.example.com' \
//   TLS_CERT=/etc/letsencrypt/live/meet.example.com/fullchain.pem TLS_KEY=/etc/letsencrypt/live/meet.example.com/privkey.pem \
//   node infrastructure/nginx/gen-node-vhosts.mjs > /etc/nginx/conf.d/meetclone-nodes.conf
// Needs a wildcard (or per-node) certificate.
import os from 'os';
const e = process.env;
const nodes = Math.max(1, parseInt(e.NODES_PER_HOST) || 1);
const host = (e.HOST_ID || os.hostname()).replace(/[^A-Za-z0-9-]/g, '-');
const base = parseInt(e.BASE_PORT) || 5000;
if (!e.NODE_PUBLIC_URL_PATTERN) { console.error('NODE_PUBLIC_URL_PATTERN is required'); process.exit(1); }
if (!e.TLS_CERT || !e.TLS_KEY) { console.error('TLS_CERT and TLS_KEY are required'); process.exit(1); }

for (let i = 0; i < nodes; i++) {
  const url = new URL(e.NODE_PUBLIC_URL_PATTERN.replace('{host}', host).replace('{i}', String(i + 1)));
  console.log(`# node ${i + 1}
server {
    listen 443 ssl http2;
    server_name ${url.hostname};
    ssl_certificate     ${e.TLS_CERT};
    ssl_certificate_key ${e.TLS_KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    location / {
        proxy_pass http://127.0.0.1:${base + i};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;   # map defined in nginx.conf
        proxy_read_timeout 120s;
        proxy_buffering off;
    }
}
`);
}
