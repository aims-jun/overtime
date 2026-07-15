#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

sqlite3 "$tmp/source.sqlite" \
  'CREATE TABLE probe(value TEXT); INSERT INTO probe VALUES("kept");'

DATABASE_PATH="$tmp/source.sqlite" \
BACKUP_DIR="$tmp/backups" \
SKIP_UPLOAD=1 \
  "$root/docker/backup.sh"

backup="$(find "$tmp/backups" -name '*.sqlite' -type f | head -1)"
test -n "$backup"

RESTORE_SOURCE="$backup" \
RESTORE_TARGET="$tmp/restored.sqlite" \
  "$root/docker/restore.sh"

test "$(sqlite3 "$tmp/restored.sqlite" 'SELECT value FROM probe;')" = "kept"

if RESTORE_SOURCE="$backup" RESTORE_TARGET="$tmp/restored.sqlite" \
  "$root/docker/restore.sh" 2>/dev/null; then
  echo 'restore unexpectedly overwrote an existing database' >&2
  exit 1
fi

mkdir -p "$tmp/bin"
cat > "$tmp/bin/oci" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$OCI_CALL_LOG"
EOF
chmod +x "$tmp/bin/oci"

OCI_CALL_LOG="$tmp/oci-call.log" \
PATH="$tmp/bin:$PATH" \
DATABASE_PATH="$tmp/source.sqlite" \
BACKUP_DIR="$tmp/oci-backups" \
BACKUP_RETENTION_DAYS=30 \
OCI_BACKUP_BUCKET=aims-overtime-backups \
  "$root/docker/backup-oci.sh"

grep -F -- 'os object put --auth instance_principal' "$tmp/oci-call.log"
grep -F -- '--bucket-name aims-overtime-backups' "$tmp/oci-call.log"
grep -F -- '--file ' "$tmp/oci-call.log"
grep -F -- '--force' "$tmp/oci-call.log"

echo 'backup and restore smoke test passed'
