#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp)"
tmp_json="$(mktemp)"
local_tmp="$(mktemp)"
local_json="$(mktemp)"
local_err="$(mktemp)"
trap 'rm -f "$tmp" "$tmp_json" "$local_tmp" "$local_json" "$local_err"' EXIT

docker compose \
  --env-file "$root/.env.example" \
  -f "$root/compose.yaml" \
  config > "$local_tmp" 2> "$local_err"
test ! -s "$local_err"
docker compose \
  --env-file "$root/.env.example" \
  -f "$root/compose.yaml" \
  config --format json > "$local_json"

node - "$root/.env.example" "$local_json" <<'NODE'
const fs = require('node:fs');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8')
  .split(/\r?\n/).filter(line => line && !line.startsWith('#'))
  .map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const config = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const postgres = config.services.postgres;
const urls = [
  ['DATABASE_URL', 'POSTGRES_RUNTIME_PASSWORD', 'overtime_app'],
  ['DATABASE_MIGRATION_URL', 'POSTGRES_MIGRATION_PASSWORD', 'overtime_migrator'],
];
for (const key of ['POSTGRES_ADMIN_PASSWORD', 'POSTGRES_RUNTIME_PASSWORD', 'POSTGRES_MIGRATION_PASSWORD', 'POSTGRES_BACKUP_PASSWORD']) {
  if (!env[key] || env[key] === 'replace-me') throw new Error(`${key} must have a clearly local fake value`);
}
if (postgres.environment.POSTGRES_PASSWORD !== env.POSTGRES_ADMIN_PASSWORD) throw new Error('admin bootstrap password mismatch');
for (const [urlKey, passwordKey, user] of urls) {
  const url = new URL(env[urlKey]);
  if (url.username !== user || url.password !== env[passwordKey]) throw new Error(`${urlKey} role/password mismatch`);
}
if (env.POSTGRES_DATA_DIR !== './data/postgres') throw new Error('local PostgreSQL data directory must be workspace-local');
const port = postgres.ports?.[0];
if (!port || port.host_ip !== '127.0.0.1' || String(port.published) !== (env.POSTGRES_PORT || '55432') || String(port.target) !== '5432') {
  throw new Error('local PostgreSQL must publish only the configured loopback port');
}
NODE

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
