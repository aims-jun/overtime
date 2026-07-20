#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

docker compose \
  --env-file "$root/deploy/oracle/production.env.example" \
  -f "$root/compose.production.yaml" \
  config > "$tmp"

expected_postgres_data_dir="${EXPECTED_POSTGRES_DATA_DIR:-/data/postgres}"
grep -Fx 'APP_ORIGINS=https://aims-overtime.duckdns.org' \
  "$root/deploy/oracle/production.env.example"
grep -F "source: $expected_postgres_data_dir" "$tmp"
grep -F 'target: /var/lib/postgresql/data' "$tmp"
grep -F 'condition: service_healthy' "$tmp"
grep -F 'memory: "402653184"' "$tmp"
grep -F 'DATABASE_URL:' "$tmp"
if grep -F 'DATABASE_PATH:' "$tmp"; then
  echo 'API must not receive DATABASE_PATH' >&2
  exit 1
fi
if grep -F 'POSTGRES_ADMIN_PASSWORD:' "$tmp" | grep -v '^      POSTGRES_ADMIN_PASSWORD:'; then
  echo 'PostgreSQL admin password must not be injected into another service' >&2
  exit 1
fi
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
