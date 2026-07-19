#!/usr/bin/env bash
set -euo pipefail

readonly COMPOSE_FILE="compose.test.yaml"
readonly COMPOSE_PROJECT="overtime-tracker-test"

cleanup() {
  docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" down -v
}

trap cleanup EXIT

docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" up -d --wait
npm run test:e2e -w apps/api
