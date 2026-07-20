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
  *' psql '*COUNT*users*overtime_records*)
    printf '%s\n' "${SOURCE_COUNTS:-2|3}"
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
operation="$3"
shift 3
object_name=''
source_file=''
while (($#)); do
  case "$1" in
    --name) object_name="$2"; shift 2 ;;
    --file) source_file="$2"; shift 2 ;;
    *) shift ;;
  esac
done
case "$operation" in
  head)
    if [[ -f "$OCI_REMOTE_DIR/$object_name" ]]; then
      exit 0
    fi
    echo 'ServiceError: 404 ObjectNotFound' >&2
    exit 3
    ;;
  put)
    put_count="$(cat "$OCI_PUT_COUNT" 2>/dev/null || printf 0)"
    put_count="$((put_count + 1))"
    printf '%s\n' "$put_count" > "$OCI_PUT_COUNT"
    if [[ -n "${FAIL_OCI_CALL:-}" && "$put_count" == "$FAIL_OCI_CALL" && "${AMBIGUOUS_OCI_FAILURE:-0}" != 1 ]]; then
      exit 43
    fi
    mkdir -p "$OCI_REMOTE_DIR/$(dirname "$object_name")"
    /bin/cp "$source_file" "$OCI_REMOTE_DIR/$object_name"
    if [[ -n "${FAIL_OCI_CALL:-}" && "$put_count" == "$FAIL_OCI_CALL" ]]; then
      exit 43
    fi
    ;;
  delete)
    if [[ "${FAIL_OCI_DELETE:-0}" == 1 ]]; then
      exit 44
    fi
    /bin/rm -f "$OCI_REMOTE_DIR/$object_name"
    ;;
  *) exit 98 ;;
esac
EOF
cat > "$tmp/bin/find" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FIND_CALL_LOG"
EOF
cat > "$tmp/bin/mv" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
destination="${!#}"
if [[ "${FAIL_METADATA_PUBLISH:-0}" == 1 && "$destination" == *.metadata ]]; then
  exit 45
fi
exec /bin/mv "$@"
EOF
cat > "$tmp/bin/date" <<'EOF'
#!/usr/bin/env bash
printf '20260720T000000Z\n'
EOF
chmod +x "$tmp/bin/docker" "$tmp/bin/oci" "$tmp/bin/find" "$tmp/bin/mv" "$tmp/bin/date"

password='backup-password-MUST-NOT-LEAK'
common_env=(
  PATH="$tmp/bin:$PATH"
  COMPOSE_ENV_FILE="$tmp/compose.env"
  COMPOSE_FILE="$tmp/compose.yaml"
  POSTGRES_BACKUP_PASSWORD="$password"
  OCI_BACKUP_BUCKET=aims-overtime-backups
  RUN_ID=0123456789abcdef
)
touch "$tmp/compose.env" "$tmp/compose.yaml"

