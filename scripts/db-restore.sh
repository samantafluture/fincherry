#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--" ]]; then
  shift
fi

usage() {
  cat <<'EOF'
Usage:
  pnpm db:restore -- <dump_file> [target_db] [--replace-target]

Examples:
  pnpm db:restore -- backups/fincherry_20260222T201500Z.dump
  pnpm db:restore -- backups/fincherry_20260222T201500Z.dump fincherry_restore_test --replace-target

Notes:
  - Default target DB is "fincherry_restore_test".
  - --replace-target drops and recreates the target database before restore.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

dump_file="$1"
shift

target_db="fincherry_restore_test"
replace_target="false"

for arg in "$@"; do
  if [[ "$arg" == "--replace-target" ]]; then
    replace_target="true"
  elif [[ "$target_db" == "fincherry_restore_test" ]]; then
    target_db="$arg"
  else
    echo "Unexpected argument: $arg"
    usage
    exit 1
  fi
done

if [[ ! -f "$dump_file" ]]; then
  echo "Dump file not found: $dump_file"
  exit 1
fi

if [[ ! "$target_db" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo "Invalid target database name: $target_db"
  echo "Use letters, numbers, and underscore only."
  exit 1
fi

tmp_dump="/tmp/fincherry_restore.dump"

echo "Copying dump into container..."
docker compose cp "$dump_file" "db:$tmp_dump"

if [[ "$replace_target" == "true" ]]; then
  echo "Dropping and recreating target database: $target_db"
  docker compose exec -T db psql -U fincherry -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$target_db\";"
  docker compose exec -T db psql -U fincherry -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$target_db\";"
else
  db_exists="$(docker compose exec -T db psql -U fincherry -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '$target_db';" || true)"
  if [[ "$db_exists" != "1" ]]; then
    echo "Creating target database: $target_db"
    docker compose exec -T db psql -U fincherry -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$target_db\";"
  fi
fi

echo "Restoring dump to database: $target_db"
docker compose exec -T db pg_restore \
  -U fincherry \
  -d "$target_db" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "$tmp_dump"

echo "Cleaning temporary dump from container"
docker compose exec -T db rm -f "$tmp_dump"

echo "Restore completed successfully."
echo "Verify with:"
echo "  docker compose exec -T db psql -U fincherry -d $target_db -c \"\\dt\""
