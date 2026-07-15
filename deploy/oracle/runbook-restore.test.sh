#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runbook="$root/docs/runbooks/oracle-deployment.md"

actual_restore="$({
  awk '
    /실제 장애 복구도/ { in_restore = 1 }
    in_restore { print }
    /^## 9\./ { exit }
  ' "$runbook"
})"

validation_line="$(printf '%s\n' "$actual_restore" | grep -n 'sqlite3 "$RESTORE_SOURCE".*PRAGMA integrity_check' | cut -d: -f1 || true)"
stop_line="$(printf '%s\n' "$actual_restore" | grep -n 'stop api' | cut -d: -f1 || true)"

if [[ -z "$validation_line" || -z "$stop_line" || "$validation_line" -ge "$stop_line" ]]; then
  echo 'actual restore must validate the downloaded SQLite source before stopping the API' >&2
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

echo 'oracle runbook restore safety contract passed'
