#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$root/docker/postgres-restore-drill.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/fakebin" "$tmp/backups"

cat > "$tmp/fakebin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"

case " $* " in
  *' pg_restore --list '*)
    payload="$(cat)"
    printf 'archive-list:%s\n' "$payload" >> "$DOCKER_LOG"
    [[ "${FAIL_ARCHIVE_LIST:-0}" != 1 ]]
    ;;
  *' createdb '*) ;;
  *' pg_restore --exit-on-error '*)
    payload="$(cat)"
    printf 'archive-restore:%s\n' "$payload" >> "$DOCKER_LOG"
    [[ "${FAIL_RESTORE:-0}" != 1 ]]
    ;;
  *' psql '*TypeORM*|*' psql '*migrations*)
    [[ "${FAIL_CHECK:-}" != migration ]]
    printf '%s\n' "${MIGRATION_RESULT:-1|InitialSchema1752360000000}"
    ;;
  *' psql '*COUNT*users*overtime_records*)
    [[ "${FAIL_CHECK:-}" != counts ]]
    printf '2|3\n'
    ;;
  *' psql '*LEFT*JOIN*users*)
    [[ "${FAIL_CHECK:-}" != orphan ]]
    printf '0\n'
    ;;
  *' psql '*SUM*duration_minutes*)
    [[ "${FAIL_CHECK:-}" != report ]]
    printf '3|180\n'
    ;;
  *' dropdb --if-exists '*) ;;
  *)
    echo "unexpected docker invocation: $*" >&2
    exit 91
    ;;
esac
EOF
chmod +x "$tmp/fakebin/docker"

write_set() {
  local timestamp="$1"
  local run_id="$2"
  local payload="$3"
  local archive="overtime-$timestamp.dump"
  printf '%s\n' "$payload" > "$tmp/backups/$archive"
  (cd "$tmp/backups" && sha256sum "$archive" > "$archive.sha256")
  cat > "$tmp/backups/overtime-$timestamp.metadata" <<EOF
timestamp_utc=$timestamp
postgres_version=17.10
archive=$archive
run_id=$run_id
remote_dump_key=postgres/overtime-$timestamp-$run_id.dump
remote_checksum_key=postgres/overtime-$timestamp-$run_id.dump.sha256
remote_metadata_key=postgres/overtime-$timestamp-$run_id.metadata
EOF
}

run_drill() {
  env \
    PATH="$tmp/fakebin:$PATH" \
    DOCKER_LOG="$tmp/docker.log" \
    BACKUP_DIR="$tmp/backups" \
    COMPOSE_ENV_FILE=/opt/overtime/.env.production \
    COMPOSE_FILE=/opt/overtime/compose.production.yaml \
    "$@" "$script"
}

# Destructive or ambiguous targets are rejected before any Docker call.
: > "$tmp/docker.log"
if run_drill RESTORE_DATABASE=overtime >"$tmp/prod.out" 2>"$tmp/prod.err"; then
  echo 'restore drill unexpectedly accepted the production database' >&2
  exit 1
fi
grep -F 'refusing unsafe restore database: overtime' "$tmp/prod.err" >/dev/null
test ! -s "$tmp/docker.log"

for invalid_name in overtime_restore_drill_ overtime_restore_drill_2026-07-20 scratch; do
  : > "$tmp/docker.log"
  if run_drill RESTORE_DATABASE="$invalid_name" >"$tmp/invalid.out" 2>"$tmp/invalid.err"; then
    echo "restore drill unexpectedly accepted target: $invalid_name" >&2
    exit 1
  fi
  test ! -s "$tmp/docker.log"
done

# Consumers enumerate completed metadata markers only; an unmarked newer dump is ignored.
write_set 20260719T000000Z 1111111111111111 old-archive
write_set 20260720T000000Z 2222222222222222 newest-archive
printf 'uncommitted-newer-archive\n' > "$tmp/backups/overtime-20260721T000000Z.dump"

# A marker must reference the exact unique dump/checksum keys from its timestamp and run ID.
cp "$tmp/backups/overtime-20260720T000000Z.metadata" "$tmp/valid.metadata"
sed 's#remote_dump_key=.*#remote_dump_key=postgres/overtime-shared.dump#' \
  "$tmp/valid.metadata" > "$tmp/backups/overtime-20260720T000000Z.metadata"
: > "$tmp/docker.log"
if run_drill RESTORE_DATABASE=overtime_restore_drill_202607200001 >"$tmp/key.out" 2>"$tmp/key.err"; then
  echo 'restore drill unexpectedly accepted inconsistent marker keys' >&2
  exit 1
fi
test "$(grep -c ' createdb ' "$tmp/docker.log" || true)" = 0
mv "$tmp/valid.metadata" "$tmp/backups/overtime-20260720T000000Z.metadata"

