#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="$root/compose.test.yaml"
compose_project="overtime-rehearsal-test-$$"
postgres_port="${REHEARSAL_POSTGRES_PORT:-55433}"
database_url="${DATABASE_MIGRATION_URL:-postgresql://overtime_test:overtime_test@127.0.0.1:${postgres_port}/overtime_test}"
api_port="${REHEARSAL_API_PORT:-33109}"

if [[ $# != 1 ]]; then
  echo 'usage: postgres-migration-rehearsal.sh <local-test-sqlite-path>' >&2
  exit 2
fi

source_input="$1"
if [[ "$source_input" == /data/overtime/overtime.sqlite ]]; then
  echo 'refusing production SQLite source path' >&2
  exit 1
fi
if [[ ! -f "$source_input" || -L "$source_input" ]]; then
  echo 'SQLite source must be a regular, non-symlink local file' >&2
  exit 1
fi
source_dir="$(cd "$(dirname "$source_input")" && pwd -P)"
source_path="$source_dir/$(basename "$source_input")"
case "$source_path" in
  "$root"/*|"${TMPDIR:-/tmp}"/*|/tmp/*|/private/tmp/*|/private/var/folders/*) ;;
  *)
    echo 'SQLite source must be a workspace fixture or temporary local copy' >&2
    exit 1
    ;;
esac

case "$database_url" in
  postgres://*|postgresql://*) ;;
  *) echo 'rehearsal target must be a PostgreSQL URL' >&2; exit 1 ;;
esac
if [[ "$database_url" == *\?* ]]; then
  echo 'refusing PostgreSQL URL query parameters' >&2
  exit 1
fi
url_remainder="${database_url#*://}"
authority="${url_remainder%%/*}"
if [[ "$authority" == "$url_remainder" ]]; then
  echo 'rehearsal target URL must include a database name' >&2
  exit 1
fi
host_port="${authority##*@}"
target_host="${host_port%%:*}"
target_port="${host_port##*:}"
database_path="${url_remainder#*/}"
target_database="${database_path%%\?*}"
case "$target_host" in
  127.0.0.1|localhost|postgres-test) ;;
  *) echo 'refusing nonlocal PostgreSQL target' >&2; exit 1 ;;
esac
if [[ "$target_database" != *test* && "$target_database" != *rehearsal* ]]; then
  echo 'refusing PostgreSQL database without a test-only name' >&2
  exit 1
fi
if [[ ! "$postgres_port" =~ ^[0-9]+$ || "$postgres_port" -lt 1024 || "$postgres_port" -gt 65535 ]]; then
  echo 'REHEARSAL_POSTGRES_PORT must be a non-privileged TCP port' >&2
  exit 1
fi
if [[ "$target_port" != "$postgres_port" ]]; then
  echo 'rehearsal PostgreSQL URL port must match REHEARSAL_POSTGRES_PORT' >&2
  exit 1
fi
if [[ ! "$api_port" =~ ^[0-9]+$ || "$api_port" -lt 1024 || "$api_port" -gt 65535 ]]; then
  echo 'REHEARSAL_API_PORT must be a non-privileged TCP port' >&2
  exit 1
fi

for command in sqlite3 sha256sum docker npm curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "required rehearsal command is unavailable: $command" >&2
    exit 1
  fi
done

export POSTGRES_TEST_PORT="$postgres_port"

work_dir="$(mktemp -d)"
sqlite_backup="$work_dir/source-backup.sqlite"
archive="$work_dir/rehearsal.dump"
restore_database="overtime_rehearsal_restore_$(date -u +%Y%m%d%H%M%S)$$"
compose_cleanup_required=0
api_pid=''
restore_created=0
cleanup_reported=0
compose=(docker compose -p "$compose_project" -f "$compose_file")

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$cleanup_reported" == 0 ]]; then
    printf '8/8 test-only cleanup\n'
    cleanup_reported=1
  fi
  if [[ -n "$api_pid" ]]; then
    kill "$api_pid" >/dev/null 2>&1 || true
    wait "$api_pid" >/dev/null 2>&1 || true
  fi
  if [[ "$restore_created" == 1 ]]; then
    if ! "${compose[@]}" exec -T postgres-test dropdb --if-exists \
      --username overtime_test "$restore_database" >/dev/null; then
      echo 'failed to drop temporary rehearsal restore database' >&2
      status=1
    fi
  fi
  if [[ "$compose_cleanup_required" == 1 ]]; then
    if ! "${compose[@]}" down -v >/dev/null; then
      echo 'failed to tear down isolated rehearsal Compose project' >&2
      status=1
    fi
  fi
  rm -rf "$work_dir"
  exit "$status"
}
trap cleanup EXIT

printf '1/8 SQLite backup\n'
sqlite3 "$source_path" ".backup '$sqlite_backup'"

printf '2/8 SQLite integrity\n'
integrity="$(sqlite3 "$sqlite_backup" 'PRAGMA integrity_check;' | tr -d '[:space:]')"
if [[ "$integrity" != ok ]]; then
  echo 'SQLite backup integrity check failed' >&2
  exit 1
fi

printf '3/8 checksum and counts\n'
source_checksum="$(sha256sum "$sqlite_backup" | awk '{print $1}')"
if [[ ! "$source_checksum" =~ ^[0-9a-f]{64}$ ]]; then
  echo 'could not calculate SQLite backup SHA-256' >&2
  exit 1
fi
source_counts="$(sqlite3 "$sqlite_backup" \
  'SELECT (SELECT COUNT(*) FROM users) || '\''|'\'' || (SELECT COUNT(*) FROM overtime_records);' \
  | tr -d '[:space:]')"
