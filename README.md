# openCare

A clinical record system built on one idea: the record is a list of entries that are written once and never changed; every department reads and writes that same record; packs add kinds, never core.

The design is in [`spec/`](spec/README.md) — six locked core specs (the record, the organization, patients and visits, the core entry types, the screens, the pack contract) and the audit that reviewed them. Read `spec/01-record.md` first.

## Run locally

Prerequisites: Docker (Colima on this machine), the Supabase CLI, Node 22+.

```bash
colima start                    # once per boot
supabase start                  # Postgres 17, Auth, Realtime, Storage, Studio
npm run db:reset                # migrations → registry → dev seed
npm run db:test                 # every SQL test on a fresh database
```

Studio: http://127.0.0.1:54323 · API: http://127.0.0.1:54321 · DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

Dev users (password `Demo123!`): admin@demo.com (owner), dr.ali@demo.com, nurse@demo.com, lab@demo.com, reception@demo.com.

## What is built (Phase 0)

The database half of the core, from specs 01–04, in `supabase/migrations/`:

| # | Migration | Spec |
|---|---|---|
| 0001 | foundation: schemas, roles, enums, helpers | 01, 02 |
| 0002 | the organization: users, roles, actions, departments, services, packs, audit | 02 |
| 0003 | patients and visits | 03 |
| 0004 | the record: entries (insert-only), requests, steps, values, files, drafts, patient lists | 01, 04 |
| 0005 | the gate: `require_access`, `require_pack`, `current_user_id` | 02 |
| 0006 | the funnels: `write_entry`, `change_request`, the fold, values, updaters, holds | 01 |
| 0007 | the registry core ships: actions, built-in roles, department types, entry types, vitals codes | 02, 04 |
| 0008 | the patient-list updaters and `rebuild_record` | 04 |
| 0009 | the nine public writes, `write_set`, `write_entered_in_error`, the marks | 04 |
| 0010 | the public reads: `read_record`, `read_entries`, `read_entry`, `read_values`, `read_queue`, `read_to_review` | 04 |
| 0011 | registration, search, the Here button, visit moves, the visit queue, the sweep | 03 |
| 0012 | organization functions: `save_…`, `retire_…`, `read_organization`, birth and invitations | 02 |
| 0013 | the runner, cron, the RLS backstop, revocations, `erase_patient` | 01, 02, 06 |

Tables live in schema `core` and are reachable only through functions in `public`. Every public function is `security definer` with a pinned search path and starts with `require_access`.

## Tests

`supabase/tests/` — each runs on a fresh database:

- `smoke_spine.sql` — the record itself: routing, idempotency, steps, flags, values, the fold, permanence, correction, refusals
- `smoke_api.sql` — a clinic day through the public functions as three users: the gate, one atomic Done, both lists, two routed requests, the lab, a critical result to review, the chart
- `smoke_visits.sql` — reception → queue → consult → results → BACK → done → follow-up
- `boundary.sql` — the pack boundary against a hostile fixture pack: grants, ownership, a sleeping pack, a raising pack, a pack writing core, the gate on a pack caller, the record lock

## Layout

```
spec/                 the design; locked
supabase/migrations/  the database, in order
supabase/seeds/       auth users and a dev clinic (local only)
supabase/tests/       SQL tests
scripts/db-test.sh    runs them
```

## Next

Phase 1: the client — the shell, reception, the queue, the visit screen, the request surface, settings (spec 05) — then the first packs: Laboratory, Pharmacy, Billing, Internal medicine (spec 06).
