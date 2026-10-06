#!/usr/bin/env bash
# Load a licensed code file into core.codes, per installation (spec/openCare.md §6.1, §7 decision 5): WHO ICD-10, WHO ATC, the EDA list.
# The files are not in the repository. Each is a CSV with a header: code,label[,parent][,props as JSON]
#   scripts/import-codes.sh icd10 ~/codes/icd10-who-2019.csv 2019
#   scripts/import-codes.sh atc   ~/codes/atc-2025.csv 2025
#   scripts/import-codes.sh eda   ~/codes/eda-drugs.csv 2026-09
# A code already present keeps its row and gets the new label and props (a re-import is safe). Each load is recorded (core.record_import:
# the version, the file as its source, the system's licence note), so Settings -> Reference lists shows it. Local database by default;
# set DATABASE_URL to load elsewhere.
set -euo pipefail
system=${1:?system key (icd10, atc, eda)}; file=${2:?csv file}; version=${3:-}
[ -f "$file" ] || { echo "no such file: $file"; exit 1; }
quoted() { printf '%s' "$1" | sed "s/'/''/g"; }
v_sql=$(quoted "$version"); src_sql=$(quoted "$(basename "$file")")
script() {
  echo "create temp table incoming (code text, label text, parent text, props text);"
  echo "copy incoming from stdin with (format csv, header true);"
  cat "$file"; echo '\.'
  cat <<SQL
insert into core.codes (system, code, labels, parent, props)
  select '$system', trim(code), jsonb_build_object('en', trim(label)), nullif(trim(parent), ''), coalesce(nullif(props, '')::jsonb, '{}')
    from incoming where trim(coalesce(code, '')) <> ''
  on conflict (system, code) do update set labels = core.codes.labels || excluded.labels, parent = excluded.parent, props = core.codes.props || excluded.props;
select core.record_import('$system', nullif('$v_sql', ''), '$src_sql');
select '$system: ' || count(*) || ' codes' from core.codes where system = '$system';
SQL
}
if [ -n "${DATABASE_URL:-}" ]; then
  script | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -t -f -
else
  DB=$(bash "$(dirname "$0")/db-container.sh") || exit 1
  script | docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -t -f -
fi
