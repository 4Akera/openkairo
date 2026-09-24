#!/usr/bin/env bash
# Runs every SQL test on a fresh database. Exits non-zero if any test prints an unexpected ERROR.
set -uo pipefail
cd "$(dirname "$0")/.."
DB=$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -1)
EXPECTED='pack_off|unknown_department_type|reason_missing|wrong_reply_type|bad_reply_type|not_allowed|author_mismatch|entries are permanent|requests are changed|already_replaced|request_has_replies|problem_not_found|record_not_open|permission denied|hostile raise|canceling statement|pg_advisory'
fail=0
for t in supabase/tests/*.sql; do
  supabase db reset > /dev/null 2>&1 || { echo "db reset failed"; exit 1; }
  out=$(docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=0 -q < "$t" 2>&1)
  bad=$(echo "$out" | grep -E '^ERROR' | grep -vE "$EXPECTED" || true)
  if [ -n "$bad" ] || echo "$out" | grep -q 'FAIL'; then echo "✗ $t"; echo "$bad"; echo "$out" | grep 'FAIL'; fail=1; else echo "✓ $t"; fi
done
exit $fail
