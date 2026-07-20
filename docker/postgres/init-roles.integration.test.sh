#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="overtime-roles-test-$$"
tmp="$(mktemp -d)"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

admin_password="$(openssl rand -hex 32)"
migration_password="$(openssl rand -hex 32)"
runtime_password="$(openssl rand -hex 32)"
backup_password="$(openssl rand -hex 32)"

for secret in "$admin_password" "$migration_password" "$runtime_password" "$backup_password"; do
  [[ "$secret" =~ ^[0-9a-f]{64}$ ]]
done

docker run --detach --rm \
  --name "$container" \
  --tmpfs /var/lib/postgresql/data \
  --env POSTGRES_DB=overtime \
  --env POSTGRES_USER=postgres \
  --env POSTGRES_PASSWORD="$admin_password" \
  --env POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 \
  --env POSTGRES_MIGRATION_PASSWORD="$migration_password" \
  --env POSTGRES_RUNTIME_PASSWORD="$runtime_password" \
  --env POSTGRES_BACKUP_PASSWORD="$backup_password" \
  --mount "type=bind,source=$root/docker/postgres/init-roles.sh,target=/docker-entrypoint-initdb.d/10-init-roles.sh,readonly" \
  --mount "type=bind,source=$root/docker/postgres/healthcheck.sh,target=/usr/local/bin/overtime-postgres-healthcheck,readonly" \
  postgres:17.10-bookworm >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container" /usr/local/bin/overtime-postgres-healthcheck >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$container" /usr/local/bin/overtime-postgres-healthcheck

logs="$(docker logs "$container" 2>&1)"
for secret in "$admin_password" "$migration_password" "$runtime_password" "$backup_password"; do
  if [[ "$logs" == *"$secret"* ]]; then
    echo 'postgres bootstrap logs exposed a password' >&2
    exit 1
  fi
done

if docker exec \
  --env PGPASSWORD=definitely-wrong-password \
  "$container" \
  psql --host=127.0.0.1 --username overtime_migrator --dbname overtime \
  --command='SELECT 1;' >/dev/null 2>&1; then
  echo 'migration role unexpectedly authenticated with the wrong password' >&2
  exit 1
fi

docker exec --interactive \
  --env PGPASSWORD="$migration_password" \
  "$container" \
  psql --set=ON_ERROR_STOP=1 --host=127.0.0.1 --username overtime_migrator --dbname overtime <<'SQL' >/dev/null
CREATE TABLE privilege_probe (id integer PRIMARY KEY, value text NOT NULL);
INSERT INTO privilege_probe VALUES (1, 'seed');
SQL

docker exec --interactive \
  --env PGPASSWORD="$runtime_password" \
  "$container" \
  psql --set=ON_ERROR_STOP=1 --host=127.0.0.1 --username overtime_app --dbname overtime <<'SQL' >/dev/null
SELECT * FROM privilege_probe;
INSERT INTO privilege_probe VALUES (2, 'runtime');
UPDATE privilege_probe SET value = 'updated' WHERE id = 2;
DELETE FROM privilege_probe WHERE id = 2;
SQL

if docker exec \
  --env PGPASSWORD="$runtime_password" \
  "$container" \
  psql --set=ON_ERROR_STOP=1 --host=127.0.0.1 --username overtime_app --dbname overtime \
  --command='CREATE TABLE runtime_must_not_create (id integer);' >/dev/null 2>&1; then
  echo 'runtime role unexpectedly created a table' >&2
  exit 1
fi

docker exec \
  --env PGPASSWORD="$backup_password" \
  "$container" \
  psql --set=ON_ERROR_STOP=1 --host=127.0.0.1 --username overtime_backup --dbname overtime \
  --command='SELECT * FROM privilege_probe;' >/dev/null

if docker exec \
  --env PGPASSWORD="$backup_password" \
  "$container" \
  psql --set=ON_ERROR_STOP=1 --host=127.0.0.1 --username overtime_backup --dbname overtime \
  --command="INSERT INTO privilege_probe VALUES (3, 'forbidden');" >/dev/null 2>&1; then
  echo 'backup role unexpectedly inserted a row' >&2
  exit 1
fi

docker exec "$container" psql --username postgres --dbname overtime \
  --command='ALTER DEFAULT PRIVILEGES FOR ROLE overtime_migrator IN SCHEMA public REVOKE SELECT ON TABLES FROM overtime_backup;' \
  >/dev/null
if docker exec "$container" /usr/local/bin/overtime-postgres-healthcheck >/dev/null 2>&1; then
  echo 'healthcheck stayed healthy after required default privilege was removed' >&2
  exit 1
fi

echo 'postgres role bootstrap integration test passed'
