#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: POSTGRES_BACKUP_PASSWORD=secret OCI_BACKUP_BUCKET=bucket ./docker/postgres-backup-oci.sh

Creates a validated local PostgreSQL backup, uploads its dump, checksum, and
metadata with an OCI instance principal, then removes local artifacts older
than two days.
EOF
  exit 0
fi

: "${OCI_BACKUP_BUCKET:?OCI_BACKUP_BUCKET is required}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/data/overtime/postgres-backups}"

target_dump="$(BACKUP_DIR="$BACKUP_DIR" "$root/postgres-backup.sh")"
target_checksum="$target_dump.sha256"
target_metadata="${target_dump%.dump}.metadata"

(cd "$BACKUP_DIR" && sha256sum -c "$(basename "$target_checksum")") >/dev/null

for artifact in "$target_dump" "$target_checksum" "$target_metadata"; do
  oci os object put \
    --auth instance_principal \
    --bucket-name "$OCI_BACKUP_BUCKET" \
    --name "postgres/$(basename "$artifact")" \
    --file "$artifact" \
    --force >/dev/null
done

find "$BACKUP_DIR" -type f -name 'overtime-*.dump*' -mtime +2 -delete
find "$BACKUP_DIR" -type f -name 'overtime-*.metadata' -mtime +2 -delete

printf '%s\n' "$target_dump"
