#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$root/deploy/oracle/postgres-migration-rehearsal.sh"
tmp="$(mktemp -d)"
cleanup_test() {
  if [[ "${KEEP_TMP:-0}" == 1 ]]; then
    printf 'preserved test directory: %s\n' "$tmp" >&2
  else
    rm -rf "$tmp"
  fi
}
trap cleanup_test EXIT

mkdir -p "$tmp/bin"

cat > "$tmp/bin/sqlite3" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'sqlite3 %s\n' "$2" >> "$REHEARSAL_CALL_LOG"
case "$2" in
  .backup*)
    destination="${2:9}"
    destination="${destination%\'}"
    cp "$1" "$destination"
    ;;
  'PRAGMA integrity_check;') printf 'ok\n' ;;
  *'COUNT(*) FROM users'*) printf '2|3\n' ;;
  *) echo "unexpected sqlite3 invocation" >&2; exit 91 ;;
esac
EOF

cat > "$tmp/bin/sha256sum" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'sha256sum\n' >> "$REHEARSAL_CALL_LOG"
printf 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  %s\n' "$1"
EOF

cat > "$tmp/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'POSTGRES_TEST_PORT=%s docker %s\n' "${POSTGRES_TEST_PORT:-unset}" "$*" >> "$REHEARSAL_CALL_LOG"
case " $* " in
  *' up -d --wait '*) ;;
  *' down -v '*) ;;
  *' pg_dump '*) printf 'representative archive\n' ;;
  *' pg_restore --list '*) printf 'archive catalog\n' ;;
  *' createdb '*) ;;
  *' pg_restore --exit-on-error '*) ;;
  *' dropdb --if-exists '*) ;;
  *' psql '*"to_regclass('public.users')"*) echo 'unsafe absent-table query' >&2; exit 94 ;;
  *' psql '*"information_schema.tables"*"table_type = 'BASE TABLE'"*) printf '0\n' ;;
  *' psql '*"information_schema.tables"*) echo 'incomplete empty-target query' >&2; exit 95 ;;
  *' psql '*"COUNT(*) FROM users"*"COUNT(*) FROM overtime_records"*"COUNT(*) FROM sessions"*) printf '2|3|0|1\n' ;;
  *' psql '*"COUNT(*) FROM users"*"COUNT(*) FROM overtime_records"*) printf '2|3\n' ;;
  *) echo "unexpected docker invocation: $*" >&2; exit 92 ;;
esac
EOF

cat > "$tmp/bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'npm %s\n' "$*" >> "$REHEARSAL_CALL_LOG"
case " $* " in
  *' run db:migrate:sqlite '*)
    count="$(grep -c '^npm run db:migrate:sqlite ' "$REHEARSAL_CALL_LOG")"
    if [[ "$count" == 1 ]]; then
      printf '{"users":2,"overtimeRecords":3,"sessionsMigrated":0,"verification":"passed"}\n'
    else
      printf 'target is not empty\n' >&2
      exit 1
    fi
    ;;
  *' run db:migrate '*) printf 'InitialSchema1752360000000\n' ;;
  *' run start:prod '*)
    trap 'exit 0' TERM INT
    while :; do sleep 1; done
    ;;
  *) echo "unexpected npm invocation" >&2; exit 93 ;;
esac
EOF

cat > "$tmp/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'curl %s\n' "$*" >> "$REHEARSAL_CALL_LOG"
printf '{"status":"ok","database":"ready"}\n'
EOF

chmod +x "$tmp/bin/"*
fixture="$tmp/representative.sqlite"
printf 'representative sqlite fixture\n' > "$fixture"
export REHEARSAL_CALL_LOG="$tmp/calls.log"

# Unsafe inputs fail before any orchestration command runs.
if PATH="$tmp/bin:$PATH" DATABASE_MIGRATION_URL='postgresql://test:test@127.0.0.1:55432/overtime_test' \
  bash "$script" /data/overtime/overtime.sqlite >"$tmp/production.out" 2>"$tmp/production.err"; then
  echo 'rehearsal accepted the production SQLite path' >&2
  exit 1
fi
grep -F 'refusing production SQLite source path' "$tmp/production.err" >/dev/null
test ! -e "$tmp/calls.log"

if PATH="$tmp/bin:$PATH" DATABASE_MIGRATION_URL='postgresql://test:test@203.0.113.10:5432/overtime_test' \
  bash "$script" "$fixture" >"$tmp/remote.out" 2>"$tmp/remote.err"; then
  echo 'rehearsal accepted a nonlocal PostgreSQL target' >&2
  exit 1
