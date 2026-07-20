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

metadata_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$target_metadata"
}

timestamp="$(metadata_value timestamp_utc)"
run_id="$(metadata_value run_id)"
remote_dump_key="$(metadata_value remote_dump_key)"
remote_checksum_key="$(metadata_value remote_checksum_key)"
remote_metadata_key="$(metadata_value remote_metadata_key)"
if [[ ! "$timestamp" =~ ^[0-9]{8}T[0-9]{6}Z$ || ! "$run_id" =~ ^[0-9a-f]{16}$ ]]; then
  echo 'backup metadata has an invalid timestamp or run ID' >&2
  exit 1
fi
remote_prefix="postgres/overtime-$timestamp-$run_id"
if [[ "$remote_dump_key" != "$remote_prefix.dump" ||
      "$remote_checksum_key" != "$remote_prefix.dump.sha256" ||
      "$remote_metadata_key" != "$remote_prefix.metadata" ]]; then
  echo 'backup metadata contains inconsistent remote object keys' >&2
  exit 1
fi

artifacts=("$target_dump" "$target_checksum" "$target_metadata")
object_names=("$remote_dump_key" "$remote_checksum_key" "$remote_metadata_key")
collision_found=0
for object_name in "${object_names[@]}"; do
  if head_error="$(oci os object head \
    --auth instance_principal \
    --bucket-name "$OCI_BACKUP_BUCKET" \
    --name "$object_name" 2>&1)"; then
    echo "OCI backup key collision: $object_name" >&2
    collision_found=1
  elif [[ ! "$head_error" =~ 404|ObjectNotFound|NotFound ]]; then
    echo "OCI preflight failed for $object_name: $head_error" >&2
    exit 1
  fi
done
if [[ "$collision_found" == 1 ]]; then
  echo 'OCI backup aborted before upload because one or more keys already exist' >&2
  exit 1
fi

attempted_names=()
rollback_uploaded() {
  local rollback_failed=0
  local index
  for ((index=${#attempted_names[@]} - 1; index >= 0; index--)); do
    if ! oci os object delete \
      --auth instance_principal \
      --bucket-name "$OCI_BACKUP_BUCKET" \
      --name "${attempted_names[index]}" \
      --force >/dev/null; then
      echo "OCI rollback failed for ${attempted_names[index]}" >&2
      rollback_failed=1
    fi
  done
  return "$rollback_failed"
}

# Metadata is uploaded last and acts as the remote set's commit marker.
for index in "${!artifacts[@]}"; do
  artifact="${artifacts[index]}"
  object_name="${object_names[index]}"
  attempted_names+=("$object_name")
  if ! oci os object put \
    --auth instance_principal \
    --bucket-name "$OCI_BACKUP_BUCKET" \
    --name "$object_name" \
    --file "$artifact" \
    --no-overwrite >/dev/null; then
    echo "OCI upload failed for $object_name; rolling back uploaded objects" >&2
    if ! rollback_uploaded; then
      echo 'OCI upload rollback incomplete; manual object cleanup is required' >&2
    fi
    exit 1
  fi
done

find "$BACKUP_DIR" -type f -name 'overtime-*.dump*' -mtime +2 -delete
find "$BACKUP_DIR" -type f -name 'overtime-*.metadata' -mtime +2 -delete

printf '%s\n' "$target_dump"
