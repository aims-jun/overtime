#!/usr/bin/env bash
set -euo pipefail

readonly SETUP_ENV="apps/api/test/setup-env.ts"
readonly GLOBAL_SETUP="apps/api/test/postgres-global-setup.ts"

if rg -q 'SQLITE_SOURCE_PATH' "${SETUP_ENV}"; then
  echo "E2E environment must not define SQLITE_SOURCE_PATH" >&2
  exit 1
fi

if ! rg -Fq 'const databaseUrl = process.env.DATABASE_MIGRATION_URL' \
  "${GLOBAL_SETUP}" ||
  ! rg -Fq 'createMigrationDataSource(databaseUrl)' "${GLOBAL_SETUP}"; then
  echo "PostgreSQL global setup must pass DATABASE_MIGRATION_URL explicitly" >&2
  exit 1
fi