fi
grep -F 'refusing nonlocal PostgreSQL target' "$tmp/remote.err" >/dev/null
test ! -e "$tmp/calls.log"

if PATH="$tmp/bin:$PATH" DATABASE_MIGRATION_URL='postgresql://test:test@127.0.0.1:55432/overtime' \
  bash "$script" "$fixture" >"$tmp/nontest.out" 2>"$tmp/nontest.err"; then
  echo 'rehearsal accepted a non-test PostgreSQL database' >&2
  exit 1
fi
grep -F 'refusing PostgreSQL database without a test-only name' "$tmp/nontest.err" >/dev/null
test ! -e "$tmp/calls.log"

if PATH="$tmp/bin:$PATH" \
  DATABASE_MIGRATION_URL='postgresql://test:test@127.0.0.1:55434/overtime_test' \
  REHEARSAL_POSTGRES_PORT=55433 \
  bash "$script" "$fixture" >"$tmp/port-mismatch.out" 2>"$tmp/port-mismatch.err"; then
  echo 'rehearsal accepted mismatched PostgreSQL URL and Compose ports' >&2
  exit 1
fi
grep -F 'rehearsal PostgreSQL URL port must match REHEARSAL_POSTGRES_PORT' \
  "$tmp/port-mismatch.err" >/dev/null
test ! -e "$tmp/calls.log"

PATH="$tmp/bin:$PATH" \
DATABASE_MIGRATION_URL='postgresql://test:test@127.0.0.1:55433/overtime_test' \
REHEARSAL_POSTGRES_PORT=55433 \
REHEARSAL_API_PORT=33109 \
bash "$script" "$fixture" >"$tmp/success.out" 2>"$tmp/success.err"

steps=(
  '1/8 SQLite backup'
  '2/8 SQLite integrity'
  '3/8 checksum and counts'
  '4/8 PostgreSQL schema'
  '5/8 data migration'
  '6/8 deterministic verification'
  '7/8 API smoke and backup restore'
  '8/8 test-only cleanup'
)
previous=0
for step in "${steps[@]}"; do
  line="$(grep -nF "$step" "$tmp/success.out" | cut -d: -f1)"
  test -n "$line"
  test "$line" -gt "$previous"
  previous="$line"
done

grep -F 'source_counts users=2 overtime_records=3' "$tmp/success.out" >/dev/null
grep -F 'source_backup_sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "$tmp/success.out" >/dev/null
grep -F 'target_counts users=2 overtime_records=3 sessions=0 migrations=1' "$tmp/success.out" >/dev/null
grep -F 'second migration refused non-empty target' "$tmp/success.out" >/dev/null
grep -F 'backup restore verified users=2 overtime_records=3' "$tmp/success.out" >/dev/null
grep -F 'rehearsal passed' "$tmp/success.out" >/dev/null

backup_line="$(grep -n 'sqlite3 .*.backup' "$tmp/calls.log" | cut -d: -f1)"
integrity_line="$(grep -n 'sqlite3 PRAGMA integrity_check' "$tmp/calls.log" | cut -d: -f1)"
checksum_line="$(grep -n '^sha256sum$' "$tmp/calls.log" | head -1 | cut -d: -f1)"
schema_line="$(grep -n '^npm run db:migrate -w ' "$tmp/calls.log" | cut -d: -f1)"
migration_line="$(grep -n '^npm run db:migrate:sqlite -w ' "$tmp/calls.log" | head -1 | cut -d: -f1)"
verification_line="$(grep -n 'docker .*COUNT.*sessions' "$tmp/calls.log" | cut -d: -f1)"
smoke_line="$(grep -n '^curl ' "$tmp/calls.log" | cut -d: -f1)"
cleanup_line="$(grep -n 'docker .* down -v$' "$tmp/calls.log" | cut -d: -f1)"
test "$backup_line" -lt "$integrity_line"
test "$integrity_line" -lt "$checksum_line"
test "$checksum_line" -lt "$schema_line"
test "$schema_line" -lt "$migration_line"
test "$migration_line" -lt "$verification_line"
test "$verification_line" -lt "$smoke_line"
test "$smoke_line" -lt "$cleanup_line"

grep -E 'POSTGRES_TEST_PORT=55433 docker compose -p overtime-rehearsal-test-[0-9]+ -f .*compose.test.yaml down -v' "$tmp/calls.log" >/dev/null
if grep -E '/data/overtime/overtime\.sqlite|203\.0\.113\.10|person|@company\.' "$tmp/success.out" "$tmp/success.err"; then
  echo 'rehearsal output exposed a production path, host, or personal data' >&2
  exit 1
fi

echo 'PostgreSQL migration rehearsal safety contract passed'
