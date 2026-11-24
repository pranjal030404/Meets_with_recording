#!/usr/bin/env bash
# Zero-downtime-ish deploy for the PM2 multi-node setup: restarts ONE node at a time and waits until it is
# healthy again before touching the next. Run on the VPS from anywhere:  deploy/scripts/rolling-restart.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE_PORT="${BASE_PORT:-5010}"
NODES="${NODES:-2}"

git -C "$ROOT" pull --ff-only origin main
(cd "$ROOT/backend" && npm install --omit=dev --no-audit --no-fund && npm run migrate)
(cd "$ROOT/frontend" && npm install --no-audit --no-fund && npm run build)
pm2 restart meetclone-frontend

for i in $(seq 1 "$NODES"); do
  port=$((BASE_PORT + i - 1))
  echo ">> restarting meetclone-node-$i (port $port)"
  pm2 restart "meetclone-node-$i" --update-env
  for t in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then echo "   node-$i healthy"; break; fi
    [ "$t" = 30 ] && { echo "node-$i did not become healthy; stopping rollout" >&2; exit 1; }
    sleep 2
  done
  sleep 5   # let clients re-place before the next node goes down
done
pm2 save
echo "done"
