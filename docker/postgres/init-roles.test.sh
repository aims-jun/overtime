#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin"
cat > "$tmp/bin/psql" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "$PSQL_ARGS_LOG"
cat > "$PSQL_STDIN_LOG"
EOF
chmod +x "$tmp/bin/psql"

migration_password='migration-secret-with-$-and-quotes'
runtime_password='runtime-secret-with-$-and-quotes'
backup_password='backup-secret-with-$-and-quotes'

output="$({
  PATH="$tmp/bin:$PATH" \
  PSQL_ARGS_LOG="$tmp/psql-args.log" \
  PSQL_STDIN_LOG="$tmp/psql-stdin.log" \
  POSTGRES_USER=postgres \
  POSTGRES_DB=overtime \
  POSTGRES_MIGRATION_PASSWORD="$migration_password" \
  POSTGRES_RUNTIME_PASSWORD="$runtime_password" \
  POSTGRES_BACKUP_PASSWORD="$backup_password" \
    "$root/docker/postgres/init-roles.sh"
} 2>&1)"

for secret in "$migration_password" "$runtime_password" "$backup_password"; do
  if [[ "$output" == *"$secret"* ]]; then
    echo 'role bootstrap printed a password' >&2
    exit 1
  fi
done

grep -Fqx -- '--set=migrator_password=migration-secret-with-$-and-quotes' "$tmp/psql-args.log"
grep -Fqx -- '--set=runtime_password=runtime-secret-with-$-and-quotes' "$tmp/psql-args.log"
grep -Fqx -- '--set=backup_password=backup-secret-with-$-and-quotes' "$tmp/psql-args.log"

grep -F 'CREATE ROLE overtime_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE' "$tmp/psql-stdin.log"
grep -F 'CREATE ROLE overtime_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE' "$tmp/psql-stdin.log"
grep -F 'CREATE ROLE overtime_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE' "$tmp/psql-stdin.log"
grep -F 'ALTER DATABASE :"database_name" OWNER TO overtime_migrator' "$tmp/psql-stdin.log"
grep -F 'ALTER SCHEMA public OWNER TO overtime_migrator' "$tmp/psql-stdin.log"
grep -F 'GRANT CONNECT ON DATABASE :"database_name" TO overtime_app, overtime_backup' "$tmp/psql-stdin.log"
grep -F 'GRANT USAGE ON SCHEMA public TO overtime_app, overtime_backup' "$tmp/psql-stdin.log"
grep -F 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO overtime_app' "$tmp/psql-stdin.log"
grep -F 'GRANT SELECT ON TABLES TO overtime_backup' "$tmp/psql-stdin.log"

echo 'postgres role bootstrap contract passed'
