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
grant_runtime_line="$(require_line 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES.*overtime_app' 'actual restore must grant runtime access to restored tables')"
grant_backup_line="$(require_line 'GRANT SELECT ON ALL TABLES.*overtime_backup' 'actual restore must grant backup access to restored tables')"
grant_backup_sequence_line="$(require_line 'GRANT SELECT ON ALL SEQUENCES.*overtime_backup' 'actual restore must grant backup access to restored sequence state')"
role_check_line="$(require_line 'SET ROLE overtime_app' 'actual restore must verify runtime privileges through SET ROLE')"
backup_check_line="$(require_line 'SET ROLE overtime_backup' 'actual restore must verify backup privileges through SET ROLE')"
backup_dump_line="$(require_line 'pg_dump .*overtime_backup.*\$RESTORE_DATABASE' 'actual restore must run a real backup-role pg_dump probe')"
switch_line="$(require_line 'env.production.next' 'actual restore must verify privileges before switching API configuration')"

if [[ "$checksum_line" -ge "$stop_line" || "$archive_list_line" -ge "$stop_line" ]]; then
  echo 'actual restore must validate checksum and pg_restore list before stopping the API' >&2
  exit 1
fi

if [[ "$createdb_line" -ge "$restore_line" ]]; then
  echo 'actual restore must create the fresh target database before restoring' >&2
  exit 1
fi

if [[ "$grant_runtime_line" -le "$restore_line" || "$grant_backup_line" -le "$restore_line" || "$grant_backup_sequence_line" -le "$restore_line" \
  || "$role_check_line" -le "$grant_runtime_line" || "$backup_check_line" -le "$grant_backup_line" \
  || "$backup_dump_line" -le "$grant_backup_sequence_line" || "$role_check_line" -ge "$switch_line" \
  || "$backup_check_line" -ge "$switch_line" || "$backup_dump_line" -ge "$switch_line" ]]; then
  echo 'actual restore must grant and verify runtime/backup privileges before API switch' >&2
  exit 1
fi

if ! printf '%s\n' "$actual_restore" | grep -q 'ALTER DEFAULT PRIVILEGES.*overtime_app' \
  || ! printf '%s\n' "$actual_restore" | grep -q 'ALTER DEFAULT PRIVILEGES.*overtime_backup' \
  || ! printf '%s\n' "$actual_restore" | grep -q 'ALTER DEFAULT PRIVILEGES.*SEQUENCES.*overtime_backup' \
  || ! printf '%s\n' "$actual_restore" | grep -q 'ROLLBACK'; then
  echo 'actual restore must set future grants and roll back its runtime DML privilege probe' >&2
  exit 1
fi

if ! grep -q 'GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO overtime_backup' "$runbook"; then
  echo 'deployment migration instructions must grant backup access to existing sequence state' >&2
  exit 1
fi

mode_line="$(require_line 'stat -c.*env.production.*600' 'actual restore must require mode 0600 production env')"
source_prod_line="$(require_line '^ *\. /opt/overtime/\.env.production' 'actual restore must load the trusted production env')"
source_backup_line="$(require_line '^ *\. /opt/overtime/\.env.backup' 'actual restore must load the trusted backup env')"
set_u_line="$(require_line 'set -.*u' 'actual restore must enable nounset after loading trusted env files')"
if [[ "$mode_line" -ge "$set_u_line" || "$source_prod_line" -ge "$set_u_line" || "$source_backup_line" -ge "$set_u_line" ]]; then
  echo 'actual restore must validate and load trusted env files before nounset use' >&2
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

backup_runbook="$root/docs/runbooks/backup-restore.md"
if ! grep -Eq '(^| )\. /opt/overtime/\.env.backup|OCI_BACKUP_BUCKET=' "$backup_runbook"; then
  echo 'remote restore drill must load backup environment or supply the OCI bucket' >&2
  exit 1
fi

if ! grep -q 'manual remote marker drill' "$runbook" \
  || ! grep -q 'RESTORE_METADATA_OBJECT=' "$runbook" \
  || ! grep -q 'OCI_BACKUP_BUCKET' "$runbook"; then
  echo 'Oracle acceptance must require recorded manual remote marker drill evidence' >&2
  exit 1
fi

gcp_runbook="$root/docs/runbooks/gcp-deployment.md"
if ! grep -q 'ARCHIVED / UNSUPPORTED' "$gcp_runbook" \
  || grep -q 'docker compose .*up' "$gcp_runbook" \
  || grep -q '마이그레이션이 자동 실행' "$gcp_runbook"; then
  echo 'GCP runbook must be archived and contain no active stale deployment commands' >&2
  exit 1
fi

echo 'oracle PostgreSQL runbook restore safety contract passed'
