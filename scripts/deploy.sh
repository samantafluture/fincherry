#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "==> Pulling latest changes"
git pull origin main

echo "==> Building Docker images"
docker compose -f docker-compose.prod.yml build

echo "==> Deploying web assets to nginx volume"
docker compose -f docker-compose.prod.yml run --rm web-assets

echo "==> Running database migrations"
docker compose -f docker-compose.prod.yml run --rm migrate

echo "==> Restarting API"
docker compose -f docker-compose.prod.yml up -d api

echo "==> Reloading nginx"
docker exec infra-nginx nginx -s reload

echo "==> Health check (waiting up to 30s)"
for i in $(seq 1 10); do
  if docker exec fincherry-api wget -qO- http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "    API is healthy"
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo "    WARNING: Health check failed. Container logs:"
    docker logs fincherry-api --tail 50
    exit 1
  fi
  sleep 3
done

echo "==> Cleaning up dangling images"
docker image prune -f

echo "==> Deploy complete"
