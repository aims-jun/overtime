#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

docker compose \
  --env-file "$root/deploy/oracle/production.env.example" \
  -f "$root/compose.production.yaml" \
  config > "$tmp"

expected_data_dir="${EXPECTED_DATA_DIR:-/data/overtime}"
grep -Fx 'APP_ORIGINS=https://aims-overtime.duckdns.org' \
  "$root/deploy/oracle/production.env.example"
grep -F "source: $expected_data_dir" "$tmp"
grep -F 'target: /app/data' "$tmp"
grep -F 'target: 80' "$tmp"
grep -F 'target: 443' "$tmp"
if grep -F 'published: "3000"' "$tmp"; then
  echo 'API port 3000 must not be published' >&2
  exit 1
fi

echo 'oracle compose contract passed'
