#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
BACKUP_SCRIPT="$ROOT_DIR/scripts/db-backup.sh"
LOG_FILE="$BACKUP_DIR/backup.log"
MARKER="# fincherry-db-backup"
SCHEDULE="${FINCHERRY_BACKUP_CRON_SCHEDULE:-0 3 * * *}"
RETENTION_DAYS="${FINCHERRY_BACKUP_RETENTION_DAYS:-7}"

usage() {
  cat <<'EOF'
Usage:
  pnpm db:backup:cron
  pnpm db:backup:cron -- --remove

Environment options:
  FINCHERRY_BACKUP_CRON_SCHEDULE   Cron schedule (default: "0 3 * * *")
  FINCHERRY_BACKUP_RETENTION_DAYS  Retention in days (default: 7)
EOF
}

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab command not found. Install cron first."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

line="$SCHEDULE FINCHERRY_BACKUP_RETENTION_DAYS=$RETENTION_DAYS /bin/bash \"$BACKUP_SCRIPT\" \"$BACKUP_DIR\" >> \"$LOG_FILE\" 2>&1 $MARKER"
current="$(crontab -l 2>/dev/null || true)"
without_marker="$(printf '%s\n' "$current" | sed "/$MARKER/d" | sed '/^[[:space:]]*$/d')"

if [[ "${1:-}" == "--remove" ]]; then
  if [[ -n "$without_marker" ]]; then
    printf '%s\n' "$without_marker" | crontab -
  else
    crontab -r || true
  fi
  echo "Removed FinCherry backup cron entry."
  exit 0
fi

{
  if [[ -n "$without_marker" ]]; then
    printf '%s\n' "$without_marker"
  fi
  printf '%s\n' "$line"
} | crontab -

echo "Installed FinCherry backup cron entry:"
echo "  $line"
