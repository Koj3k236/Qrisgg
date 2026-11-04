#!/usr/bin/env bash
# Usage: infra/scripts/backup.sh   (run from /opt/qrisgg/infra). Keeps last 14 archives.
set -euo pipefail
cd "$(dirname "$0")/.."
DB_NAME=$(grep '^DB_NAME=' .env.backend | cut -d= -f2)
TS=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T mongo mongodump --db "$DB_NAME" --archive="/backups/qrisgg-$TS.archive.gz" --gzip
ls -1t backups/qrisgg-*.archive.gz | tail -n +15 | xargs -r rm --
echo "Backup created: backups/qrisgg-$TS.archive.gz"
