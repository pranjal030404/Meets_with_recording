#!/usr/bin/env bash
# Run ON THE SERVER to update the live site:  bash deploy/scripts/update.sh [branch]
# Pulls the branch (default: the one checked out), installs, builds the web app, restarts both
# PM2 apps and checks the backend. Meetings in progress are interrupted by the restart.
set -euo pipefail

# one function, read in full before it runs: "git pull" may replace this very file
main() {
# The web build needs Node 20.19+ or 22.12+: stop before anything is changed
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (!((a===20&&b>=19)||(a===22&&b>=12)||a>22)) { console.error("Node "+process.versions.node+" is too old: install Node 22 LTS before deploying"); process.exit(1) }'
cd "$(dirname "$0")/../.."

git fetch origin
[ $# -gt 0 ] && git checkout "$1"
before=$(git rev-parse --short HEAD)
git pull --ff-only
echo "Updating $before -> $(git rev-parse --short HEAD)   (to go back: git checkout $before, then rebuild)"

# back up first: migrations change the schema, and the backup is the way back (SKIP_BACKUP=1 only if one was just taken)
[ "${SKIP_BACKUP:-}" = 1 ] || bash deploy/scripts/backup.sh
(cd backend && npm ci --omit=dev && npm run preflight && npm run migrate)   # migrations are safe to re-run
# build first, restart after: the old site keeps serving if the build fails
(cd frontend && npm ci && npm run build)
pm2 restart meetclone-backend meetclone-frontend

curl -fsS --retry 15 --retry-delay 2 --retry-all-errors "http://localhost:${PORT:-5004}/api/health" >/dev/null
echo "Backend is healthy."
}
main "$@"; exit
