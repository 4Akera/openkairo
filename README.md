# openKairo

A clinical record system built on one idea: the record is a list of entries that are written once and never changed. Every department reads and writes that same record. Packs add kinds of work, never core.

Live demo: https://www.openkairo.com (one-click demo logins, made-up patients).

## What it is

- **The core**: an insert-only spine (`core.entries`), a writer (`public.write`, one set per Done) and a reader (`public.read`) are the only ways in and out. Identity comes from the login; every read of a patient is logged; a patient can be erased or redacted under rules.
- **The base**: 34+ entry types (vitals, problems, medicines, allergies, orders, results, scores, notes, stays …), the queue, the bed board, the doctor's visit typed on one line (`/v`, `/rx`, `/dx`, `/order`, `#preset`), Reception, Settings, standards (ICD-10, ATC, LOINC, UCUM, FHIR R4).
- **22 packs**, each its own schema, role and screens, switched on per department:
  - Pharmacy and stock · Laboratory (with the blood bank) · Radiology · Billing and printing · Bookings
  - Ward nursing (`bedside`: drug round, NEWS2 obs, fluids, handover, going home) · Emergency (`casualty`) · Critical care (`intensive`: ICU and CCU) · Haemodialysis · ObGyn (clinic and labour ward)
  - Paediatrics · Vaccines · Chronic care · Family care · Cardiology · Nephrology · Chest · Haematology · Oncology (chemotherapy day unit) · Surgery · Theatre · Anaesthesia (with Recovery)
- **Printing** through the browser's print dialog: specimen labels, receipts, prescriptions, vaccination card, action plans, consent forms, operating list (Arabic and English, logged like reads).

The design is one document: [`spec/openCare.md`](spec/openCare.md) — layers, spine, core, base, packs (§5), standards, decisions, tests, build record. Earlier specs are in `spec/archive/`; the clinics build plan is `spec/build-clinics.md`.

## Run locally

Prerequisites: Docker, the Supabase CLI, Node 22+.

```bash
supabase start                  # Postgres 17, Auth, Realtime, Storage, Studio
npm run db:reset                # migrations, then seeds in supabase/config.toml's order
npm run db:demo                 # a working day relative to now (run again to reload)
npm install && npm run dev      # http://localhost:3000 (copy .env.example to .env.local first)
npm run db:test                 # every SQL suite, each in a rolled-back transaction
npm run typecheck && npm run lint && npm run build
npm run test:print              # …and the other test:* scripts: pure TypeScript, no browser or database
```

Demo logins (password `Demo123!`): with `VITE_DEMO_LOGINS=true` the sign-in page lists every demo person by department, one click each (`src/core/shell/logins.generated.ts`, `npm run gen:logins` after a seed changes).

## Deploy (Vercel + Supabase)

The client is a static Vite build (`vercel.json`). It needs three variables on the Vercel project:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | its anon (publishable) key — never the service-role key |
| `VITE_DEMO_LOGINS` | `true` only on a demo site |

Database: `npm run db:deploy` pushes the migrations and seeds to a hosted project (`SUPABASE_DB_URL` = the session-pooler connection string); add `-- --demo` for the demo day. On a hosted project the CLI's temporary login cannot grant on the base's tables, so use the real `postgres` connection string, or apply each file with `supabase db query --linked --file`. The journey demo files (`supabase/demo/journey/`) must run in one request.

## Layout

```
spec/                 the design (openCare.md) and the clinics build plan
supabase/migrations/  the database, in order (core 01–10, then one per pack, privileges last)
supabase/seeds/       codes, the demo kit, each pack's seed, the clinic's choices between packs
supabase/demo/        each layer's demo day and the shared journey
supabase/tests/       SQL suites (lib/: assertions and the fixture)
scripts/              db-test.sh, demo.sh, deploy-db.sh, generators, test-*.ts
src/core/             the client: db, auth, hooks, shell, screens, renderers, print, ui
src/packs/            one folder per pack
```

## Tests

64 SQL suites (about 3,000 checks) including the permanent ones — rebuild equals live, boundary, canary, concurrency, registry, FHIR, tenancy, pack contract — and one TypeScript script per pack and per core area. Typecheck, lint (no errors) and build are clean.

## Open

Questions for the owner are in the spec: §5.6 (ward nursing and the beds), §5.8 (the clinics: the chemotherapy cycle ending at the drug round, A6/A4 paper, printing many patients at once). Deferred: MEOWS, dialysis monthly bloods, drug-round safety checks, insurance.
