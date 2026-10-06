#!/usr/bin/env bash
# Load a licensed code file into core.codes, per installation (spec/openCare.md §6.1, §7 decision 5): WHO ICD-10, WHO ATC, the EDA list.
# The files are not in the repository. Each is a CSV with a header: code,label[,parent][,props as JSON]
#   scripts/import-codes.sh icd10 ~/codes/icd10-who-2019.csv
#   scripts/import-codes.sh atc   ~/codes/atc-2025.csv
#   scripts/import-codes.sh eda   ~/codes/eda-drugs.csv
# A code already present keeps its row and gets the new label and props (a re-import is safe). Local database by default; set
# DATABASE_URL to load elsewhere.
set -euo pipefail
system=${1:?system key (icd10, atc, eda)}; file=${2:?csv file}
[ -f "$file" ] || { echo "no such file: $file"; exit 1; }
script() {
  echo "create temp table incoming (code text, label text, parent text, props text);"
  echo "copy incoming from stdin with (format csv, header true);"
  cat "$file"; echo '\.'
  cat <<SQL
insert into core.codes (system, code, labels, parent, props)
  select '$system', trim(code), jsonb_build_object('en', trim(label)), nullif(trim(parent), ''), coalesce(nullif(props, '')::jsonb, '{}')
    from incoming where trim(coalesce(code, '')) <> ''
  on conflict (system, code) do update set labels = core.codes.labels || excluded.labels, parent = excluded.parent, props = core.codes.props || excluded.props;
select '$system: ' || count(*) || ' codes' from core.codes where system = '$system';
SQL
}
if [ -n "${DATABASE_URL:-}" ]; then
  script | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -t -f -
else
  DB=$(bash "$(dirname "$0")/db-container.sh") || exit 1
  script | docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -t -f -
fi
