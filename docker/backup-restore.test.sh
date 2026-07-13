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

echo 'backup and restore smoke test passed'
