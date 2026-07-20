#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin"
cat > "$tmp/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_CALL_LOG"
case " $* " in
  *' pg_dump '*)
    printf 'PostgreSQL custom archive\n'
    ;;
  *' pg_restore --list '*)
    if [[ "${FAIL_RESTORE_LIST:-0}" == 1 ]]; then
      exit 42
    fi
    printf 'archive catalog\n'
    ;;
  *' psql '*"SELECT current_setting('server_version')"*)
    printf '17.10 (Debian 17.10-1.pgdg120+1)\n'
    ;;
  *)
    echo "unexpected docker invocation" >&2
    exit 99
    ;;
esac
EOF
cat > "$tmp/bin/oci" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$OCI_CALL_LOG"
count="$(wc -l < "$OCI_CALL_LOG" | tr -d ' ')"
if [[ -n "${FAIL_OCI_CALL:-}" && "$count" == "$FAIL_OCI_CALL" ]]; then
  exit 43
fi
EOF
cat > "$tmp/bin/find" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FIND_CALL_LOG"
EOF
chmod +x "$tmp/bin/docker" "$tmp/bin/oci" "$tmp/bin/find"

password='backup-password-MUST-NOT-LEAK'
common_env=(
  PATH="$tmp/bin:$PATH"
  COMPOSE_ENV_FILE="$tmp/compose.env"
  COMPOSE_FILE="$tmp/compose.yaml"
  POSTGRES_BACKUP_PASSWORD="$password"
  OCI_BACKUP_BUCKET=aims-overtime-backups
)
touch "$tmp/compose.env" "$tmp/compose.yaml"

run_backup() {
  local backup_dir="$1"
  shift
  env "${common_env[@]}" \
    BACKUP_DIR="$backup_dir" \
    DOCKER_CALL_LOG="$tmp/docker.log" \
    OCI_CALL_LOG="$tmp/oci.log" \
    FIND_CALL_LOG="$tmp/find.log" \
    "$@"
}

# Local publication is atomic and occurs only after pg_restore validates the archive.
mkdir -p "$tmp/validation-failure"
printf 'known-good\n' > "$tmp/validation-failure/overtime-20260718T000000Z.dump"
: > "$tmp/docker.log"
: > "$tmp/oci.log"
: > "$tmp/find.log"
if run_backup "$tmp/validation-failure" \
  FAIL_RESTORE_LIST=1 "$root/docker/postgres-backup-oci.sh" \
  >"$tmp/failure.stdout" 2>"$tmp/failure.stderr"; then
  echo 'backup unexpectedly succeeded when pg_restore --list failed' >&2
  exit 1
fi
test ! -s "$tmp/oci.log"
test "$(cat "$tmp/validation-failure/overtime-20260718T000000Z.dump")" = 'known-good'
test "$(find "$tmp/validation-failure" -maxdepth 1 -type f | wc -l | tr -d ' ')" = 1

# A successful backup creates and uploads a complete three-file artifact set.
: > "$tmp/docker.log"
: > "$tmp/oci.log"
: > "$tmp/find.log"
run_backup "$tmp/success" "$root/docker/postgres-backup-oci.sh" \
  >"$tmp/success.stdout" 2>"$tmp/success.stderr"

grep -F -- 'compose --env-file ' "$tmp/docker.log" >/dev/null
grep -F -- ' exec -T -e PGPASSWORD=' "$tmp/docker.log" >/dev/null
grep -F -- 'postgres pg_dump --username overtime_backup --dbname overtime --format=custom --no-owner --no-acl' "$tmp/docker.log" >/dev/null
grep -F -- 'postgres pg_restore --list' "$tmp/docker.log" >/dev/null

dump="$(printf '%s\n' "$tmp/success"/overtime-*.dump)"
checksum="$dump.sha256"
metadata="${dump%.dump}.metadata"
test -f "$dump"
test -f "$checksum"
test -f "$metadata"
test -z "$(find "$tmp/success" -maxdepth 1 -type f -name '*.tmp*' -print)"
(cd "$tmp/success" && sha256sum -c "$(basename "$checksum")") >/dev/null
grep -Fx "archive=$(basename "$dump")" "$metadata" >/dev/null
grep -E '^timestamp_utc=[0-9]{8}T[0-9]{6}Z$' "$metadata" >/dev/null
grep -Fx 'postgres_version=17.10' "$metadata" >/dev/null

test "$(wc -l < "$tmp/oci.log" | tr -d ' ')" = 3
while IFS= read -r call; do
  grep -F -- 'os object put --auth instance_principal' <<<"$call" >/dev/null
  grep -F -- '--bucket-name aims-overtime-backups' <<<"$call" >/dev/null
  grep -F -- '--name postgres/overtime-' <<<"$call" >/dev/null
  grep -F -- '--file ' <<<"$call" >/dev/null
  grep -F -- '--force' <<<"$call" >/dev/null
done < "$tmp/oci.log"
grep -F -- '.dump ' "$tmp/oci.log" >/dev/null
grep -F -- '.dump.sha256 ' "$tmp/oci.log" >/dev/null
grep -F -- '.metadata ' "$tmp/oci.log" >/dev/null
grep -F -- '-type f -name overtime-*.dump* -mtime +2 -delete' "$tmp/find.log" >/dev/null
grep -F -- '-type f -name overtime-*.metadata -mtime +2 -delete' "$tmp/find.log" >/dev/null

if grep -F -- "$password" "$tmp/success.stdout" "$tmp/success.stderr"; then
  echo 'backup password leaked to stdout/stderr' >&2
  exit 1
fi

# A partial OCI failure leaves existing backups untouched and never runs cleanup.
mkdir -p "$tmp/upload-failure"
for suffix in dump dump.sha256 metadata; do
  printf 'previous-valid\n' > "$tmp/upload-failure/overtime-20260717T000000Z.$suffix"
done
: > "$tmp/docker.log"
: > "$tmp/oci.log"
: > "$tmp/find.log"
if run_backup "$tmp/upload-failure" \
  FAIL_OCI_CALL=2 "$root/docker/postgres-backup-oci.sh" \
  >"$tmp/upload-failure.stdout" 2>"$tmp/upload-failure.stderr"; then
  echo 'backup unexpectedly succeeded when an OCI upload failed' >&2
  exit 1
fi
test ! -s "$tmp/find.log"
for suffix in dump dump.sha256 metadata; do
  test "$(cat "$tmp/upload-failure/overtime-20260717T000000Z.$suffix")" = 'previous-valid'
done
if grep -F -- "$password" "$tmp/upload-failure.stdout" "$tmp/upload-failure.stderr"; then
  echo 'backup password leaked during upload failure' >&2
  exit 1
fi

echo 'PostgreSQL backup and OCI upload contract passed'
