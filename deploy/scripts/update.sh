#!/usr/bin/env bash
# Run ON THE SERVER to update the live site:  bash deploy/scripts/update.sh [branch]
# Pulls the branch (default: the one checked out), installs, builds the web app, restarts both
# PM2 apps and checks the backend. Meetings in progress are interrupted by the restart.
set -euo pipefail
cd "$(dirname "$0")/../.."

git fetch origin
[ $# -gt 0 ] && git checkout "$1"
before=$(git rev-parse --short HEAD)
git pull --ff-only
echo "Updating $before -> $(git rev-parse --short HEAD)   (to go back: git checkout $before, then rebuild)"

(cd backend && npm ci --omit=dev)   # no database changes in this release
# build first, restart after: the old site keeps serving if the build fails
(cd frontend && npm ci && npm run build)
pm2 restart meetclone-backend meetclone-frontend

curl -fsS --retry 15 --retry-delay 2 --retry-all-errors "http://localhost:${PORT:-5004}/api/health" >/dev/null
echo "Backend is healthy."
