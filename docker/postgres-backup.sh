#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: POSTGRES_BACKUP_PASSWORD=secret ./docker/postgres-backup.sh

Creates a validated PostgreSQL custom-format archive and its checksum and
metadata. COMPOSE_ENV_FILE, COMPOSE_FILE, and BACKUP_DIR may override the
/opt/overtime defaults. A backup set is committed only by its .metadata file;
consumers must enumerate markers and validate their referenced payloads.
EOF
  exit 0
fi

: "${POSTGRES_BACKUP_PASSWORD:?POSTGRES_BACKUP_PASSWORD is required}"

COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-/opt/overtime/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/overtime/compose.production.yaml}"
BACKUP_DIR="${BACKUP_DIR:-/data/overtime/postgres-backups}"

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ID="${RUN_ID:-$(openssl rand -hex 8)}"
if [[ ! "$RUN_ID" =~ ^[0-9a-f]{16}$ ]]; then
  echo 'RUN_ID must be exactly 16 lowercase hexadecimal characters' >&2
  exit 1
fi
archive="overtime-$timestamp.dump"
target_dump="$BACKUP_DIR/$archive"
target_checksum="$target_dump.sha256"
target_metadata="$BACKUP_DIR/overtime-$timestamp.metadata"
publish_lock="$BACKUP_DIR/.overtime-$timestamp.publish"
if ! mkdir "$publish_lock"; then
  echo "backup publication already exists for timestamp: $timestamp" >&2
  exit 1
fi
if [[ -e "$target_dump" || -e "$target_checksum" || -e "$target_metadata" ]]; then
  rmdir "$publish_lock"
  echo "backup artifact already exists for timestamp: $timestamp" >&2
  exit 1
fi
temporary_dump="$(mktemp "$BACKUP_DIR/.${archive}.tmp.XXXXXX")"
temporary_checksum="$(mktemp "$BACKUP_DIR/.${archive}.sha256.tmp.XXXXXX")"
temporary_metadata="$(mktemp "$BACKUP_DIR/.overtime-$timestamp.metadata.tmp.XXXXXX")"
publication_started=0
publication_complete=0

cleanup_temporary() {
  rm -f "$temporary_dump" "$temporary_checksum" "$temporary_metadata"
  if [[ "$publication_started" == 1 && "$publication_complete" != 1 ]]; then
    rm -f "$target_dump" "$target_checksum" "$target_metadata"
  fi
  rmdir "$publish_lock" 2>/dev/null || true
}
trap cleanup_temporary EXIT

source_counts() {
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" \
    exec -T postgres sh -c \
    'export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"; exec psql --username overtime_backup --dbname overtime --tuples-only --no-align --command="SELECT (SELECT COUNT(*) FROM users) || '\''|'\'' || (SELECT COUNT(*) FROM overtime_records);"'
}

# Bound the dump with identical read-only counts. This is not a shared snapshot,
# so any count change during pg_dump aborts publication instead of recording a
# misleading baseline in the commit marker.
counts_before="$(source_counts | tr -d '[:space:]')"
if [[ ! "$counts_before" =~ ^[0-9]+\|[0-9]+$ ]]; then
  echo 'could not determine source users/overtime_records counts' >&2
  exit 1
fi

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" \
  exec -T postgres sh -c \
  'export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"; exec pg_dump --username overtime_backup --dbname overtime --format=custom --no-owner --no-acl' \
  > "$temporary_dump"

counts_after="$(source_counts | tr -d '[:space:]')"
if [[ "$counts_after" != "$counts_before" ]]; then
  echo 'source counts changed while creating the PostgreSQL dump' >&2
  exit 1
fi
IFS='|' read -r users_count overtime_records_count <<< "$counts_before"

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" \
  exec -T postgres pg_restore --list < "$temporary_dump" >/dev/null

postgres_version="$({
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" \
    exec -T postgres sh -c \
    'export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"; exec psql --username overtime_backup --dbname overtime --tuples-only --no-align --command="SELECT current_setting('\''server_version'\'');"'
} | tr -d '[:space:]')"
postgres_major_minor="$(printf '%s\n' "$postgres_version" | sed -E 's/^([0-9]+\.[0-9]+).*/\1/')"
if [[ ! "$postgres_major_minor" =~ ^[0-9]+\.[0-9]+$ ]]; then
  echo 'could not determine PostgreSQL major/minor version' >&2
  exit 1
fi

checksum_value="$(sha256sum "$temporary_dump" | awk '{print $1}')"
printf '%s  %s\n' "$checksum_value" "$archive" > "$temporary_checksum"
remote_prefix="postgres/overtime-$timestamp-$RUN_ID"
printf 'timestamp_utc=%s\npostgres_version=%s\narchive=%s\nrun_id=%s\nremote_dump_key=%s.dump\nremote_checksum_key=%s.dump.sha256\nremote_metadata_key=%s.metadata\nusers_count=%s\novertime_records_count=%s\n' \
  "$timestamp" "$postgres_major_minor" "$archive" "$RUN_ID" \
  "$remote_prefix" "$remote_prefix" "$remote_prefix" \
  "$users_count" "$overtime_records_count" > "$temporary_metadata"
chmod 600 "$temporary_dump" "$temporary_checksum" "$temporary_metadata"

publication_started=1
mv "$temporary_dump" "$target_dump"
mv "$temporary_checksum" "$target_checksum"
# Metadata is the commit marker: a local set is valid only after this final move.
mv "$temporary_metadata" "$target_metadata"
publication_complete=1
cleanup_temporary
trap - EXIT

printf '%s\n' "$target_dump"
