#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: ./docker/postgres-restore-drill.sh

Restores the newest committed local PostgreSQL backup into a temporary database,
verifies it, and always drops that temporary database. Set RESTORE_METADATA_OBJECT
to an exact OCI .metadata key (and OCI_BACKUP_BUCKET) to drill a remote backup.
RESTORE_DATABASE may be set only to overtime_restore_drill_<UTC digits>.
EOF
  exit 0
fi

COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-/opt/overtime/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/overtime/compose.production.yaml}"
BACKUP_DIR="${BACKUP_DIR:-/data/overtime/postgres-backups}"
RESTORE_DATABASE="${RESTORE_DATABASE:-overtime_restore_drill_$(date -u +%Y%m%d%H%M%S)}"

if [[ "$RESTORE_DATABASE" == overtime || ! "$RESTORE_DATABASE" =~ ^overtime_restore_drill_[0-9]+$ ]]; then
  echo "refusing unsafe restore database: $RESTORE_DATABASE" >&2
  exit 1
fi

compose=(docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE")
download_dir=''
database_created=0

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$database_created" == 1 ]]; then
    if ! "${compose[@]}" exec -T postgres sh -c \
      'exec dropdb --if-exists --username "$POSTGRES_USER" "$1"' sh "$RESTORE_DATABASE"; then
      echo "failed to drop restore drill database: $RESTORE_DATABASE" >&2
      status=1
    fi
  fi
  if [[ -n "$download_dir" ]]; then
    rm -rf "$download_dir"
  fi
  exit "$status"
}
trap cleanup EXIT

metadata_value() {
  local key="$1"
  local file="$2"
  local count value
  count="$(grep -c "^${key}=" "$file" || true)"
  if [[ "$count" != 1 ]]; then
    echo "backup metadata must contain exactly one $key" >&2
    return 1
  fi
  value="$(sed -n "s/^${key}=//p" "$file")"
  printf '%s\n' "$value"
}

select_local_marker() {
  local marker
  marker="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'overtime-*.metadata' -print | LC_ALL=C sort | tail -1)"
  if [[ -z "$marker" ]]; then
    echo "no committed PostgreSQL backup metadata found in $BACKUP_DIR" >&2
    return 1
  fi
  printf '%s\n' "$marker"
}

if [[ -n "${RESTORE_METADATA_OBJECT:-}" ]]; then
  : "${OCI_BACKUP_BUCKET:?OCI_BACKUP_BUCKET is required with RESTORE_METADATA_OBJECT}"
  if [[ ! "$RESTORE_METADATA_OBJECT" =~ ^postgres/overtime-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}\.metadata$ ]]; then
    echo 'RESTORE_METADATA_OBJECT must be an exact unique PostgreSQL metadata key' >&2
    exit 1
  fi
  download_dir="$(mktemp -d)"
  metadata="$download_dir/$(basename "$RESTORE_METADATA_OBJECT")"
  oci os object get --auth instance_principal --bucket-name "$OCI_BACKUP_BUCKET" \
    --name "$RESTORE_METADATA_OBJECT" --file "$metadata" >/dev/null
else
  metadata="$(select_local_marker)"
fi

timestamp="$(metadata_value timestamp_utc "$metadata")"
archive_name="$(metadata_value archive "$metadata")"
run_id="$(metadata_value run_id "$metadata")"
remote_dump_key="$(metadata_value remote_dump_key "$metadata")"
remote_checksum_key="$(metadata_value remote_checksum_key "$metadata")"
remote_metadata_key="$(metadata_value remote_metadata_key "$metadata")"
metadata_users="$(metadata_value users_count "$metadata")"
metadata_records="$(metadata_value overtime_records_count "$metadata")"

if [[ ! "$timestamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ||
      ! "$run_id" =~ ^[0-9a-f]{16}$ ||
      "$archive_name" != "overtime-$timestamp.dump" ]]; then
  echo 'backup metadata has an invalid timestamp, run ID, or archive reference' >&2
  exit 1
fi
if [[ ! "$metadata_users" =~ ^[0-9]+$ || ! "$metadata_records" =~ ^[0-9]+$ ]]; then
  echo 'backup metadata has invalid source counts' >&2
  exit 1
fi
remote_prefix="postgres/overtime-$timestamp-$run_id"
if [[ "$remote_dump_key" != "$remote_prefix.dump" ||
      "$remote_checksum_key" != "$remote_prefix.dump.sha256" ||
      "$remote_metadata_key" != "$remote_prefix.metadata" ]]; then
  echo 'backup metadata contains inconsistent remote object keys' >&2
  exit 1
fi

