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
npm run db:demo                 # optional: a clinic morning — 30 patients checked in, lab requests for a third
npm install && npm run dev      # the client on http://localhost:3000 (copy .env.example to .env.local first)
```

Studio: http://127.0.0.1:54323 · API: http://127.0.0.1:54321 · DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

Dev users (password `Demo123!`): admin@demo.com (owner), dr.ali@demo.com, nurse@demo.com, lab@demo.com, reception@demo.com. With `VITE_DEMO_LOGINS=true` the login page has one-click buttons for them.

Settings changes need a second factor (spec 02). The dev seed turns that off locally (`core.server_settings` row `require_mfa = off`, migration 0019); when it is on, the Settings page enrols an authenticator app the first time a save is refused.

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
| 0014 | `my_organization`, realtime channel policy | 05 |
| 0015 | `read_entry` names its patient | 05 |
| 0016 | `auth_uid`/`auth_aal` read PostgREST's JSON claims | 02 |
| 0017 | `core.fill_values`: results carry ranges and flags from the service fields | 01, 04 |
| 0018 | `save_service` accepts fields without choices | 02 |
| 0019 | `core.server_settings`: the `require_mfa` switch on the gate (local development sets it off) | 02 |
| 0020 | problems carry a note and a certainty; `core.local_code` + `read_codes`; `save_service` makes local codes | 02, 04 |
| 0022 | spec 07: private visits, the one read log, a correction stays put, department rules, reads for the record views | [07](spec/07-privacy-and-record.md) |
| 0023 | what a pack needs to answer a request: pack writers in Done's write set, one reply-type check in the funnel, prescription requests carry their service and details; enabling a pack fixed | 06 |
| 0021 | the amendments of 2026-09-23: waiting for results, the review rule and reasons, ranges by sex/age, reply types from the registry, the day's released results | [amendments](spec/amendments-2026-09-23.md) |

Tables live in schema `core` and are reachable only through functions in `public`. Every public function is `security definer` with a pinned search path and starts with `require_access`.

## What is built (Phase 1)

The client, `src/core/` — Vite, React, TanStack Query, zustand. Every server call is a function through `src/core/db/rpc.ts`; the department is a client-held choice passed on every call; drafts live in the client until Done writes them as one `write_set`.

- `shell/` — sign-in (demo one-click), the department switcher, ⌘K patient search, the second-factor step-up
- `screens/Reception.tsx` — search-first; Here opens or marks present; New patient is four fields with a duplicate warning
- `screens/Department.tsx`, `Queue.tsx` — the patient queue in bands (Back · In consult · Waiting · Here-pending) and the request queue
- `screens/visit/` — the visit, built for typing. A sticky banner holds Done → next (⌘↵). The side lists problems (certainty, onset and duration, note, the medicines given for them), then medications, then allergies, each with its own + form (Alt+P / Alt+M / Alt+A). The speed line (`/`) turns one typed line into a draft (`parse.ts`):

  ```
  bp 148/92 p 84 t 37 w 86              vitals
  rx metformin 500 bd 30d for dm        prescription, linked to a problem (dm, htn, ckd… understood)
  lab hba1c, lipid · lab urgent cbc     requests, or a preset by name; Tab completes a service
  ref cardiology chest pain on effort   consult
  dx hypertension since 3y ; note       problem ( ? or ddx = suspected )
  al penicillin: rash severe            allergy
  anything else                         joins today's note
  ```
- `screens/bench/` — any department that offers services and sees no patients of its own (laboratory, imaging, pharmacy) works a bench: open requests grouped one row per patient, a scan box for record number or name, section and step filters, Collect all, and one screen per patient where Enter walks every field and ⌘↵ releases every result in one atomic set, then opens the next patient. Values that are not numbers block release; values ten times outside the range ask for a second look; flags use the range that fits the patient's sex and age. Core shows no working steps: packs register them (`registerBenchSteps`). *Released today* lists the last day's results, and Correct replaces one.
- `screens/Request.tsx` — one request: the value grid from the service's fields, a report, preliminary, not done, steps, Release → next; technicians work from the queue row and never read the record
- `screens/Settings.tsx`, `settings/Services.tsx` — organization, departments, users and roles, presets, packs; services grouped by department and section, filtered as you type, edited in place (⌘S), fields typed or pasted one per line (`name | unit | 12-16 | 7-20`, tabs from a spreadsheet work); a field without a registered code gets a local one
- `renderers/` — one card per entry from its display line; packs register richer renderers here
- `packs/index.ts` — the only place packs are named; ESLint keeps core from importing packs

## The first pack: Pharmacy

`supabase/migrations/20260924000001_pharmacy_step.sql`, `…0002_pharmacy_pack.sql`, `src/packs/pharmacy`. Kinds only: a `pharmacy` department type, the `pharmacy_dispense` reply type, the `prepared` step, the `pharmacy_pharmacist` role. Its code runs as its own role in its own schema (`pharmacy.write_dispense`), behind a thin public door (`pharmacy_write_dispense`). On the bench it adds a Prepare button and a dispense form filled from the prescription (quantity from dose frequency × days, substitution, not dispensed). A prescription becomes a request only while the pack is on and a Dispensing service exists.

## Tests

`supabase/tests/` — each runs on a fresh database:

- `smoke_spine.sql` — the record itself: routing, idempotency, steps, flags, values, the fold, permanence, correction, refusals
- `smoke_api.sql` — a clinic day through the public functions as three users: the gate, one atomic Done, both lists, two routed requests, the lab, a critical result to review, the chart
- `smoke_visits.sql` — reception → queue → consult → results → BACK → done → follow-up
- `privacy.sql` — private visits: hidden notes, visible facts, open anyway, the read log, corrections stay put, department rules
- `pharmacy.sql` — the first pack: boundary, a prescription becomes a request, prepared, dispensed in a write set, pack off
- `amendments.sql` — waiting for results, not-seen results, the review rule, ranges by sex, reply types, correction
- `boundary.sql` — the pack boundary against a hostile fixture pack: grants, ownership, a sleeping pack, a raising pack, a pack writing core, the gate on a pack caller, the record lock

## Layout

```
spec/                 the design; locked
supabase/migrations/  the database, in order
supabase/seeds/       auth users and a dev clinic (local only)
supabase/tests/       SQL tests
scripts/db-test.sh    runs them
src/core/             the client: db, auth, hooks, shell, screens, renderers
src/packs/            packs: pharmacy (the first)
```

## Next

Phase 2: the first packs — Laboratory, Pharmacy, Billing, Internal medicine (spec 06) — then the core-later items from the audit: `read_cohort`, the outbound door, server-side drafts, user invitations from Settings.