run_backup() {
  local backup_dir="$1"
  shift
  env "${common_env[@]}" \
    BACKUP_DIR="$backup_dir" \
    DOCKER_CALL_LOG="$tmp/docker.log" \
    OCI_CALL_LOG="$tmp/oci.log" \
    OCI_PUT_COUNT="$tmp/oci-put-count" \
    OCI_REMOTE_DIR="$tmp/remote" \
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

# Metadata is the atomic local commit marker; a failed final publish leaves no set.
mkdir -p "$tmp/publication-failure"
: > "$tmp/docker.log"
if run_backup "$tmp/publication-failure" \
  FAIL_METADATA_PUBLISH=1 "$root/docker/postgres-backup.sh" \
  >"$tmp/publication-failure.stdout" 2>"$tmp/publication-failure.stderr"; then
  echo 'backup unexpectedly succeeded when commit-marker publication failed' >&2
  exit 1
fi
test -z "$(find "$tmp/publication-failure" -maxdepth 1 -type f -name 'overtime-*' -print)"

# A caller-supplied run ID must be a cryptographic-identifier-shaped hex value.
if run_backup "$tmp/invalid-run-id" RUN_ID=not-hex "$root/docker/postgres-backup.sh" \
  >"$tmp/invalid-run-id.stdout" 2>"$tmp/invalid-run-id.stderr"; then
  echo 'backup unexpectedly accepted an invalid run ID' >&2
  exit 1
fi

# A same-timestamp retry cannot overwrite a previously committed valid set.
mkdir -p "$tmp/timestamp-collision"
for suffix in dump dump.sha256 metadata; do
  printf 'previous-valid\n' > "$tmp/timestamp-collision/overtime-20260720T000000Z.$suffix"
done
if run_backup "$tmp/timestamp-collision" "$root/docker/postgres-backup.sh" \
  >"$tmp/collision.stdout" 2>"$tmp/collision.stderr"; then
  echo 'backup unexpectedly overwrote a committed same-timestamp set' >&2
  exit 1
fi
for suffix in dump dump.sha256 metadata; do
  test "$(cat "$tmp/timestamp-collision/overtime-20260720T000000Z.$suffix")" = 'previous-valid'
done

# A successful backup creates and uploads a complete three-file artifact set.
: > "$tmp/docker.log"
: > "$tmp/oci.log"
: > "$tmp/oci-put-count"
: > "$tmp/find.log"
rm -rf "$tmp/remote"
run_backup "$tmp/success" "$root/docker/postgres-backup-oci.sh" \
  >"$tmp/success.stdout" 2>"$tmp/success.stderr"

grep -F -- 'compose --env-file ' "$tmp/docker.log" >/dev/null
grep -F -- 'exec -T postgres sh -c export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"; exec pg_dump --username overtime_backup --dbname overtime --format=custom --no-owner --no-acl' "$tmp/docker.log" >/dev/null
grep -F -- 'postgres pg_restore --list' "$tmp/docker.log" >/dev/null
if grep -F -- "$password" "$tmp/docker.log"; then
  echo 'backup password leaked into host Docker argv' >&2
  exit 1
fi

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
grep -Fx 'run_id=0123456789abcdef' "$metadata" >/dev/null
grep -Fx 'remote_dump_key=postgres/overtime-20260720T000000Z-0123456789abcdef.dump' "$metadata" >/dev/null
grep -Fx 'remote_checksum_key=postgres/overtime-20260720T000000Z-0123456789abcdef.dump.sha256' "$metadata" >/dev/null
grep -Fx 'remote_metadata_key=postgres/overtime-20260720T000000Z-0123456789abcdef.metadata' "$metadata" >/dev/null
grep -Fx 'users_count=2' "$metadata" >/dev/null
grep -Fx 'overtime_records_count=3' "$metadata" >/dev/null

first_count_line="$(grep -n ' psql .*COUNT.*users.*overtime_records' "$tmp/docker.log" | head -1 | cut -d: -f1)"
dump_line="$(grep -n ' pg_dump ' "$tmp/docker.log" | cut -d: -f1)"
last_count_line="$(grep -n ' psql .*COUNT.*users.*overtime_records' "$tmp/docker.log" | tail -1 | cut -d: -f1)"
test "$first_count_line" -lt "$dump_line"
test "$dump_line" -lt "$last_count_line"

test "$(grep -c '^os object head ' "$tmp/oci.log")" = 3
test "$(grep -c '^os object put ' "$tmp/oci.log")" = 3
while IFS= read -r call; do
  grep -F -- 'os object put --auth instance_principal' <<<"$call" >/dev/null
  grep -F -- '--bucket-name aims-overtime-backups' <<<"$call" >/dev/null
  grep -F -- '--name postgres/overtime-' <<<"$call" >/dev/null
  grep -F -- '--file ' <<<"$call" >/dev/null
  grep -E -- '--name postgres/overtime-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}\.(dump|dump\.sha256|metadata)' <<<"$call" >/dev/null
  grep -F -- '--no-overwrite' <<<"$call" >/dev/null
done < <(grep '^os object put ' "$tmp/oci.log")
if grep -F -- '--force' "$tmp/oci.log"; then
  echo 'OCI uploads unexpectedly allow overwriting a persistent object key' >&2
  exit 1
fi
grep -F -- '.dump ' "$tmp/oci.log" >/dev/null
grep -F -- '.dump.sha256 ' "$tmp/oci.log" >/dev/null
grep -F -- '.metadata ' "$tmp/oci.log" >/dev/null
grep '^os object put ' "$tmp/oci.log" | tail -1 | grep -F -- '.metadata ' >/dev/null
test -f "$tmp/remote/postgres/overtime-20260720T000000Z-0123456789abcdef.dump"
test -f "$tmp/remote/postgres/overtime-20260720T000000Z-0123456789abcdef.dump.sha256"
test -f "$tmp/remote/postgres/overtime-20260720T000000Z-0123456789abcdef.metadata"
grep -F -- '-type f -name overtime-*.dump* -mtime +1 -delete' "$tmp/find.log" >/dev/null
grep -F -- '-type f -name overtime-*.metadata -mtime +1 -delete' "$tmp/find.log" >/dev/null

if grep -F -- "$password" "$tmp/success.stdout" "$tmp/success.stderr"; then
  echo 'backup password leaked to stdout/stderr' >&2
  exit 1
fi

# A same-run-ID complete remote set is a collision, never rollback ownership.
: > "$tmp/docker.log"
: > "$tmp/oci.log"
: > "$tmp/oci-put-count"
: > "$tmp/find.log"
rm -rf "$tmp/remote"
mkdir -p "$tmp/remote/postgres"
for suffix in dump dump.sha256 metadata; do
  printf 'preexisting-same-run\n' > "$tmp/remote/postgres/overtime-20260720T000000Z-0123456789abcdef.$suffix"
done
if run_backup "$tmp/remote-collision" "$root/docker/postgres-backup-oci.sh" \
  >"$tmp/remote-collision.stdout" 2>"$tmp/remote-collision.stderr"; then
  echo 'backup unexpectedly uploaded over a same-run-ID remote set' >&2
  exit 1
fi
test "$(grep -c '^os object head ' "$tmp/oci.log")" = 3
test "$(grep -c '^os object put ' "$tmp/oci.log" || true)" = 0
test "$(grep -c '^os object delete ' "$tmp/oci.log" || true)" = 0
test ! -s "$tmp/find.log"
for suffix in dump dump.sha256 metadata; do
  test "$(cat "$tmp/remote/postgres/overtime-20260720T000000Z-0123456789abcdef.$suffix")" = 'preexisting-same-run'
done

# A partial OCI failure reconciles the failed key and every prior key.
for failed_put in 2 3; do
  case_dir="$tmp/upload-failure-$failed_put"
  mkdir -p "$case_dir"
  for suffix in dump dump.sha256 metadata; do
    printf 'previous-valid\n' > "$case_dir/overtime-20260717T000000Z.$suffix"
  done
  : > "$tmp/docker.log"
  : > "$tmp/oci.log"
  : > "$tmp/oci-put-count"
  : > "$tmp/find.log"
  rm -rf "$tmp/remote"
  mkdir -p "$tmp/remote/postgres"
  for suffix in dump dump.sha256 metadata; do
    printf 'preexisting-complete\n' > "$tmp/remote/postgres/overtime-20260719T000000Z-fedcba9876543210.$suffix"
  done
  ambiguous_failure=0
  if [[ "$failed_put" == 3 ]]; then
    ambiguous_failure=1
  fi
  if run_backup "$case_dir" \
    FAIL_OCI_CALL="$failed_put" AMBIGUOUS_OCI_FAILURE="$ambiguous_failure" \
    "$root/docker/postgres-backup-oci.sh" \
    >"$case_dir.stdout" 2>"$case_dir.stderr"; then
    echo "backup unexpectedly succeeded when OCI put $failed_put failed" >&2
    exit 1
  fi
  test ! -s "$tmp/find.log"
  test "$(grep -c '^os object delete ' "$tmp/oci.log")" = "$failed_put"
  test -z "$(find "$tmp/remote" -type f -name '*-0123456789abcdef.*' -print)"
  for suffix in dump dump.sha256 metadata; do
    test "$(cat "$tmp/remote/postgres/overtime-20260719T000000Z-fedcba9876543210.$suffix")" = 'preexisting-complete'
  done
  for suffix in dump dump.sha256 metadata; do
    test "$(cat "$case_dir/overtime-20260717T000000Z.$suffix")" = 'previous-valid'
  done
  if grep -F -- "$password" "$case_dir.stdout" "$case_dir.stderr" "$tmp/docker.log"; then
    echo 'backup password leaked during upload failure' >&2
    exit 1
  fi
done

# Rollback failure remains a hard failure and is explicit to operators.
: > "$tmp/docker.log"
: > "$tmp/oci.log"
: > "$tmp/oci-put-count"
: > "$tmp/find.log"
rm -rf "$tmp/remote"
if run_backup "$tmp/rollback-failure" \
  FAIL_OCI_CALL=2 FAIL_OCI_DELETE=1 "$root/docker/postgres-backup-oci.sh" \
  >"$tmp/rollback-failure.stdout" 2>"$tmp/rollback-failure.stderr"; then
  echo 'backup unexpectedly succeeded when OCI rollback failed' >&2
  exit 1
fi
grep -F -- 'OCI rollback failed for postgres/overtime-' "$tmp/rollback-failure.stderr" >/dev/null
test ! -s "$tmp/find.log"

echo 'PostgreSQL backup and OCI upload contract passed'
