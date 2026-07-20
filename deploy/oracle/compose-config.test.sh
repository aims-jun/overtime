#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp)"
tmp_json="$(mktemp)"
trap 'rm -f "$tmp" "$tmp_json"' EXIT

docker compose \
  --env-file "$root/deploy/oracle/production.env.example" \
  -f "$root/compose.production.yaml" \
  config > "$tmp"
docker compose \
  --env-file "$root/deploy/oracle/production.env.example" \
  -f "$root/compose.production.yaml" \
  config --format json > "$tmp_json"

expected_postgres_data_dir="${EXPECTED_POSTGRES_DATA_DIR:-/data/postgres}"
grep -Fx 'APP_ORIGINS=https://aims-overtime.duckdns.org' \
  "$root/deploy/oracle/production.env.example"
grep -F "source: $expected_postgres_data_dir" "$tmp"
grep -F 'target: /var/lib/postgresql/data' "$tmp"
grep -F 'condition: service_healthy' "$tmp"
grep -F 'memory: "402653184"' "$tmp"
grep -F 'target: /usr/local/bin/overtime-postgres-healthcheck' "$tmp"
grep -F '/usr/local/bin/overtime-postgres-healthcheck' "$tmp"
node - "$tmp_json" <<'NODE'
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const apiEnvironment = config.services.api.environment;
const forbidden = [
  'DATABASE_PATH',
  'DATABASE_MIGRATION_URL',
  'POSTGRES_PASSWORD',
  'POSTGRES_ADMIN_PASSWORD',
  'POSTGRES_MIGRATION_PASSWORD',
  'POSTGRES_RUNTIME_PASSWORD',
  'POSTGRES_BACKUP_PASSWORD',
];

if (!Object.hasOwn(apiEnvironment, 'DATABASE_URL')) {
  throw new Error('API must receive DATABASE_URL');
}
for (const name of forbidden) {
  if (Object.hasOwn(apiEnvironment, name)) {
    throw new Error(`API must not receive privileged variable ${name}`);
  }
}

const healthcheck = config.services.postgres.healthcheck.test;
if (JSON.stringify(healthcheck) !== JSON.stringify([
  'CMD',
  '/usr/local/bin/overtime-postgres-healthcheck',
])) {
  throw new Error('PostgreSQL healthcheck must verify initialized roles and privileges');
}
NODE
grep -F 'target: 80' "$tmp"
grep -F 'target: 443' "$tmp"
if grep -F 'published: "3000"' "$tmp"; then
  echo 'API port 3000 must not be published' >&2
  exit 1
fi
if grep -F 'published: "5432"' "$tmp"; then
  echo 'PostgreSQL port 5432 must not be published' >&2
  exit 1
fi

echo 'oracle compose contract passed'
