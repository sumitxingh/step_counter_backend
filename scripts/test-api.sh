#!/usr/bin/env bash
# Runs the full Postman collection against a live server via Newman and writes
# a Markdown report (flow + pass/fail percentages) to reports/api-test-report.md.
# Admin routes need role='admin' in the DB, which no API endpoint grants
# (by design, see docs/design.md §4) — so this promotes the user created in
# stage 1 directly in Postgres before running the Admin folder in stage 2.
set -uo pipefail
cd "$(dirname "$0")/.."

COLLECTION="docs/postman/Step Counter API.postman_collection.json"
ENV_FILE="docs/postman/Step Counter - Local.postman_environment.json"
EXPORTED_ENV="$(mktemp -t step-counter-env).json"
STAGE1_JSON="$(mktemp -t step-counter-stage1).json"
STAGE2_JSON="$(mktemp -t step-counter-stage2).json"
REPORT="reports/api-test-report.md"
PG_CONTAINER="${PG_CONTAINER:-atom_admin_postgres}"
PG_DB="${PG_DB:-step_counter_db}"
PG_USER="${PG_USER:-postgres}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

cleanup() { rm -f "$EXPORTED_ENV" "$STAGE1_JSON" "$STAGE2_JSON"; }
trap cleanup EXIT

if ! curl -s -o /dev/null "$BASE_URL"; then
  echo "Error: no server reachable at $BASE_URL — run 'npm run start' (or start:dev) first." >&2
  exit 1
fi

echo "== stage 1: auth, users, steps, notifications =="
npx newman run "$COLLECTION" \
  -e "$ENV_FILE" \
  --env-var "base_url=$BASE_URL" \
  --folder Auth \
  --folder Users \
  --folder Steps \
  --folder Notifications \
  --reporters cli,json \
  --reporter-json-export "$STAGE1_JSON" \
  --export-environment "$EXPORTED_ENV"
STAGE1_EXIT=$?

EMAIL=$(node -e "console.log(require('$EXPORTED_ENV').values.find(v => v.key === 'user_email').value)" 2>/dev/null)

STAGE2_EXIT=0
if [ -n "$EMAIL" ] && [ "$EMAIL" != "undefined" ]; then
  echo "== promoting $EMAIL to admin for the Admin folder =="
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c \
    "UPDATE users SET role='admin' WHERE email='$EMAIL';" >/dev/null

  echo "== stage 2: admin =="
  npx newman run "$COLLECTION" \
    -e "$EXPORTED_ENV" \
    --env-var "admin_email=$EMAIL" \
    --folder Admin \
    --reporters cli,json \
    --reporter-json-export "$STAGE2_JSON"
  STAGE2_EXIT=$?
else
  echo "Skipping stage 2 (Admin) — could not read user_email, stage 1 likely failed before Register completed." >&2
fi

echo "== report =="
node scripts/generate-report.js "$REPORT" \
  "Core flow (Auth, Users, Steps, Notifications)=$STAGE1_JSON" \
  "Admin flow=$STAGE2_JSON"
REPORT_EXIT=$?

if [ "$STAGE1_EXIT" -ne 0 ] || [ "$STAGE2_EXIT" -ne 0 ] || [ "$REPORT_EXIT" -ne 0 ]; then
  echo "Some API tests failed — see $REPORT" >&2
  exit 1
fi

echo "All API tests passed — see $REPORT"
