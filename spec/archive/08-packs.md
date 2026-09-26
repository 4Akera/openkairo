# 08 · The packs

Status: **draft** · 2026-09-25, amended 2026-09-25: specialty packs, the ward skeleton in core · amended 2026-09-25 (approved by the owner): core setup — place, person, pack · amended 2026-09-25 (approved by the owner): private notes; packs bring their own screens; ordering follows works for · the build plan for the pack kit, in 29 kit rows (K1–K29), and the 17 specialty packs, in 28 phase rows. Each `/loop` iteration builds one row.

Migrations are cited by file name; they all live in `supabase/migrations/`. Client files are cited relative to the repo root. Spec lines are cited as `spec/<file>:<line>`. Pharmacy is the pack that already exists. It is the reference for every new pack, and kit row K9 moves it onto the kit. It is not in the pack table.

## How the loop works

One iteration builds exactly one row, from the pack kit or from the pack table.

> **Core only (the owner, 2026-09-25).** Until the owner says packs are ready, the loop builds **kit rows only**: part 0A in its table
> order, then part 0B in the order of the phase each is built before — K10, K11, K29, K12, K25, K14, K13, K15, K18, K19, K17, K16. It never
> starts a pack phase row. When no kit row is left `todo` (or the rest are `blocked`), it ends the loop and tells the owner the core is
> ready. The owner lifts this line by saying so; nothing else does.

0. **Stay awake.** Renew the Mac's keep-awake hold (`request_keep_awake`, until `session_idle`) before starting.

1. **Read.** Read this file. For a pack, also read `spec/06-pack-contract.md` and any spec its v1 scope cites. Read every file you will change before you edit it.
2. **Pick the row.** Take the first row whose status is `todo` and whose note does not say `blocked:` (a blocked row waits for the user):
   - Kit part 0A (K1, K26, K27, K20–K24, K28, K2–K9) comes first, in table order.
   - After 0A, take the first `todo` row of the pack table. **Phases are rows.** A specialty pack has one row per phase (`obgyn a`, `obgyn b`, …), each built in one iteration, in order. A later phase adds to its pack's schema, registry and `src/packs/<key>/`, and may read and extend what the earlier phases built.
   - If the row's **after** column names a kit row that is still `todo`, build that kit row in this iteration instead (the first one it names).
   - If the scope turns out to need a core change the kit does not list, stop. Add that change as a new kit row (status `todo`) right before the phase, and build the new row.
3. **Design within the v1 scope.** Anything beyond it goes into the row's note as "later", not into code.
4. **Database: migrations in the pharmacy shape** (see `20260924000002_pharmacy_pack.sql`).
   - **File names.** `supabase/migrations/<timestamp>_<key>_<what>.sql` for a pack and `<timestamp>_core_<what>.sql` for a kit row. The timestamp is today's date plus the next 6-digit counter, so it sorts after every existing file (for example `20260925000001`).
   - **Order inside a pack migration:**
     1. registry rows, inserted as the migration owner (`core.packs`, `entry_types` with `is_note` stated on each, `actions`, `roles` only for a job narrower than any built-in role, `role_actions`, and `codes` after K3). A pack inserts no `department_types` row: it ships starter setups instead (K12);
     2. `select core.create_pack_role('<key>');` (from K2 on);
     3. `set role pack_<key>;`
     4. the pack's objects: its tables (each with `organization_id`), `update_<list>`, `after_write`, and private writers `<key>.write_<type>`, every function `security definer set search_path = ''`;
     5. `reset role;`
     6. thin public doors `public.<key>_write_…`, `_mark_…`, `_read_…`, `_save_…`, each with an explicit `grant execute … to authenticated` (pharmacy: `20260924000002_pharmacy_pack.sql:56-68`).
   - **Steps.** Each `alter type core.request_step add value '<key>_<step>'` goes in a file of its own, with an earlier timestamp than the migration that uses it.
   - **Forbidden:** `on conflict`, changing any core object, editing a migration that was already applied. Every later change is a new file.
5. **Apply.** Run `supabase migration up`, then `npm run gen:types`.
6. **Client.**
   - Write `src/packs/<key>/` using `definePack` (after K5), with its starter setups (after K12). Split files so each stays under 300 lines (`eslint.config.js:12`).
   - Add one import line to `src/packs/index.ts`.
   - Every entry type gets a renderer (`Card` where the display line is not enough, `Full`, and `Print` where paper leaves the building).
   - Every command gets an `example`. Every refusal code gets words.
7. **Tests.**
   - The generic boundary test (`supabase/tests/pack_contract.sql`) covers the new key by itself, because it loops over `core.packs`. Add one `t.samples` row per public door.
   - The pack's own suite is `supabase/tests/<key>.sql`, copied from the scaffold template. `scripts/db-test.sh` runs every `supabase/tests/*.sql`, so nothing needs adding to it, unless the suite must commit: then its first line is `-- needs: reset`.
8. **Demo data.**
   - Before K8, add the lines that enable the pack to `supabase/seeds/dev.sql` when that helps.
   - From K8 on, the seeds enable every pack from the registry, and a pack's demo morning goes in `scripts/demo/<key>.sql`. From K12 on, the seeds also apply every pack's starter setups.
9. **Docs.**
   - Set this file's row.
   - README: kit migrations get the next number in the migration table (0041 onward). Each pack gets a row in the README's pack table, which K9 creates.
   - Change `spec/06-pack-contract.md` only when the contract changes (mostly kit rows).
10. **Checks.**
    - Run `npm run -s typecheck`, `npx eslint <changed files>`, `./scripts/db-test.sh` and `npm run -s test:composer`.
    - While iterating, `./scripts/db-test.sh <key>` is enough (after K1). From K8 on, `npm run check:pack -- <key>` runs everything.
    - Check in the browser only when the pack has a screen, an organization page, a side section or a record view. Open the running dev server with the preview tool (`preview_start` with `opencare-dev`); never start a dev server from the shell. Walk the v1 flow by keyboard, signed in through the login page's one-click demo buttons (the `<key>` demo user after K8, else the owner). Never type a password.
11. **Finish.** Set the row's status to `done`, with a one-line note: the date, the migration files, and anything left for later.
    - If a check fails and cannot be fixed this iteration, leave the row `todo` with `blocked: …` and stop.
    - Never commit unless the user said so.
12. **Next.** Schedule the next iteration about a minute later. While the core-only line above stands, end the loop when every kit row (K1–K29, 29 rows) is `done` (or the rest are `blocked`). After the owner lifts it, end when every phase row of the specialty packs (28 rows) is `done` too. On ending, stop the screen-awake process if it runs: `pkill -f "caffeinate -d -i -t 43200"`.

## Definition of done

Every pack meets all of these before its row says `done`:

- [ ] **Scope.** The v1 scope works end to end in the demo, by keyboard, and does nothing more.
- [ ] **Registry.**
  - Every registry row carries `pack = '<key>'`. No `department_types` row: the pack ships starter setups instead.
  - Type keys are `<key>_…`. Every entry type states `is_note`; a type other departments order sets `is_request`; a reply type sets `answers`.
  - Actions take the forms of spec 06: `write:<key>_<type>`, or `write:<key>_<thing>` for the pack's own data; `mark:<key>_<step>`; `manage:<key>_<setting>`, checked only by `<key>_save_…` doors. An entry writer and a step are always department scope; only an action over the pack's own data may state organization scope; `manage:` is always everywhere, and no built-in role but the owner gets it (K22). The bedside part of an order (a transfusion) is a type that states `follows`: the `is_request` type whose order it belongs to (K3).
  - Roles are `<key>_<role>`, and a pack ships one only for a job narrower than any built-in role. Every other action goes to the built-in roles through the pack's own registry rows.
  - Each step is added in its own file.
  - The pack's role comes from `core.create_pack_role`.
- [ ] **Boundary.**
  - Every object in schema `<key>` is owned by `pack_<key>`.
  - Every function is `security definer` with `search_path` pinned.
  - Each public door is thin: one of the four gates (`core.require_write`, `core.require_order`, `core.begin_reply` or `core.begin_read`), then the funnel.
  - No core object changes. No other pack is imported, called or named.
- [ ] **Spec 06's tests, as they apply:**
  - 1 core alone;
  - 2 no core drift;
  - 3 ownership and definer;
  - 4 grants;
  - 5 static scan;
  - 6 tenant matrix, with a sample for every door;
  - 7 off still renders: with the pack off, its entries render, trend and accept a correction, and a new entry is refused `pack_off`;
  - 8 updater replay is identical (if it keeps a list);
  - 9 `after_write` twice changes nothing, and a replaced entry voids and re-creates (if it reacts);
  - 10 signatures only grow;
  - 11 the manifest's actions equal `core.actions` for the pack;
  - 12 a starter setup added to the same department twice changes nothing and keeps the administrator's edits; created new twice, it makes two departments (if it ships one);
  - 13 not used here: at a department that does not use the pack, its writers, steps and replies refuse `not_used_here`; its orders, and the bedside part of an order, pass by `require_order`'s rule; its reads and `after_write` still work; a correction and the pack's own user pass.
