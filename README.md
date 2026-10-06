# openCare

A clinical record system built on one idea: the record is a list of entries that are written once and never changed; every department reads and writes that same record; packs add kinds, never core.

The design is one document: [`spec/openCare.md`](spec/openCare.md) — the layers, the spine, the core (the writer and the reader are the only ways in and out), the base, packs, standards (ICD-10, ATC, LOINC, UCUM, FHIR R4), the decisions, the permanent tests and the build record. Earlier specs are in `spec/archive/`.

## Run locally

Prerequisites: Docker (Colima on this machine), the Supabase CLI, Node 22+.

```bash
colima start                    # once per boot
supabase start                  # Postgres 17, Auth, Realtime, Storage, Studio
npm run db:reset                # migrations → codes, the demo kit, the base's clinic and staff, the pharmacy's (supabase/seeds/)
npm run db:test                 # every SQL suite (22), each in its own rolled-back transaction
npm run db:demo                 # a working day, times relative to now: the base's, each pack's, the shared journey (run again to reload)
npm run test:composer           # the composer's typed lines and drafts → entries (no browser, no database)
npm run gen:shapes              # the client's entry and setting types from the declared shapes (db:test fails when they are stale)
npm install && npm run dev      # the client on http://localhost:3000 (copy .env.example to .env.local first)
```

Studio: http://127.0.0.1:54323 · API: http://127.0.0.1:54321 · DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

