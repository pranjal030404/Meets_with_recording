#!/usr/bin/env bash
# Run from cron every few minutes. Silent while all is well; on failure it prints why (cron mails that) and, if
# ALERT_URL is set, posts the same text there.
#   */5 * * * * cd /path/to/app && bash deploy/scripts/healthcheck.sh
set -uo pipefail
URL="${HEALTH_URL:-http://127.0.0.1:${PORT:-5004}/readyz}"
MAX_DISK="${MAX_DISK_PERCENT:-85}"
MAX_BACKUP_HOURS="${MAX_BACKUP_HOURS:-26}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/meet-backups}"
problems=()
curl -fsS -m 10 "$URL" >/dev/null 2>&1 || problems+=("the server does not answer at $URL")
used=$(df -P . | awk 'NR==2 { sub("%", "", $5); print $5 }')
[ "$used" -lt "$MAX_DISK" ] || problems+=("disk is ${used}% full")
if [ -z "$(find "$BACKUP_DIR" -name database.sql.gz -mmin "-$((MAX_BACKUP_HOURS * 60))" 2>/dev/null | head -1)" ]; then
  problems+=("no database backup in the last ${MAX_BACKUP_HOURS} hours in $BACKUP_DIR")
fi
[ ${#problems[@]} -eq 0 ] && exit 0
message="$(hostname): $(IFS=';'; echo "${problems[*]}")"
echo "$message"
if [ -n "${ALERT_URL:-}" ]; then curl -fsS -m 10 -X POST --data-binary "$message" "$ALERT_URL" >/dev/null || echo "could not reach ALERT_URL"; fi
exit 1
