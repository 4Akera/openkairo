#!/usr/bin/env bash
# npm run db:demo: loads the demo into this checkout's database (supabase/demo/load.sql: the kit, the base, each pack, the shared
# journey) in one transaction, through the doors. Run it again any time: it reloads, leaving a fresh working day. A refusal or a
# flagged entry stops it and nothing is kept.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=$(bash scripts/db-container.sh)
awk -f scripts/include.awk supabase/demo/load.sql | docker exec -i -e PGOPTIONS=--client-min-messages=warning "$DB" psql -U postgres -q -1 -v ON_ERROR_STOP=1 -f - > /dev/null
docker exec -i "$DB" psql -U postgres -At -c "select 'demo loaded: ' || (select count(*) from core.patients where organization_id = '00000000-0000-0000-0000-00000000a001')
  || ' patients · ' || (select count(*) from base.presence where organization_id = '00000000-0000-0000-0000-00000000a001' and state not in ('done', 'left', 'discharged'))
  || ' open visits and stays · ' || (select count(*) from core.entries where organization_id = '00000000-0000-0000-0000-00000000a001') || ' entries'"