Demo people (password `Demo123!`, the kit's `demo.password()`), one for every built-in role: Amira Lotfy admin@demo.com (owner), Mai Samir reception@demo.com (Front desk), Dr. Ali Hassan dr.ali@demo.com and Sara Mahmoud nurse@demo.com (General Practice and the Medical Ward), Dr. Salma Adel psych@demo.com (Psychiatry, a private department), Karim Fawzy lab@demo.com (Laboratory), Dr. Reem Hamdy pharm@demo.com and Hesham Ragab store@demo.com (Pharmacy). With `VITE_DEMO_LOGINS=true` the login page lists them grouped by department, one click each, from `src/core/shell/logins.generated.ts` (`npm run gen:logins` after a seed changes; `db:test` fails when it is stale).

Settings changes need a second factor. The dev seed turns that off locally (`core.server_settings`, `require_mfa = off`); when it is on, the Settings page enrols an authenticator app the first time a save is refused.

## What is built

**The database** (`supabase/migrations/`, one baseline of 2026-09-26; the earlier migrations are in `supabase/archive/`):

| # | Migration | Spec |
|---|---|---|
| 01 | the spine: `core.entries` (insert-only), sets, patients, users, roles and holdings, departments and places, settings, codes, files, the read log, the audit | §2, §3.1–3.7 |
| 02 | the registry: `core.declare_*` for types, systems, tables, rules, actions, settings, screens, listeners, packs, roles — each checked when declared | §3.8 |
| 03 | the writer `public.write(set)`: identity from the JWT, the set ledger, locks and claims, checks, live vs late, refreshes, the outbox | §3.9 |
| 04 | the reader `public.read(query)`: me · patients · patient · record · item · table · file · fhir · log · audit · codes; masked, logged | §3.10 |
| 05 | the other doors: `my_users`, `choose_user`, `save`, `remove`, `save_patient`, `merge_patients`, `write_setting`, `erase_patient`, `redact` | §3.11–3.12 |
| 06 | the base's code systems and catalogs (ICD-10, ATC, allergens, reactions) and identifier checks | §4, §6 |
| 07 | the base's derived tables: `base.orders`, `base.presence`, `base.review`, `base.lists`, `base.values`, `base.deceased` | §4.5 |
| 08 | the base's 34 types, their checks and lines, the privacy rule, settings keys, actions, built-in roles, screens | §4.1–4.6 |
| 09 | FHIR R4: one mapping per type version | §6.4 |
| 10 | guards: the rebuild check, the cron jobs (outbox every 5 s, the file sweep), realtime | §8 |
| 11 | the pharmacy pack on the pack contract: its role and schema, `pharmacy.dispense`, `pharmacy.queue`, its screen | §5 |
| 12 | privileges: every routine revoked from PUBLIC, then granted by name | §8 |

**The client** (`src/core/`, Vite · React · TanStack Query · zustand). Every read goes through `read`, every Done through `write` as one set; settings through `save`/`remove`/`write_setting`.

- `db/rpc.ts` — the doors; `db/views.ts` — the screens' view models from server rows; `db/entries.ts` — drafts, moves, bench answers and reviews as entries (codings, UCUM quantities)
- `shell/` — sign-in (demo one-click), choosing which clinic when a login has more than one user, the department switcher, ⌘K patient search
- `screens/Reception.tsx` — the front desk: search-first, send to a clinic, urgent, undo a check-in, edit details, the clinics' lines
- `screens/clinic/`, `Queue.tsx` — a clinic's queue in bands and its results to review (Reviewed writes a `reviewed` entry)
- `screens/visit/` — the visit, built for typing. One composer line: **`/` starts a command, `#` a preset, anything else is the note**; Done writes one set and moves to the next patient

  ```
  /v 148/92 84 37 86                     vitals (by position, or p 84 t 37)
  /rx metformin 500 bd 30d for dm        a medication (ATC), linked to a problem; … send → an order to the pharmacy
  /dx hypertension                       a problem (ICD-10); /dx ? pneumonia = suspected
  /al penicillin: rash severe            an allergy · /al none: no known allergies
  /order hba1c, lipid · /order urgent cbc  orders; /order cardiology: chest pain is a consult
  #dm · #soap · #hx                      presets (Settings → Presets)
  hx: … · ex: … · plan: …                a note line under that heading
  ```
- `screens/bench/` — a bench (laboratory, imaging, pharmacy): open orders one row per patient, a scan box, one screen per patient where ⌘↵ releases every result in one set; ranges by sex and age; Correct replaces a released result
- `screens/ward/BedBoard.tsx` — a ward: its beds, admit to a free bed, move, discharge
- `screens/Request.tsx` — one order: the value grid, a report, not done, start · hold · decline
- `screens/Settings.tsx`, `settings/` — organization (time zone, record view, recent changes), departments and their rules, services (fields, units, ranges by sex and age, LOINC codings), users and roles, presets, packs, record reads

**The pharmacy pack** (`…000011_pharmacy.sql`, `src/packs/pharmacy`): a prescription reaches the pharmacy only when the doctor sends it; its bench (To give · Given today) gives with **Give all** or Given / Not given with a reason. Its `pharmacy.queue` table is filled by a listener after commit.

## Tests

`supabase/tests/`, run by `scripts/db-test.sh`: spine · presence · clinic · review · lists · admin · privacy · pharmacy, and the eight permanent tests — rebuild (= live) · boundary · canary · concurrency · registry · fhir · tenancy · pack contract. `supabase/tests/ported.md` maps every check of the earlier suites to its new home.

## Layout

```
spec/openCare.md      the design (spec/archive/: the earlier specs)
supabase/migrations/  the database, in order
supabase/seeds/       codes, the demo kit, the base's clinic and each pack's seed (local only)
supabase/demo/        each layer's demo day and the shared journey's steps (journey/), in load.sql's order
supabase/tests/       SQL suites (lib/: assertions and the fixture)
scripts/              db-test.sh, demo.sh, include.awk, gen-logins.ts, gen-shapes.ts, gen-codes.py, import-codes.sh, test-*.ts
src/core/             the client: db, auth, hooks, shell, screens, renderers
src/packs/            packs: pharmacy
```

## Next

What the build record lists as open (spec §11): the Storage API sweep for erased files' bytes, and Settings editors for sites, beds, the kind of encounter and the Screens line. Packs wait for the owner's go.
