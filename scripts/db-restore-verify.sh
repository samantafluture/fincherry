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
  pnpm db:restore:verify
  pnpm db:restore:verify -- <dump_file> [target_db] [--keep-db]

Examples:
  pnpm db:restore:verify
  pnpm db:restore:verify -- backups/fincherry_20260222T201500Z.dump
  pnpm db:restore:verify -- backups/fincherry_20260222T201500Z.dump fincherry_restore_verify --keep-db

Notes:
  - If no dump file is provided, this script creates a fresh backup first and verifies a full round-trip.
  - Default target DB is "fincherry_restore_verify".
  - The target DB is dropped after a successful run unless --keep-db is provided.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

dump_file=""
target_db="fincherry_restore_verify"
keep_db="false"

for arg in "$@"; do
  if [[ "$arg" == "--keep-db" ]]; then
    keep_db="true"
  elif [[ -z "$dump_file" ]]; then
    dump_file="$arg"
  elif [[ "$target_db" == "fincherry_restore_verify" ]]; then
    target_db="$arg"
  else
    echo "Unexpected argument: $arg"
    usage
    exit 1
  fi
done

if [[ ! "$target_db" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo "Invalid target database name: $target_db"
  echo "Use letters, numbers, and underscore only."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found."
  exit 1
fi

if ! docker compose exec -T db true >/dev/null 2>&1; then
  echo "Database container is not running."
  echo "Start it with: pnpm db:up"
  exit 1
fi

round_trip_mode="false"
if [[ -z "$dump_file" ]]; then
  round_trip_mode="true"
  backup_output="$(bash "$ROOT_DIR/scripts/db-backup.sh" "$ROOT_DIR/backups")"
  echo "$backup_output"
  dump_file="$(printf '%s\n' "$backup_output" | awk -F': ' '/^File: / {print $2}' | tail -n1)"
  if [[ -z "$dump_file" ]]; then
    echo "Could not determine backup file path from db-backup output."
    exit 1
  fi
fi

if [[ ! -f "$dump_file" ]]; then
  echo "Dump file not found: $dump_file"
  exit 1
fi

get_table_counts() {
  local db_name="$1"
  docker compose exec -T db psql -U fincherry -d "$db_name" -At -v ON_ERROR_STOP=1 <<'SQL'
CREATE TEMP TABLE _fincherry_counts(table_name text, row_count bigint);
DO $do$
DECLARE
  r record;
  c bigint;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO c;
    INSERT INTO _fincherry_counts(table_name, row_count) VALUES (r.tablename, c);
  END LOOP;
END
$do$;
SELECT table_name || ':' || row_count FROM _fincherry_counts ORDER BY table_name;
DROP TABLE _fincherry_counts;
SQL
}

echo "[1/5] Restoring dump to verification DB: $target_db"
bash "$ROOT_DIR/scripts/db-restore.sh" -- "$dump_file" "$target_db" --replace-target >/dev/null
echo "      PASS"

echo "[2/5] Collecting restored database table counts"
declare -A restored_counts=()
restored_counts_output="$(get_table_counts "$target_db")"
while IFS=: read -r table_name row_count; do
  [[ -z "${table_name:-}" ]] && continue
  restored_counts["$table_name"]="$row_count"
done <<<"$restored_counts_output"
echo "      PASS (${#restored_counts[@]} public tables)"

echo "[3/5] Checking required tables"
required_tables=(accounts categories transactions)
missing_required=()
for table in "${required_tables[@]}"; do
  if [[ ! -v restored_counts["$table"] ]]; then
    missing_required+=("$table")
  fi
done

if [[ ${#missing_required[@]} -gt 0 ]]; then
  echo "      FAIL (missing: ${missing_required[*]})"
  exit 1
fi
echo "      PASS"

echo "[4/5] Verifying representative row counts"
for table in "${required_tables[@]}"; do
  echo "      - $table: ${restored_counts[$table]}"
done
echo "      PASS"

if [[ "$round_trip_mode" == "true" ]]; then
  echo "[5/5] Comparing source vs restored row counts (round-trip)"
  declare -A source_counts=()
  source_counts_output="$(get_table_counts "fincherry")"
  while IFS=: read -r table_name row_count; do
    [[ -z "${table_name:-}" ]] && continue
    source_counts["$table_name"]="$row_count"
  done <<<"$source_counts_output"

  mismatches=()

  for table in "${!source_counts[@]}"; do
    if [[ ! -v restored_counts["$table"] ]]; then
      mismatches+=("$table missing in restored")
      continue
    fi

    if [[ "${source_counts[$table]}" != "${restored_counts[$table]}" ]]; then
      mismatches+=("$table source=${source_counts[$table]} restored=${restored_counts[$table]}")
    fi
  done

  for table in "${!restored_counts[@]}"; do
    if [[ ! -v source_counts["$table"] ]]; then
      mismatches+=("$table exists only in restored")
    fi
  done

  if [[ ${#mismatches[@]} -gt 0 ]]; then
    echo "      FAIL"
    echo "      Mismatches:"
    for item in "${mismatches[@]}"; do
      echo "      - $item"
    done
    echo
    echo "Verification database kept for inspection: $target_db"
    exit 1
  fi
  echo "      PASS"
else
  echo "[5/5] Source-vs-restore comparison skipped (external dump provided)"
  echo "      PASS"
fi

if [[ "$keep_db" == "true" ]]; then
  echo "Keeping verification database for inspection: $target_db"
else
  docker compose exec -T db psql -U fincherry -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$target_db\";" >/dev/null
  echo "Dropped verification database: $target_db"
fi

echo
echo "Restore verification PASSED."
echo "Dump checked: $dump_file"