- [ ] **Fixtures.** Three entries per type: one replaced, one struck, and one read back with the pack off.
- [ ] **Renderers.** Every type draws acceptably with core's fallback and with its own `Full`. `Print` exists where paper leaves the building.
- [ ] **Typing first.** A `/command` wherever a clinician writes the thing. Tab walks the card. ⌘↵ or Done signs. No path needs the mouse.
- [ ] **Inline.** Cards append below the line. Sections, panels and settings are inline. No dropdown or modal over the record. Printing never covers the screen.
- [ ] **Privacy (spec 07's private notes).** Only a note can be private. A private note is hidden from everyone but the people who work in the department it was written in, its author and its responsible clinician. Everything else shows.
  - Every entry type states `is_note`. A type that holds both a note and something everyone may see is split into two types, written by one command in one Done. A note type keeps no list.
  - A pack's note written in a private department is private. Any other pack note is made private the way core's are: `!` at the start of its line, or the Private tick that core's card frame draws on every note card. The pack draws nothing for it.
  - Pack reads go through `core.begin_read`, which returns the hidden entry ids, and mask each row whose entry is hidden, the way core masks an entry (K26). A pack table that holds free text keeps `entry_id` and masks that text the same way. A list read returns only the rows of the patients `begin_read` kept.
  - A print draws only what the reads returned. Exports and claims carry no note text.
  - No patient id or name in a URL or a live payload.
- [ ] **Screens.** The pack's own screens act only through core's actions and the pack's own, so every rule still holds. A pack adds nothing to a default screen: no row badges, columns, bands, row keys, filter chips or sort options. Its marks on a patient show in the banner, the record and its own screens.
- [ ] **Off means quiet.** With the pack off, its tools (commands, cards, forms, steps, screens, organization pages) and its displays (banner items, sections, record views, checks) disappear. A department whose screen it was shows its default screen again. Its entries still render.
- [ ] **Not used here means quiet.** In a department that does not use the pack, its tools and screens disappear and its writers refuse `not_used_here`. Its displays stay, because they are the record, read under the normal rules. Ordering from it still works wherever a live service works for the department, whatever packs the department uses.
- [ ] **Speed.** One read per pack per screen or list, never one per row. Everything a clinician signs goes in Done's one `write_set`.
- [ ] **Plain naming.** Words from spec 01's list, none from its banned list (`spec/01-record.md:168-169`), and words for every refusal code.
- [ ] **Demo and docs.** The pack is enabled in the seeds, its starter setups apply, and its demo morning runs. This file's row, the README pack row, and spec 06 (if the contract changed) are updated.
- [ ] **Checks.** `check:pack` is green (or, before K8, the four checks in step 10). A browser walk is done when the pack has a screen.

## Pack kit (item 0)

Kit rows are core only: none names a pack, except K9, which is pharmacy's own migration. Part **0A** (K1, K26, K27, K20–K24, K28, K2–K9) is built before row 1a, in table order. Part **0B** rows are the same kind of generic work, each built in the iteration just before its first user (the **before** column). Where two fixes were possible, the smaller one was chosen.

**The core setup (K20–K29).** These rows build the core setup the owner approved on 2026-09-25: place, person, pack and private notes, with the owner's final wording of the same day for private notes, screens and ordering.
- **Place.** A department does one of five kinds of work, fixed when it is made: desk, visits, stays, bench or outside. The work picks its default screen, its settings and what "serves" means. Each department lists the packs it uses.
- **Person.** A role is a job title with a list of actions, held everywhere or in one department. One permission function answers every call, and the client receives each person's rights per department from the same function, so anything shown is allowed.
- **Pack.** A pack ships kinds, starter setups and its own screens, never a department type. Its writing tools and screens show only where a department uses it; one of its screens may replace the department's default screen. Its displays show wherever the record is read, while the pack is on. A department orders from any department that works for it, whatever packs it uses.
- **Private notes.** Every note written in a private department is private, and a clinician can make any note private. A private note is hidden from people who do not work in the department it was written in, except its author and responsible clinician. Everything else shows (spec 07).

In part 0A the table lists them in build order:
- **K26 comes first.** It deletes `core.sees_department` (the last SQL `'reception'` literal, `20260923000024_core_private_visit_leaks.sql:16`), `read_private_visits` (one of the jobs of `served_departments`, `20260924000012_core_reception_private.sql:41`) and one of the three definitions of department staff (`20260924000016_core_calling.sql:65-66`). The later rows then have less to rewrite.
- **K26 builds who reads a private note; K27 re-creates `write_entry` once,** which writes a note's privacy when it is signed and carries the other write fixes.
- **K20 before K21, and K21 before K22.** Otherwise the demo Pharmacy refuses its own dispense (`not_used_here`).
- **K22, K23 and K24 are consecutive,** so no pack row lands between the server narrowing rights and the client learning them.
- Their migrations take the next README numbers in build order: K26 0041, K27 0042, K20 0043, K21 0044, K22 0045, K23 0046, K24 0047, K28 0048.

K12, K25 and K29 are part 0B, all built before chronic care (3), whose screen is the first pack screen and the read's first user; K25 comes directly after K12.

K15–K19 are the ward skeleton (see *Why the ward is core*). They are built in the order their users need them: K15, K18 and K19 before emergency (9), the first phase that admits; K17 before medicine rounds (10a); K16 before handover (10d).

| id | status | item | size | lands in | before |
|---|---|---|---|---|---|
| K1 | done | Generic boundary test, and a test runner that can fail | M | `scripts/db-test.sh`, `supabase/tests/lib/assert.sql`, `supabase/tests/pack_contract.sql`, `supabase/tests/boundary.sql` | 1a |
| K26 | done | Private notes: who reads them | L (was M) | `<ts>_core_private_notes.sql`, `src/core/screens/reception/Lists.tsx`, `src/core/hooks/{reads,writes}.ts`, `src/core/screens/visit/{VisitScreen,Record}.tsx`, `src/core/screens/Settings.tsx`, `src/core/db/{types,rpc}.ts`, `supabase/seeds/dev.sql`, `supabase/tests/privacy.sql`, `spec/05-screens.md`, `spec/07-privacy-and-record.md` | 1a; K4, K19 |
| K27 | todo | Where a note is written, and making it private | M | `<ts>_core_note_place.sql`, `src/core/hooks/drafts.ts`, `src/core/screens/visit/{VisitScreen,Composer,Card}.tsx`, `src/core/screens/visit/parse.ts`, `src/core/db/rpc.ts`, `supabase/tests/privacy.sql`, `scripts/test-composer.ts`, `spec/07-privacy-and-record.md` | 1a |
| K20 | todo | Work on the department type | M | `<ts>_core_department_work.sql`, `src/core/screens/settings/Departments.tsx` (moved out of `Settings.tsx`), `src/core/screens/{Settings,Department,Reception}.tsx`, `src/core/shell/Shell.tsx`, `src/core/screens/clinic/ClinicHome.tsx`, `src/core/screens/visit/VisitScreen.tsx`, `src/core/screens/settings/Services.tsx`, `src/core/db/rpc.ts`, `supabase/tests/departments.sql` | 1a; K12, K15 |
| K21 | todo | Packs used here | M | `<ts>_core_packs_used_here.sql`, `supabase/seeds/dev.sql`, `supabase/tests/{pharmacy,departments}.sql`, `src/core/renderers/index.tsx`, `src/core/screens/visit/{parse.ts,commands.ts,Composer.tsx}`, `src/core/screens/settings/Departments.tsx`, `src/core/db/types.ts`, `README.md` | 1a; K5, K10, K14 |
| K22 | todo | One permission function | L | `<ts>_core_one_gate.sql`, `src/core/shell/Shell.tsx`, `src/core/db/rpc.ts`, `supabase/tests/{access,roles,pharmacy}.sql` | 1a; K2, K3, K4 |
| K23 | todo | Checks in for, works for, consults | M | `<ts>_core_serves.sql`, `src/core/hooks/organization.ts`, `src/core/screens/visit/{send.ts,parse.ts}`, `src/core/screens/Reception.tsx`, `src/core/screens/reception/PatientCard.tsx`, `src/core/screens/settings/Departments.tsx`, `supabase/seeds/dev.sql`, `supabase/tests/{smoke_api,pharmacy,departments}.sql` | 1a; K17 |
| K24 | todo | Rights per department on the client | M | `<ts>_core_my_departments.sql`, `src/core/hooks/organization.ts`, `src/core/shell/{Shell,Search}.tsx`, `src/core/screens/visit/{commands.ts,parse.ts,VisitScreen.tsx}`, `src/core/screens/settings/save.ts`, `supabase/tests/access.sql`, `scripts/test-composer.ts` | 1a; K5, K6 |
| K28 | todo | Clinic flow gaps | M | `<ts>_core_clinic_flow.sql`, `src/core/shell/Shell.tsx`, `src/core/screens/clinic/{ClinicHome.tsx,words.ts}`, `src/core/screens/visit/VisitScreen.tsx`, `src/core/screens/reception/Lists.tsx`, `supabase/tests/calling.sql`, `spec/03-patients-visits.md`, `spec/05-screens.md` | 1a |
| K2 | todo | Close the boundary; one pack-role factory; check a pack's step moves | M | `<ts>_core_pack_boundary.sql`, `spec/06-pack-contract.md`, `spec/02-organization.md` | 1a |
| K3 | todo | Registry rows tagged by pack; codes; reply types; types in the organization read | M | `<ts>_core_pack_registry.sql`, `src/core/screens/settings/Departments.tsx`, `src/core/db/types.ts` | 1a |
| K4 | todo | Pack gates and helpers | L (was M) | `<ts>_core_pack_helpers.sql`, `supabase/functions/entry-file/`, `spec/06-pack-contract.md` | 1a |
| K5 | todo | Client manifest and import boundary | M (was S) | `src/core/packs.ts`, `src/core/renderers/index.tsx`, `src/core/screens/visit/commands.ts`, `src/core/hooks/organization.ts`, `src/core/db/rpc.ts`, `src/main.tsx`, `index.html`, `eslint.config.js`, `scripts/check-imports.ts` | 1a |
| K6 | todo | Entries, printing, corrections, composer | M | `src/core/renderers/index.tsx`, `src/core/screens/visit/{Record,VisitScreen,Composer}.tsx`, `src/core/screens/Request.tsx`, `src/core/screens/bench/BenchPatient.tsx`, `src/core/ui/print.tsx`, `src/core/styles.css` | 1a |
| K7 | todo | Per-pack tests: fixture, tenant matrix, template (tests 6–9 and 13) | M | `supabase/tests/lib/{fixture,packs}.sql`, `supabase/tests/pack_contract.sql`, `scripts/new-pack/test.sql` | 1a |
| K8 | todo | Merge gate and tooling (tests 1, 2, 10, 11), scaffold, seeds from the registry | M | `scripts/{core-only.sh,lint-pack-migrations.sh,test-packs.ts,new-pack.sh}`, `supabase/tests/lib/fingerprint.sql`, `supabase/tests/golden/signatures.txt`, `package.json`, `tsconfig.scripts.json`, `supabase/seeds/{auth,dev}.sql`, `scripts/demo/`, `.github/workflows/ci.yml` | 1a |
| K9 | todo | Pharmacy onto the kit (the kit's acceptance test) | S | `<ts>_pharmacy_kit.sql`, `src/packs/pharmacy/`, `supabase/tests/pharmacy.sql`, `README.md` | 1a |
| K10 | todo | Record slots (no list slots) | M | `src/core/screens/visit/{Side,VisitScreen,Record,KeyResults,Composer}.tsx`, `src/core/screens/visit/kinds.ts`, `src/core/hooks/reads.ts`, `src/core/packs.ts` | 2a |
| K11 | todo | Pack lists end to end | M | `<ts>_core_pack_lists.sql`, `spec/06-pack-contract.md` | 2b |
| K29 | todo | A clinic's patients by problem: one core read for pack screens | M | `<ts>_core_read_cohort.sql`, `src/core/db/rpc.ts`, `src/core/hooks/reads.ts`, `src/core/packs.ts`, `src/core/screens/settings/Roles.tsx`, `supabase/tests/cohort.sql`, `spec/03-patients-visits.md` | 3 |
| K12 | todo | Pack screens and the Screens line, organization pages, settings, starter setups (test 12), names by id | L (was M) | `src/core/screens/Department.tsx`, `src/core/shell/App.tsx`, `src/core/screens/Settings.tsx`, `src/core/screens/settings/{Departments,Services}.tsx`, `src/core/screens/bench/BenchPatient.tsx`, `src/core/setups.ts`, `scripts/starter-sql.ts`, `<ts>_core_patient_names.sql` | 3 |
| K25 | todo | Settings by work: what happens there, packs used here, the Screens line, Staff | M | `src/core/screens/settings/{Departments,Packs,Staff,Roles}.tsx`, `src/core/screens/Settings.tsx`, `src/core/setups.ts`, `spec/05-screens.md` | 3 (directly after K12) |
| K13 | todo | The after-write runner as the spec describes it | M | `<ts>_core_pack_runner.sql`, `src/core/screens/Settings.tsx` | 5 |
| K14 | todo | Requests of pack types | M (was S) | `<ts>_core_pack_requests.sql`, `src/core/screens/visit/{Composer.tsx,Side.tsx,Card.tsx}` | 4b |
| K15 | todo | Stays, discharge and visit actions | M | `<ts>_core_stay_status.sql` (the ADD VALUE alone), `<ts>_core_stays.sql`, `src/core/screens/visit/{VisitScreen.tsx,parse.ts}`, `src/core/screens/Reception.tsx`, `src/core/packs.ts`, `src/core/db/rpc.ts`, `spec/03-patients-visits.md`, `spec/05-screens.md` | 9 |
| K16 | todo | Transfer with its bed | M | `<ts>_core_transfer.sql`, `src/core/screens/beds/BedBoard.tsx`, `src/core/screens/visit/VisitScreen.tsx`, `spec/03-patients-visits.md` | 10d |
| K17 | todo | Medicines on a stay | S | `<ts>_core_stay_medicines.sql`, `spec/04-entry-types.md` | 10a |
| K18 | todo | Beds and places, the bed on the stay, and admission as a request | L (was M) | `<ts>_core_beds.sql`, `src/core/screens/settings/{Beds,Departments}.tsx`, `src/core/screens/visit/parse.ts`, `src/core/db/rpc.ts`, `src/core/setups.ts`, `supabase/seeds/dev.sql`, `spec/02-organization.md`, `spec/03-patients-visits.md`, `spec/04-entry-types.md` | 9 |
| K19 | todo | The bed board, the default screen of every stays department | M | `<ts>_core_bed_board.sql`, `src/core/screens/beds/{BedBoard,BedRow}.tsx`, `src/core/screens/Department.tsx`, `src/core/screens/visit/Side.tsx`, `src/core/hooks/reads.ts`, `spec/05-screens.md` | 9 |

### K1 · Generic boundary test, and a test runner that can fail

- **What:**
  - **`supabase/tests/lib/assert.sql`** defines three helpers:
    - `t.try(sql)` returns `ok` or `<sqlstate> <message>`;
    - `t.ok(pass, what)` prints `ok …` or `FAIL …`;
    - `t.refuses(sql, code)`.
  - **`scripts/db-test.sh`** changes:
    - Reset once. Pipe each suite through `cat` as `\set ON_ERROR_ROLLBACK on`, `begin`, `lib/*.sql`, the suite, `rollback`. psql inside the container cannot `\ir` repo files.
    - A suite whose first line is `-- needs: reset` gets its own reset and no wrapper. `boundary.sql` is one, because it commits through `call core.run_pack_calls()`.
    - Each suite's `-- expects: code, code` line replaces the one shared EXPECTED list. It names each code once per expected refusal (comma-separated, since some messages are several words), and a different count fails.
    - `db-test.sh <key>` runs lib + `pack_contract.sql` + `<key>.sql` only.
  - **`supabase/tests/pack_contract.sql`** defines `t.violations(key)` and runs it for every row of `core.packs`:
    - test 3: owner, definer and pinned `search_path` for every object in schema `<key>` and every `public.<key>_*`;
    - test 4: EXECUTE in core equals the allow-list (inline until K2 moves it to `core.pack_may_execute()`); no privilege on any core relation; no USAGE on another schema; no TEMP; no advisory-lock or file functions; no role membership. Anything the host will not let us revoke is printed as `host limit: …`;
    - test 5: a regex scan of every body for core table names, `pg_advisory`, `set role`, `set_config`, `opencare.`, `pg_sleep`, timeouts, `cron.`, `net.` and dynamic `execute`;
    - registry: every row with the key carries `pack = key`, except core rows the core-only fingerprint holds. The owner role holds every pack action. Every declared `update_<list>` and `after_write` exists.
  - **The control:** the hostile fixture is built inline and rolled back, and the scan must catch it.
  - **Landing green:** today's violations (pharmacy's grants, PUBLIC EXECUTE on its function) go in a `t.known(test, what, 'K2')` list that prints `known … (K2)` instead of `FAIL`. K2 and K9 empty the list.
  - **`boundary.sql`:** rewrite its bare selects as `t.ok(...)`.
- **Why:**
  - The runner resets before every file and accepts 19 error texts in every suite (`scripts/db-test.sh:6,9,11-12`), so a refusal that stops happening still passes.
  - `boundary.sql` prints booleans that cannot fail the run. Only its B1 notice says PASS/FAIL (`supabase/tests/boundary.sql:38-81`, `:46`).
  - Grants are checked on tables only (`supabase/tests/boundary.sql:38`, `supabase/tests/pharmacy.sql:20`).
- **Done (2026-09-25).** `scripts/db-test.sh`, `supabase/tests/lib/assert.sql`, `supabase/tests/pack_contract.sql`, `boundary.sql` rewritten, a counted `-- expects:` line on every suite; no migration. After an adversarial review (22 findings, all applied) the runner also fails on a lost connection or psql error (`-f -`, exit code), on a suite that ends the wrapper transaction (the next suite gets a fresh database), on deferred constraints (`set constraints all immediate` before the rollback), on a NULL label, and on a suite that checks nothing. The contract test also checks column and MAINTAIN grants, function settings, SQL-standard and view bodies, quoted names, `pack_list` updaters, CREATE anywhere, default privileges, public functions, role attributes and types; its control pack plants every rule and one clean function. Grants the host made and we cannot revoke (advisory locks, `net` USAGE) print as `host limit …` and do not fail. Known for K2: PUBLIC EXECUTE on pharmacy's functions, 63 core and 31 public functions beyond the allow-list, TEMP. Later: `smoke_api`, `smoke_spine` and `smoke_visits` print values but assert nothing (they pass on their counted refusals); convert them to `t.ok`.

### K2 · Close the boundary; one pack-role factory; check a pack's step moves

- **What:**
  - **Revoke.** A DO loop revokes EXECUTE on every function in `core` and `public` from `public` (and from `anon` for core). It re-grants the public API to `authenticated` explicitly and keeps existing explicit grants, such as the gate's to `authenticated` and `pack_runner` (`20260922000005_core_gate.sql:85`). It then:
    - adds `alter default privileges revoke execute on functions from public`, the global form;
    - runs `revoke temp on database … from public`;
    - tries the advisory and `net` revokes inside exception blocks. Whatever the host refuses, K1 prints as a named host limit.
  - **Allow-list.** `core.pack_may_execute()` returns the one list of functions a pack role may execute: `write_entry`, `change_request`, `record_settings_change`, `begin_write`, `require_access`, `require_pack`, `refuse`, `short`, and K22's `core.why_not` and `core.may`, and `core.release_hold` (below). K4 and K11 add to it.
  - **`core.create_pack_role(key)`:**
    - checks `^[a-z]{2,12}$`;
    - creates NOLOGIN `pack_<key>` if missing and grants it to `current_user`;
    - grants USAGE on core and EXECUTE on the allow-list;
    - creates schema `<key>` owned by the role, with USAGE for `authenticated`;
    - runs `alter default privileges for role pack_<key> revoke execute on functions from public`.
  - **`core.regrant_packs()`** re-grants the list to every pack role. Every later core migration that grows the list ends by calling it. Both functions are revoked from everyone but the migration owner.
  - **The funnels learn their caller** (spec 02, *The funnels gate pack callers themselves*). Inside a `security definer` function `current_user` is its owner, and today's test of `users.kind = 'pack'` catches only the runner, so a pack door a person calls that forgets its gate is not refused. So:
    - `core.write_entry` and `core.change_request` become `security invoker` entries with their signatures unchanged. Each records `current_user` in a transaction-local setting and calls its `security definer` body, which reads the setting once, clears it, and refuses a call that did not come through the entry. Core's wrappers call the entries too. The allow-list holds the entries and their bodies.
    - When the recorded caller is `pack_%` and the actor is a person, the body re-runs the gate the door should have run, chosen from the row, not from the door: a correction → `write:<type>` at the original's department, skipping pack-on and used-here; a reply → `begin_reply`'s rule; an `is_request` type, or a type that `follows` one (the bedside part of an order, K3) → `require_order`'s rule, the follow-up checked against the order its `data.order_id` names; otherwise `write:<type>` or `mark:<step>` at the entry's department or the request's to-department, used-here included.
    - When it is the pack's own user (`kind = 'pack'`), the gate runs for that user, skipping used-here but never pack-on, and `change_request` forces `p_actor` to that user.
    - The one exception is `core.release_hold(request_id)`. It moves held → sent only when the latest `held` step was placed by this pack's own user, and records the calling person as the actor.
  - **Tests:** K1's hostile fixture gains a pack door with no gate: called by a person, it is refused by the funnel; and the bedside part of an order, written by the ordering ward's nurse through a pack door, passes.
  - **Spec 06 changes:**
    - New migration shape: registry rows as owner → `create_pack_role` → `set role` → objects → `reset role` → public doors.
    - Steps are `<key>_<step>` with action `mark:<key>_<step>`. Roles are `<key>_<role>`. The pack user's role is `pack_<key>`.
- **Why:**
  - The per-schema revoke does nothing (`20260922000001_core_foundation.sql:13-14`), so every pack role can execute nearly every core function. That includes `core.replay_list`, which runs `delete from %I.%I` as postgres (`20260922000006_core_funnels.sql:83-110`), and `core.run_one_pack_call` (`20260922000013_core_runner_and_guards.sql:28-42`).
  - The advisory-lock revoke fails on this host (`20260922000013_core_runner_and_guards.sql:87-93`).
  - `change_request` trusts the actor it is handed (`20260922000006_core_funnels.sql:162-188`). A pack door that moves a request for a person (billing's release after payment) would otherwise have no gate at all.
  - `write_entry` re-gates a pack only when the caller's users row is of kind `pack` (`20260923000024_core_private_visit_leaks.sql:85`), which is true only in the runner; `current_user` inside it is always its owner.
  - Pharmacy types its role and grants by hand (`20260924000002_pharmacy_pack.sql:6-11`).
  - Spec 06's sketch set the role first and then inserted into a core table, which that role cannot do (the sketch at `spec/06-pack-contract.md:155-170` now has the order below).
  - `request_step` is one shared enum (`20260922000001_core_foundation.sql:28`), and pharmacy adds `prepared` with `if not exists` (`20260924000001_pharmacy_step.sql:2`), so two packs would silently share a step.
  - The pack user's role is read as `'pack_' || key` (`20260923000023_core_pack_replies.sql:268`).

### K3 · Registry rows tagged by pack; codes; reply types; types in the organization read

- **What:**
  - **Keys.** `core.packs.key` gets `check (key ~ '^[a-z]{2,12}$')`.
  - **`roles.pack`** moved to K22, and `packs.works` to K21 (amended 2026-09-25).
  - **Foreign key** from `actions.pack` to `packs`. `department_types.pack` gets none: no pack department type remains after K21.
  - **Entry type flags:**
    - `entry_types.is_request boolean not null default false` marks a pack type that other departments order without using the pack (K14);
    - `entry_types.follows text null` (references `entry_types`) marks the bedside part of an order: the follow-up that belongs to an `is_request` type of the same pack, such as the transfusion of the blood a ward ordered. The ordering department records it, checked against that order (`require_order`, K4). A `follows` entry names its order in `data.order_id` (the order's entry id), never in `reply_to_id`: a reply of another type is refused `wrong_reply_type` (`20260923000024_core_private_visit_leaks.sql:128-131`), and a reply would fold into the order and close it. `write_entry` checks `data.order_id` on every write of a `follows` type, a correction included, and a correction keeps it (`reply_mismatch` otherwise);
    - `check (not (is_note and (list is not null or pack_list is not null)))`: a note type keeps no list.
  - **Pack actions on built-in roles.** A trigger gives the owner role every new pack action. A pack inserts its actions for built-in core roles as its own registry rows (Doctor gets obgyn's write actions), never an everywhere-scope action (K8's lint; the owner already gets those by the trigger). These go quiet when the pack is off, because `require_access` runs `require_pack` for pack actions (`20260923000019_core_mfa_switch.sql:8-10`), and in a department that does not use the pack, because the gate checks "used here" (K22).
  - **`codes.pack`** (NULL means core).
    - A pack inserts its own codes. For a shared LOINC code it uses `insert … select … where not exists`, never `on conflict`.
    - Core ships the codes several packs write: fluid intake volume, fluid output volume, capillary glucose and pain score.
  - **Reply types by `answers`.** A reply type says what it answers: `prescription`, `request`, or the pack's own request type. `read_reply_types` offers core `result`/`note` plus enabled-pack types that have `answers` set, and returns `answers`.
  - **`read_organization`** returns `entry_types` (key, name, pack, answers, is_note, is_request, follows) for core and enabled packs. Settings builds its rules from these and from the department's work (K20), not from type names.
- **Why:**
  - `roles` has no pack column (`20260922000002_core_organization.sql:28-35`), so the pharmacist role keeps `read:record` while the pack is off (`20260924000002_pharmacy_pack.sql:19-20`). K22 adds the column.
  - The pack columns have no foreign key (`20260922000002_core_organization.sql:25`, `:47`).
  - Global codes are migrations-only and carry no pack (`:81-89`), and a value trends only when its code is known (`20260922000006_core_funnels.sql:53-55`).
  - `read_reply_types` offers every type of an enabled pack (`20260923000021_core_amendments_0923.sql:358-366`).
  - The type picker is hardcoded (`src/core/screens/Settings.tsx:121-123`).

### K4 · Pack gates and helpers

- **What.** Each helper joins `core.pack_may_execute()`, and the migration ends with `core.regrant_packs()`.
  - **`core.require_write(org, action, patient, department, replaces_id)`** is the writer's gate. It calls `core.why_not` (K22) with `correction := replaces_id is not null`, so a correction of a live entry of that type passes with the pack off or not used there.
  - **`core.require_order(org, action, patient, department, service_id, request_id default null)`** gates a pack's `is_request` type, and a type that `follows` one (K3). Ordering follows "works for": if a department works for yours, you can order from it, whatever packs your department uses.
    - It checks the action at the writer's department, with no used-here check there.
    - An order also needs `core.may_order(department, service_id)` (K23: `not_served`, `not_orderable`, or a service that is not live). A service is live only where its department uses the reply's pack (`core.service_live`, K21), so no separate used-here test is needed.
    - The bedside part of an order passes `request_id` in place of `service_id`: the order must be of the type it follows, for the same patient, not cancelled, and placed by this department: the order's `from_department_id`, or, for an order written in a stay, the stay's department now (a transfer carries the stay's orders, K16). Otherwise it is refused `request_not_found`, which reveals nothing else about the request. The door stores it as `data.order_id`, and `write_entry` checks it again (K3).
  - **`core.require_used(department_id, pack)`** is for pack save doors that write rows per department (a clinic's booking sessions).
  - **`core.checks_in_for(desk_id, clinic_id)`** is for a pack acting for a desk's clinics (bookings). Nothing else widens anything.
  - **Which doors check "used here".** "Packs used here" is for the department doing the pack's own work: its screens, its reply forms, its bench steps and its commands for its own entries. So only department-scope `write:` and `mark:` pack actions done by people check it, through `require_write`, `begin_reply` and the step path. Never orders or the bedside part of an order (`require_order`), reads (`begin_read` in either form), updaters, `after_write`, calls by the pack's own user, or corrections. K1's static scan fails a function that calls both `begin_read` and `require_used`.
  - **`core.begin_read(patient_id, department_id)`** returns organization, user, patient ids (merged ones included) and the hidden entry ids (`core.hidden_entries`, K26). It checks `read:record` and `require_open` (or `open_record` for a pack user).
    - Convention: every pack list row carries `patient_id`, `entry_id` and `visit_id`.
    - A pack read masks a row when its entry is hidden.
  - **The list form, `core.begin_read(department_id, patient_ids uuid[])`**, gates the rows of a pack screen in one call, the way `read_visit_queue` reads a queue:
    - it checks `read:queue` and `read:record` at that department; the desk's reach does not open it, since the reach is opt-in (K22);
    - it keeps only the patients with an open visit in that department or an open request addressed to it; the door returns rows only for the patients it kept: a row of any other patient never comes back, masked or not;
    - it returns each kept patient's hidden entry ids, with no `require_open` and no `record_reads` row.
    - It is an overload of `begin_read`, so the Definition of done's "pack reads go through `core.begin_read`" covers both forms.
  - **`core.begin_reply(request_id, action, source, stated_author_name, stated_recorded_at)`** gates at the request's `to_department_id` and returns organization, author, patient, visit and the reply's department. It refuses `request_not_found` and reveals nothing else about the request. A request sent outside is gated at its from-department instead, as its order was (no used-here there), with source `outside`: the sender types the reply in. The reply's department is the department the gate ran at (the to-department, or the from-department for a request sent outside), and the door writes with it (K27).
  - **A `write_entry` overload with `p_files jsonb`.** It inserts `entry_files` after the entry, with `write_result`'s checks. A note type never carries an outside URL.
  - **Files, before row 1b.** Entry files sit in a private bucket with no `storage.objects` policy for `authenticated`, so a client can neither list nor sign. One Edge Function (`supabase/functions/entry-file/`), called with the user's JWT, calls `read_entry_file` as that user (which runs `require_open` and `note_hidden`) and signs the returned path with the service role for 60 s; the path is never returned to the client. An upload goes through the same function, which mints the path and a signed upload URL.
  - **`core.signal_department(department_id)`**: payload-free and same-organization only, like `core.signal` (`20260924000013_core_review_fixes.sql:6-10`).
- **Why:**
  - `require_access` runs `require_pack` for every pack action, even on a correction (`20260923000019_core_mfa_switch.sql:8-10`, `20260924000002_pharmacy_pack.sql:39-40`), so the "accept corrections while off" half of rule 6 fails.
  - Pharmacy gates at whatever department the client passes (`20260924000002_pharmacy_pack.sql:39`).
  - No core helper tells a pack which notes are hidden from its reader, and today's test is per visit (`20260923000022_core_privacy_views.sql:36-43`).
  - The one-patient form needs a `record_reads` row by this user in the last 12 hours (`require_open`, `20260923000022_core_privacy_views.sql:100-105`), so a pack screen's rows would be refused for every record nobody opened, and one read per row breaks the Speed rule.
  - Files are inserted only by `write_result` and `write_note` (`20260922000009_core_writes.sql:88-90`, `:171-173`).
  - `read_entry_file` returns the storage path for the client to sign itself (`20260923000024_core_private_visit_leaks.sql:244`). That works only if any member may sign any path, and then a known path to a hidden note's file is signed without `note_hidden`.
  - Without `require_order`, every department that orders a pack's request, or records the bedside part of one, would have to use the pack.

### K5 · Client manifest and import boundary

- **What:**
  - **`definePack({ key, name, actions, usedBy })`** in `src/core/packs.ts` returns every register function with `pack` stamped. `usedBy` lists the works whose departments the enable card pre-ticks (K25). It also re-exports the hooks and UI a pack may use.
  - **Kinds come from the slot.** A registration carries only its pack. Whether it is a department tool (a pack screen included), an order (a command writing an `is_request` type, or the bedside part of an order), a record display, a renderer or an organization item is fixed by its slot, in spec 06's slot table. No slot adds to a default screen. Each slot has default works, which a registration may only narrow.
  - **Lookups.** Every registry entry carries its pack:
    - department tools look up the department's work, `dept.packs` and `dept.can` (K24);
    - record displays look up the packs that are on (`usePacksOn()`, built from `org.packs`);
    - renderers are always found, whether the pack is on or off, used or not.

    With the pack off, core's value grid and neutral bench words return, and there is no quick release.
  - **`registerBench({ steps, words, for: { replyTypes, requestTypes } })`** replaces `registerBenchSteps` and `registerBenchWords`, which are keyed by department type (`src/core/renderers/index.tsx:14`, `:19`). A bench that mixes packs gets neutral words.
  - **Delete** `overrideCommand`, `CommandOverride`, `resolve`, `offersFor` and `registerCard({ departmentType })` (`src/core/screens/visit/commands.ts:26-66`). A department's packs decide what it gets; no pack overrides a core command.
  - **Checks** (in `scripts/test-packs.ts`, from K8 on): a pack command lists at least one of its pack's own actions, and its `actions` cover every function its parser can emit.
  - **`registerRefusalWords(pack, words)`**, merged into `WORDS`.
  - **Bootstrap.** Move it from `src/core/main.tsx` to `src/main.tsx`, so core names no pack.
  - **ESLint.** One `no-restricted-imports` block per file group, because flat config replaces options instead of merging them.
  - **`scripts/check-imports.ts`** fails on any import from one pack into another.
- **Why:**
  - Reply forms, bench words and bench steps are keyed by type only (`src/core/renderers/index.tsx:13-33`), so "Give all" still shows with the pack off (`src/core/screens/bench/Bench.tsx:76-81`).
  - Core imports the packs (`src/core/main.tsx:7`).
  - The last ESLint block replaces both pack rules (`eslint.config.js:13-15`).
  - Refusal words are a fixed map (`src/core/db/rpc.ts:7-15`).
  - Pharmacy exports only `key` (`src/packs/pharmacy/index.tsx:51`).
  - Nothing registers an override, a department-type card or bench steps today; the only bench words are pharmacy's, keyed by its department type (`src/packs/pharmacy/index.tsx:45`).

### K6 · Entries, printing, corrections, composer

- **What:**
  - **`EntryFull`** draws `rendererFor(type)?.Full ?? FallbackFull` in the entry panel, its replies and its versions. `Renderer` gains `label`, `tone` and `Print`.
  - **`registerPrint({ scope: 'entry' | 'visit' | 'patient' | 'department', label, Doc })`** with a PrintHost that renders into a print-only node (`@media print`). Its header is the organization's name plus the writing department's `site_name`. It prints names with `dir="auto"`, stores nothing and never covers the screen.
    - A print draws only what the reads returned, so a hidden note prints as it shows.
    - Exports and claims carry no note text.
  - **`ReplyForm.fromReply(data)`** lets Correct on the bench and on the Request screen prefill the pack's editor and write through the pack's writer with `replaces_id`. Correct opens the pack's card even with the pack off or not used in that department, because a correction skips both checks (K4).
  - **`after`.** A draft may carry `after: { function: 'mark_visit_priority', params }`, from a fixed core list, run after `write_set` the way `mark_visit` is. A pack command can then change the visit after Done without touching visits itself.
  - **Alt letters.** A command may claim one Alt letter, refused when the letter is already taken. (`canWrite` moved to K24.)
- **Why:**
  - The entry panel and the Request screen draw `FallbackFull` directly (`src/core/screens/visit/Record.tsx:159-165`, `src/core/screens/Request.tsx:54`), so pharmacy's `Full` is never shown (`src/packs/pharmacy/index.tsx:46-50`).
  - Correct always writes `write_result` (`src/core/screens/bench/BenchPatient.tsx:148`).
  - The only printing is `window.print` on the reads page (`src/core/screens/settings/Reads.tsx:32`).
  - A second site needs its own name on paper. The header names the organization and the site, not the department, so a sensitive department's name (Psychiatry) is not printed at the top of every page that leaves the building (spec 07's known limits).

### K7 · Per-pack tests: fixture, tenant matrix, template (tests 6–9 and 13)

- **What:**
  - **`lib/fixture.sql`:**
    - two organizations, a and b, with every pack on in both;
    - ids from `t.mint(...)` (sha256);
    - one department for each work, using every pack whose works include it, and one for each work using none;
    - a service and an open request for each pack reply type, at a department that uses the pack.
  - **`t.samples(fn, params)`** is the only line a pack adds per door.
  - **The matrix.** Every `public.<key>_*` door is called:
    - normally, and must return `ok`;
    - with each uuid parameter swapped for b's, and must refuse: `wrong_organization`, `wrong_patient`, `not_a_member`, `request_not_found`, or a 23503 foreign-key error;
    - with its pack retired, and must refuse `pack_off`; the same writer called as a correction must return `ok`.

    An id parameter with no fixture kind is a FAIL, never a skip.
  - **`lib/packs.sql`**, the template helpers:
    - `t.fixture_set(key)`: three entries per writing door; e1 is replaced through the same door, and e2 is struck by `write_entered_in_error`.
    - `t.off_still_renders(key)`: entries render in `read_record` and trend in `read_values`; a correction passes; a new entry is refused `pack_off`; the door works again after re-enabling.
    - `t.updater_replays(key)`: a schema snapshot is identical after two rebuilds and after a time-zone change.
    - `t.after_write_twice(key)`: run as the pack role, the same snapshot twice; e1 followed by its replacement voids and re-creates.
  - **Test 13, not used here.** For every door, at the fixture's department that does not use the pack:
    - writers, steps and replies refuse `not_used_here`;
    - ordering doors pass wherever a live service answering them works for the department, and the bedside part of an order passes for the department that placed it (`require_order`); for another department it is refused `request_not_found`;
    - reads and `after_write` still work;
    - a correction passes, and so does the pack's own user;
    - `me.departments` (K24) agrees with `core.why_not` for every pack action, and there it lists the pack's order and follow-up actions and no other department-scope pack action.
  - **A privacy sample for each door:**
    - a pack note written in a private department, read by someone who does not work there, shows no text and no author; made not private (with a reason), it shows;
    - a pack note written elsewhere and made private with `!` is hidden the same way;
    - a list door (`begin_read`'s list form) returns no row for a patient the list form did not keep, even one with a private pack note;
    - a replay of another author's id is refused `id_in_use`.
- **Why:**
  - No suite calls a door with another organization's ids.
  - Pharmacy's call with the pack off is not asserted (`supabase/tests/pharmacy.sql:64`).
  - With the pack off, pharmacy's suite checks a core prescription rather than its own dispense (`:66`).
  - `boundary.sql`'s rebuild compares nothing (`supabase/tests/boundary.sql:82-83`).
  - "Packs used here" (K21) gives every door a second way to be quiet, with its own exemptions, and each must be tested per door.

### K8 · Merge gate and tooling

- **What:**
  - **Core alone (tests 1–2).** `scripts/core-only.sh` copies `supabase/` to a temp dir, keeps only `*_core_*` migrations, runs `supabase db reset --workdir`, runs the core suites and dumps `lib/fingerprint.sql`. It then resets with everything, and the two fingerprints must match. The fingerprint masks pack roles' own ACL entries and pack registry rows.
  - **Signatures (test 10).** A golden list of public signatures in `supabase/tests/golden/signatures.txt`; a lost line fails.
  - **`scripts/lint-pack-migrations.sh`** checks every pack file for:
    - no `on conflict`;
    - no `create or replace function public.` outside `<key>_`;
    - no `alter table core.`;
    - no update of a row whose pack is null;
    - each `add value` alone in its file;
    - every `entry_types` row states `is_note`;
    - a `manage:` action is checked only by `<key>_save_…` doors.

    It also checks every migration after `20260924000019`, core's included, for:
    - no `department_types` insert;
    - no new code compares a type key to a literal (`'ward'`, `'reception'`, …) or decides by `is_visited` or `is_outside`: code tests `department_types.work` (K20), which K20's check keeps in step with those columns;
    - an action's scope is one its form allows (an entry writer and a step: department; `manage:`: everywhere; spec 06), and no `role_actions` row gives an everywhere-scope action to a built-in role.
  - **`scripts/test-packs.ts`** (tsx with `tsconfig.app.json` paths) loads `src/packs/index.ts` in node, parses every command's `example`, and compares each manifest's `actions` with `core.actions` both ways (test 11). It also checks that every registration carries its pack, that `usedBy` is within `packs.works`, and K5's command checks. `tsx` joins devDependencies, and `tsconfig.scripts.json` joins the typecheck.
  - **`npm run check:pack -- <key>`** runs eslint, typecheck, test:composer, test-packs, check-imports, the migration lint and `db-test.sh <key>`.
  - **`npm run new:pack <key> "<Name>"`** writes the registry and schema migrations, `src/packs/<key>/index.tsx`, `supabase/tests/<key>.sql`, `scripts/demo/<key>.sql` and the README row.
  - **Seeds from the registry:**
    - `auth.sql` adds `<key>@demo.com` for every installed pack.
    - `dev.sql` enables every pack and assigns each pack's roles, with md5 ids in separate namespaces. The existing `d004` and `c007` stay.
    - From K12 on, `dev.sql` also applies core's and every pack's starter setups through the calls `scripts/starter-sql.ts` prints (K12): with Add to this department onto the demo department of the setup's work that it fits (Laboratory, Pharmacy, the ward), and as a New department only where the demo has none. No seed makes a department of a pack type.
    - `db:demo` runs `scripts/demo/*.sql` after `demo-day.sql`.
  - **CI.** `.github/workflows/ci.yml` runs the same commands.
- **Why:**
  - Pack files sit between core files (`20260924000001_pharmacy_step.sql`, `20260924000002_pharmacy_pack.sql`, `20260924000018_pharmacy_answers_prescriptions.sql`), and the seed names pharmacy (`supabase/seeds/dev.sql:10-12`, `:27`, `:37`), so a core-only reset is impossible today.
  - Nothing checks drift or signatures.
  - `tsx` is downloaded on every run (`package.json:13`).
  - There is no CI.

### K9 · Pharmacy onto the kit

- **What:**
  - **Its own migration:**
    - revoke PUBLIC EXECUTE on `pharmacy.write_dispense`;
    - `create or replace` that function with `core.require_write` and `core.begin_reply`, so it gates at the request's department.
    - Its role is tagged by K22 (`roles.pack`), and its department type was retired by K21, so neither is done here.
  - **Client:**
    - `definePack` with `actions: ['write:pharmacy_dispense', 'mark:prepared']` and `usedBy: ['bench']`. The step stays unused, as the README says; keys are permanent.
    - `registerBench({ words: { todo: 'To give', done: 'Given today' }, for: { replyTypes: ['pharmacy_dispense'] } })` replaces `registerBenchWords('pharmacy', …)` (`src/packs/pharmacy/index.tsx:45`).
  - **Tests:** the suite moves onto `t.ok`/`t.refuses` with an `-- expects:` line, a sample row, and the template checks, with the dispense itself checked with the pack off. It adds: a dispense at a department that does not use pharmacy is refused `not_used_here`.
  - **README:** a pack table replaces "The first pack" paragraph (`README.md:102-104`).
  - **Starter setup** "Pharmacy" (bench · pharmacy · a Dispensing service · works for Every): added in K12's iteration.
  - Done when `check:pack -- pharmacy` is green and K1's `known` list is empty.
- **Why:** the one existing pack must pass what every new pack must pass.

### K10 · Record slots (before 2a)

- **What:**
  - **`registerRecordView({ key, label, View })`**, opened by `?view=<key>` the way results are. Core exports `Trend`, `Spark`, `useValues` and `useEntries({ types })`.
  - **`registerSideSection({ key, title, order, Section })`**, drawn after Allergies. Pack data sits under the query key `['record', patientId, key]`, so Done and the `record:<id>` channel refresh it.
  - **`registerBannerItem({ key, useItems })`**: a pack's marks on the patient (Isolation, Pregnant 28+3, NEWS 7), after the allergies. Each item has a level, `alert` or `info`. The banner shows every alert and up to three infos, then "+N". The banner is part of the record, so it needs `read:record`.
  - **No list slot.** A pack adds nothing to a default screen's rows: no row badges, columns, bands, row keys, filter chips or sort options (the owner, 2026-09-25). Its marks show in the banner and the record, and on its own screens (K12), never on core's lists or on another pack's screen (packs never read each other).
  - **`registerCheck({ functions, check })`**: warnings merged into the composer's warnings. A pack may block only its own writers.
  - **`registerKeyTests({ codes, when })`**: merged in order into Key results and Results over time.
  - **Where each slot shows** follows spec 06's slot table. These slots are record displays: they show wherever the record is read while the pack is on, whether or not the department uses the pack, because they are the record, read under the normal rules.
    - Items of the packs used here come first.
    - A side section or record view shows when the patient has entries of the pack's types, when its `when` holds, or when the department uses the pack.
    - A writing part inside a section or view (its actions or a `Writer`) is a department tool: it shows only where the department uses the pack and the action is allowed there.
  - **Reads** are one batched read per pack per screen.
- **Why:**
  - These places are all fixed today:
    - the side column (`src/core/screens/visit/Side.tsx:51-111`);
    - the banner (`src/core/screens/visit/VisitScreen.tsx:141-159`);
    - the record views (`src/core/screens/visit/Record.tsx:19-38`);
    - the key tests (`src/core/screens/visit/kinds.ts:3`);
    - the composer warnings (`src/core/screens/visit/Composer.tsx:69-73`).
  - `useValues` exists but nothing uses it (`src/core/hooks/reads.ts:32`).
  - This row once showed department slots by `departments.pack_cards` (`20260924000015_core_pack_cards.sql:3`), which K21 drops. A pregnancy banner or an `/rx` pregnancy warning must show in a dental clinic too, so displays follow the record, not the department.

### K11 · Pack lists end to end (before 2b)

- **What:**
  - **`rebuild_record`** replays every distinct `(pack, pack_list)` from `entry_types` through `replay_list`, each in its own exception block, and returns counts and errors per list.
  - **`core.replay_pack_list(pack, list)`** replays every patient with entries of those types. `save_organization_pack` calls it on enable, and a pack's upgrade migration calls it.
  - **`core.root_of`** joins the allow-list, so pack updaters key rows by chain root as core's do.
  - **`patient_list_reviews.list`** becomes text, checked against the core list names plus every `pack_list`.
  - **`erase_patient`** deletes the patient's rows from every `<pack>.<pack_list>` table and calls `<key>.erase(patient_ids)` when the pack defines one, checked for definer and owner as `apply_updater` checks. K1 gains an `erase` violation for any pack table with a `patient_id` column and no `erase`.
  - **Spec 06** documents `pack_list` (not `list`), the table `<key>.<pack_list>` with `patient_id`, `entry_id` and `visit_id`, and the shape of the updater.
- **Why:**
  - `rebuild_record` replays only the three core lists (`20260922000008_core_updaters.sql:93-95`), although `spec/06-pack-contract.md:371` says enabling a pack replays.
  - Spec 06's sketch uses `list`, which is the core enum (`20260922000002_core_organization.sql:157-158`).
  - Core updaters use `core.root_of` (`20260922000008_core_updaters.sql:3-11`), which packs cannot call.
  - List reviews use the enum (`20260922000004_core_record.sql:206`).
  - `erase_patient` touches no pack data (`20260922000013_core_runner_and_guards.sql:96-122`).

### K12 · Pack screens and the Screens line, organization pages, settings, starter setups, names by id (before 3)

- **What:**
  - **The default screen.** Every department has one, decided by its work: Front desk (desk), Queue (visits), Bed board (stays) or Bench (bench); outside has none. Its actions are the department's basic work: check in, call, see, Done, admit, move, transfer, discharge, collect, release. Packs add nothing to it (K10).
  - **Pack screens.** Each specialty pack brings its own screens: full screens designed for that work, with their own layout (chronic care's review list, the emergency track board, the labour board, the ICU chart, the drug round, the tooth chart).
    - `registerDepartmentScreen({ key, label, works, actions, Screen })` registers one, for departments of those works that use the pack. `actions` are what the screen needs to work (chronic care: `read:cohort`, `read:record` and `read:queue`, K29); the screen shows to a person only where they hold them all. It lives at `/d/:department/<pack>/<screen>`.
    - It acts only through core's actions and the pack's own, so every rule still holds. It reads through core's reads and its pack's own (`begin_read`'s list form, K4; the read by problem, K29), one read per pack per screen.
    - A pack screen shows its own pack's marks on a patient, never another pack's: packs never read each other.
  - **The Screens line**, in the department's settings (K25 draws it), stored as `departments.screens` and `departments.opens_on` (K21):
    - ☑ **Default screen**, which can be unticked only while a pack screen is ticked;
    - ☑ each screen of the packs used here, for the department's work;
    - **Opens on**: which screen opens first.
  - **A pack screen can replace the default screen**, with whatever actions it has: with the default unticked, the screen Opens on names replaces it. Turning the pack on for the department means agreeing to what its screen does. Only one pack screen replaces the default in a department; every other ticked pack screen is a tab.
    - The basic actions are never truly lost: they also live on the patient's own visit screen, and the default screen can be ticked back on at any time.
    - **Never without a screen.** When the screen Opens on names cannot show (its pack is off, unticked or not used here, the screen is unticked, the client has no such screen for this work, or this person does not hold its `actions` here), the default screen shows by itself, opened first; other ticked pack screens stay tabs. A desk's machine user always gets the board view.
    - When a department starts using a pack, the same save ticks the pack's screens for its work as tabs. A starter setup may untick the default and name Opens on.
  - `src/core/screens/Department.tsx` dispatches by work to the default screen, or to the screen Opens on names; the other ticked screens are tabs in the screen header.
  - **Organization pages.** `registerOrganizationPage` replaces the planned `registerRoute` for work across departments: `/p/<pack>/<page>`, in the shell menu, gated by an organization action. A department's own pack work is a pack screen, never a separate page.
  - **Settings:**
    - `registerPackSettings({ Panel })`: an inline card under the pack's row on Settings → Packs, for the organization;
    - `registerDepartmentSettings({ works, Panel })`: an inline panel under the department's chip for that pack, saved through a door that calls `core.require_used` (K4);
    - `registerServicesColumn({ header, Cell, Editor, save, for: 'all' | 'departments using' })`: saved through the pack's `<key>_save_…` after `save_service` returns.
  - **Desk.** The cashier is a desk that uses billing, not a sixth kind of work. Billing's Cashier screen replaces the front desk's default screen there (6a); no pack adds a panel to the default Front desk.
  - **Starter setups** are client data shipped by a pack or by core. `registerStarterSetup({ key, name, work, rules, screens, beds, services, serves })` holds a work, the pack itself, rules, the Screens line (which pack screens are ticked, whether the default stays, and Opens on), beds or places, services and works-for. A setup never names another pack and never assigns roles.
    - `src/core/setups.ts` holds its two operations. `newDepartmentFrom(setup, name)` makes a new department with a fresh id and the name the administrator types. `addToDepartment(department, setup)` ticks the pack and adds only what is missing: services match on code and beds on name. Nothing is overwritten, and the result says "kept yours: cbc".
    - `registerUseDefaults({ work, services })` declares what a pack adds to any department of a work when that department starts using it (inpatient's Medicine doses and care services for stays), applied with Add semantics.
    - Both go through `save_department` and `save_service` (and `save_bed`, from K18 on), one call per row, so each save keeps its own stale-save check. Nothing is ticked at run time: the rows are the only truth.
    - `scripts/starter-sql.ts` prints the same calls for the seeds (K8).
    - Test 12: Add to the same department twice, and nothing changes and the administrator's edits survive; New twice, and there are two departments.
  - **Bench.** The bench patient page carries the composer for people who have commands there.
  - **`public.read_patient_names(organization_id, patient_ids uuid[])`** under `read:patient`, for pack screens that hold patient ids.
- **Why:**
  - The screen dispatch is hardcoded (`src/core/screens/Department.tsx:11-14`).
  - A specialty's work needs its own layout (a track board, a labour board, a drug round). Slots added to four core screens could not give it, and they would crowd the lists everyone else uses. One full screen per job, chosen per department, is simpler.
  - Keys are permanent, so the pack table's department types become starter setups before 4a builds the first one.
  - The route table is fixed (`src/core/shell/App.tsx:38-52`).
  - The Packs page is only an on/off switch (`src/core/screens/Settings.tsx:310-329`).
  - Services has no column slot (`src/core/screens/settings/Services.tsx:59-87`), although spec 06 promises the column (`spec/06-pack-contract.md:302-304`) and the starter setups.
  - The old plan's derived sha256 ids made a preset impossible to add to an existing department, or to apply twice under two names.
  - The only patient reads are one at a time (`20260923000024_core_private_visit_leaks.sql:424`) or a search (`20260922000011_core_visits_functions.sql:64`).

### K13 · The after-write runner as the spec describes it (before 5)

- **What:**
  - **The cron job** runs as `pack_runner` and issues a fixed number of top-level `select core.run_next_pack_call();` statements under `set statement_timeout = '5s'`. In a simple query the timeout applies to each statement. Next and finish become callable only by `pack_runner`.
  - **`packs.call_types text[]`** (NULL means every non-note type) filters the fan-out in `write_entry`.
  - **Private notes.** The fan-out, and the runner again when it delivers a call, skip a private note (`core.note_private`, K26) unless the pack is used in the note's own department. A pack not used there never receives a psychiatric note. The runner's check also covers a note that `write_set` marks private after its entry is written (K27). A note made private after its call was delivered is not called back.
  - **Cancellations.** When a request becomes cancelled or done, its entry's `pack_calls` row is queued again (tries reset) for enabled after-write packs. `core.request_state(entry_id)` (step, status, reason) joins the allow-list.
  - **`public.read_pack_calls(organization_id, pack)`** (manage:organization) lists parked calls with entry type, tries, `tried_at` and `error_text`. The Packs page gets Retry, using the existing `retry_pack_calls`.
- **Why:**
  - One 55 s timeout covers the whole loop (`20260922000013_core_runner_and_guards.sql:71`), and `pack_runner` is never used (`20260922000001_core_foundation.sql:17-22`).
  - Every entry fans out to every after-write pack (`20260923000024_core_private_visit_leaks.sql:206-209`).
  - A cancel queues nothing (`20260922000006_core_funnels.sql:162-188`).
  - Parked calls are only a count (`20260924000015_core_pack_cards.sql:66`).

### K14 · Requests of pack types (before 4b)

- **What:**
  - **`entry_types.holds_visit`** (default true; false for `prescription`) is read by `core.holds` in place of the literal.
  - **`read_queue`** returns `details` (data minus the header keys) for every type.
  - **Ordering from anywhere.** A pack's `is_request` type (K3) is written through `core.require_order` (K4), so a department orders it without using the pack.
  - **The destination rule moves into `core.write_entry`:**
    - with a service, the destination is the service's department;
    - without one, it must be a visits or a stays department (`consult_not_here`, the consult rule of K23).
  - **`write_request`** refuses a service that is not live (`core.service_live`, K21): a retired service, or one whose reply pack is off or not used at its department.
  - **Send.** The client's Send reads the department's `send_to` (K23), and its words use that department's name.
- **Why:**
  - `holds` names `prescription` (`20260922000006_core_funnels.sql:222`).
  - `details` is filled only for prescriptions (`20260924000016_core_calling.sql:84-87`).
  - `write_request` never checks the pack (`20260923000024_core_private_visit_leaks.sql:481-515`).
  - Send keys on `automatic` (`src/core/screens/visit/send.ts:5-7`), so a second automatic pack would offer "Send to pharmacy" everywhere. K23 deletes that test.
  - Blood, imaging and theatre requests are ordered from clinics and wards that do not use those packs.

### K15 · Stays, discharge and visit actions (before 9)

- **What:**
  - **`alter type core.visit_status add value 'admitted'`**, in its own file.
  - **Stays are departments whose work is `stays`** (K20). No `is_stay` column is added. The `'ward'` literals are already work tests (K20), and Settings reads the work.
  - **`open_visit`** keeps refusing stays departments, and K15 turns K20's `not_yet` into `admission_only`. A stay opens only through K18's `admit_visit`; until K18 lands, K15's tests insert stays as the migration owner.
  - **`mark_visit`** adds admitted→done (Left) and admitted→cancelled:
    - Left ends the stay. It is gated `write:visit` and refused `discharge_note_missing` while the stay has no live discharge note. It closes the open requests addressed to the stay's department whose service belongs to that department (its dose and care requests), with reason `discharged`;
    - admitted→cancelled stays `write:visit` and needs a reason, since it undoes a desk's own mistake;
    - a stay never becomes pending and never runs `flag_unseen`.
  - **`read_visit_queue`** for a stays department keeps away patients (`present: false`) in an `admitted` band.
  - **Departments** in `read_organization` carry their `work` (K20), and Reception's send list leaves stays departments out by work.
  - **Stay mode on the visit screen:** timeline first, no Done; ⌘↵ and Sign write with the stay's `visit_id` and stay on the patient.
  - **`registerVisitAction({ statuses, label, run })`** in the visit menu.
  - **Discharge** is core's first visit action, offered on an `admitted` stay:
    - the composer label `dc:` (or `discharge:`) puts a note line under the heading Discharge, with note kind `discharge`, which `write_note` already accepts. Destination and follow-up are words in that note;
    - Discharge asks for that note when the stay has none and signs the stay's drafts and the note in one `write_set`. The stay then shows "Going home" until Left ends it, so the bed is not freed too early. From K18 on, Discharge also sets `expected_end_on` to today;
    - "Died" also saves `died_on` through core's `register_patient` update (`write:patient`) before the stay ends.
  - **Words** for `admission_only` and `discharge_note_missing` go in `src/core/db/rpc.ts`.
  - **Specs:** spec 03 gets the stay's two rows in its move table and `admission_only` in `open_visit`'s refusal list (`spec/03-patients-visits.md:94-97`). Spec 05's ward line says core, not an admissions pack.
- **Why:**
  - `visit_status` has no `admitted` (`20260922000001_core_foundation.sql:31`).
  - `open_visit` refuses a ward (`20260923000024_core_private_visit_leaks.sql:354`), and the sweep spares wards by name (`20260923000021_core_amendments_0923.sql:175`). Opening a stay there too would skip the bed, the one-stay check and the admission note, and would leave a bed request open.
  - `open_visit` refuses a type that is not visited (`20260923000024_core_private_visit_leaks.sql:353`), and `is_visited` is NOT NULL with no default (`20260922000002_core_organization.sql:48`).
  - The legal moves are clinic moves (`20260924000016_core_calling.sql:18-19`), and ending from any status but in_consult runs `flag_unseen` (`:40`).
  - Every move not into or out of in_consult or pending is gated `write:visit` (`20260924000016_core_calling.sql:16`), which receptionists and technicians hold, and spec 03 keeps the desk clerical (`spec/03-patients-visits.md:131-133`). So Left stays a clerical move, and the clinical act is the discharge note it needs.
  - A stay's dose and care requests would stay open after the patient left.
  - Away patients drop out of the queue (`:64`).
  - `sign()` writes without a `visit_id` (`src/core/screens/visit/VisitScreen.tsx:48-51`).
  - The note kinds already include `discharge` (`20260923000021_core_amendments_0923.sql:287`), but the composer's labels offer only history, examination, plan and procedure (`src/core/screens/visit/parse.ts:203-204`).
  - Spec 05 left the end of a stay to an admissions pack until its 2026-09-25 amendment, which this plan dissolves.
  - Planned at `spec/03-patients-visits.md:274-276`.
- **Later:** a structured destination and follow-up on the discharge (old `ward_discharge`). Inpatient's discharge letter (10e) carries both in its own sections.

### K16 · Transfer with its bed (before 10d)

- **What:**
  - **`mark_visit_routing`** gains `department_id`, `bed_id` and `move_requests` (default false), for stay visits only:
    - it gates in both departments;
    - the target must be a stays department of the same organization;
    - it refuses `visit_open` when the patient already has a visit there;
    - the bed, when given, is checked the way `admit_visit` checks it (K18), and the bed the stay leaves becomes `cleaning`;
    - it records one step `{department_id: [old, new], bed_id: [old, new]}` and signals both queues.
  - **`move_requests`** gives every open request for the patient addressed to the old department a routing step to the new one. A request of a pack's type moves only to a department that uses the pack (`not_used_there`); `mark_routing` follows the same rule. The requests that stay are listed on the transfer card.
  - **Orders go with the stay.** After a transfer, the stay's new department records the follow-ups of the orders written in the stay (the transfusion of blood ordered before the move), and the old one no longer can (`require_order`, K4). The orders themselves do not change.
  - **A transfer changes nothing about privacy.** A note keeps its department for ever, and its privacy is kept beside it (K26). Notes written before the transfer keep the department they were written in; notes written after it follow the new department's rule.
  - **The one-stay rule becomes a move.** When a bed request's sending visit is a live stay, `admit_visit` (K18) applies this routing step `{department_id, bed_id}` to that stay (the old bed becomes `cleaning`, `move_requests` true) instead of refusing `already_admitted`, and returns the moved stay. The admission note (K18) then closes the request. The request, written from the old stay, speaks for the sending department, so this path gates only in the new one.
  - **`read_visits`** gains `moves[]` per stay, `{department_name, bed_name, from_at}`, built from the stay's routing steps. Department names are never masked (spec 07).
  - **Transfer** is a key on the bed board and a visit action on the stay (K15). `t` on a patient row opens an inline card under the row: the department is typed, from the stays departments where the person holds `write:visit` (`canAt`), then one of its free beds is picked, or none. A patient who arrives without a bed waits in the new board's No bed band (K19).
  - **Specs:** spec 03 gets the transfer step.
  - **Tests:** `privacy.sql` gains one case: a stay moved from a private department P to a ward W. P's private notes stay hidden from a W nurse, and W's own notes show to everyone who may read the record. A second case: after A→B, B records the transfusion of blood A ordered on the stay (a fixture `follows` type), and A is refused `request_not_found`.
- **Why:**
  - Routing moves only assignee, priority and `is_first` (`20260922000011_core_visits_functions.sql:170-185`).
  - A pack's request moved to a department that does not use the pack could never be answered there.
  - The bed must move in the same step as the stay. Otherwise the old bed stays taken under K18's one-live-stay-per-bed index.
  - No core read returns a visit's steps: `read_visits` returns department, arrival and end only (`20260924000003_core_record_view.sql:67-92`), and the discharge letter (10e) lists the stay's departments.
  - Its first user is handover (10d).

### K17 · Medicines on a stay (before 10a)

- **What:**
  - **Change or stop** in `write_prescription` closes every open request of that medication in the same transaction (done, reason `stopped` or `changed`).
  - **Send** takes an optional `service_id`, which must answer prescriptions and be in this department's `send_to` (K23), and `due_at` for the first dose; a PRN dose is never due.
  - **Without a service**, it picks in K23's order: its own service, then a service whose department names this one, then one at the same site, then Every. A tie is refused `choose_service`.
  - **Discharge.** The Discharge card (K15) has a "Send to <pharmacy>" chip for take-home medicines, which calls `write_prescription` with that `service_id`, so they do not go to the ward's own dose service.
  - **Frequencies** gain q1h, q2h, nocte, alternate days and continuous, plus `frequency_text`.
  - **`read_queue(department_id, replies_since)`** adds masked `replies[]` to open rows.
  - **`read_values`** gains `since` and `until`.
  - **Any stay.** "This department" is the stay's own department, so all of this works in every department whose work is `stays`.
- **Why:**
  - Send takes `limit 1` with no ORDER BY (`20260924000017_core_send_prescriptions.sql:44-49`), so with two answering services the first found wins.
  - A stop touches no request (`20260924000009_core_change_clears.sql:74-75`).
  - The frequency set is fixed (`20260924000017_core_send_prescriptions.sql:22`).
  - `read_values` takes a count, not a period (`20260923000024_core_private_visit_leaks.sql:247`).

### K18 · Beds and places, the bed on the stay, and admission as a request (before 9)

- **What:**
  - **`core.beds`**: id, organization_id, department_id, name, bay_name, position, is_side_room, state (`open | cleaning | blocked | closed`) and retired_at.
    - The department must be a stays or a visits department. In a visits department the same rows are called **places** on screen (ER cubicles, dialysis chairs). There is one live visit per bed or place.
    - A name is unique among a department's live beds.
  - **Beds are department settings.**
    - `public.save_bed(id, department_id, name, bay_name, position, is_side_room)` runs under `manage:departments` and is logged by `core.record_settings_change`.
    - In Settings → Departments, beds fold under each stays department, and places under each visits department. Their rows are edited in place (`src/core/screens/settings/Beds.tsx`).
    - A bed that never held a stay can be deleted for good. A used bed is retired (0036's rule).
    - `read_organization` returns the beds with their departments.
  - **Bed state.** `public.mark_bed(bed_id, state, reason)` runs under `write:visit` in the bed's department.
    - `blocked` and `closed` need a reason.
    - A bed that holds a stay stays `open`, and anything else is refused `bed_taken`.
    - The change is logged as a settings change and signals the department's queue.
  - **The bed is a property of the stay.** `visits.bed_id` (nullable, with a foreign key to `core.beds`) and `visits.expected_end_on` are both new. A partial unique index keeps one live stay per bed, so `bed_taken` is the database's own refusal.
  - **`public.admit_visit(id, patient_id, department_id, bed_id default null, request_id default null, expected_end_on default null, assignee_id default null)`** runs under `write:visit` in the stays department. It is the only way a stay opens (K15's `open_visit` refuses `admission_only`):
    - the department's work must be `stays` (`not_a_stay`). There is no `pack_off` check: the ward skeleton is core and never keyed on a pack;
    - the patient must have no open visit in any stays department (`already_admitted`, naming that stay's department). K16 later turns this refusal into a move when the request comes from that stay;
    - the bed, when given, must be `open` and free (`bed_not_open`, `bed_taken`), and must be that department's, or, as an **outlier**, a bed of another stays department at the same site (`wrong_department` otherwise). An outlier stay belongs to the admitting department and lies in the other department's bed;
    - `request_id`, when given, must be a bed request (below), open, addressed to this department, for the same patient (`not_a_bed_request`, `request_not_open`, `wrong_department`, `wrong_patient`);
    - it inserts the visit `admitted` and present, and one `change_visit` step records `{bed_id, expected_end_on, request_id, assignee_id}`. It takes no patient lock and writes no entry (`spec/03-patients-visits.md:28-30`).
  - **The admission note is a second call.** The board's ⌘↵ calls `admit_visit`, then `write_note(kind 'admission', reply_to_id = the request, visit_id = the new stay)`, the way Done is `write_set` followed by `mark_visit`. The note ("Admitted · Ward A · bed 12") is the request's final reply: it closes the request and releases the sending visit's hold.
    - `admit_visit` runs under `write:visit` and the note under `write:note`, both at the stays department, so the board offers `a` only to a user who holds both `write:visit` and `write:note` there.
    - A stay whose `visits.request_id` is still open shows "Admission note not written" on the board (K19), with a retry.
  - **Moves on a stay.** Both functions have `mark_visit_priority`'s shape: gate, compare, update, then one logged `change_visit` step (`20260924000019_core_visit_priority.sql:2-13`).
    - `public.mark_visit_bed(visit_id, bed_id)` moves a stay to another bed of its department, with the same checks. The bed it leaves becomes `cleaning`.
    - `public.mark_visit_expected_end(visit_id, expected_end_on)` sets the expected discharge.
  - **Ending a stay** (K15's Left, or a cancel): `mark_visit` is re-created so that the bed the stay leaves becomes `cleaning`.
  - **The bed request is a core request, marked `is_admission`.**
    - A bed request is a core `request` entry marked `is_admission`. `write_request(is_admission)` is legal only to a stays department (`not_a_stay`), and only /admit sets it. Only this mark gets the "Admission …" line, fills the board's Bed requests band (K19) and is accepted by `admit_visit`. Prescriptions, requests to a service, pack request types and consults addressed to the same department are not bed requests.
    - `/admit ward a · pneumonia on oxygen · edd 3d` is a core command. It writes `write_request` with `to_department_id` set to the named stays department, the question text and `is_admission`. It is the consult shape that `/order cardiology: …` already writes (`src/core/screens/visit/parse.ts:157-162`), plus the mark.
    - /admit offers every live stays department with its free beds and its waiting count (`beds_free` and `bed_requests_open`, returned by `read_organization` as counts).
    - A consult to a stays department is allowed (K23): it is a question, not a bed request.
    - It holds the sending visit as pending, as a consult does.
    - For a stays department, `write_request`'s line reads "Admission Ward A — …".
    - `edd 3d` stays in the question and prefills the expected discharge when the board admits.
  - **`write_note`** gains the kind `admission`, labelled `adm:` in the composer. When it has a `reply_to_id`, it is a reply like `consult_reply`, gated at the request's department, and the request must be an open bed request (`not_a_bed_request`). It may also stand alone, for a patient admitted directly.
  - **The sweep** never moves a stay, nor a visit waiting on an open bed request (an ER patient waiting for a bed).
  - **Words** for `not_a_stay`, `bed_not_open`, `bed_taken`, `not_a_bed_request` and `already_admitted` go in `src/core/db/rpc.ts`.
  - **Demo:** `supabase/seeds/dev.sql` gets a ward with 12 beds in three bays.
  - **Core's starter setup "Ward"** (K25) gains 12 beds in three bays (`src/core/setups.ts`), now that `save_bed` exists.
  - **Specs:**
    - spec 02: beds as department settings;
    - spec 03: the bed on the visit, which replaces "beds in the admissions table" (`spec/03-patients-visits.md:274-276`);
    - spec 04: the `admission` note kind.
- **Why:**
  - `core.visits` has no bed and no expected discharge (`20260922000003_core_patients_visits.sql:52-73`). Spec 03 planned beds in an admissions pack's table (`spec/03-patients-visits.md:274-276`), which obgyn, critical and inpatient could never read.
  - A bed is operational, like priority, and priority already changes through one logged visit change (`20260924000019_core_visit_priority.sql:2-13`). Packs may not touch visits at all (`spec/03-patients-visits.md:205-207`).
  - A consult is already a request addressed to a department with a question (`20260923000024_core_private_visit_leaks.sql:493-501`). It is answered by a note (`20260923000021_core_amendments_0923.sql:288-292`), and `open_visit` already takes the request a visit answers (`20260923000024_core_private_visit_leaks.sql:355-360`). So a bed request needs no service and no new entry type.
  - `open_visit` refuses a ward outright (`20260923000024_core_private_visit_leaks.sql:354`).
  - A note goes through `write_entry`, which takes the patient lock (`20260922000006_core_funnels.sql:20-23`). Spec 03 forbids that in a visit function (`spec/03-patients-visits.md:28-30`, `:208-209`), and `admit_visit`'s `write:visit` gate lets in receptionists and technicians, who hold no `write:note` (`20260922000007_core_registry.sql:32-34`). So the note is its own call.
  - `visits_open` is unique only per patient and department (`20260922000003_core_patients_visits.sql:74`), so without `already_admitted` one patient could hold two beds on two boards.
  - Every open request addressed to a stays department would otherwise read as a bed request: prescriptions sent there (K17), requests to its services and consults. An explicit mark lets a consult go to a ward.
  - A full ward must still admit, so a stay may lie in another ward's bed at the same site.
- **Later:** `mark:bed`, a separate right for bed moves. It can be added later without changing anything. (The old Later, a starter set of beds for a new stays department, is added here to core's starter setup "Ward" (K25).)

### K19 · The bed board, the default screen of every stays department (before 9)

- **What:**
  - **`public.read_bed_board(department_id)`** runs under `read:queue` and is the board's one read:
    - the department's live beds in bay and position order, each with its live stay: patient (name, record number, age, sex), day N (from `arrived_at`), expected discharge, the assignee's name, `present`, and the stay's results waiting (`to_review`, with a critical flag);
    - stays with no bed (a direct admission or a transfer that came without one);
    - bed requests: open requests marked `is_admission` addressed to this department (K18), most urgent first, then oldest, with the sending department, the question and the minutes waited;
    - calls: open requests addressed here with no service that are not bed requests (a consult, a NEWS call from 10b);
    - the question of a bed request or a call shows only to a reader with `read:record`; anyone else gets the sending department and the minutes waited (spec 03: counts, not service names). Receptionist and Technician hold `read:queue` without `read:record` (`20260922000007_core_registry.sql:32-34`);
    - stays whose admission note is not yet written (`visits.request_id` still open);
    - going home and discharges today: stays with a discharge note that have not left, stays expected to end today, and stays that ended today;
    - elsewhere: this department's outliers, lying in another stays department's bed (K18).
    - Every stay shows by name. Only private notes are hidden (spec 07), and the board shows no note, so it masks nothing.
  - **The screen.** `src/core/screens/beds/BedBoard.tsx` is the default screen of every department whose work is `stays`. `src/core/screens/Department.tsx` sends stays departments there by work (K12).
    - Its actions are the ward's basic work: admit, move, transfer, discharge. Packs add nothing to it (K10). A pack screen of a pack used in the department may be a tab beside it or replace it (K12). Spec 05 gets a Bed board section.
    - Bed requests, Calls, and Going home and discharges today sit above the beds. The No bed band comes next, then Elsewhere, then the beds grouped by bay.
    - The department's review list, "Waiting in this department" (K28): the shell's bar shows it, above the Bed board or a pack screen that replaced it, folded for the department's reviewers, and it opens by itself when a critical result is waiting.
    - Each bed row shows the name (side room marked), patient, age and sex, day N, expected discharge (amber today, red when past), the assignee, away, and results waiting (red when critical). An empty bed shows its state. A bed taken by another department's outlier shows as taken, "Medicine · outlier". A stay with no admission note shows "Admission note not written", and ↵ on it retries the note.
    - Typing filters by bed name or patient name. ↑↓ move, and ↵ opens the stay (K15's stay mode).
    - `a` admits the selected bed request into the selected empty bed. It is offered only to a user who holds both `write:visit` and `write:note` in this department (K18). An inline card under the bed row shows both, with the expected discharge prefilled from `edd` and the doctor. ⌘↵ calls `admit_visit`, then `write_note(kind 'admission')` (K18).
    - With no request selected, typing a name that no row matches searches patients (core `read_patients`), and `a` on a hit admits that patient directly.
    - `m` moves the selected patient to a bed typed by name (`mark_visit_bed`). `e` sets the expected discharge.
    - `s` cycles an empty bed through open, cleaning, blocked and closed, and asks inline for the reason on the last two.
    - `d` opens the stay with Discharge (K15).
    - The board listens on `queue:<department_id>`, which `change_visit` and `mark_bed` signal.
  - **The stay's visit screen:**
    - a Stay card at the top of the side column shows department, bed, day N and expected discharge;
    - Move bed is a visit action (K15).
  - **The bench.** `read_queue` rows carry the stay, `{department_name, bed_name}`, so a lab or a pharmacy sees where an inpatient lies.
- **Why:**
  - Every visited department other than reception draws the clinic screen (`src/core/screens/Department.tsx:11-14`), and spec 05 left the ward screen to a pack until its 2026-09-25 amendment.
  - `read_visit_queue` drops away patients and knows no bed (`20260924000016_core_calling.sql:64`).
  - Every stays department (a medical ward, a labour ward, an ICU) needs the same board for its basic work. A pack that needs more brings its own screen over `read_bed_board` (the labour board, the ICU chart, the drug round).
  - Results reach only the doctor who ordered them, so a ward's own staff would not see a critical result on the board.
- **Later:** a named nurse beside the responsible doctor. That is a second person on the stay, and core does not hold one.

### K20 · Work on the department type (part 0A, after K27)

- **What (server)**, in `<ts>_core_department_work.sql`:
  - **`department_types.work`**, checked against five words: `desk`, `visits`, `stays`, `bench`, `outside`.
    - Fill the core rows: reception → desk, clinic → visits, ward → stays, ancillary → bench, outside → outside. Fill the pack rows from `is_visited` (→ visits or bench). Then set NOT NULL.
    - A unique index on work where `pack is null and retired_at is null`: exactly one live core type per work.
    - `check (is_visited = (work in ('desk','visits','stays')))`, which changes no current row. `is_visited` and `is_outside` stay as columns, checked against the work, so old functions still compile. The desk keeps its lab-only walk-in visit (spec 03).
  - **`save_department`** derives `is_outside` from the work, and refuses `work_fixed` when the id exists with another type. It logs the stored type.
  - **The type-name literals become work tests:**
    - `open_visit` refuses `not_visited` for bench and outside;
    - stays keep `not_yet` until K15 turns it into `admission_only`;
    - the sweep skips `work = 'stays'`;
    - `open_consults` looks for `work = 'visits'`.
  - **`read_organization`** returns each department's `work`.
  - **Notices** list open visits in bench or outside departments, and departments whose `is_outside` disagrees with their work.
- **What (client):**
  - First, move `DepartmentsPage` (with `TYPES`, `REVIEW`, `DeptDraft` and `serving`) to `src/core/screens/settings/Departments.tsx`, because `src/core/screens/Settings.tsx` is at the 300-line lint limit (`eslint.config.js:12`).
  - Replace every check on the type with a check on the work: `src/core/screens/Department.tsx:11-14`, `src/core/shell/Shell.tsx:19`, `src/core/screens/Reception.tsx:43-44`, `src/core/screens/clinic/ClinicHome.tsx:15`, `src/core/screens/visit/VisitScreen.tsx:106`, `:125`, `src/core/screens/Settings.tsx:122-189`, `src/core/screens/settings/Services.tsx:51`.
  - The Type select is disabled after creation. Words for `work_fixed`.
  - Screens use place words: Front desk, Clinic, Ward, "Lab, X-ray or pharmacy", Outside. The keys `visits` and `stays` stay in code.
- **Tests:** a new `supabase/tests/departments.sql` covers `work_fixed`, `is_outside` derived from the work, and a bench refused `not_visited`.
- **Why:**
  - Type names act as switches: `'ward'` in the sweep (`20260923000021_core_amendments_0923.sql:175`), `'reception'` in `sees_department` (`20260923000024_core_private_visit_leaks.sql:16`) and in the shell (`src/core/shell/Shell.tsx:19`). The screen is picked by the type, `is_visited` and whether the department owns services (`src/core/screens/Department.tsx:11-14`).
  - A type change is silently ignored but still logged (`20260924000015_core_pack_cards.sql:24-33`).
  - K12's default screens and K15's stays need one word for what a department does before they build on types.

### K21 · Packs used here (part 0A, after K20)

- **What (server)**, in `<ts>_core_packs_used_here.sql`:
  1. `departments.packs text[] not null default '{}'` and `packs.works text[]`, filled from the work of each pack's own department types before they are retired (pharmacy's gives `{bench}`).
  2. Each department of a pack type moves to the core type with the same work, and that pack is added to its `packs`.
  3. The pack department types are retired, never deleted (spec 01: settings rows are retired).
  4. `departments.pack_cards` is dropped. The untracked `20260924000015_core_pack_cards.sql` stays, and the README's 0037 row gets "(dropped in 0044)".
  5. **The Screens line** is stored on the department: `departments.screens text[] not null default '{default}'` (the ticked screens: `default` and pack screens as `<pack>.<screen>`) and `departments.opens_on text not null default 'default'`.
  6. `save_department` is dropped and re-created with `packs text[] default null`, `screens text[] default null` and `opens_on text default null`, and no `pack_cards`. It refuses:
     - `pack_off`: the pack must be on in the organization;
     - `not_for_this_work`: the pack's `works` must include the department's work;
     - `pack_in_use`, with counts: a pack cannot be unticked while the department owns live services answered by the pack's types, or has open requests of its types addressed to it;
     - `bad_setting`: `screens` must hold `default` or a pack screen (the default can be unticked only while a pack screen is ticked); a pack screen must name a pack in `packs`; `opens_on` must be one of `screens`.

     Unticking a pack also drops its screens from `screens`; when `opens_on` named one of them, it puts `default` back in `screens` and sets `opens_on` to `default`. It logs `packs`, `screens` and `opens_on`, which are used from K12 on.
  7. `core.service_live(service_id)`: the service is not retired and, if its reply type belongs to a pack, that pack is on and used at the service's department (or the department is outside). Send, `/order`, `write_request` and `read_organization` use only live services. `save_service` refuses a pack reply type in a department that does not use the pack, and refuses moving such a service there (`not_used_here`).
  8. `read_organization` returns `departments[].packs`, `departments[].screens`, `departments[].opens_on`, `packs[].works`, and only live services.
  - Switching a pack off for the organization keeps the ticks, its screens included. Its tools, screens and displays go quiet, the default screen comes back by itself where one of its screens had replaced it (K12), and its entries still render. `organization_packs` stays the pack's master switch.
- **Same iteration:**
  - The seed saves Pharmacy as `save_department(d004, …, 'ancillary', 'Pharmacy', packs := array['pharmacy'])`, and `supabase/tests/pharmacy.sql` changes to match (`:27`, `:35`).
  - Bench words are looked up by the department's packs (`benchWordsFor(dept.packs)`). Pharmacy's `registerBenchWords('pharmacy', …)` still works, because its key equals the old type key.
  - Remove `departmentType` and `packCards` from the composer's context (`src/core/screens/visit/parse.ts:21-22`, `src/core/screens/visit/Composer.tsx:43`), from `commands.ts` and `src/core/db/types.ts`, and the Pack cards switch (`src/core/screens/Settings.tsx:171`).
  - Minimal "Packs used here" chips in the department editor.
- **Why:**
  - `pack_cards` does the job that "packs used in this department" should do (`20260924000015_core_pack_cards.sql:1-3`), and no pack registers a card for it.
  - A pack's department type ties a department to one pack for good: a GP clinic that also does antenatal checks could not use both packs' tools, and the type never changes (`20260924000015_core_pack_cards.sql:24-27`).
  - A service whose reply pack is off or unused would still take orders nobody can answer.

### K22 · One permission function (part 0A, after K21)

- **What (server)**, in `<ts>_core_one_gate.sql`:
  1. **Scopes.** `actions.scope` is one of:

     | Scope | Counts from | Actions |
     |---|---|---|
     | department | a role held in that department, or held everywhere | writes, marks, `read:queue` |
     | organization | any live role | `read:patient`, `write:patient`, `read:record`, `read:organization`, `read:cohort` |
     | everywhere | only a role held everywhere, with a second factor | `manage:*`, `read:settings_changes`, `read:record_reads` |

     A before-insert trigger gives a pack action its verb's default (`manage` → everywhere, `read` → organization, `write` and `mark` → department). The pack's registry row may state organization scope only for an action over its own data (spec 06); an entry writer and a step are always department scope.
  2. **Roles.** `roles.pack` (references `packs`); existing pack roles are tagged by key prefix, and `save_role` keeps `pack` on a copy of a pack role. A retired role counts for nothing anywhere, and neither does a pack role, or a copy of one, whose pack is off. `retired_at` is honoured everywhere.
  3. **`core.may(user, org, action default null, department default null)`** returns rows of (department_id, action, via). It states the rule once:
     - the caller is a live member;
     - holding a live role whose pack, if any, is on;
     - within the action's scope;
     - the desk's reach, the only reach beyond a person's own departments: `read:queue` and `write:visit` at the visits departments a desk checks in for (K23), with `via = 'desk'`, only when the person's role held at the desk itself holds that action;
     - for a pack action: the pack is on and, for a department-scope action, used here, with K4's exemptions. An order (a `write:` of an `is_request` type) and the bedside part of an order (a `write:` of a type that `follows` one, K3) are never tested for used-here: ordering follows "works for", so they are listed wherever the role holds them and the pack is on, and `require_order` tests the rest (K4).
     - The second factor belongs to the session, so `core.may` ignores it.
  4. **`core.why_not(user, org, action, department, correction default false, desk default false)`** returns null when the call is allowed, otherwise the first refusal in this order: `unknown_action`, `pack_off`, `not_a_member`, `mfa_required`, `department_missing`, `not_used_here`, `not_allowed`. There is no outside branch: holding `read:queue` does not open an outside department's queue.
     - Used-here is tested at the department asked about, never for an order or the bedside part of one. `begin_reply` asks about the request's to-department, or its from-department for a request sent outside, which it gates as an order. `correction := true` is passed only for a correction, never to skip used-here.
  5. **`require_access(uuid,text,uuid,uuid)` and `core.can(uuid,uuid,text,uuid)`** keep their signatures and grants (pharmacy's grant, the realtime policy) and call `why_not`. The second factor applies to everywhere-scope actions (`mfa_required`).
  6. **Call sites:**
     - **The desk's reach is opt-in.** Only these pass `desk := true`: `read_visit_queue`, `read_patients` (open visits in the clinics the desk checks in for), `open_visit`, `mark_present`, `mark_visit_priority`, `mark_visit` (its `write:visit` moves), `mark_visit_routing` (not its transfer form), and `core.can` for the `queue:` channel. Every other call, core's or a pack's, gets no reach: not `read_queue`, `read_to_review(department)`, `read_sent_outside`, `mark_bed` or any pack door;
     - `read_to_review(organization_id, department_id default null)`: "mine" needs `mark:reviewed` somewhere;
     - `mark_reviewed` passes for the request's requester, so the requester may always review their own results;
     - `read_sent_outside` requires the department;
     - `read_record` names a department where the caller holds a role, or holds one everywhere (`not_allowed` otherwise). `open_record` records the basis `visit` or `request` only when the reader holds a role scoped to that department, or is the visit's assignee or the request's requester; otherwise the basis is `none`. Machine and importer users get their own basis, `machine`, and are listed on the review;
     - `read_organization` admits any live member with a live role;
     - `write_entry`'s correction path calls `why_not(…, correction := true)`.
  7. **`save_user`** refuses a role that holds an everywhere-scope action when it is given in one department (`everywhere_only`), and any role on an outside department (`outside_department`). **`save_role`** refuses `everywhere_only` when it would add an everywhere-scope action to a role someone holds in one department, and names them. Only someone who holds a settings or audit right everywhere may grant it.
  8. **Notices** name each user who holds a settings role in one department, or any role on an outside department. No rows change.
- **What (client):** the shell says "Your work here is switched off" in place of the raw error. Until K24, a scoped holder's Settings pages show and are then refused.
- **Rights narrow on purpose.** Lab and pharmacy staff lose queue and visit rights over the clinics they serve, and settings roles held in one department stop working. The last-administrator rule already keeps an administrator whose role is held everywhere (`20260924000013_core_review_fixes.sql:18-20`). The seed is updated.
- **Tests:** a new `supabase/tests/access.sql`, the permission matrix. For every user, action and department (and none), with a second factor (`aal2`): `why_not` with `desk := true` is null exactly when the cell is in `core.may` (a `via = 'desk'` row exactly when it is null only with `desk := true`), when `core.can` is true and when the realtime policy for `queue:<department>` passes. With `aal1` the same holds except the `mfa_required` cells. Named cells cover the desk's reach and its opt-in list (rec1 `read_sent_outside(org, C1)` → `not_allowed`; rec1 `mark_bed` on a C1 place → `not_allowed`; a custom desk role without `write:visit` gets no `write:visit` at C1), the lost lab and pharmacy rights, scoped settings roles, retired roles, a copy of `pharmacy_pharmacist` holding nothing while pharmacy is off, `not_used_here` and its exemptions (order and follow-up actions listed where the pack is not used), `department_missing`, the read log's basis, `everywhere_only` (both saves) and `outside_department`. `roles.sql` and `pharmacy.sql` change to match; `privacy.sql` and the tenant matrix stay green.
- **Why:**
  - The screen asks "what may this person do anywhere?" (`src/core/hooks/organization.ts:37`); the server asks "what may they do here?" (`20260923000019_core_mfa_switch.sql:28-34`).
  - A call with no department passes any role held in one department (`20260923000019_core_mfa_switch.sql:33`), so `manage:users` given only in one clinic saves users for the whole organization.
  - "Serves" quietly widens `read:queue` and `write:visit` over every department the caller's department serves (`20260923000019_core_mfa_switch.sql:36-46`), which gives technicians queue and visit rights over every clinic (`20260922000007_core_registry.sql:34-36`). Holding `read:queue` anywhere opens every outside department's queue (`20260923000019_core_mfa_switch.sql:47-54`).
  - The client's list of actions ignores retired roles (`20260924000015_core_pack_cards.sql:49`).

### K23 · Checks in for, works for, consults (part 0A, after K22)

- **What (server)**, in `<ts>_core_serves.sql`:
  - **"Serves" has one meaning per work:**
    - a desk **checks in for** visits departments: chosen ones, or Every (every live visits department). No rows means none. Any other target is refused `not_a_clinic`;
    - any department that owns live services, and outside, **works for** chosen departments, or Every. No rows means only itself;
    - on insert with `serves` null, `save_department` adds an Every row for desk, visits, bench and outside. Stays get none: their services serve only themselves.
  - **Ordering.** `core.may_order(from_department, service_id)` holds when the service is live (K21), and it is the department's own, or has a row naming it, or an Every row, and its reply type answers nothing (`not_orderable`; Send's own call is exempt). `write_request` uses it (`not_served`). A department may always order its own services.
  - **Consults.** A consult (a department and a question) reads no works-for. It goes to a visits or a stays department (`consult_not_here` otherwise). The consult pickers list only these. The reply is a note written in the replying department, so a private department's reply is private and readable by whoever asked (spec 07). Refusing `is_admission` outside stays (`not_a_stay`) lands with K18.
  - **Paper request.** A new department-scope core action, `write:paper_request`, given to the built-in Receptionist role. `write_request` accepts it in place of `write:request` only at a desk, with source `outside`, a stated doctor and a `service_id`, never for a consult.
  - **Send** picks a service in one order, the same in client and server: its own service; a service whose department names this one; one at the same site; Every. A tie is refused `choose_service` unless `service_id` is given. K17 adds `service_id`; until then a tie is refused.
  - **`read_organization`** returns each department's `send_to` and `orders_from`, worked out by the server.
  - **Backfill:** an Every row for existing desks, and for departments that own live services, except stays. The notice lists their names.
- **What (client):**
  - Delete `worksFor` and `canSendPrescriptions` (`src/core/hooks/organization.ts:43-47`, `src/core/screens/visit/send.ts:6-7`); read `send_to` and `orders_from` instead.
  - `/order` offers the department's own services.
  - The consult pickers list visits and stays departments.
  - Reception lists the visits departments its desk checks in for, with no fallback (`src/core/screens/Reception.tsx:43-44`).
  - The desk card gets "Paper request (P)": a walk-in's paper request, source `outside` with the stated doctor, gated `write:paper_request` at the desk.
  - The chips read Only here · Every · chosen.
- **Seed and tests:**
  - The desk saves with `serves := array[null]::uuid[]`, and the raw inserts go (`supabase/seeds/dev.sql:15`).
  - `smoke_api.sql` adds an Every row for its lab; `pharmacy.sql` adds one for Pharmacy.
  - `departments.sql` covers own, Every, nobody, ties and `not_a_clinic`.
- **Why:**
  - `served_departments` does seven jobs, and "no rows" means every department when routing a prescription (`20260924000017_core_send_prescriptions.sql:46`) but nobody in the gate's widening (`20260923000019_core_mfa_switch.sql:42-44`).
  - The client and the server test Send differently (`src/core/screens/visit/send.ts:6-7` against `20260924000017_core_send_prescriptions.sql:43-50`).
  - Reception falls back to every clinic when its desk serves none (`src/core/screens/Reception.tsx:44`).

### K24 · Rights per department on the client (part 0A, after K23)

- **What (server)**, in `<ts>_core_my_departments.sql`: `read_organization` returns `me.departments[]`, every department where the person may do anything, and `me.actions`, the organization and everywhere actions. Both are built from one set call of `core.may(u, org)`. `me.actions` marks everywhere-scope actions `needs_second_factor` while the session is `aal1`; the client shows those pages behind the step-up. Each department carries:
  - `actions`;
  - `via` (`role` or `desk`);
  - `works_in` (K26);
  - `held`: the actions of live roles there, used by Correct: built-in and custom roles whatever the pack state, and a pack role (or a copy of one) only while its pack is on.

  The department picker lists `via: 'role'` departments only, keeps only live roles and never includes an outside department.
- **What (client):**
  - **Rights.** `useDepartment()` exposes `can(a)` (the current department, or the organization), `canAt(department, a)` (used by Reception's rows and the Request screen's steps) and `canAnywhere(a)` (used by the review list and the Settings cog). All three read the one list, so anything shown is allowed.
  - **Picker** grouped by site when there is more than one.
  - **Working department.** The visit screen writes in the first of these that applies: (1) the picked department, when the patient has an open visit or stay there; (2) the department of the patient's live stay, if the person may write there; (3) the patient's only open visit in a department where the person may write, never one in a private department; (4) the picked department, with no visit. When the picked department is private, (2) and (3) never apply, so a note is never moved out of a private department. A draft is signed only into the department stamped on it. It reads the patient's live stay and open visits from `read_record` (one subselect) and says "Writing in Ward C".
  - **Commands.** `registerCommand({ name, label, example, works, actions, pack, parse, empty })`:
    - a command lists every action its drafts need, and the works it serves; core's commands serve visits, stays and bench;
    - it shows when the department's work is one it serves, the department uses its pack (for an order, or the bedside part of one, a live service answering the order works for this department, whatever packs the department uses), and all its actions are allowed here;
    - roles no longer decide which commands are listed;
    - `canWrite = commandsFor(ctx).length > 0`, moved here from K6;
    - `/al none` carries `write:list_review`.
  - **Small fixes:** ⌘K opens a record only for someone with `read:record` (`src/core/shell/Search.tsx:28`); each Settings page is gated by the actions its own calls need (`src/core/screens/settings/save.ts:8-9`).
- **Tests:** `access.sql` asserts that `me.departments` equals `core.may`; `scripts/test-composer.ts` changes to match (commands by work and by all their actions; `/al none`; picked P, a patient with a live stay in Medicine and no P visit: the draft is stamped P and signed private).
- **Why:**
  - `can(action)` is the union of every action held anywhere (`src/core/hooks/organization.ts:37`), so commands are listed by a role held anywhere (`src/core/screens/visit/commands.ts:48-49`) and may be refused at Done.
  - A draft carries only its command's one action (`src/core/screens/visit/parse.ts:222`), so `/al none` writes `write_list_review` under `write:allergy` (`:258-259`).
  - `canWrite` names three core actions (`src/core/screens/visit/VisitScreen.tsx:105`).
  - ⌘K opens a record for anyone who may search (`src/core/shell/Search.tsx:28`).

### K25 · Settings by work (part 0B, directly after K12, before 3)

- **What:**
  - **Departments:**
    - "What happens there" cards, one per work, in place words, each with core's and the enabled packs' starter setups under it. A setup of a pack that is off is marked "also turns on Obstetrics", and only `manage:organization` can pick it;
    - New department and Add to this department (K12);
    - "Packs used here" chips, each with its department settings panel (K12);
    - the Screens line (K12): ☑ Default screen (unticked only while a pack screen is ticked), ☑ each screen of the packs used here, and Opens on. Unticking the screen Opens on names ticks Default again and sets Opens on to Default, so the default screen comes back by itself (spec 05);
    - the settings each work shows, from spec 02's "Settings by work" table, with the rules as one summary line edited in place;
    - Checks in for or Works for chips: Only here · Every · chosen;
    - a new department's card offers to add it, with one key each, to the desks and benches that have chosen lists, through their own saves.
  - **Staff** replaces Users:
    - no Kind select;
    - "where" offers Everywhere plus the departments where people work;
    - an everywhere-only role offers only Everywhere;
    - role chips read "Doctor · Cardiology".
  - **Packs.** Turning a pack on opens its card:
    - "Use it in" chips, pre-ticked from the manifest's `usedBy` works;
    - its starter setups;
    - its screens, each with one line on what it does and which actions it has, since turning the pack on for a department means agreeing to what its screen does;
    - the clinic's own roles, each with a "give its actions" chip.

    One Save calls `save_department` once per department, so each keeps its own stale-save check. A department shows one line when no role held there has any of a used pack's actions.
  - **Roles.** The role editor hides `manage:patients` and steps that have no button. `read:cohort` shows as "Patient lists", since K29 gives it a read. A copied role keeps no link to the role it was copied from.
  - **Advanced fold:** Record reads (gated by `read:record_reads`) and Settings history (gated by `read:settings_changes`).
  - **Core starter setups:** Front desk (checks in for Every), General clinic, Ward and Laboratory (works for Every), as client data in `src/core/setups.ts`. K18 gives the Ward its 12 beds.
  - **Who is offered what.** A starter setup, New or Add, is offered only to someone who holds every action its saves need: `manage:departments`, plus `manage:services` when it carries services, plus `manage:organization` when it turns a pack on. A pack card's "give its actions" chips show only with `manage:roles`.
- **Why:** an administrator should choose what happens in a place, not a type name. K12 brings the starter setups; this row gives them a screen.

### K26 · Private notes: who reads them (part 0A, after K1)

- **What (server)**, in `<ts>_core_private_notes.sql`. The rule: hide the story, never the fact.
  1. **`core.works_in(user, department)`** is true when the user is a live staff user (kind `staff`) and holds a live, non-retired role scoped to that department (never a role held everywhere, so not the owner's) whose actions include `read:record`. It is never worked out through the gate.
  2. **The private list.** `core.note_privacy` (organization_id, entry_id, patient_id, department_id, is_private, reason_text, changed_by, changed_at) keeps each note's privacy beside the record, one row per change, insert-only like `record_reads`. A row is keyed by the note's chain (`entry_id` is `core.root_of`, its first version), so every version of a note — earlier versions, a struck one and their files included — has the privacy of the chain's latest row. The note itself never changes, so the spine is untouched. `department_id` is the note's own department, for ever: a transfer, a note written between visits, or a reply written in another department's visit changes nothing. K27 writes the first row when the note is signed.
  3. **Private departments.** The department rule `departments.private_visits` is renamed `is_private` (spec 02), "Private department" on screen: every note written there is private. `save_department` and `read_organization` are re-created with the new name (today `20260924000015_core_pack_cards.sql:8`, `:51`), and the seed changes to match (`supabase/seeds/dev.sql:14`).
  4. **Backfill, then drop.** Every note in a visit that is private today gets a private row, in its own department, by its author at its `recorded_at`. So does every other note written in a department while its `private_visits` rule was on (the department's `settings_changes` rows say when; spec 07: turning the rule on changes only the notes signed afterwards), unless it sits in one of that department's visits that was made not private by hand (its `mark_visit_private` step, `visit_steps.changes` `{is_private: false}`). This catches the notes today's per-visit test leaves readable: signed between visits, or a reply carried into another department's visit (`20260923000024_core_private_visit_leaks.sql:33-36`). Then `visits.is_private` and `public.mark_visit_private` are dropped, and `open_visit` is re-created without them (today it copies the rule onto the visit, `20260923000024_core_private_visit_leaks.sql:380-382`).
  5. **`core.note_private(e)`**: e is a note and the latest `note_privacy` row of e's chain says private.
  6. **`core.reply_for_me(e)`**: the reader is the requester of the request e answers, or works in that request's from-department.
  7. **`core.note_hidden(e, reader)`**, the one test every read applies, per note, holds when all of these hold:
     - `core.note_private(e)`;
     - the reader does not work in e's department (`core.works_in`);
     - the reader has not opened this patient's private notes from that department anyway within 12 hours;
     - the reader is neither `e.author_id` nor `e.responsible_id`;
     - `not core.reply_for_me(e)`.

     `core.hidden_entries(reader, patient_ids)` returns, in one set query, the ids of the notes hidden from the reader, and every mask tests `e.id = any(hidden)`. `core.visit_hidden` and `core.hidden_visits` are dropped: privacy never lives on a visit.
  8. **`public.mark_note_private(entry_id, is_private, reason default null)`.** Its author, or anyone who works in its department, can make a note private or not private, at any time. Not private needs a reason (`reason_missing`). A type that is not a note is refused `not_a_note`, and anyone else `not_allowed`; a pack, machine or importer user is refused `not_allowed`. It takes any version of the note, a struck one included, and writes one row for the whole chain. It adds one `note_privacy` row, so every change is logged, and signals the patient's `record:` channel.
  9. **Open anyway.** `read_record`'s `open_visit_id` becomes `open_department_id`. A staff member who may read the record gives a reason (Direct care · Emergency · Admin · Other, with a few words), and that patient's private notes from that department open to them for 12 hours. The read is logged in the one read log, basis `anyway`, with `record_reads.opened_department_id` in place of `opened_visit_id` (today the basis follows the visit, `20260923000022_core_privacy_views.sql:89`). Pack, machine and importer users cannot (`not_allowed`). `read_opened_anyway` also lists the "made not private" rows of `note_privacy`.
  10. **Re-create without the department-name masks,** keeping only the masking of hidden notes, each decided per note:
      - `entry_card` and `entry_data`: the real department name always; a hidden note shows "Private note", with no text and no author; a request's reply line and flag (`requests.reply_line`, `reply_flag`) show "Private reply" when the latest reply is hidden, and no other function body reads `requests.reply_line` (K1's static scan gains the rule);
      - `read_entry`, files (`read_entry_file` refuses `private_note`, today `private_visit`, `20260923000024_core_private_visit_leaks.sql:241`), values, the results table, the review comparison;
      - `patient_hit` and `read_visits`: department and assignee always real; `first_line` is the first note of the visit that is not hidden from the reader; `is_hidden` says the visit holds a note hidden from the reader; `read_visits` loses `is_private`;
      - `read_patient`;
      - `read_queue`: department names real; its recent-reply mask kept;
      - `read_visit_queue`: no private filter, and counts unfiltered;
      - `mark_step` and `mark_routing` no longer null `from_department_id` or `requester_id`.
  11. `patient_hit` drops `open_consults.question_text`. `read_patient` drops `visits` and returns the patient and its changes.
  12. `read_visits` and search leave out a visit cancelled with no entries.
  13. **Realtime.** `record:<patient>` also needs a `record_reads` row by the user for that patient within 12 hours.
  14. Drop `core.sees_department(uuid,uuid,uuid)` and `public.read_private_visits(uuid)`, after `patient_hit` is replaced.
  15. `read_organization`'s `me` gains `works_in uuid[]` (K24 folds it into `me.departments`).
- **What (client):**
  - Delete reception's private fold and its private "Gone" list (`src/core/screens/reception/Lists.tsx:35-45`, `:81-97`), `usePrivateVisits` and `PrivateVisit` (`src/core/hooks/reads.ts:10-13`), and the `private_visits` invalidation (`src/core/hooks/writes.ts:17`).
  - Delete the visit's "make private" item in the visit menu (`src/core/screens/visit/VisitScreen.tsx:121`), its mutation (`src/core/hooks/writes.ts:22`) and the visit's "private" badges (`src/core/screens/visit/Record.tsx:75`, `src/core/screens/visit/VisitScreen.tsx:152`).
  - A hidden note shows "Private note" in the timeline. Open anyway becomes an inline card for one department's private notes, in place of today's dialog for one visit (`src/core/screens/visit/Record.tsx:173-182`).
  - A note's entry panel offers Private or Not private to its author and to people who work in its department; Not private asks for the reason inline.
  - The department editor's rule reads "Private department" (today "Visits · Shared / Private", `src/core/screens/Settings.tsx:169-170`).
- **Tests:** `supabase/tests/privacy.sql` is rewritten around spec 07's private notes, with one assertion per kept mask (the reply line included). It checks that:
  - `read_private_visits`, `core.sees_department`, `mark_visit_private` and `visits.is_private` are gone;
  - a note in a private department P is hidden from a doctor elsewhere ("Private note", no author, the department's name shown), while the prescription, result, problem and request beside it show in full;
  - its author, its responsible clinician and a Doctor at P read it; the owner (a role held everywhere) and a role at P without `read:record` do not;
  - open anyway opens P's private notes of that patient for 12 hours, basis `anyway`; with no reason: `reason_missing`; for a pack, machine or importer user: `not_allowed`;
  - `mark_note_private` by the author or a Doctor at P passes; by anyone else: `not_allowed`; not private with no reason: `reason_missing`; the change is listed by `read_opened_anyway`;
  - a consult reply written in P is readable by the requester and by a Doctor in the asking department, and shows "Private reply" to anyone else;
  - the backfill makes every note of a private visit private in its own department; a P note with no visit, and a P consult reply written in C1's visit, are private after the backfill;
  - a note corrected once and then made private shows "Private note" for its earlier version in `read_entry`'s versions, and its earlier version's file is refused `private_note`; a struck note can be made private;
  - a machine user holding Doctor at P does not read P's private notes, and `mark_note_private` by it is refused `not_allowed`;
  - a reader who opened P's notes anyway cannot correct or strike one (`private_note`).
- **Why:**
  - The owner's decision: hide the story, never the fact. Only notes are private, one note at a time, and a note never moves (spec 07).
  - "Department staff" means three things today: any role there (`20260924000016_core_calling.sql:65-66`, `20260923000024_core_private_visit_leaks.sql:14-15`), a role with `read:record` there (`20260923000022_core_privacy_views.sql:36-43`), and a role with `mark:in_consult` there (`20260923000024_core_private_visit_leaks.sql:396-399`).
  - Privacy on the visit fails wherever a note leaves its department's visit: `note_hidden` tests only the visit (`20260923000024_core_private_visit_leaks.sql:33-36`), so a note signed between visits (Sign sends no visit, `src/core/screens/visit/VisitScreen.tsx:45-52`), a reply carried in the asker's visit, or a stay moved to another ward loses or gains privacy by accident.
  - Name masks spread to search, the desk, the bench and the planned bed board, each with its own exception (`20260923000024_core_private_visit_leaks.sql:12-19`, `20260924000012_core_reception_private.sql:30-42`).
  - Search gives consult questions to anyone who may search (`20260924000004_core_time_zone.sql:107-109`).
  - The record channel checks only `read:record` (`20260923000024_core_private_visit_leaks.sql:474-475`).
  - A note has versions. `read_entry` returns every earlier version, each masked on its own (`core.chain_of`, `20260923000024_core_private_visit_leaks.sql:233`), and `read_entry_file` tests only the entry it is given (`:241`). So privacy kept per version would leave a corrected note's earlier text and files readable, and a struck note could not be made private, because its live version is `entered_in_error`.
  - Today's backfill source, the private visit, misses the notes `note_hidden` never hid: it needs a visit (`20260923000024_core_private_visit_leaks.sql:33-36`).

- **Done (2026-09-25).** `20260925000001_core_private_notes.sql` (0041), the client (`Record.tsx` PrivateNotes, OpenAnyway inline under a hidden note and on top of the record, NotePrivacy; `Reads.tsx`; the desk's private list, the visit's private item and badges removed; "Private department" in Settings), `privacy.sql` rewritten (118 checks). Beyond the row: a note signed in a private department gets its private row in `write_entry` now (so the tests are real before K27), and striking a note (`write_entered_in_error`) was broken by an ambiguous `replaces_id` and is fixed. An adversarial review found and this row fixed: `mark_step`/`mark_routing` returned an unmasked reply line (`core.masked_request`); a correction written under a merged survivor escaped the hidden set (`hidden_entries` now walks the private chains); a striker could make a note not private (only authors of note versions count); `save_department` and `save_user` overwrote another organization's rows (now `not_found`); `erase_patient` failed on privacy rows and on replies (both fixed); the migration's copy into insert-only `record_reads` would abort on a real database (trigger disabled for that one copy; `opened_visit_id` dropped); the realtime policy read core tables `authenticated` cannot (`core.may_listen`, a definer function); the backfill is a testable function with its exemption scoped to the note's own department. Later: `read_queue`, `read_to_review` and `read_sent_outside` compute the hidden set per row (cheap now that it walks only private chains; one set per call is better).

### K27 · Where a note is written, and making it private (part 0A, after K26)

- **What (server):** `<ts>_core_note_place.sql` re-creates `core.write_entry` once:
  - **A note's privacy is written when it is signed.** A note written in a private department gets its private `note_privacy` row (K26) in the same transaction. A correction of a private note is private: a correction stays in its chain, so it keeps the chain's privacy; `!` or the Private tick on a correction makes the whole chain private.
  - **A reply's department** is the department its gate ran at: the request's to-department, or its from-department for a request sent outside. So an outside department is never an entry's department, and a correction of such a reply is gated at the sender. `write_entry` refuses `wrong_department` when a reply's `p_department_id` is any other department. `begin_reply` (K4) returns that department, and pack doors write with it; core's `write_note` (consult reply) and `write_result` write with it too, not with the caller's picked department. A note's department decides its privacy, so nobody can file a reply under another department.
  - A correction or strike of a private note is refused `private_note` unless the caller is its author or works in its department (`core.works_in`); a reader who opened it anyway is refused, since open anyway opens a note to read, never to write (spec 07).
  - A correction keeps `old.reply_to_id`; a different one is refused `reply_mismatch`.
  - `write_entry` reads no visit: there is no `wrong_visit` and no `visit_needed`, since privacy no longer lives on the visit.
- **What (server), `write_set`:** an item may carry `private: true` (`20260922000009_core_writes.sql:319`). After the item's function returns its entry, `write_set` adds the entry's private row in the same transaction, or refuses `not_a_note`. So a pack's note is made private the same way as core's, and no pack door changes.
- **What (client):**
  - Drafts are keyed by (patient, department) and stamped with that department and its visit when made, because a note's department decides its privacy. Switching department never moves a draft (`src/core/hooks/drafts.ts`).
  - `sign()` attaches this department's open visit whenever one exists, not only the caller's own.
  - **One private note.** A line that starts with `!` is a private note: the parser strips the `!` and marks `private` every draft of the line whose type is a note, and only those (`src/core/screens/visit/parse.ts`), so `!/mhrisk` makes the risk note private and never the level. Every note card, core's and a pack's, has a Private tick drawn by core's card frame (`src/core/screens/visit/Card.tsx`), which sets the same mark. On a line that writes no note, `!` is refused with words ("Only a note can be private"). A private line never joins a plain one: its draft's tag carries the mark (`note:<kind>!`), so a `!` line is never appended to a plain note of the same heading, and a plain line is never appended to a private one (today typed lines join the draft with the same tag and keep its other fields, `src/core/hooks/drafts.ts:12-14`, tags at `src/core/screens/visit/parse.ts:207-209`). Ticking Private on a card marks that whole note.
  - The composer's first line says where it writes: "Writing in Psychiatry · private department · only notes are hidden" in a private department (spec 05), otherwise "Writing in Ward C".
- **Specs:** spec 07 gets the `!`, the Private tick and where a note's privacy is kept. `write_entry` still reads no visit, so spec 03's boundary rule 1 keeps `write_entry` away from `visits`.
- **Tests:** `privacy.sql` (a note signed in a private department is private from its first read; a note marked `!` elsewhere is private; a correction of a private note is private; `private_note` and `reply_mismatch`; a reader who opened P's notes anyway cannot correct or strike one (`private_note`); a P doctor's consult reply sent with department C1 → `wrong_department`); `scripts/test-composer.ts` (a draft made in one department is never signed into another; `!` marks a note line private; `!` on a line that writes no note is refused; `plan: a` then `!plan: b` make two drafts, only the second private; `!` before a command that writes a fact and a note (a test command shaped like psychiatry's `/mhrisk`) marks only the note).
- **Why (reply department):** core's reply writers gate at the request's to-department, then write with the caller's `department_id` (`write_note` for a consult reply, `20260923000021_core_amendments_0923.sql:292` then `:301`; `write_result`, `:254` then `:264`). So a Psychiatry doctor could answer as C1, and the reply would be an ordinary C1 note that everyone reads.
- **Why:**
  - Drafts are held per patient (`src/core/hooks/drafts.ts:7`), so a draft made in one department can be signed in another, under another department's privacy.
  - Nothing can make one note private: privacy lives on the visit (`20260923000024_core_private_visit_leaks.sql:391-403`).
  - A correction may change its `reply_to_id` (`20260923000024_core_private_visit_leaks.sql:140`).

### K28 · Clinic flow gaps (part 0A, after K24)

- **What**, in `<ts>_core_clinic_flow.sql` and the Queue (the default screen of a visits department):
  - **Sweep.** `sweep_visits` adds the rule in_consult ∧ `seen_at` null ∧ idle 12 hours → left, with `flag_unseen`.
  - **Take over.** A visit in consult with someone else offers Take over to holders of `mark:in_consult` there: in_consult → waiting (reason `taken_over`), then a call. Both moves already exist.
  - **The department's review list.** In a visits or stays department the shell's bar shows, above the Queue, the Bed board or a pack screen that replaced them, its reviewers a folded "Waiting in this department" list, `read_to_review(department)` minus the reader's own, and the reader's own My results (spec 05, *Default screens and pack screens*, item 7). It opens by itself on any screen when a critical result is waiting.
  - **Back patients.** `mark_visit_routing` gains `unassign boolean default false`, and the Back row offers "Anyone (A)". The Next rule treats a Back patient as unclaimed after 30 minutes Back, or when the assignee holds no live role in the department.
- **Why:**
  - No sweep rule matches a called, unseen patient (`20260923000021_core_amendments_0923.sql:179-190`), and only the caller may finish (`src/core/screens/visit/VisitScreen.tsx:35-37`).
  - The department's list exists, but no screen shows it (`20260924000013_core_review_fixes.sql:126-157`).
  - `mark_visit_routing` cannot clear an assignee: a null keeps the old one (`20260922000011_core_visits_functions.sql:181`).

### K29 · A clinic's patients by problem: one core read for pack screens (part 0B, before 3)

- **What (server)**, in `<ts>_core_read_cohort.sql`:
  - **`public.read_cohort(organization_id, department_id, problem_codes text[], since date default null, value_codes text[] default '{}', entry_types text[] default '{}')`** finds a clinic's patients by problem, so a pack screen can list them (chronic care: this clinic's patients with diabetes whose review is overdue).
    - It returns the patients with a visit in that department (since `since`, when given) whose live problem list holds one of `problem_codes`. A code matches itself and the codes that point at it, as `read_values` expands codes. A visit cancelled with no entries does not count.
    - For each patient: id, name, record number, age and sex; the matching problems; the last visit in that department; the last two values of each of `value_codes`, so a trend shows; and the latest live entry of each of `entry_types`, as `entry_data` shows it. The pack screen works out the rest (a review due or overdue) from these.
  - **Gate:** `read:cohort`, `read:record`, and `read:queue` at `department_id` (a role held there or held everywhere; the desk's reach does not open it), as `begin_read`'s list form: a clinic's patients are listed only to that clinic's staff. The built-in Doctor role gets `read:cohort`. The read opens no record and writes no read-log row; opening a patient from the list is the usual logged `read_record`.
  - **It returns only what the caller may read.** It obeys private notes (K26): problems are not notes, so they show; a value of a hidden note is left out; an entry of a note type comes back as the record shows it, its date and "Private note" when it is hidden from the caller, never swapped for an older one (`core.hidden_entries`), so a review is never shown as overdue because its note is private.
  - **One set query,** over the problem list (`core.patient_problems`), the values (`core.entry_values`) and the entries, never one query per patient.
- **What (client):** `useCohort({ department, problems, since, values, types })` in `src/core/hooks/reads.ts`, re-exported to packs by `src/core/packs.ts` (K5). The role editor shows `read:cohort` as "Patient lists" (the label exists, `src/core/screens/settings/Roles.tsx:16`).
- **Tests:** a new `supabase/tests/cohort.sql`:
  - it finds only the department's patients with a matching problem, a child code included, and none of another organization (`wrong_organization`);
  - `since` keeps only patients with a visit there since that date;
  - a caller without `read:cohort`, or without `read:record`, is refused `not_allowed`; so is a Doctor whose only role is in another department;
  - a problem written in a private department shows; a value of a private note hidden from the caller is left out, and a hidden latest entry of a note type comes back as "Private note" with its date, never an older one; both show to someone who works there;
  - a visit cancelled with no entries does not bring a patient into the list;
  - 200 patients come back from one call, and the function body holds no loop over patients.
- **Specs:** spec 03's function list names `read_cohort` beside `read_patients`; spec 02's core roles add `read:cohort` (doctor).
- **Why:**
  - Chronic care's screen (3) lists the clinic's diabetic and hypertensive patients with their last HbA1c and blood pressure and whether a review is due. No core read crosses patients by problem, and a pack may not read core tables. The core audit planned this read as `read_cohort` under `read:cohort` (`spec/00-core-audit.md:62`).
  - `read:cohort` exists with no function (`20260922000007_core_registry.sql:3`), and only the owner holds it, through "owner: everything" (`:19`).
  - `read_values` reads one patient at a time (`20260923000024_core_private_visit_leaks.sql:247`), so a list built from it would make one read per row, which the Speed rule forbids.
  - `read:cohort` and `read:record` are organization scope, and `department_id` alone is only a filter. Without `read:queue` there, any Doctor could list, with no read-log row, every patient of Psychiatry or Sexual health with a given diagnosis, while opening those records one by one is logged and printable for the patient (spec 07).

## Why the ward is core

- **Packs cannot share data.** No pack reads, imports or calls another (`spec/06-pack-contract.md:257`, `:321`), so data two workflows share must live in one pack or in core. Several packs need to know who is admitted where:
  - emergency admits;
  - inpatient works the stays;
  - the labour ward and the ICU are stays departments using obgyn or critical;
  - surgery sends a stay's patient to theatre.

  None of these packs is "the ward".
- **Every pack used on a stay would otherwise rebuild it.** A `ward` pack's stays and beds would be invisible to the labour ward and the ICU. Each of those would have to copy stays, beds, the board, move, transfer and discharge, or depend on the ward pack, which the contract forbids.
- **Core already held most of it.** `ward` is a core department type (`20260922000007_core_registry.sql:41`), whose work becomes `stays` in K20. Visits, their logged steps, routing and presence are core, and K15–K17 were already core rows. The old pack held only beds, the bed request and a screen.
- **A bed is not part of the clinical record.** It is where the patient lies, like the visit's priority, which already changes through one logged visit change (`20260924000019_core_visit_priority.sql`). Packs may not touch visits (`spec/03-patients-visits.md:205-207`), so a pack could only shadow the bed in its own table and flag mismatches.
- **A clinic without wards sees nothing.** With no stays department:
  - there is no bed board;
  - `/admit` offers nothing, because it lists stays departments only;
  - Settings shows no beds;
  - `admitted` never appears.

  Core grows by one status, two visit columns, one settings table, one note kind and one screen.
- **One board for every stays department.** Core's bed board is the default screen of every stays department, with the ward's basic work: admit, move, transfer, discharge. A pack that needs its own view of the same beds brings its own screen over `read_bed_board` (the labour board, the ICU chart, the drug round), as a tab or in place of the board. A pack's marks on a patient (doses due, NEWS, dilation, ventilator day, isolation) show in the patient's banner and record, and on its own screen, never on the board.
- **What stays in packs:** every clinical act on a stay, used where the stays department uses the pack. Admission and discharge are notes, so core gains no clinical entry type.
  - `inpatient`: medicine rounds, NEWS2, fluids, nursing, handover, discharge letter and nutrition;
  - `obgyn`: labour, partogram and births;
  - `critical`: the hourly chart and ventilation;
  - `surgery`: the theatre list.
- **Old pack #12 `ward` is dissolved** into K15, K16, K18 and K19, bullet by bullet:

| Old #12 | Now |
|---|---|
| `ward.beds`, edited on the pack's settings card (`ward_save_bed`, `ward_mark_bed`) | K18: `core.beds`, `save_bed`, `mark_bed`, Settings → Departments |
| Preset: a ward with 12 beds and an Admission service replied by `ward_bed` | K18: the demo seed's ward with 12 beds; K25's core starter setup "Ward", given 12 beds by K18. No Admission service is needed, because a bed request is addressed to the department |
| `/admit` writes `ward_admission`, lands on the board, holds the sending visit | K18: core `/admit`, a core request marked `is_admission` and addressed to the stays department |
| The bed board: beds in bay order, Bed requests and Discharges today, filter, ↵, `a` admits, names from `read_visit_queue` | K19, with its own single read |
| Consultant, named nurse on each row | K19: the stay's assignee. The named nurse is K19's Later |
| Isolation on each row | infection's banner item (5) through K10, in the patient's banner and record; not on the board |
| `/bed 12`; `bed_taken` inside the writer | K18/K19: `mark_visit_bed` from the board's `m` and the visit menu. A bed move is a visit change, not an entry, so it is not a composer command. `bed_taken` comes from the unique index |
| Transfer: routing with `move_requests`, then `ward_bed` | K16, with the bed in the same step |
| Discharge: `ward_discharge` plus a core discharge note, then admitted→done; a death sets `died_on` | K15: the `dc:` heading and Discharge ("Going home"), then Left, which ends the stay. Destination and follow-up become words in the note, and K15's Later holds the structured fields |
| `ward.update_stays` keeps `ward.stays` | K18: `visits.bed_id` and `visits.expected_end_on`, with their history in `visit_steps` |
| Side section: ward, bed, day N, expected discharge | K19: the Stay card |
| The board flags a mismatch (bed free, visit still open) | not needed: bed and stay change in one transaction |
| Roles `ward_nurse`, `ward_doctor`, `ward_bed_manager`; `manage:ward_beds` | none. `save_bed` uses `manage:departments`, and bed moves and states use `write:visit`. A clinic's own roles (0033) make a bed manager |

## The packs

Order rules:
- A specialty pack is what a clinic turns on ("we do OB/GYN").
  - Its phases are rows, built in order, one per iteration.
  - The phases of one pack are one pack: one key, one schema, one role, one `after_write` and one `src/packs/<key>/`, and they share data freely.
- A later phase's migration is the pack's own later migration:
  1. registry rows other than `core.packs` (phase a inserted it, with `call_types` and `is_called_after_write`);
  2. `set role pack_<key>`. The role and schema exist from the first phase, so `create_pack_role` is not called again;
  3. its objects, then `reset role`, then its doors.
- The small packs come first, and each phase proves one more contract path (**bold** = first proven).
- The ward skeleton is core (K15–K19), built as its users arrive. Every stay tool in `inpatient`, `obgyn` b and `critical` works in any stays department that uses its pack, never on a type.
- A pack adds no department type. Where the old plan had one, the pack ships a **starter setup**: client data that makes a new department, or adds to an existing one, with a work, the pack ticked, rules, the Screens line, beds or places, services and works-for (K12). Setups are named here now, before 4a builds the first one, because keys are permanent.
- A pack's writing tools and screens show only where a department uses it. A pack screen is a tab, or replaces the default screen with whatever actions it has (K12). Its displays (banner items, sections, record views, warnings) show wherever the record is read while the pack is on. Its marks on a patient never show on core's lists or on another pack's screen.
- A department orders from any department that works for it, whatever packs it uses (`require_order`, K4).
- **after** lists the kit rows the phase needs and the row built just before it. It is build order only: no pack reads, imports or calls another (`spec/06-pack-contract.md:257`, `:321`).

Kinds: T = entry types · **Setup** = starter setup (work · packs · screens · beds or places · rules) · **Screen** = the pack's own screen, a tab unless it says "in place of the default" · S = steps · L = pack list · own = the pack's own tables · R = roles (only jobs narrower than any built-in role) · A = extra actions (`write:<key>_<thing>` for its own data, `manage:` for settings, `read:` for an organization page). Each type also brings `write:<type>`, offered to the core roles that use it. The **is_note** column names the row's note types; every other type of the row states `is_note = false`.

| order | status | key | phase | name | purpose | kinds | is_note | contract path | size | after |
|---|---|---|---|---|---|---|---|---|---|---|
| 1a | todo | `documents` | a | Certificates and letters | Sick-leave, fitness and attendance certificates and referral letters, typed in one line and printed | T documents_certificate, documents_referral | both | **own type, thin door via require_write, command + card, Full + Print, off still renders, tenant matrix** | S | K1–K9, K20–K24, K26–K28 |
| 1b | todo | `documents` | b | Consent | Consent forms printed, signed on paper, scanned back | T documents_consent | documents_consent | **files on a pack entry, a second phase added to a pack** | S | K4 · 1a |
| 2a | todo | `paediatrics` | a | Growth | Children's weight, height and head size against WHO standards | T paediatrics_growth · codes | none | **pack codes, record view** | S | K10 · 1b |
| 2b | todo | `paediatrics` | b | Vaccines | Doses given and due on the national schedule, recorded at any age; the vaccination card | T paediatrics_vaccine · L doses | none | **updater list, side section, begin_read masking, list rebuild and erase**, print | M | K11 · 2a |
| 3 | todo | `chronic` | — | Chronic care | Diabetes and hypertension reviews, the right key results, drug warnings, and the clinic's chronic care screen (the internal-medicine pack of `spec/00-core-audit.md:128`) | T chronic_review · Screen chronic care | none | **key tests, composer check (warning), a pack screen over core's read by problem (K29)**, side section over core values | M (was S) | K10 K29 K12 K25 · 2b |
| 4a | todo | `laboratory` | a | Laboratory | Numbered specimens, tube labels, sections, a starter test list | Setup "Laboratory" (bench · laboratory · works for Every · about 30 services) · S laboratory_collected, laboratory_received · own specimens | none | **pack steps and mark door, bench steps, own table, services column, starter setup added to an existing department twice (test 12)** | M | K12 K25 · 3 |
| 4b | todo | `laboratory` | b | Blood bank | Crossmatch, units issued, bedside transfusion record | Setup "Blood bank" (bench · laboratory) · T laboratory_blood_request, laboratory_blood_issue, laboratory_blood_given · S laboratory_grouped, laboratory_matched | none | **pack request type answered by the pack's own reply (begin_reply), ordered from any department (require_order), the bedside part recorded by the ordering department (a type that follows the order, require_order), holds_visit, several non-final replies to one request**, steps chosen per request type | M | K14 · 4a |
| 5 | todo | `infection` | — | Infection control | Isolation on the patient's banner; notifiable diseases collected for the weekly report | T infection_isolation · L isolations · own cases · A read:infection_cases, write:infection_case | none | **after_write (idempotent, voids), call_types, organization page**, a banner item | M | K13 · 4b |
| 6a | todo | `billing` | a | Billing | Prices, charges, the cashier, pay first | Setup "Cashier" (desk · billing · checks in for nobody · screens: cashier in place of the default) · Screen cashier · own prices, charges, payments · A manage:billing_prices, write:billing_payment · R billing_cashier | none | **pack user holds a request through a checked change_request and releases it through core.release_hold, a pack screen in place of a desk's default screen, pack settings, cancellations reach after_write** | L | K12 K13 · 5 |
| 6b | todo | `billing` | b | Insurance | Patient cover, approvals before covered services, the co-pay at the cashier, claim sheets | own insurers, covers, approvals · A manage:billing_insurers, write:billing_approval (organization) · R billing_insurance_clerk | none | **one hold with two reasons, one after_write serving two phases**, organization pages | M | 6a |
| 7 | todo | `bookings` | — | Appointments | A diary per clinic; Here turns a booking into a visit | own sessions, bookings · Screens diary (a clinic), booked today (a desk) · A manage:bookings_sessions, write:bookings_booking | none | **own data with no entries, pack screens at a desk and at a clinic, department settings (require_used), a desk door for its clinics (checks_in_for), a door linked to a core visit** | M | K12 · 6b |
| 8 | todo | `imaging` | — | Imaging | X-ray and ultrasound requests and reports with images | Setup "Imaging" (bench · imaging · services) · T imaging_request, imaging_report · S imaging_scanned | none | **a final pack reply on the requester's review list, with a critical flag**, pack request type ordered from anywhere, bench, files, starter setup | M | K14 · 7 |
| 9 | todo | `emergency` | — | Emergency | Triage with vitals, the track board, unknown patients; admission through core | Setup "Emergency department" (visits · emergency · screens: track board in place of the default · After Done next · places: cubicles) · Screen track board · T emergency_triage · L triages | none | **a pack screen in place of the default screen (the Screens line), one command writing core and pack types and needing two actions, a draft's after, admission through core's bed request**, banner | M | K12 K15 K18 K19 · 8 |
| 10a | todo | `inpatient` | a | Medicine rounds | Nurses give and record each dose; due and late at a glance, on any stay | T inpatient_dose (answers prescription) · own round_times · Screen drug round | none | **second service answering prescriptions, replies since, use defaults for stays**, a pack screen on a ward | M | K17 · 9 |
| 10b | todo | `inpatient` | b | Early warning and fluid balance | Vital signs scored (NEWS2), next set due, urgent call to the doctor; intake, output, running balance, urine per kg | T inpatient_news, inpatient_news_plan, inpatient_fluid, inpatient_fluid_plan · L news_plans, fluid_plans · codes · shared core codes | none | **a pack entry that escalates as a request, values over a time window** | L | 10a |
| 10c | todo | `inpatient` | c | Nursing | Risk scores, lines and drains, care tasks due by bed | T inpatient_risk, inpatient_device, inpatient_care_done · L devices · R inpatient_assistant · Screen care tasks | none | **care tasks as core requests answered by a pack reply, a pack screen over core's bed board read** | M | 10b |
| 10d | todo | `inpatient` | d | Handover | One SBAR per patient per shift, typed down the stay and printed | T inpatient_handover · Screen handover | inpatient_handover | **a note written row by row on a pack screen, one list read for a whole screen** | S | K16 · 10c |
| 10e | todo | `inpatient` | e | Discharge letter and nutrition | A letter built from the stay, medicines reconciled in the same Done; nil by mouth, diets, dietitian assessment, kitchen list | T inpatient_letter, inpatient_diet, inpatient_nutrition · L diets · A read:inpatient_kitchen · R inpatient_dietitian | inpatient_letter | **letter prefilled from core reads, reconciliation in one set, composer for a role holding only pack actions** | L | 10d |
| 11a | todo | `obgyn` | a | Antenatal | Pregnancies, dating, antenatal checks, pregnancy warnings | T obgyn_booking, obgyn_check, obgyn_outcome · L pregnancies · codes | none | **a list entry that ends**, banner, check, record view | M | 10e |
| 11b | todo | `obgyn` | b | Labour ward | Labour stay, partogram, birth, newborn linked to the mother; the pregnancy read from phase a | Setup "Labour ward" (stays · obgyn · 8 beds · opens on the labour board) · Screen labour board · T obgyn_labour, obgyn_birth · own births | none | **a stays setup, a pack screen over core's bed board read, babies on cots admitted by the birth card, mother–baby link**, a phase ending an earlier phase's list row | L | K15 K18 K19 · 11a |
| 11c | todo | `obgyn` | c | Gynaecology | Menstrual and obstetric history, contraception, cervical screening due and done; gynae problems through core `/dx` | T obgyn_history, obgyn_contraception, obgyn_screening · L methods, screenings | obgyn_history | side section over two lists and core problems, due worked out at read time | S | 11b |
| 12a | todo | `surgery` | a | Theatre | Operation list, WHO safety checklist, operation note | Setup "Theatre" (bench · surgery · screens: theatre list in place of the default) · Screen theatre list · T surgery_booking, surgery_safety, surgery_note · S surgery_arrived, surgery_recovery | none | **a request that does not hold its visit, ordered from anywhere, steps on a pack screen in place of a bench's default screen** | L | K14 · 11c |
| 12b | todo | `surgery` | b | Anaesthesia | Pre-operative assessment and the anaesthetic record | T surgery_anaesthesia_review, surgery_anaesthesia_reading, surgery_anaesthesia_record · codes | none | **readings typed row by row into a grid view**, whose writing row follows the tool rule | M | 12a |
| 13 | todo | `critical` | — | Intensive care | ICU stay with an hourly chart and ventilator days | Setup "ICU" (stays · critical · beds · opens on the ICU chart) · Screen ICU chart · T critical_hourly, critical_ventilation · L ventilation · codes | none | a second stays setup, a pack screen over the bed board read, hourly grid, a shared core code counted by another pack | M | K15 K16 K19 · 12b |
| 14 | todo | `cardiology` | — | ECG | ECG intervals and QTc that trend, tracing attached | T cardiology_ecg (answers request) · codes | none | reply to a core service, codes, files, check | S | 13 |
| 15 | todo | `psychiatry` | — | Psychiatry | Mental state and risk, in a private department | Setup "Psychiatry clinic" (visits · psychiatry · private department) · T psychiatry_assessment, psychiatry_risk, psychiatry_risk_note · L risks | psychiatry_assessment, psychiatry_risk_note | **one command writes a visible entry and a note in one Done** | S | 14 |
| 16 | todo | `dialysis` | — | Dialysis | Standing plan, sessions by chair, the unit's day | Setup "Dialysis unit" (visits · dialysis · screens: chair view in place of the default · places: chairs) · Screen chair view · T dialysis_plan, dialysis_session · L plans · codes | none | a session prefilled from a pack list, a pack screen in place of the default over core places | M | K18 · 15 |
| 17 | todo | `dental` | — | Dental | Findings and treatments per tooth, typed by FDI number | Setup "Dental clinic" (visits · dental · services) · T dental_finding, dental_treatment · L teeth · Screen tooth chart | none | per-tooth list, tooth chart as a pack screen and a record view | M | 16 |

The 17 packs:
1. `documents`: certificates, referral letters and consent forms, the papers a clinic prints and gets signed.
2. `paediatrics`: growth against WHO standards, and vaccines given and due.
3. `chronic`: diabetes and hypertension reviews for the internal-medicine clinic.
4. `laboratory`: specimens, labels, sections, and the blood bank.
5. `infection`: isolation on the banner and notifiable diseases.
6. `billing`: prices, the cashier, pay first, and insurance approvals and claims.
7. `bookings`: the appointment diary.
8. `imaging`: X-ray and ultrasound requests and reports.
9. `emergency`: triage, the track board and unknown patients, with admission through core.
10. `inpatient`: the clinical tools of any stay: medicine rounds, NEWS2, fluids, nursing, handover, discharge letter and nutrition.
11. `obgyn`: antenatal care, the labour ward and gynaecology.
12. `surgery`: the theatre list, the WHO checklist, the operation note and anaesthesia.
13. `critical`: the ICU's hourly chart and ventilation.
14. `cardiology`: ECG readings that trend.
15. `psychiatry`: mental state and risk, in a private department.
16. `dialysis`: standing plans and sessions by chair.
17. `dental`: findings and treatments per tooth.

## v1 scope per phase

### 1a · documents a · Certificates and letters
- `/sick 3 acute tonsillitis` writes `documents_certificate` {kind sick_leave, starts_on today, days, ends_on, reason_text, shows_reason}.
  - `/sick 5 from 28/9 …` sets another start date.
  - `/fit school` and `/attended` give fitness and attendance certificates.
  - The card sits under the line, and Tab walks days, dates and wording.
- `/refer cardiology: chest pain on exertion` writes `documents_referral`. Problems, medicines and allergies are copied from `read_record` and can be edited.
- Both types are notes (`is_note`). Written in a private department, or marked `!`, a letter is hidden from people who do not work in the department it was written in. Their write actions go to the core Doctor role, through the pack's own registry rows.
- The commands and cards show in every department that uses documents: turning the pack on pre-ticks it for visits and stays departments (`usedBy`, K5). The letters render wherever the record is read.
- Print from the entry (K6): A5 with the organization name, the patient's name and record number, the dates, and the doctor's name, with room for a stamp. Nothing is stored.
- Correct opens the same card filled in and writes a replacement. With the pack off, old letters render and still accept a correction.
- This is the kit's pilot: a schema with private writers and no tables. Every generic test runs on it first.

### 1b · documents b · Consent
- `/consent excision of sebaceous cyst · bleeding, infection, scar` opens a card with:
  - the procedure and the kind of consent (procedure, anaesthesia, blood, photography);
  - risks and alternatives;
  - the signer (patient, or guardian and relation), the witness and an interpreter.
- Print the filled-in form (K6), with phase a's page header. The patient signs on paper. The scan drops onto the card's file field, and Done writes `documents_consent` with the file (K4).
- A refusal is the same entry with `not_done` and a reason. The type is a note (`is_note`), so a private consent hides the procedure from people who do not work in the department it was written in. The scan's signed URL is minted only after the note is found readable (K4).
- The card line reads "Consent signed · 1 file". The standard wording for each kind is client data.
- This is the first later phase. It adds to the `documents` schema, registry rows and `src/packs/documents/`, and does not call `create_pack_role` again.

### 2a · paediatrics a · Growth
- `/hc 44.5` and `/length 68` (lying length, under 2 years) write `paediatrics_growth` with coded values. Weight and height stay core `/v`.
- The migration ships the head-circumference and lying-length codes as pack codes (K3), so they trend like vitals.
- A Growth view (`?view=growth`, for patients under 19) draws weight, height or length, head size and BMI for age, with WHO z-score lines. The WHO LMS tables ship as client data in `src/packs/paediatrics/`.
- The view's header shows the newest z-scores: beyond ±2 amber, beyond ±3 red.

### 2b · paediatrics b · Vaccines
- Commands:
  - `/vaccine mmr 1` records a dose given today, with lot, site and route on the card.
  - `/vaccine card penta 2 12/3/2025` copies a dose from the paper card, with source outside and its stated date.
  - `/vaccine refused mmr 1 · parents` records a dose not given, with the reason.
- Any age may be recorded. An adult's `/vaccine td 3`, or a hepatitis B dose copied from a travel card, is written the same way.
- Writes `paediatrics_vaccine`. The pure updater `paediatrics.update_doses` keeps `paediatrics.doses` (patient_id, entry_id, visit_id, vaccine, dose number, given_on, not_done).
- A Vaccines side section shows overdue and due first, then what was given. Due dates are worked out at read time from the birth date and the schedule, never in the updater. Egypt's compulsory schedule is client data, and a clinician checks it before go-live.
  - The schedule is a child's, so for an adult the section lists only what was given, and it shows only when there is a dose.
- `paediatrics_read_doses` goes through `begin_read`. A banner item says "Vaccines overdue".
- Print the vaccination card. A clinic-wide due list is Later: core's read by problem (K29) finds patients by problem, not by age.
- **Later:** adult schedules (boosters, pregnancy, risk groups) and their due dates.

### 3 · chronic · Chronic care
- When the problem list holds diabetes (ICD-10 E10–E14) or hypertension (I10–I15), Key results show, in this order: HbA1c, fasting glucose, creatinine, urine albumin/creatinine ratio, LDL, blood pressure.
- A Chronic care side section, read from core `read_values` with nothing copied: the last HbA1c with its trend and age, the last blood pressure, and when the yearly review is due or overdue.
- `/review dm feet ok · eyes 3/2025 no retinopathy · hypos 0` writes `chronic_review` (condition, foot check, eye check date, targets, education, smoking, next_review_on).
- Checks (warnings only): metformin on `/rx` when the latest eGFR is under 30; an ACE inhibitor together with an ARB.
- **The Chronic care screen**, chronic's own screen in a visits department that uses it (a tab beside the Queue, `/d/:department/chronic/review`). One call of core's read by problem (K29) fills it: this clinic's patients with diabetes or hypertension, with their HbA1c and blood pressure values and their latest `chronic_review`. It shows two lists:
  - **Today:** those whose last visit here is today;
  - **Due:** those whose review is due or overdue, most overdue first.
  - Each row shows the last HbA1c and blood pressure with their trend, and when the review is due. Typing filters by name or record number.
  - One-key review: `r` opens the review card inline under the row, and ⌘↵ writes `chronic_review` through chronic's own writer. ↵ opens the patient.
  - It acts only through chronic's writer and core's reads, and the Queue stays the default screen. It shows to people who hold `read:cohort`, `read:record` and `read:queue` in the clinic (K12, K29): a Doctor there, not a clerk.
- Left out:
  - the problem-column layout, because there is no visit-layout slot;
  - letters or messages that call patients back, which wait for core's outbound door (`spec/00-core-audit.md:110`).

### 4a · laboratory a · Laboratory
- Bench steps Collect and Receive (`registerBench`, K5), with actions `mark:laboratory_collected` and `mark:laboratory_received` given to the built-in Technician and Nurse roles. The pack ships no role of its own. `laboratory_mark_collected(request_ids[])`:
  - gives the tube one number, the day's next (e.g. 250925-014), kept in `laboratory.specimens`;
  - adds a `laboratory_collected` step with `changes {specimen_number}` to each request;
  - prints tube labels (barcode, name, record number, tests, tube).
- Scanning a tube number on the bench calls `laboratory_mark_received`. Results stay core `write_result`.
- A Tube and Section column on Services (`registerServicesColumn({ for: 'departments using' })`), saved by `laboratory_save_tube`. The bench filters by section.
- Starter setup "Laboratory" (bench · laboratory · works for Every): about 30 common tests with fields, units and ranges (CBC, FBS, HbA1c, lipids, liver, kidney, urine). Added to the same department twice, it changes nothing and keeps the administrator's edits (test 12).
- The demo's Laboratory (`supabase/seeds/dev.sql:9`) starts using laboratory through "Add to this department": the pack is ticked, and only the missing services are added ("kept yours: cbc").

### 4b · laboratory b · Blood bank
- Starter setup "Blood bank" (bench · laboratory): a bench that uses laboratory and works its own requests. Phase a's Collect and Receive steps run there too, so the crossmatch sample gets a specimen number and a tube label from `laboratory.specimens` like any other tube.
- `/blood 2 red cells · hb 6.1 · urgent` writes `laboratory_blood_request` to the blood bank's service. The type is `is_request`, so any clinic or ward the service works for orders it without using laboratory (`core.require_order`, K4). Group and screen are core results on their own service.
- Steps are chosen per request type (`registerBench({ for: { requestTypes } })`): the bench shows the `laboratory_grouped` and `laboratory_matched` steps only on blood requests.
- Issue is the reply form: scan each unit (unit number, group, expiry, compatibility). Each unit gets one non-final `laboratory_blood_issue`; the last one is final.
- `/transfuse 2501234 start` and `… end · no reaction` write `laboratory_blood_given` with vital signs before, at 15 minutes and at the end. It is the bedside part of the order: `laboratory_blood_given` states `follows = 'laboratory_blood_request'` (K3), so the ward that ordered the blood records it through `core.require_order`, gated at that ward and checked against that order, without using laboratory (K4). A unit not issued to this patient warns, and the banner shows "Transfusing 2501234".

### 5 · infection · Infection control
- `/isolate contact MRSA` and `/isolate stop` write `infection_isolation`, and the pure updater keeps `infection.isolations`. A banner item "Isolation: contact" shows in the patient's banner wherever the record is read. It shows on no core list: not the queue, the bed board or the front desk.
- `infection.after_write` hears only core `problem` entries (`call_types`, K13):
  - a problem whose code is on the pack's notifiable list (ICD-10, grouped by how fast it must be reported) gets a row in `infection.cases`, keyed by entry id;
  - a replaced problem voids its row and creates one for the new entry;
  - a struck problem voids its row;
  - a second call changes nothing.
- A Notifiable diseases organization page (`/p/infection/cases`), gated by `read:infection_cases` (organization scope), lists this week's cases, most urgent first, with names from `read_patient_names`. It has Mark reported (`infection_mark_reported`, gated by `write:infection_case`, whose registry row states organization scope) and Print for the weekly sheet.
- Nothing changes in the visit: the doctor keeps typing `/dx`.

### 6a · billing a · Billing
- A Price column on Services (EGP), saved by `billing_save_price` under `manage:billing_prices`. The pack's settings card holds each department's visit fee and whether it takes payment first: organization settings, keyed by department.
- `after_write` keeps `billing.charges`, keyed by entry id. Billing's `call_types` is NULL, so every entry reaches it, and the charge rule keys on the entry's shape, never on its type. It never names another pack's type:
  - any live entry with a `service_id` that opened a request to a priced service is charged its price, whichever pack's type it is;
  - a replaced request is priced again;
  - a struck request, or one that was cancelled (K13), voids its charge.
- The visit fee is a charge line the cashier adds with one key (`f`), by department.
- Pay first:
  - the pack's user moves the request from sent to held (checked by K2), and `billing_mark_paid` releases it through `core.release_hold`, which releases only a hold billing's own user placed and records the cashier as the actor (K2);
  - a request already started stays started;
  - anyone holding `mark:sent` can release it, so care is never blocked.
- The cashier is a desk that uses billing, not a sixth kind of work. Starter setup "Cashier" (desk · billing · checks in for nobody · screens: cashier in place of the default). Billing's Cashier screen replaces the Front desk there (K12); it and its read of the open charges are gated by `write:billing_payment` at the cashier desk. Billing's own role, `billing_cashier`, holds it with the desk's actions:
  - type or scan a name or record number to see the open charges;
  - ↵ takes the whole amount, with a cash or card chip; `d` gives a discount with a reason;
  - the receipt prints;
  - today's totals by cashier and payment kind show at the top.
- No money reaches the record. The record shows only the held step.
- Phase b adds a second reason to the same hold (6b).

### 6b · billing b · Insurance
- Pack settings hold the insurers (`manage:billing_insurers`): which services need approval, and the co-pay. A patient's cover (insurer, member number, valid until) is typed on billing's Cashier screen and kept in `billing.covers`.
- Phase a's one `after_write` also reacts for insurance. A covered patient's request for a service that needs approval gets a row in `billing.approvals`, and the pack's user holds the request until it is approved. A decline keeps it held and shows the reason.
- A request carries one hold, the `held` step (`20260922000006_core_funnels.sql:162-188`). Payment and approval are now two reasons for that one hold, inside one pack:
  - the pack's user holds the request on the first reason;
  - it releases the request only when no reason is left, after whichever of `billing_mark_paid` and `billing_mark_approved` comes last;
  - anyone holding `mark:sent` can still release it, so care is never blocked.
- For a covered patient, the cashier (6a) shows only the co-pay. The rest of the charge goes on the insurer's claim sheet.
- An Approvals organization page (`/p/billing/approvals`), oldest first, has Approve and Decline, gated by `write:billing_approval` (organization scope). The monthly claim sheet per insurer is an organization page too, and prints. Claims carry no note text.
- `billing_insurance_clerk` holds the approval and insurer actions: a job narrower than any built-in role.

### 7 · bookings · Appointments
- Sessions per clinic (days, hours, slot length, doctor) are department settings (`registerDepartmentSettings`, under the clinic's bookings chip), kept in `bookings.sessions` and saved under `manage:bookings_sessions` through a door that calls `core.require_used` (K4).
- A Diary screen per clinic (bookings' own screen, a tab beside the Queue, `/d/:department/bookings/diary`) shows the week as columns of slots. The diary is that clinic department's list, so it is read under core `read:queue` there; booking, moving and cancelling need `write:bookings_booking`, which the built-in Receptionist role gets (the pack ships no role):
  - type a name or record number and press ↵ to book the highlighted free slot, or register a new patient inline;
  - arrows move a booking;
  - Delete cancels it with a reason.
- A "Booked today" screen (bookings' own screen, a tab beside the Front desk), filtered as you type, on a desk that uses bookings. A desk's act for a clinic is gated at the desk, `why_not(person, 'write:bookings_booking', desk)`, so the desk must use bookings; it also needs `core.checks_in_for(desk, clinic)` and `core.require_used(clinic, 'bookings')`, so the desk books and checks in only for its own clinics. The clinic's own staff book at the clinic as usual. ↵ means Here: the client calls core `open_visit` as the desk user, then `bookings_mark_arrived(booking_id, visit_id)`. Packs never see visits themselves (`spec/03-patients-visits.md:205-207`).
- The Diary and Booked today show "booked 10:30 · late" on the booking; core's queue shows nothing of bookings. A no-show is a past booking with no `visit_id`; nothing is stored for it.
- No reminders until core has an outbound door (`spec/00-core-audit.md:110`).

### 8 · imaging · Imaging
- `/xray chest pa ? pneumonia` and `/us abdomen ? gallstones` write `imaging_request` with a destination (the exam's service). The type is `is_request`, so any department an imaging service works for orders from anywhere without using imaging (`core.require_order`, K4). The card asks which side for limbs, and warns when pregnancy is unanswered for women aged 12–50.
- On the imaging bench: the `imaging_scanned` step (`mark:imaging_scanned`, given to the built-in Technician role). The reply form is the report: findings, impression, attached images, preliminary or final, and a critical flag that sets `needs_review`.
- `imaging_write_report` answers through `begin_reply` under `write:imaging_report`, given to the built-in Doctor role, so only the imaging department (which uses imaging) can report. A report on a request sent outside is typed in by the sender, with source `outside`. A final report closes the request and lands on the requester's review list. Corrections use the pack's form (K6).
- The pack ships no role of its own.
- Starter setup "Imaging" (bench · imaging · services): an X-ray and ultrasound catalogue. Bench words are "To image" and "Reported today". The report prints.
- The request holds the sending visit, and it is refused `pack_off` while the pack is off.

### 9 · emergency · Emergency
- `/triage 2 chest pain · ambulance` writes `emergency_triage` together with core vitals in one Done. The command lists both actions it needs, `write:emergency_triage` and `write:vitals`, and shows only to someone who holds both there. Levels 1–2 make the visit urgent through the draft's `after` (`mark_visit_priority`, K6).
- The pack ships no role of its own: the built-in Nurse and Doctor roles get its actions.
- `emergency.update_triages` keeps the latest triage for each visit.
- Starter setup "Emergency department" (visits · emergency · screens: track board in place of the default · After Done: next · places: cubicles). The Track board is emergency's own screen, in place of the Queue there (K12). It acts through core's actions (call, see, Done) and emergency's own, with a fast button for each; the Queue can be ticked back on at any time, and the patient's visit screen keeps every basic action:
  - rows sorted by level, then by minutes waited against each level's target (a pack setting);
  - complaint, place (the cubicle, a core place, K18) and doctor on each row;
  - typing filters, and ↵ opens a row.
- An unknown patient ("Unknown male ~30") is registered inline from the board through core `register_patient`, with an estimated birth year.
- A banner item "Triage 2 · 14 min" shows in the patient's banner, and the level shows on the track board. Core's lists, the bed board included, show nothing of it.
- Admission is core's `/admit` (K18). The bed request lands on the stays department's bed board (K19), and the ER visit stays pending until a bed is given; the sweep never moves it while the bed request is open.
  - The track board shows "Bed requested · Ward A" on that row, from the queue row's own requests.
  - When the ward admits, the request closes and the row returns to Back, where the ER doctor ends the visit.

### 10a · inpatient a · Medicine rounds
- Each stays department that uses inpatient gets one "Medicine doses" service, answered by `inpatient_dose` and serving only that department. It comes from inpatient's use defaults for stays (`registerUseDefaults`, K12): when a stays department starts using inpatient, the service is added with Add semantics, so a labour ward or an ICU made later gets its own. A prescription written on a stay is sent there (K17); one written in a clinic still goes to the pharmacy.
- A Drug round screen (inpatient's own screen, a tab beside the bed board, `/d/:department/inpatient/rounds`), in each stays department that uses inpatient, lists patients by bed with each dose due or late. It is built from:
  - core's `read_bed_board` (beds and patients, K19);
  - `read_queue` details (drug, dose, route, frequency; `20260924000016_core_calling.sql:84-87`);
  - today's replies (K17);
  - round times per frequency (`inpatient.round_times`, a pack setting).

  Scanning a wristband record number jumps to that patient.
- Give is one key. Not given takes a reason chip: refused, asleep, nil by mouth, unavailable, away, vomited.
  - Each dose is a non-final reply, so the request stays open at replied and shows the last dose (`20260923000021_core_amendments_0923.sql:100-105`).
  - Once-only and stat doses are final.
- PRN rows show the last dose and the 24-hour count. A dose too soon or over the daily maximum is a warning, never a block (`spec/06-pack-contract.md:483-484`). Controlled drugs ask for a witness name.
- A "Due now" side section and a banner item on the stay (K10); the drug round shows "2 due · 1 late" per bed. Core's bed board shows nothing of it. `/give paracetamol 1g` matches an open PRN request.
- Everything here keys on `work = 'stays'` and on the department using inpatient, never on a type, so it works in the labour ward and the ICU too.

### 10b · inpatient b · Early warning and fluid balance
Early warning:
- `/news 22 91 o2 2l 118/70 104 alert 38.4` writes core vitals and `inpatient_news` in one Done, so the command lists both actions, `write:vitals` and `write:inpatient_news`. The card shows each parameter's score and the total as you type.
- The writer scores NEWS2 and stores what core vitals lack: consciousness (ACVPU), oxygen and device, SpO2 scale, each part's score, and the total as pack code `inpatient:news_total`, so it trends.
- A total of 5 or more, or any single 3, gives the entry a destination: the patient's stays department, where it shows in the bed board's Calls band (K19), or a response team, which is a visits department named in pack settings. Priority is urgent, or stat at 7 or more. The doctor answers with a core consult reply, which is already gated at the destination (`20260923000021_core_amendments_0923.sql:292`).
- `/newsplan scale 2 · every 4h · ceiling ward` writes `inpatient_news_plan`, kept by `inpatient.update_news_plans`. The score writer reads its own plans to choose the SpO2 scale.
- The next set is due by score (0: 12 h; 1–4: 4–6 h; 5–6 or a single 3: 1 h; 7+: continuous) or by plan. A banner item shows "NEWS 7 · due 14:30", inpatient's own screens (the drug round, care tasks) show it per bed, and a side section shows the trend.

Fluid balance:
- `/in 250 oral`, `/in 1000 iv`, `/out 400 urine` and `/out 150 drain` write `inpatient_fluid` with the shared core codes (K3).
- `/fluids restrict 1500 · urine 0.5` writes `inpatient_fluid_plan`, kept in `inpatient.fluid_plans`.
- A side section shows an hourly grid for the clinic's day: in, out, running balance, and urine in ml/kg/h from the latest core weight. Going over the limit or under the urine target shows amber.
- There is no balance table: totals are `read_values` over `since`/`until` (K17). A banner item reads "+1.2 L · urine low".

### 10c · inpatient c · Nursing
- `/risk falls` walks the tool's items inline, typed as numbers, and writes `inpatient_risk`. The total is a pack code, flagged at the tool's threshold (falls, pressure, nutrition screen, pain).
- `/line cannula 20g left forearm`, `/line check` and `/line out` write `inpatient_device`. `inpatient.update_devices` gives "Cannula day 4" in a side section and a banner item.
- Care tasks (turns, mouth care, dressings, daily weight) are core requests to the stays department's own care services. The care services come from inpatient's use defaults for stays, as the dose service does (10a). They are answered by `inpatient_care_done` as a non-final reply, or not done with a reason. An "Every (hours)" services column sets when each is due.
- A Care tasks screen (inpatient's own screen, a tab beside the bed board, `/d/:department/inpatient/care`): due tasks by bed. Done is one key; Not done takes a reason.
- Roles:
  - the built-in Nurse role gets every inpatient action from phases a–c, through the pack's registry rows. The pack ships no nurse role;
  - `inpatient_assistant` holds care done and risk scores only, a job narrower than any built-in role.

### 10d · inpatient d · Handover
- A Handover screen (inpatient's own screen, a tab beside the bed board, `/d/:department/inpatient/handover`) has one row per patient in bed order, from core's `read_bed_board` (K19). Every row's last SBAR is read in one call through `begin_read`'s list form (K4).
  - Type over the row; Tab moves to the next patient.
  - Each row saves as its own write.
- Writes `inpatient_handover` (situation, background, assessment, recommendation), which is a note (`is_note`). Written in a private department, or marked `!`, it is hidden from people who do not work in the department it was written in. It keeps that department for ever, so a transfer (K16) changes nothing.
- `/sbar` in the visit writes the same type. The sheet prints for the next shift.
- `write:inpatient_handover` joins the built-in Nurse and Doctor roles.
- **Later:** each handover row could show the latest NEWS, balance and lines from phases b and c. They share the data, but this is left out to keep the phase to one iteration.

### 10e · inpatient e · Discharge letter and nutrition
Discharge letter:
- A "Discharge letter" visit action and `/letter` open one card. Tab moves between its sections:
  - times and the stay's departments (from `read_visits`' `moves[]`, K16);
  - diagnoses, principal first;
  - course;
  - key results;
  - pending results;
  - follow-up;
  - GP text;
  - words for the patient.
- The card is filled in from `read_record`, `read_visits`, `read_entries(visit_ids = [stay])` and `read_results_table`.
- Every inpatient medicine must be set to continue, stop or change, and none is pre-selected. These are written as core prescriptions in the same Done, so the medication list and the stay's dose requests close together (K17).
- Writes `inpatient_letter`, a self-contained copy that is a note (`is_note`). A trainee's letter is preliminary; the consultant's final letter replaces it.
- The letter is a draft like any other, so core's Discharge (K15) signs it with the `dc:` note in one step. The stay then shows "Going home" until Left ends it.
- It prints with the organization and site header (K6). Sending it electronically waits for core's outbound door (`spec/00-core-audit.md:110`).

Nutrition:
- `/diet npo from 22:00`, `/diet diabetic 1800 kcal` and `/diet soft` write `inpatient_diet`. `inpatient.update_diets` keeps the current diet.
- `/assess nutrition must 2 · lost 6 kg` writes `inpatient_nutrition`. Its MUST total uses the same pack code as phase c's nutrition screen, so both trend as one line.
- Banner items "Nil by mouth since 22:00 (9 h)" and "Diet: renal".
- The role `inpatient_dietitian` holds only this phase's nutrition actions plus `read:record`, a job narrower than any built-in role, and still gets the composer (K24).
- A kitchen list organization page (`/p/inpatient/kitchen`), gated by `read:inpatient_kitchen` (organization scope), per stays department and meal. It shows only bed, name, diet and allergies, and prints.

### 11a · obgyn a · Antenatal
- `/pregnant lmp 12/3 g3p2` writes `obgyn_booking` with gravida, para and risks. `obgyn.update_pregnancies` keeps the pregnancy until `/pregnancy end live birth` (`obgyn_outcome`) ends it.
- `/anc fh 28 fhr 140 ceph` writes `obgyn_check`. Fundal height and fetal heart rate are pack codes and trend, and the card shows the gestation.
- A side section shows gestation today, due date, G/P, risks, and the next contact on the WHO 8-contact schedule. A banner item reads "Pregnant 28+3".
- A record view plots fundal height against gestation.
- Check: while a pregnancy is open, a `/rx` line for a drug on the pack's avoid-in-pregnancy list warns.
- `/pregnant` and `/anc` show only where the department uses obgyn (an antenatal clinic). The side section, the banner item, the record view and the `/rx` warning are displays: they show wherever the record is read while obgyn is on, a dental clinic included.

### 11b · obgyn b · Labour ward
- Starter setup "Labour ward" (stays · obgyn · 8 beds) makes a stays department that uses obgyn. Core's bed board (K19) is its default screen, and core's admission (K18) fills it: `/admit labour ward · 6 cm, contracting` from the antenatal clinic or the ER, or a direct admission on the board.
- The pack ships no midwife role. The built-in Nurse role gets the labour and birth actions; a clinic copies Nurse as its own Midwife role, held in the labour ward.
- The labour card opens with the open pregnancy from phase a (gestation, G/P and risks), read from `obgyn.pregnancies` through the pack's own read.
- `/labour 6 cm · 2/5 · 3 in 10 · fhr 140 · clear` writes one `obgyn_labour` reading. A Partogram record view draws the WHO alert and action lines.
- The birth card records mode, blood loss and perineum, and for each baby: sex, weight, and Apgar at 1 and 5 minutes. Each baby is registered inline through core `register_patient`, then `obgyn_birth` is written. A baby who stays lies on a cot, which is a bed of the labour ward, admitted by the birth card through core `admit_visit`, so core does not change.
  - `obgyn.update_pregnancies` treats the birth as the pregnancy's outcome, so `/pregnancy end` is not typed again.
- `obgyn.births` links mother and baby, since no core pointer crosses patients (`spec/00-core-audit.md:130`).
- The Labour board is obgyn's own screen, over core's `read_bed_board` and the pack's own read (`begin_read`'s list form, K4). The setup opens the labour ward on it, with the bed board as a tab. Each bed shows dilation, time since the last examination and fetal heart alerts. Admit, move, transfer and discharge stay on the bed board and the patient's visit screen.

### 11c · obgyn c · Gynaecology
- `/gyn menarche 13 · cycle 28/5 regular · lmp 2/9 · g3p2` writes `obgyn_history`: menarche, cycle length and days, regularity, last period, menopause, and gravida and para. When phase a holds pregnancies, the card lists them and prefills G/P from them. `obgyn_history` is a note (`is_note`); `obgyn_contraception` and `obgyn_screening` are not.
- `/contra copper iud 3/2024` writes `obgyn_contraception`: the method, when it started, and the next due date the method sets (injection 12 weeks, implant 3 years, IUD 5 or 10 years). `/contra stop` ends it. `obgyn.update_methods` keeps the current method.
- `/smear done 20/9 hpv negative` and `/smear refused` write `obgyn_screening`, kept by `obgyn.update_screenings`.
  - The next screening is due by result and age, from an interval table that is client data and that a clinician checks before go-live.
  - Like vaccines, it is worked out at read time, never in the updater.
- A Gynaecology side section for female patients shows the last period and cycle, the current method and when it is due, the last screening and when the next is due, and the open gynae problems.
  - Gynae problems stay core `/dx`. The section reads them from `read_record` (ICD-10 N70–N98, D25–D28) and copies nothing.
- A banner item "Screening overdue" appears when the next screening date has passed.
- **Later:** a clinic-wide screening recall list, a pack screen over core's read by problem (K29) and the pack's own screening list.

### 12a · surgery a · Theatre
- `/operation laparoscopic cholecystectomy · 12/10 · general · left` writes `surgery_booking`: a request to the Operation service with procedure, side, urgency and planned date. The type is `is_request`, so any clinic or ward the Operation service works for orders it without using surgery (`core.require_order`, K4). It does not hold the clinic visit (K14).
- Starter setup "Theatre" (bench · surgery · screens: theatre list in place of the default). The Theatre list is surgery's own screen, in place of the Bench there (K12); it acts through core's steps and releases and surgery's own, and the Bench can be ticked back on at any time. It is the day's list by room and running order:
  - rows move booked → surgery_arrived → started → surgery_recovery, one key per move;
  - typing filters;
  - the case's state shows as a banner item on the patient, "In theatre" or "Recovery" (K10), never on core's bed board. Surgery never touches the stay: `mark_present` needs `write:visit` in the stay's department, which theatre staff do not hold.
- `surgery_safety` records the WHO checklist as three non-final replies (sign in, time out, sign out), one key per item. An unticked item warns.
- The operation note, `surgery_note`, is the final reply. It keeps the procedure's details (procedure, side, implants, blood loss) and is not a note. Its narrative is a core `proc:` note written in the same Done, so a private note hides the story and not the operation. Specimens are core lab requests in the same Done. The day's list prints.
- The pack ships no role of its own: the built-in Nurse and Doctor roles get its actions, and a clinic copies them as its own Theatre nurse or Surgeon.

### 12b · surgery b · Anaesthesia
- An "Anaesthesia review" service is answered by `surgery_anaesthesia_review`: `/asa 2 · mallampati 2 · fasted 8h · plan spinal`.
- During the case, each line such as `10:05 118/70 82 99 etco2 36` writes one `surgery_anaesthesia_reading` with coded values. Drug lines such as `10:07 propofol 150 mg` work too.
- An Anaesthesia record view draws the readings and drug times as a grid. The view is a display and shows wherever the record is read; its writing row is a tool and shows only where the department uses surgery and the reader may write there. `surgery_anaesthesia_record` closes the case: technique, airway, fluids, blood loss, incidents, handover to recovery. It prints.
- The pack ships no anaesthetist role: the built-in Doctor role gets these actions.
- A banner item reads "ASA 3 · difficult airway". There is no machine data (`spec/00-core-audit.md:147`).
- Phase a's theatre list shows each case's ASA and whether the review is done. Both phases are one pack, so the list reads the review directly.

### 13 · critical · Intensive care
- Starter setup "ICU" (stays · critical · beds · opens on the ICU chart) makes a stays department that uses critical. Core's bed board (K19) is its default screen and stays a tab. The ICU chart is critical's own screen, over core's `read_bed_board` and the pack's own read: each bed with day of stay, day on the ventilator and its last hour's values; ↵ opens the patient's hourly grid. With critical switched off, the bed board shows by itself and it is still a working ward.
- An hourly grid (record view): a row such as `14 118/64 96 18 98 fio2 40 peep 8 · noradrenaline 0.1 · urine 60` writes one `critical_hourly` entry with coded values.
  - Urine uses the shared core fluid-output code (K3), so inpatient's fluid balance (10b) counts it without either pack reading the other.
- `/vent start simv …` and `/vent stop` write `critical_ventilation`, kept in `critical.ventilation`. "Ventilated day 3" shows on the banner and on the ICU chart.
- Transfers in and out use core's transfer (K16).
- A new ICU gets its Medicine doses and care services from inpatient's use defaults when inpatient is ticked there (10a, 10c). The inpatient phases (10a–10e) then work in the ICU as on any stay.

### 14 · cardiology · ECG
- `/ecg sr 78 pr 160 qrs 92 qt 380 · lvh` opens a card that works out QTc live, stating the formula (Bazett). A photo or PDF of the tracing attaches.
- Writes `cardiology_ecg` with coded values: core's heart-rate code plus the pack's PR, QRS, QT and QTc codes. QTc trends in Results over time, and a QTc over 500 is flagged.
- An "ECG" service can be answered by `cardiology_ecg` on a bench (`answers = 'request'`), as well as written inside a visit.
- Check: a `/rx` line for a drug on the pack's QT list warns when the latest QTc is long. `Full` shows the tracing beside the reading.

### 15 · psychiatry · Psychiatry
- Starter setup "Psychiatry clinic" (visits · psychiatry · private department). Every note written there is private (spec 07); the demo already has a department with the rule on (`supabase/seeds/dev.sql:14`). The setup suggests a neutral name, because the department's name shows wherever the record is read (spec 07).
- `/mse` opens a mental state examination card (appearance, mood, affect, thought, perception, cognition, insight) and writes `psychiatry_assessment`, which is a note (`is_note`).
- `/mhrisk suicide high · plan · protective family` writes two entries in one Done, linked by `written_with_id`:
  - `psychiatry_risk`, not a note: the level, the kind and the date, kept in `psychiatry.risks`. The level shows on the banner everywhere;
  - `psychiatry_risk_note`, a note: the plan, the protective factors and the text. Written in a private department it is private, like any note there, and hidden from people who do not work in that department.
- There is no special masking: `psychiatry_read_risks` reads the list through `begin_read` like any pack read.
- The command is `/mhrisk`, not `/risk`: inpatient's nursing risk (10c) takes `/risk` first, and a command name that is taken is refused.
- PHQ-9 and GAD-7 totals are pack codes, so they trend.

### 16 · dialysis · Dialysis
- `/hdplan dry 68 · mon wed sat · 4h · avf left` writes `dialysis_plan`, kept in `dialysis.plans` and shown as a side section.
- Starter setup "Dialysis unit" (visits · dialysis · screens: chair view in place of the default · places: chairs). The Chair view is dialysis's own screen, in place of the Queue there (K12); it acts through core's actions (call, see, Done) and dialysis's own. It shows today's shift by chair, with each patient's plan. Chairs are core places (K18), not a pack setting.
- ↵ opens the session card, filled in from the plan. The fluid-removal goal is weight before minus dry weight. `/hd pre 70.4 post 68.3 uf 2.2` writes `dialysis_session` with coded values.
- A record view shows recent sessions' weights and fluid removed.

### 17 · dental · Dental
- Starter setup "Dental clinic" (visits · dental · services). The pack's commands and cards show wherever a department uses dental.
- `/tooth 36 mo caries` writes `dental_finding`. `/treat 36 mo composite planned|done` writes `dental_treatment`.
- `dental.update_teeth` keeps each tooth's state. The Tooth chart is dental's own screen (a tab beside the Queue, `/d/:department/dental/teeth`) for the patient in consult, and the same drawing is a Teeth record view wherever the record is read (FDI adult or child set, by age). Typing a tooth number moves there, and nothing needs a click.
- Planned treatment shows as a side section.

## Open questions

1. **Money before beds?** Billing and appointments are rows 6a–7. The ward skeleton (K15, K18, K19) lands just before emergency at 9.
   *Default:* this order. If beds open within weeks, emergency (9) with K15, K18 and K19, then inpatient 10a–10e with K17 and K16, move up to follow the blood bank (4b); infection, billing, bookings and imaging follow them in their present order.
2. **Billing v1: what gets charged?**
   *Default:*
   - requests to priced services, with "pay first" holds per department;
   - visit fees as a one-key line at the cashier;
   - for a covered patient, the co-pay at the cashier and the rest on the claim sheet (6b);
   - no bed-days, stay doses or pharmacy items.

   Billing's `call_types` is NULL and it charges by the entry's shape (a live entry with a `service_id` that opened a request to a priced service), so a pack's request type (`laboratory_blood_request`, `imaging_request`, `surgery_booking`) is charged like a core request without billing naming it. Charging each dose or pharmacy item would mean pricing other packs' replies by type, which billing cannot do. Bed-days could come later from core's admission and discharge notes, which billing's `after_write` can hear.
3. **Medicines on a stay: which service gets a prescription written there?**
   *Default:* stay prescriptions go to the stays department's own Medicine doses service (K17, 10a), and the pharmacy supplies ward stock outside the record. Take-home medicines go to the pharmacy through the Discharge card's "Send to <pharmacy>" chip (K17). If the pharmacy must also dispense per patient during the stay, one prescription needs two requests. That is a core change, not planned.
4. **Should patient papers print in Arabic?** This covers certificates, consent, receipts and discharge letters.
   *Default:* left-to-right English pages, with names printed `dir="auto"` in an Arabic-capable font. Full right-to-left layouts would be added to K6 only if you ask.
5. **Are the keys and command names right?** Keys are permanent.
   *Default:*
   - the 17 keys as written, with the British spellings `paediatrics` and `anaesthesia` (now in `surgery_anaesthesia_…`);
   - every type, step, role and list of a phase starts with its pack's key, so its name says its pack (`obgyn_labour`, `laboratory_blood_issue`);
   - steps named `<key>_<step>`, so laboratory's are `laboratory_collected` and `laboratory_received`;
   - psychiatry's risk command is `/mhrisk`, because inpatient takes `/risk` first (10c);
   - no pack adds a department type; the starter setups are named in the pack table.
6. **Department names for sensitive specialties.** Since the core setup, a department's name (Psychiatry, Sexual health) shows wherever the record is read, the desk and the bench included; only private notes are hidden.
   *Default:* the name shows. Starter setups for sensitive specialties suggest neutral names, and paper that leaves the building carries only the organization and the site (K6). The Egyptian lawyer confirms this under PDPL 151/2020 and Penal Code Art. 310 (spec 07's known limits).
