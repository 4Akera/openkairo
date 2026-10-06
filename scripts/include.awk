# Prints a SQL file with each line `-- include: <path>` replaced by that file, itself expanded the same way (paths from the repo root).
# Used by scripts/db-test.sh (a suite that replays the demo) and scripts/demo.sh (the demo's own order, supabase/demo/load.sql).
function expand(f,   line) {
  while ((getline line < f) > 0) {
    if (line ~ /^-- include: /) expand(substr(line, 13)); else print line
  }
  close(f)
}
{ if ($0 ~ /^-- include: /) expand(substr($0, 13)); else print }
