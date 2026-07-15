#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: DATABASE_PATH=/path/db.sqlite BACKUP_DIR=/path/backups OCI_BACKUP_BUCKET=bucket ./docker/backup-oci.sh

Creates and verifies a local SQLite backup, then uploads it with an OCI
instance principal. BACKUP_RETENTION_DAYS defaults to 30.
EOF
  exit 0
fi

: "${DATABASE_PATH:?DATABASE_PATH is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${OCI_BACKUP_BUCKET:?OCI_BACKUP_BUCKET is required}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target="$(
  DATABASE_PATH="$DATABASE_PATH" \
  BACKUP_DIR="$BACKUP_DIR" \
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}" \
  SKIP_UPLOAD=1 \
    "$root/backup.sh"
)"

oci os object put \
  --auth instance_principal \
  --bucket-name "$OCI_BACKUP_BUCKET" \
  --name "$(basename "$target")" \
  --file "$target" \
  --force >/dev/null

echo "$target"
