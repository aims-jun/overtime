#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: DATABASE_PATH=/path/db.sqlite BACKUP_DIR=/path/backups ./docker/backup.sh

Optional:
  SKIP_UPLOAD=1            Do not upload to Cloud Storage.
  BACKUP_BUCKET=name       Upload to gs://name/ when SKIP_UPLOAD is not 1.
  BACKUP_RETENTION_DAYS=14 Delete local backups older than this many days.
EOF
  exit 0
fi

: "${DATABASE_PATH:?DATABASE_PATH is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

if [[ ! -f "$DATABASE_PATH" ]]; then
  echo "database does not exist: $DATABASE_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/overtime-$timestamp.sqlite"

sqlite3 "$DATABASE_PATH" ".backup '$target'"
if [[ "$(sqlite3 "$target" 'PRAGMA integrity_check;')" != "ok" ]]; then
  rm -f "$target"
  echo 'backup integrity check failed' >&2
  exit 1
fi
chmod 600 "$target"

if [[ "${SKIP_UPLOAD:-0}" != "1" ]]; then
  : "${BACKUP_BUCKET:?BACKUP_BUCKET is required unless SKIP_UPLOAD=1}"
  gcloud storage cp "$target" "gs://$BACKUP_BUCKET/"
fi

retention_days="${BACKUP_RETENTION_DAYS:-14}"
if [[ ! "$retention_days" =~ ^[0-9]+$ ]]; then
  echo 'BACKUP_RETENTION_DAYS must be a non-negative integer' >&2
  exit 1
fi
find "$BACKUP_DIR" -type f -name 'overtime-*.sqlite' \
  -mtime "+$retention_days" -delete

echo "$target"
