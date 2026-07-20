#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: POSTGRES_BACKUP_PASSWORD=secret ./docker/postgres-backup.sh

Creates a validated PostgreSQL custom-format archive and its checksum and
metadata. COMPOSE_ENV_FILE, COMPOSE_FILE, and BACKUP_DIR may override the
/opt/overtime defaults.
EOF
  exit 0
fi

: "${POSTGRES_BACKUP_PASSWORD:?POSTGRES_BACKUP_PASSWORD is required}"

COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-/opt/overtime/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/overtime/compose.production.yaml}"
BACKUP_DIR="${BACKUP_DIR:-/data/overtime/postgres-backups}"

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="overtime-$timestamp.dump"
target_dump="$BACKUP_DIR/$archive"
target_checksum="$target_dump.sha256"
target_metadata="$BACKUP_DIR/overtime-$timestamp.metadata"
temporary_dump="$(mktemp "$BACKUP_DIR/.${archive}.tmp.XXXXXX")"
temporary_checksum="$(mktemp "$BACKUP_DIR/.${archive}.sha256.tmp.XXXXXX")"
temporary_metadata="$(mktemp "$BACKUP_DIR/.overtime-$timestamp.metadata.tmp.XXXXXX")"

cleanup_temporary() {
  rm -f "$temporary_dump" "$temporary_checksum" "$temporary_metadata"
}
trap cleanup_temporary EXIT

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" \
  exec -T -e PGPASSWORD="$POSTGRES_BACKUP_PASSWORD" postgres \
  pg_dump --username overtime_backup --dbname overtime \
  --format=custom --no-owner --no-acl > "$temporary_dump"

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" \
  exec -T postgres pg_restore --list < "$temporary_dump" >/dev/null

postgres_version="$({
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" \
    exec -T -e PGPASSWORD="$POSTGRES_BACKUP_PASSWORD" postgres \
    psql --username overtime_backup --dbname overtime --tuples-only --no-align \
    --command="SELECT current_setting('server_version');"
} | tr -d '[:space:]')"
postgres_major_minor="$(printf '%s\n' "$postgres_version" | sed -E 's/^([0-9]+\.[0-9]+).*/\1/')"
if [[ ! "$postgres_major_minor" =~ ^[0-9]+\.[0-9]+$ ]]; then
  echo 'could not determine PostgreSQL major/minor version' >&2
  exit 1
fi

checksum_value="$(sha256sum "$temporary_dump" | awk '{print $1}')"
printf '%s  %s\n' "$checksum_value" "$archive" > "$temporary_checksum"
printf 'timestamp_utc=%s\npostgres_version=%s\narchive=%s\n' \
  "$timestamp" "$postgres_major_minor" "$archive" > "$temporary_metadata"
chmod 600 "$temporary_dump" "$temporary_checksum" "$temporary_metadata"

mv "$temporary_dump" "$target_dump"
mv "$temporary_checksum" "$target_checksum"
mv "$temporary_metadata" "$target_metadata"
trap - EXIT

printf '%s\n' "$target_dump"