# Checksums and archive structure are validated before createdb.
printf '0%.0s' {1..64} > "$tmp/backups/overtime-20260720T000000Z.dump.sha256"
printf '  overtime-20260720T000000Z.dump\n' >> "$tmp/backups/overtime-20260720T000000Z.dump.sha256"
: > "$tmp/docker.log"
if run_drill RESTORE_DATABASE=overtime_restore_drill_202607200002 >"$tmp/checksum.out" 2>"$tmp/checksum.err"; then
  echo 'restore drill unexpectedly accepted a bad checksum' >&2
  exit 1
fi
test "$(grep -c ' createdb ' "$tmp/docker.log" || true)" = 0
test "$(grep -c ' dropdb ' "$tmp/docker.log" || true)" = 0
(cd "$tmp/backups" && sha256sum overtime-20260720T000000Z.dump > overtime-20260720T000000Z.dump.sha256)

: > "$tmp/docker.log"
if run_drill RESTORE_DATABASE=overtime_restore_drill_202607200003 FAIL_ARCHIVE_LIST=1 >"$tmp/list.out" 2>"$tmp/list.err"; then
  echo 'restore drill unexpectedly accepted an invalid archive' >&2
  exit 1
fi
test "$(grep -c ' createdb ' "$tmp/docker.log" || true)" = 0
test "$(grep -c ' dropdb ' "$tmp/docker.log" || true)" = 0

# Happy path is create, restore, all checks, then generated-target cleanup.
: > "$tmp/docker.log"
run_drill RESTORE_DATABASE=overtime_restore_drill_202607200004 >"$tmp/success.out" 2>"$tmp/success.err"
grep -F 'archive-list:newest-archive' "$tmp/docker.log" >/dev/null
grep -F 'archive-restore:newest-archive' "$tmp/docker.log" >/dev/null

createdb_line="$(grep -n ' createdb ' "$tmp/docker.log" | cut -d: -f1)"
restore_line="$(grep -n ' pg_restore --exit-on-error ' "$tmp/docker.log" | cut -d: -f1)"
migration_line="$(grep -n ' psql .*TypeORM\| psql .*migrations' "$tmp/docker.log" | head -1 | cut -d: -f1)"
counts_line="$(grep -n ' psql .*COUNT.*users.*overtime_records' "$tmp/docker.log" | cut -d: -f1)"
orphan_line="$(grep -n ' psql .*LEFT.*JOIN.*users' "$tmp/docker.log" | cut -d: -f1)"
report_line="$(grep -n ' psql .*SUM.*duration_minutes' "$tmp/docker.log" | cut -d: -f1)"
drop_line="$(grep -n ' dropdb --if-exists ' "$tmp/docker.log" | cut -d: -f1)"
test "$createdb_line" -lt "$restore_line"
test "$restore_line" -lt "$migration_line"
test "$migration_line" -lt "$counts_line"
test "$counts_line" -lt "$orphan_line"
test "$orphan_line" -lt "$report_line"
test "$report_line" -lt "$drop_line"
grep ' createdb .*--owner overtime_migrator .*overtime_restore_drill_202607200004' "$tmp/docker.log" >/dev/null
grep ' pg_restore --exit-on-error --no-owner --no-acl .*overtime_restore_drill_202607200004' "$tmp/docker.log" >/dev/null
grep ' dropdb --if-exists .*overtime_restore_drill_202607200004' "$tmp/docker.log" >/dev/null

# Any check failure still drops only the generated temporary database.
: > "$tmp/docker.log"
if run_drill RESTORE_DATABASE=overtime_restore_drill_202607200005 FAIL_CHECK=orphan >"$tmp/failure.out" 2>"$tmp/failure.err"; then
  echo 'restore drill unexpectedly succeeded when an integrity check failed' >&2
  exit 1
fi
test "$(grep -c ' dropdb --if-exists ' "$tmp/docker.log")" = 1
grep ' dropdb --if-exists .*overtime_restore_drill_202607200005' "$tmp/docker.log" >/dev/null
if grep -E 'dropdb .*([ =]|^)overtime([ $]|$)|rm .*overtime-.*\.(dump|sha256|metadata)|os object delete' "$tmp/docker.log"; then
  echo 'restore drill issued a destructive production or source command' >&2
  exit 1
fi

# A present but stale/unknown latest migration is not accepted as healthy.
: > "$tmp/docker.log"
if run_drill RESTORE_DATABASE=overtime_restore_drill_202607200006 \
  MIGRATION_RESULT='1|UnexpectedMigration1' >"$tmp/migration.out" 2>"$tmp/migration.err"; then
  echo 'restore drill unexpectedly accepted an unknown latest migration' >&2
  exit 1
fi
grep ' dropdb --if-exists .*overtime_restore_drill_202607200006' "$tmp/docker.log" >/dev/null

echo 'PostgreSQL restore drill safety contract passed'
