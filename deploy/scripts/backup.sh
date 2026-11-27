#!/usr/bin/env bash
# Database + uploaded files backup.   bash deploy/scripts/backup.sh [target-dir]
# Reads DB_* from backend/.env. Keeps the newest $KEEP sets (default 7). Copy the results OFF this machine:
# a backup on the same disk does not survive the disk.
set -euo pipefail
cd "$(dirname "$0")/../.."
TARGET="${1:-${BACKUP_DIR:-$HOME/meet-backups}}"
KEEP="${KEEP:-7}"
ENV_FILE="${ENV_FILE:-backend/.env}"
UPLOADS="${UPLOADS_DIR:-backend/uploads}"
val() { sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | sed -e 's/[[:space:]]#.*$//' -e "s/^['\"]//" -e "s/['\"]$//" -e 's/[[:space:]]*$//'; }
DB_NAME="$(val DB_NAME)"; DB_HOST="$(val DB_HOST)"; DB_PORT="$(val DB_PORT)"; DB_USER="$(val DB_USER)"
umask 077
mkdir -p "$TARGET"
STAMP="$(date +%Y%m%d-%H%M%S)"
SET="$TARGET/$STAMP"
mkdir "$SET"
# the password goes through the environment, never the command line
MYSQL_PWD="$(val DB_PASSWORD)" mariadb-dump --protocol=tcp -h"${DB_HOST:-localhost}" -P"${DB_PORT:-3306}" -u"$DB_USER" \
  --single-transaction --routines --triggers "$DB_NAME" | gzip > "$SET/database.sql.gz"
gzip -t "$SET/database.sql.gz"
if [ -d "$UPLOADS" ]; then tar -czf "$SET/uploads.tar.gz" -C "$UPLOADS" --exclude=./tmp .; fi
(cd "$SET" && sha256sum ./* > SHA256SUMS)
echo "Backup written to $SET"
# prune: only directories this script names (YYYYmmdd-HHMMSS), oldest first
ls -1d "$TARGET"/????????-?????? | sort | head -n -"$KEEP" | while read -r old; do
  rm -f -- "$old/database.sql.gz" "$old/uploads.tar.gz" "$old/SHA256SUMS" && rmdir -- "$old"
done
