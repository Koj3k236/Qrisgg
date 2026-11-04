#!/usr/bin/env bash
# Usage: infra/scripts/deploy.sh   (from /opt/qrisgg). Non-destructive: builds new images, keeps volumes.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PUBLIC_API_URL:=https://api.qrisgg.com}"
export PUBLIC_API_URL
git -C .. rev-parse --short HEAD > .last_deploy_candidate
./scripts/backup.sh || echo "WARN: backup skipped (first deploy?)"
docker compose build --pull
docker compose up -d
for i in $(seq 1 30); do
  if docker compose exec -T backend python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8001/api/health')" 2>/dev/null; then
    cp .last_deploy_candidate .last_deploy_ok; echo "Backend healthy"; break
  fi
  sleep 3
done
curl -fsS https://api.qrisgg.com/api/health && echo && curl -fsSI https://qrisgg.com | head -n 1
# Rollback: git -C .. checkout $(cat .last_deploy_ok) && ./scripts/deploy.sh
