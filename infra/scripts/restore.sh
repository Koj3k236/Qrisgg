#!/usr/bin/env bash
# Usage: infra/scripts/restore.sh backups/qrisgg-<TS>.archive.gz [TARGET_DB]
# Default restores into "<DB_NAME>_restore_test" so production data is never overwritten without intent.
set -euo pipefail
cd "$(dirname "$0")/.."
FILE=${1:?archive path required}
DB_NAME=$(grep '^DB_NAME=' .env.backend | cut -d= -f2)
TARGET=${2:-${DB_NAME}_restore_test}
if [ "$TARGET" = "$DB_NAME" ]; then
  read -r -p "This will DROP and replace production database '$DB_NAME'. Type YES to continue: " ok
  [ "$ok" = "YES" ] || { echo "Aborted"; exit 1; }
fi
docker compose exec -T mongo mongorestore --gzip --archive="/backups/$(basename "$FILE")" \
  --nsFrom="${DB_NAME}.*" --nsTo="${TARGET}.*" --drop
docker compose exec -T mongo mongosh --quiet "$TARGET" --eval 'printjson({invoices: db.invoices.countDocuments(), users: db.users.countDocuments()})'
echo "Restored into $TARGET"
