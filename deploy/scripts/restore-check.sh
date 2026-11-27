#!/usr/bin/env bash
# Proves a backup can be restored: loads it into a NEW scratch database and counts what arrived.
#   bash deploy/scripts/restore-check.sh <backup-set-dir> <scratch-db-name>
# Needs a database user allowed to create databases (MARIADB_ARGS, e.g. "-uroot -p"). Refuses an existing database
# and never touches the live one. Drop the scratch database yourself afterwards.
set -euo pipefail
SET="${1:?backup set directory}"
SCRATCH="${2:?name for a new scratch database}"
read -r -a ARGS <<< "${MARIADB_ARGS:--uroot -p}"
[[ "$SCRATCH" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Plain database names only" >&2; exit 1; }
(cd "$SET" && sha256sum -c --quiet SHA256SUMS)
mariadb "${ARGS[@]}" -e "CREATE DATABASE \`$SCRATCH\`"   # fails if it exists
gunzip -c "$SET/database.sql.gz" | mariadb "${ARGS[@]}" "$SCRATCH"
mariadb "${ARGS[@]}" -N "$SCRATCH" -e "SELECT 'tables', COUNT(*) FROM information_schema.tables WHERE table_schema='$SCRATCH'
  UNION ALL SELECT 'users', COUNT(*) FROM Users UNION ALL SELECT 'meetings', COUNT(*) FROM Meetings
  UNION ALL SELECT 'teams', COUNT(*) FROM Teams UNION ALL SELECT 'messages', COUNT(*) FROM Messages"
if [ -f "$SET/uploads.tar.gz" ]; then echo "uploaded files in archive: $(tar -tzf "$SET/uploads.tar.gz" | grep -vc '/$')"; fi
echo "Restore check passed. Remove the scratch database when done: DROP DATABASE \`$SCRATCH\`;"
