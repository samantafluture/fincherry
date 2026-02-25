#!/bin/bash
set -e

# ── FinCherry ────────────────────────────────────────────────────────────
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    CREATE USER fincherry WITH PASSWORD '${FINCHERRY_DB_PASSWORD}';
    CREATE DATABASE fincherry OWNER fincherry;
    GRANT ALL PRIVILEGES ON DATABASE fincherry TO fincherry;
EOSQL

# ── Future projects (uncomment when needed) ──────────────────────────────
# psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
#     CREATE USER surpride WITH PASSWORD '${SURPRIDE_DB_PASSWORD}';
#     CREATE DATABASE surpride OWNER surpride;
#     GRANT ALL PRIVILEGES ON DATABASE surpride TO surpride;
# EOSQL

# psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
#     CREATE USER devtwin WITH PASSWORD '${DEVTWIN_DB_PASSWORD}';
#     CREATE DATABASE devtwin OWNER devtwin;
#     GRANT ALL PRIVILEGES ON DATABASE devtwin TO devtwin;
# EOSQL