if [[ -n "${RESTORE_METADATA_OBJECT:-}" ]]; then
  if [[ "$remote_metadata_key" != "$RESTORE_METADATA_OBJECT" ]]; then
    echo 'downloaded metadata does not identify the requested OCI marker' >&2
    exit 1
  fi
  archive="$download_dir/$archive_name"
  checksum="$download_dir/$archive_name.sha256"
  oci os object get --auth instance_principal --bucket-name "$OCI_BACKUP_BUCKET" \
    --name "$remote_dump_key" --file "$archive" >/dev/null
  oci os object get --auth instance_principal --bucket-name "$OCI_BACKUP_BUCKET" \
    --name "$remote_checksum_key" --file "$checksum" >/dev/null
else
  expected_marker="$BACKUP_DIR/overtime-$timestamp.metadata"
  if [[ "$metadata" != "$expected_marker" ]]; then
    echo 'local metadata filename does not match its timestamp' >&2
    exit 1
  fi
  archive="$BACKUP_DIR/$archive_name"
  checksum="$archive.sha256"
fi

if [[ ! -f "$archive" || ! -f "$checksum" ]]; then
  echo 'backup marker references a missing dump or checksum' >&2
  exit 1
fi

checksum_line="$(cat "$checksum")"
checksum_hash=''
checksum_filename=''
checksum_extra=''
read -r checksum_hash checksum_filename checksum_extra <<< "$checksum_line"
if [[ ! "$checksum_hash" =~ ^[0-9a-f]{64}$ ||
      "$checksum_filename" != "$archive_name" ||
      -n "$checksum_extra" ]]; then
  echo 'backup checksum does not reference the exact marker archive' >&2
  exit 1
fi
(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$checksum")") >/dev/null

# Archive structure is checked before any database is created.
"${compose[@]}" exec -T postgres pg_restore --list < "$archive" >/dev/null

"${compose[@]}" exec -T postgres sh -c \
  'exec createdb --username "$POSTGRES_USER" --owner overtime_migrator "$1"' \
  sh "$RESTORE_DATABASE"
database_created=1

"${compose[@]}" exec -T postgres sh -c \
  'exec pg_restore --exit-on-error --no-owner --no-acl --username "$POSTGRES_USER" --dbname "$1"' \
  sh "$RESTORE_DATABASE" < "$archive"

latest_migration="$("${compose[@]}" exec -T postgres sh -c \
  'exec psql --username "$POSTGRES_USER" --dbname "$1" --tuples-only --no-align --command="SELECT COUNT(*) || '\''|'\'' || COALESCE((SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1), '\'''\'') FROM migrations;"' \
  sh "$RESTORE_DATABASE" | tr -d '[:space:]')"
if [[ ! "$latest_migration" =~ ^[1-9][0-9]*\|[A-Za-z0-9_]+$ ]]; then
  echo 'restore drill migration table is missing or empty' >&2
  exit 1
fi
EXPECTED_LATEST_MIGRATION="${EXPECTED_LATEST_MIGRATION:-InitialSchema1752360000000}"
if [[ "$latest_migration" != *"|$EXPECTED_LATEST_MIGRATION" ]]; then
  echo 'restore drill latest migration does not match expectation' >&2
  exit 1
fi

counts="$("${compose[@]}" exec -T postgres sh -c \
  'exec psql --username "$POSTGRES_USER" --dbname "$1" --tuples-only --no-align --command="SELECT (SELECT COUNT(*) FROM users) || '\''|'\'' || (SELECT COUNT(*) FROM overtime_records);"' \
  sh "$RESTORE_DATABASE" | tr -d '[:space:]')"
if [[ ! "$counts" =~ ^[0-9]+\|[0-9]+$ ]]; then
  echo 'restore drill could not read users/overtime_records archive counts' >&2
  exit 1
fi
if [[ "$counts" != "$metadata_users|$metadata_records" ]]; then
  echo 'restore drill archive counts do not match metadata baseline' >&2
  exit 1
fi

orphan_count="$("${compose[@]}" exec -T postgres sh -c \
  'exec psql --username "$POSTGRES_USER" --dbname "$1" --tuples-only --no-align --command="SELECT COUNT(*) FROM overtime_records r LEFT JOIN users u ON u.id = r.user_id WHERE u.id IS NULL;"' \
  sh "$RESTORE_DATABASE" | tr -d '[:space:]')"
if [[ "$orphan_count" != 0 ]]; then
  echo "restore drill found orphan overtime records: $orphan_count" >&2
  exit 1
fi

report_result="$("${compose[@]}" exec -T postgres sh -c \
  'exec psql --username "$POSTGRES_USER" --dbname "$1" --tuples-only --no-align --command="SELECT COUNT(*) || '\''|'\'' || COALESCE(SUM(duration_minutes), 0) FROM overtime_records;"' \
  sh "$RESTORE_DATABASE" | tr -d '[:space:]')"
if [[ ! "$report_result" =~ ^[0-9]+\|[0-9]+$ ]]; then
  echo 'restore drill basic report aggregation failed' >&2
  exit 1
fi

printf 'restore drill passed: database=%s users_records=%s report=%s\n' \
  "$RESTORE_DATABASE" "$counts" "$report_result"
