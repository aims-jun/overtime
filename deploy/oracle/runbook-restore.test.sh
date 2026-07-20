#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runbook="$root/docs/runbooks/oracle-deployment.md"

actual_restore="$({
  awk '
    /### 8\.2 실제 장애 복구/ { in_restore = 1 }
    in_restore { print }
    /^## 9\./ { exit }
  ' "$runbook"
})"

require_line() {
  local pattern="$1"
  local message="$2"
  local line
  line="$(printf '%s\n' "$actual_restore" | grep -nE -- "$pattern" | head -1 | cut -d: -f1 || true)"
  if [[ -z "$line" ]]; then
    echo "$message" >&2
    exit 1
  fi
  printf '%s\n' "$line"
}

checksum_line="$(require_line 'sha256sum -c ' 'actual restore must verify the selected dump checksum')"
archive_list_line="$(require_line 'pg_restore --list' 'actual restore must validate the PostgreSQL archive list')"
stop_line="$(require_line 'stop api' 'actual restore must stop the API only after validation')"
createdb_line="$(require_line 'createdb .*\$RESTORE_DATABASE' 'actual restore must create a fresh target database')"
restore_line="$(require_line 'pg_restore --exit-on-error .*\$RESTORE_DATABASE' 'actual restore must restore into the fresh target database')"

if [[ "$checksum_line" -ge "$stop_line" || "$archive_list_line" -ge "$stop_line" ]]; then
  echo 'actual restore must validate checksum and pg_restore list before stopping the API' >&2
  exit 1
fi

if [[ "$createdb_line" -ge "$restore_line" ]]; then
  echo 'actual restore must create the fresh target database before restoring' >&2
  exit 1
fi

recovery_function="$({
  printf '%s\n' "$actual_restore" | awk '
    /restore_api_on_exit\(\)/ { in_function = 1 }
    in_function { print }
    in_function && /^  }$/ { exit }
  '
})"

if ! printf '%s\n' "$actual_restore" | grep -q 'trap restore_api_on_exit EXIT' \
  || ! printf '%s\n' "$recovery_function" | grep -q 'up -d api'; then
  echo 'actual restore must install an EXIT trap that attempts to restart the API' >&2
  exit 1
fi

if ! printf '%s\n' "$actual_restore" | grep -Fq 'CONFIRM_RESTORE=YES' \
  || ! printf '%s\n' "$actual_restore" | grep -Fq 'RESTORE_DATABASE" == overtime' \
  || ! printf '%s\n' "$actual_restore" | grep -Eq 'overtime_restore_[[]0-9[]]'; then
  echo 'actual restore must require confirmation and reject the production database name' >&2
  exit 1
fi

if grep -Fq 'dropdb overtime' "$runbook" \
  || grep -Fq 'DROP DATABASE overtime' "$runbook"; then
  echo 'runbook must never contain a command that drops the production database' >&2
  exit 1
fi

echo 'oracle PostgreSQL runbook restore safety contract passed'
