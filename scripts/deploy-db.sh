#!/usr/bin/env bash
# npm run db:deploy: loads openCare into a hosted Supabase database — the migrations and seeds (recorded, so a later `supabase db push` adds
# only new ones), then, with --demo, the demo (supabase/demo/load.sql: the seeds, the demo staff and patients, one transaction).
# The connection string is read from SUPABASE_DB_URL (Dashboard → Connect → Session pooler; percent-encode the password) and is
# never written anywhere. psql comes from this machine, else from a running local Supabase stack's database container.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL to the hosted database's connection string}"
demo=0; [ "${1:-}" = "--demo" ] && demo=1

if command -v psql > /dev/null; then run_psql() { psql "$SUPABASE_DB_URL" "$@"; }
else
  db=$(docker ps --format '{{.Names}}' | grep -m1 '^supabase_db_') || { echo "no psql here and no local Supabase stack running" >&2; exit 1; }
  run_psql() { docker exec -i -e PGOPTIONS=--client-min-messages=warning "$db" psql "$SUPABASE_DB_URL" "$@"; }
fi

echo "→ migrations and seeds (the code lists, the clinic, each pack's seed)"
supabase db push --db-url "$SUPABASE_DB_URL" --include-seed --yes

if [ $demo -eq 1 ]; then
  echo "→ demo"
  awk -f scripts/include.awk supabase/demo/load.sql | run_psql -q -1 -v ON_ERROR_STOP=1 -f - > /dev/null
  run_psql -At -c "select 'demo loaded: ' || (select count(*) from core.patients) || ' patients · ' || (select count(*) from core.entries) || ' entries'"
fi
