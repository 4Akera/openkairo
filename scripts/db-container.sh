#!/usr/bin/env bash
# The database container of this checkout's local stack: supabase_db_<project_id of supabase/config.toml>, so a second checkout with
# its own project_id and ports tests against its own database, never another's.
cd "$(dirname "$0")/.."
project=$(sed -nE 's/^project_id *= *"([^"]+)".*/\1/p' supabase/config.toml | head -1)
db="supabase_db_$project"
docker ps --format '{{.Names}}' | grep -qx "$db" || { echo "no $db container is running (supabase start)" >&2; exit 1; }
echo "$db"