if [[ ! "$source_counts" =~ ^[0-9]+\|[0-9]+$ ]]; then
  echo 'could not read safe SQLite source counts' >&2
  exit 1
fi
IFS='|' read -r source_users source_records <<< "$source_counts"
printf 'source_backup_sha256=%s\n' "$source_checksum"
printf 'source_counts users=%s overtime_records=%s\n' "$source_users" "$source_records"

compose_cleanup_required=1
"${compose[@]}" up -d --wait >/dev/null

target_table_count="$("${compose[@]}" exec -T postgres-test psql \
  --username overtime_test --dbname "$target_database" --tuples-only --no-align \
  --command="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" \
  | tr -d '[:space:]')"
if [[ "$target_table_count" != '0' ]]; then
  echo 'refusing non-empty rehearsal PostgreSQL target' >&2
  exit 1
fi

printf '4/8 PostgreSQL schema\n'
DATABASE_MIGRATION_URL="$database_url" npm run db:migrate -w apps/api

printf '5/8 data migration\n'
migration_summary="$(DATABASE_MIGRATION_URL="$database_url" \
  SQLITE_SOURCE_PATH="$sqlite_backup" npm run db:migrate:sqlite -w apps/api)"
printf '%s\n' "$migration_summary"
if [[ "$migration_summary" != *'"verification":"passed"'* ]]; then
  echo 'migration did not report deterministic verification success' >&2
  exit 1
fi

printf '6/8 deterministic verification\n'
target_result="$("${compose[@]}" exec -T postgres-test psql \
  --username overtime_test --dbname "$target_database" --tuples-only --no-align \
  --command="SELECT (SELECT COUNT(*) FROM users) || '|' || (SELECT COUNT(*) FROM overtime_records) || '|' || (SELECT COUNT(*) FROM sessions) || '|' || (SELECT COUNT(*) FROM migrations);" \
  | tr -d '[:space:]')"
if [[ ! "$target_result" =~ ^[0-9]+\|[0-9]+\|0\|[1-9][0-9]*$ ]]; then
  echo 'PostgreSQL verification returned invalid counts' >&2
  exit 1
fi
IFS='|' read -r target_users target_records target_sessions target_migrations <<< "$target_result"
if [[ "$target_users|$target_records" != "$source_counts" ]]; then
  echo 'PostgreSQL counts do not match the SQLite source' >&2
  exit 1
fi
printf 'target_counts users=%s overtime_records=%s sessions=%s migrations=%s\n' \
  "$target_users" "$target_records" "$target_sessions" "$target_migrations"

if DATABASE_MIGRATION_URL="$database_url" SQLITE_SOURCE_PATH="$sqlite_backup" \
  npm run db:migrate:sqlite -w apps/api >"$work_dir/second-migration.log" 2>&1; then
  echo 'second migration unexpectedly accepted a non-empty target' >&2
  exit 1
fi
if ! grep -F 'target is not empty' "$work_dir/second-migration.log" >/dev/null; then
  echo 'second migration failed for an unexpected reason' >&2
  exit 1
fi
printf 'second migration refused non-empty target\n'

printf '7/8 API smoke and backup restore\n'
NODE_ENV=production PORT="$api_port" \
APP_ORIGINS='https://rehearsal.invalid' \
DATABASE_URL="$database_url" \
GOOGLE_CLIENT_ID='rehearsal.apps.googleusercontent.com' \
GOOGLE_HOSTED_DOMAIN='example.invalid' \
ADMIN_EMAILS='admin@example.invalid' \
SESSION_COOKIE_NAME='overtime_rehearsal_session' \
SESSION_TTL_DAYS=1 \
SESSION_HASH_SECRET='rehearsal-only-secret-32-characters' \
npm run start:prod -w apps/api >"$work_dir/api.log" 2>&1 &
api_pid=$!
health=''
for _ in $(seq 1 50); do
  if health="$(curl --fail --silent --show-error "http://127.0.0.1:$api_port/api/health" 2>/dev/null)"; then
    break
  fi
  sleep 0.2
done
if [[ "$health" != '{"status":"ok","database":"ready"}' ]]; then
  echo 'local rehearsal API health smoke failed' >&2
  exit 1
fi

"${compose[@]}" exec -T postgres-test pg_dump --username overtime_test \
  --dbname "$target_database" --format=custom --no-owner --no-acl > "$archive"
archive_checksum="$(sha256sum "$archive" | awk '{print $1}')"
if [[ ! "$archive_checksum" =~ ^[0-9a-f]{64}$ ]]; then
  echo 'could not calculate rehearsal archive SHA-256' >&2
  exit 1
fi
"${compose[@]}" exec -T postgres-test pg_restore --list < "$archive" >/dev/null
"${compose[@]}" exec -T postgres-test createdb --username overtime_test "$restore_database"
restore_created=1
"${compose[@]}" exec -T postgres-test pg_restore --exit-on-error --no-owner --no-acl \
  --username overtime_test --dbname "$restore_database" < "$archive" >/dev/null
restore_counts="$("${compose[@]}" exec -T postgres-test psql \
  --username overtime_test --dbname "$restore_database" --tuples-only --no-align \
  --command="SELECT (SELECT COUNT(*) FROM users) || '|' || (SELECT COUNT(*) FROM overtime_records);" \
  | tr -d '[:space:]')"
if [[ "$restore_counts" != "$source_counts" ]]; then
  echo 'restored rehearsal archive counts do not match the SQLite source' >&2
  exit 1
fi
printf 'postgres_backup_sha256=%s\n' "$archive_checksum"
printf 'backup restore verified users=%s overtime_records=%s\n' "$source_users" "$source_records"

printf 'rehearsal passed\n'
