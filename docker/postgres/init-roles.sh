#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"
: "${POSTGRES_MIGRATION_PASSWORD:?POSTGRES_MIGRATION_PASSWORD must be set}"
: "${POSTGRES_RUNTIME_PASSWORD:?POSTGRES_RUNTIME_PASSWORD must be set}"
: "${POSTGRES_BACKUP_PASSWORD:?POSTGRES_BACKUP_PASSWORD must be set}"

psql \
  --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set="database_name=$POSTGRES_DB" \
  --set="migrator_password=$POSTGRES_MIGRATION_PASSWORD" \
  --set="runtime_password=$POSTGRES_RUNTIME_PASSWORD" \
  --set="backup_password=$POSTGRES_BACKUP_PASSWORD" <<'SQL'
BEGIN;

CREATE ROLE overtime_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  PASSWORD :'migrator_password';
CREATE ROLE overtime_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  PASSWORD :'runtime_password';
CREATE ROLE overtime_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  PASSWORD :'backup_password';

ALTER DATABASE :"database_name" OWNER TO overtime_migrator;
ALTER SCHEMA public OWNER TO overtime_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT CONNECT ON DATABASE :"database_name" TO overtime_app, overtime_backup;
GRANT USAGE ON SCHEMA public TO overtime_app, overtime_backup;

ALTER DEFAULT PRIVILEGES FOR ROLE overtime_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO overtime_app;
ALTER DEFAULT PRIVILEGES FOR ROLE overtime_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO overtime_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE overtime_migrator IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO overtime_backup;

COMMIT;
SQL
