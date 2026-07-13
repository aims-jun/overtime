#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
SQLite restore order:
  1. docker compose -f compose.production.yaml stop api
  2. RESTORE_SOURCE=/backup.sqlite RESTORE_TARGET=/data/overtime/overtime.sqlite CONFIRM_RESTORE=YES ./docker/restore.sh
  3. docker compose -f compose.production.yaml up -d api
  4. curl --fail http://127.0.0.1/api/health

CONFIRM_RESTORE=YES is required only when RESTORE_TARGET already exists.
EOF
  exit 0
fi

: "${RESTORE_SOURCE:?RESTORE_SOURCE is required}"
: "${RESTORE_TARGET:?RESTORE_TARGET is required}"

if [[ ! -f "$RESTORE_SOURCE" ]]; then
  echo "restore source does not exist: $RESTORE_SOURCE" >&2
  exit 1
fi
if [[ -e "$RESTORE_TARGET" && "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo 'target exists; set CONFIRM_RESTORE=YES to replace it' >&2
  exit 1
fi
if [[ "$(sqlite3 "$RESTORE_SOURCE" 'PRAGMA integrity_check;')" != "ok" ]]; then
  echo 'restore source integrity check failed' >&2
  exit 1
fi

target_dir="$(dirname "$RESTORE_TARGET")"
mkdir -p "$target_dir"
temporary="$(mktemp "$target_dir/.overtime-restore.XXXXXX")"
trap 'rm -f "$temporary"' EXIT

cp "$RESTORE_SOURCE" "$temporary"
chmod 600 "$temporary"
if [[ "$(sqlite3 "$temporary" 'PRAGMA integrity_check;')" != "ok" ]]; then
  echo 'copied database integrity check failed' >&2
  exit 1
fi
mv -f "$temporary" "$RESTORE_TARGET"
trap - EXIT

echo "restored: $RESTORE_TARGET"
