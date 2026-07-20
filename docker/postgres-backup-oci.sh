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

uploaded_names=()
rollback_uploaded() {
  local rollback_failed=0
  local index
  for ((index=${#uploaded_names[@]} - 1; index >= 0; index--)); do
    if ! oci os object delete \
      --auth instance_principal \
      --bucket-name "$OCI_BACKUP_BUCKET" \
      --name "${uploaded_names[index]}" \
      --force >/dev/null; then
      echo "OCI rollback failed for ${uploaded_names[index]}" >&2
      rollback_failed=1
    fi
  done
  return "$rollback_failed"
}

# Metadata is uploaded last and acts as the remote set's commit marker.
for artifact in "$target_dump" "$target_checksum" "$target_metadata"; do
  object_name="postgres/$(basename "$artifact")"
  if ! oci os object put \
    --auth instance_principal \
    --bucket-name "$OCI_BACKUP_BUCKET" \
    --name "$object_name" \
    --file "$artifact" \
    --force >/dev/null; then
    echo "OCI upload failed for $object_name; rolling back uploaded objects" >&2
    if ! rollback_uploaded; then
      echo 'OCI upload rollback incomplete; manual object cleanup is required' >&2
    fi
    exit 1
  fi
  uploaded_names+=("$object_name")
done

find "$BACKUP_DIR" -type f -name 'overtime-*.dump*' -mtime +2 -delete
find "$BACKUP_DIR" -type f -name 'overtime-*.metadata' -mtime +2 -delete

printf '%s\n' "$target_dump"
