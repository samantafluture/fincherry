#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--" ]]; then
  shift
fi

BACKUP_DIR="${1:-$ROOT_DIR/backups}"
RETENTION_DAYS="${FINCHERRY_BACKUP_RETENTION_DAYS:-}"
DB_CONTAINER="${FINCHERRY_DB_CONTAINER:-}"

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/fincherry_${timestamp}.dump"

echo "Creating PostgreSQL backup: $backup_file"
if [[ -n "$DB_CONTAINER" ]]; then
  docker exec "$DB_CONTAINER" pg_dump -Fc -U fincherry fincherry > "$backup_file"
else
  docker compose exec -T db pg_dump -Fc -U fincherry fincherry > "$backup_file"
fi

if [[ ! -s "$backup_file" ]]; then
  echo "Backup failed: file is empty."
  exit 1
fi

echo "Backup complete."
echo "File: $backup_file"

if [[ -n "$RETENTION_DAYS" ]]; then
  if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
    echo "Applying retention policy: delete backups older than $RETENTION_DAYS days"
    find "$BACKUP_DIR" -type f -name "*.dump" -mtime +"$RETENTION_DAYS" -delete
  else
    echo "Skipping retention cleanup: FINCHERRY_BACKUP_RETENTION_DAYS is not a number"
  fi
fi
