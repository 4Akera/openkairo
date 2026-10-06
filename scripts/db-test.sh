#!/usr/bin/env bash
# The SQL suites (spec 08 K1). The database is reset once; each suite runs inside one transaction that is rolled back, so suites
# never see each other's rows (deferred constraints are checked before the rollback). A suite whose first line is `-- needs: reset`
# (it commits, e.g. `call core.run_pack_calls()`) gets a fresh database of its own and no wrapper. Every suite is preceded by
# supabase/tests/lib/*.sql (the t.* helpers).
# A suite fails on: any FAIL line; any ERROR, FATAL or psql error not named on its `-- expects:` line; an expected error that
# happens a different number of times (the line names each code once per expected refusal, comma-separated, since some messages
# are several words); psql exiting non-zero (a lost connection); ending the wrapper transaction itself; checking nothing at all.
# `db-test.sh <name> …` runs only those suites.
set -uo pipefail
cd "$(dirname "$0")/.."
DB=$(bash scripts/db-container.sh) || exit 1   # this checkout's own stack (supabase/config.toml project_id)
reset() { supabase db reset > /dev/null 2>&1 || { echo "db reset failed"; exit 1; }; }
LIB=$(cat supabase/tests/lib/*.sql)
DBHOST=$(docker exec "$DB" hostname -i | awk '{print $1}')   # the concurrency suite opens real second sessions (dblink) through it
psql_in() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=0 -v dbhost="$DBHOST" -q -t -f - 2>&1; }
esc() { sed -E 's/[][().*+?^$|{}\\]/\\&/g'; }
# a suite line `-- include: <path>` is replaced by that file (the rebuild suite replays the demo day)
suite() { awk '/^-- include: /{ while ((getline line < $3) > 0) print line; close($3); next } { print }' "$1"; }

if [ $# -gt 0 ]; then
  suites=()
  for k in "$@"; do suites+=("supabase/tests/$k.sql"); done
else
  suites=(supabase/tests/*.sql)
fi

fail=0; dirty=1
for t in "${suites[@]}"; do
  [ -f "$t" ] || { echo "✗ $t: no such suite"; fail=1; continue; }
  if [ "$(head -1 "$t")" = "-- needs: reset" ]; then
    reset; dirty=1
    out=$( { printf '%s\n' "$LIB"; suite "$t"; } | psql_in ); rc=$?
  else
    if [ $dirty -eq 1 ]; then reset; dirty=0; fi
    out=$( { echo '\set ON_ERROR_ROLLBACK on'; echo 'begin;'; echo 'select txid_current() as wrap_xid \gset'
             printf '%s\n' "$LIB"; suite "$t"; echo
             echo 'set constraints all immediate;'
             echo "select 'FAIL the suite ended the wrapper transaction (commit, rollback or a reconnect)' where txid_current() <> :wrap_xid;"
             echo 'rollback;'; } | psql_in ); rc=$?
    case "$out" in *'ended the wrapper transaction'*) dirty=1;; esac
  fi
  errors=$(printf '%s\n' "$out" | grep -E '^(psql:[^ ]*: )?(ERROR|FATAL|PANIC|error):' || true)
  want=$(grep -m1 -E '^-- expects:' "$t" | sed -E 's/^-- expects:[[:space:]]*//' | tr ',' '\n' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; /^$/d')
  if [ -n "$want" ]; then
    pattern=$(printf '%s\n' "$want" | esc | paste -sd'|' -)
    bad=$(printf '%s\n' "$errors" | grep -vE "ERROR: +($pattern)" | sed '/^$/d' || true)
    miss=$(printf '%s\n' "$want" | sort | uniq -c | while read -r n c; do
      re=$(printf '%s' "$c" | esc)
      m=$(printf '%s\n' "$errors" | grep -cE "ERROR: +$re" || true)
      [ "$m" -eq "$n" ] || echo "expected $n × $c, got $m"
    done)
    [ -n "$miss" ] && bad=$(printf '%s\n%s' "$bad" "$miss" | sed '/^$/d')
  else
    bad=$errors
  fi
  [ $rc -eq 0 ] || bad=$(printf '%s\npsql exited %s' "$bad" "$rc" | sed '/^$/d')
  fails=$(printf '%s\n' "$out" | grep -E '(^|[^A-Za-z_])FAIL([^A-Za-z_]|$)' || true)
  checks=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*ok ' || true)
  known=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*known ' || true)
  limits=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*host limit ' || true)
  if [ "$checks" -eq 0 ] && [ "$known" -eq 0 ] && [ -z "$want" ]; then bad=$(printf '%s\nno check ran' "$bad" | sed '/^$/d'); fi
  note="$checks ok"; [ "$known" -gt 0 ] && note="$note, $known known"; [ "$limits" -gt 0 ] && note="$note, $limits host limits"
  if [ -n "$bad" ] || [ -n "$fails" ]; then
    echo "✗ $t ($note)"; [ -n "$bad" ] && printf '%s\n' "$bad" | sed 's/^/    /'; [ -n "$fails" ] && printf '%s\n' "$fails" | sed 's/^/    /'
    fail=1
  else
    echo "✓ $t ($note)"
  fi
done
# the client's entry and setting types are generated from the declared shapes (spec §8): a stale file fails the run
npm run -s gen:shapes -- --check || fail=1
exit $fail
