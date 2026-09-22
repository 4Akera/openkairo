# openCare: the organization (final)

Companion to [02-organization.md](02-organization.md). Where the two differ, the spec wins.

## a. In one sentence

**An organization is people, departments and services described in rows; a person does what their roles allow, where they hold them; and a pack is a schema of its own that reads the record and is never run by it.**

What follows from it:
- Everything an administrator does is a row: a department, a service, a role, a person, a site label, a pack switched on. Nothing is a deploy, and every row change is one attributed `settings_changes` row.
- Rights are `user_roles` rows. A user holds a role in one department or everywhere (`department_id IS NULL`). There is no second statement of membership anywhere.
- The record (spec 01) never calls into a pack while a clinician's write is open. A pack hears about a write after it has committed, through `pack_calls` and a runner that acts as the pack's own machine user.
- The boundary between core and a pack is one Postgres enforces at run time and CI checks at merge time: a schema, a NOLOGIN role, a grant list, `security definer` everywhere. Ownership without `security definer` is not a boundary; a test that cannot see a hole is not a guard.

Why the after-write call left `write_entry`. The 22 September amendment to spec 01 put "call enabled packs' after-write functions (guarded)" inside the write. The first break-test round showed that no guard makes it safe: a pack that sleeps, waits on a lock, or takes the patient's advisory lock stalls the clinician's save; a guard that catches raises still cannot bound time; and the sentence "the record never reads a pack" was already false in control flow. Test B1 (hostile packs concurrent with golden writes under a one-second timeout) is unpassable with the call in the write and passes with the queue. So the rule became rule 5: the record never runs a pack, and the one piece of pack code left inside a write is the updater of that pack's own types, which only that pack's own writes reach.

## b. Listing

### Table kinds

| Kind | Tables | Rule |
|---|---|---|
| **People and rights** | `users`, `roles`, `role_actions`, `user_roles`, `actions` | `users` and `roles` carry `retired_at` and are never deleted. `role_actions` and `user_roles` rows are deleted; the deletion is a `settings_changes` row. `actions` is shipped by migration only. |
| **Places and work** | `departments`, `department_types`, `served_departments`, `services`, `service_fields`, `service_field_ranges`, `codes`, `templates`, `flowsheets` | Settings in the spec 01 sense: `retired_at`, never deleted, never read by rebuild. `served_departments` rows are deleted like link rows. |
| **Packs** | `packs`, `organization_packs`, `entry_types` | Registry rows shipped by migration; `organization_packs` switched per organization. |
| **Audit** | `settings_changes`, `record_reads` | Insert-only, same trigger as `entries`. |
| **Pack work** | `pack_calls` | Written by `write_entry`; deleted by the runner, by `retire_organization_pack`, by `erase_patient`. |
| **A pack's own** | every table in schema `<pack>` | Mutable. Carries `organization_id`. Holds core ids with no foreign key, so `erase_patient` is never blocked. Owned by `pack_<key>`. |

### People and rights

```
organizations   id uuid pk · name · created_at
users           id · organization_id · kind user_kind · name · title null · login_id uuid null · invited_at null · accepted_at null · retired_at null
                UNIQUE (organization_id, login_id) WHERE login_id IS NOT NULL · UNIQUE (organization_id, id)
roles           id · organization_id null · key · name · retired_at        UNIQUE (coalesce(organization_id, nil), key) · UNIQUE (organization_id, id)
actions         key text pk CHECK (key ~ '^(write|mark|read|manage):[a-z_]+$') · pack null → packs.key
role_actions    role_id → roles · action → actions.key ON DELETE RESTRICT          pk (role_id, action)
user_roles      organization_id · user_id · role_id · department_id null           UNIQUE (user_id, role_id, coalesce(department_id, nil))
                (organization_id, user_id) → users · (organization_id, department_id) → departments
                trigger: roles.organization_id IS NULL OR = user_roles.organization_id
```

- `user_kind` is `staff | machine | pack | patient | proxy | importer`. Spec 01's "every author is a users row" now names this table.
- `kind = 'pack'` rows are named `pack:<key>`, one per (organization, pack), made and retired only by `save_organization_pack` / `retire_organization_pack`. `save_user` handles `staff` and `machine`; `patient` and `proxy` arrive with the portal; `importer` with the importer.
- `login_id` is the `auth.users` id. It is set once, by `link_login`, and never by `save_user`. A user may exist in two organizations under one login (a locum at two practices), which is why `current_user_id` takes the organization.
- `invited_at` is set by `invite_user`; `accepted_at` by `link_login`. Both show on the Staff page beside last sign-in.
- `retired_at` may be in the future ("retire Friday 18:00"). The gate treats `retired_at <= now()` as retired.
- A machine user (`kind = 'machine'`) holds only `write:` actions, in exactly one department, never everywhere; `save_user` refuses anything else. `write_entry` refuses a machine entry that is not a reply to an open request whose `to_department_id` is that department, unless it is a draft.
- `roles.organization_id IS NULL` marks a built-in role: read-only, shipped by migration, changed everywhere at once by release. Core ships `owner`, `doctor`, `nurse`, `receptionist`, `technician`. A pack ships the people roles its screens need (`cashier`) and one role `pack:<key>` for its own user.
- `actions.key` is `'<verb>:<noun>'`. Core actions: `write:<type>` for every core entry type; `mark:started`, `mark:done`, `mark:cancelled`, `mark:reopened`, `mark:held`, `mark:sent`, `mark:routing`, `mark:reviewed`; `read:organization`, `read:record`, `read:queue`, `read:to_review`, `read:values`, `read:settings_changes`; `manage:organization`, `manage:departments`, `manage:services`, `manage:users`, `manage:roles`, `manage:templates`. A pack adds `write:<its types>`, `mark:<its steps>` and `read:<its things>` with `pack = its key`.
- The `pack:<key>` role holds `mark:held` and the pack's own actions only. Nothing else may be granted to it (CI, B16).

### Places and work

```
department_types    key pk · name · pack null → packs.key · is_visited bool · retired_at
departments         id · organization_id · type → department_types.key · name · site_name null · is_outside bool · contact_text null · retired_at
                    UNIQUE (organization_id, id)
served_departments  organization_id · department_id · served_department_id null        pk (department_id, coalesce(served_department_id, nil))
services            id · organization_id · department_id null · section_name null · code → codes · name · reply_type · retired_at
                    UNIQUE (organization_id, department_id, code) WHERE retired_at IS NULL · (organization_id, department_id) → departments
service_fields      as spec 01
service_field_ranges service_id · position · sex (female | male | null) · age_low · age_high · reference_low · reference_high · critical_low · critical_high
codes               as spec 01; organization_id IS NULL rows only from _core_ migrations
templates           id · organization_id · department_id null · user_id null · name · items jsonb · retired_at
flowsheets          as v3
```

- **Core department types** are `clinic`, `reception`, `ward`, `ancillary`, `outside`. `ancillary` is a department that only works its request queue (PFT, physiotherapy, audiometry); its screen is the core request-queue screen. `outside` rows are created by `write_request` on first use with `is_outside = true` and `contact_text`; they are hidden from internal pickers and nobody holds a role there (trigger on `user_roles`). Packs add `laboratory`, `imaging`, `pharmacy` with `pack` set; `save_department` runs `require_pack` on the type's pack.
- **Keys are never renamed or reused.** A rename of a type key is a new row and the old one retired; `save_department` moves each department across as one settings change. `department_types.retired_at` exists for this.
- **One type per department.** A department that does two things is two departments; a division inside a department is `services.section_name`. The type picks the screen and nothing else; the request queue exists whenever a department has a live service.
- **`is_visited`** says whether patients are seen there (clinic, ward, reception: yes; ancillary, outside, laboratory, imaging: no). Spec 03 reads it for visits.
- **`site_name`** is a label. `save_department` trims it and refuses a value that differs from an existing site of the organization only by case or whitespace; the Departments page offers existing names. A `sites` table is additive when a site needs its own address.
- **`served_departments`** says whom a serving department (a lab, a reception) works for. `served_department_id IS NULL` means every department, the same convention as `user_roles`. It gives the default provider in the service picker when two departments offer one code, and the queues a reception may read. It is never needed with one provider per code.
- **`services.department_id IS NULL`** means the destination is outside the organization and the requester names it at send time. Several in-house providers of one service are several service rows; `served_departments` picks the default. `services.department_id` may change through `save_service`: new requests go to the new department, open ones keep their destination (`mark_routing` if wanted), templates keep working by id, and a move into a department that already offers the code is refused like a duplicate.
- **`service_field_ranges`** is a core table, read only by `field_range(field, patient)` in `write_entry` step 5, released in the first migration that carries the Laboratory pack. Flags are computed once, so a unisex range mis-flags for good; that is why it ships now. Range edits are in-place updates recorded in `settings_changes`, never retire-and-insert.
- **Codes.** Global rows (`organization_id IS NULL`) are written only by `_core_` migrations, so no organization can fix a unit for every other. `save_service` refuses a code that is neither global nor the organization's own; an importer mints `local:` codes for anything the migrations did not seed.
- **Templates** are loaded and saved whole; items carry their own type and service id. `user_id` set means personal. A template naming a retired service skips it on apply and says so.

### Packs and audit

```
packs               key pk · name · is_called_after_write bool
organization_packs  organization_id · pack → packs.key · retired_at             pk (organization_id, pack)
entry_types         as spec 01
settings_changes    id uuid pk · organization_id · user_id · table_name · row_id · changes jsonb · recorded_at        insert-only
record_reads        organization_id · user_id · patient_id · read_at            index (user_id, patient_id, read_at desc); insert-only
pack_calls          pack · entry_id · organization_id · recorded_at · tries smallint · tried_at null · error_text null   pk (pack, entry_id)
                    index (recorded_at) WHERE tries < 5 (the runner's pick); no foreign key to entries
```

- `settings_changes.changes` is the row after the save (or `{retired_at}` / `{deleted: true}` for a link row); `user_id` comes from `current_user_id()` and is never a parameter. `read_settings_changes(organization_id)` is gated by `manage:organization`.
- `record_reads` is the read audit: `read_record(patient_id)` inserts one row per open; the other record reads (`read_entries`, `read_entry`, `read_values`, `read_entry_file`) raise `record_not_open` when the caller has no row for that patient in the last 12 hours. It applies to `staff`, `patient` and `proxy`; `machine`, `pack` and `importer` read without opening and without a row, so the audit shows only people.
- `pack_calls` has no `patient_id` on purpose: the entry is the fact, and `erase_patient` deletes the patient's rows by joining through `entries` before deleting them.

### Functions

**save_ / retire_.** Each begins with `require_access(organization_id, 'manage:<area>', NULL, department_id)`, takes a client-minted UUIDv7 `id` and upserts on it, takes `seen_change_id` (the `settings_changes.id` the screen loaded; NULL for a new row) and raises `changed_since_read` when the row has a newer change, and ends by inserting one `settings_changes` row. Areas: `organization` (packs, retry, history), `departments`, `services` (services, fields, ranges, codes), `users`, `roles`, `templates`.

- `save_department(id, name, type, site_name, seen_change_id)`: `require_pack` on the type's pack; site name rule.
- `retire_department(id)`: refused with `department_has_open_requests` while `EXISTS (requests WHERE to_department_id = id AND status = 'open')` and with `department_has_unreviewed_results` while `EXISTS (requests WHERE from_department_id = id AND review_needed_at IS NOT NULL)`; then retires the row and its services, and deletes its `user_roles` and `served_departments` rows, each deletion a `settings_changes` row.
- `save_service(id, department_id, section_name, code, name, reply_type, fields[], ranges[], seen_change_id)`: refuses an unknown or foreign code; refuses a second live row for `(department_id, code)`; a live row for the same code in another department returns `other_providers[]` so the client can ask whom the new one serves and list the templates naming the other provider.
- `save_user(id, kind, name, title, roles[], retired_at, seen_change_id)`: `kind` in `staff | machine`; never takes `login_id`; refuses roles for `patient`/`proxy`; enforces the machine rule; enforces the rights rules below; returns `{open_assigned, to_review}` when `retired_at` is set so the client can say "reassign 30; 12 results now belong to Internal medicine". Clearing `retired_at` is the one un-retire.
- `save_role(id, key, name, actions[], seen_change_id)`: refuses `organization_id IS NULL` (built-in roles are copied, not edited); enforces the rights rules. `retire_role(id)` refuses `last_administrator`.
- `save_template`, `retire_template`, `retire_service`: as the pattern.
- `save_organization_pack(organization_id, pack)`: inserts or un-retires `organization_packs`, creates or un-retires the `pack:<key>` user and its `user_roles` row (`pack:<key>` role, everywhere), in one transaction. `retire_organization_pack(organization_id, pack)`: sets `retired_at`, deletes the organization's `pack_calls` rows for the pack, retires the pack user, and moves every request whose latest `held` step has `actor_id = that user` from `held` to `sent` through `core.change_request` with the caller as actor and reason `pack_switched_off`.
- `retry_pack_calls(organization_id, pack)`: `manage:organization`; sets `tries = 0` on the organization's parked rows for the pack.

**read_.** `read_organization(organization_id)` returns everything a picker or a settings screen needs: departments with types and served rows, services with fields and ranges, users with roles, roles with actions, packs with on/off, templates, flowsheets, the parked `pack_calls` count per pack, and the caller's own users row. It is gated by `read:organization`, which every built-in role holds. `read_to_review(organization_id, department_id)`: NULL means mine (`requester_id`); a department means that department's outstanding reviews, for a caller holding `mark:reviewed` there, over the second partial index `(from_department_id, review_needed_at) WHERE review_needed_at IS NOT NULL`. `read_settings_changes(organization_id, table_name, row_id)`.

**invite.** `invite_user(organization_id, id, name, title, roles[])` is public, gated by `manage:users`, creates the users row with `invited_at = now()` and returns its id. One Edge Function `invite` calls it with the caller's own JWT first, then, as `service_role`, `auth.admin.inviteUserByEmail(email)` and `link_login(users_id, auth_uid)` with the id the database returned; the service key never touches a client-supplied id. `link_login` sets `login_id` only when it is NULL and `invited_at` is within the last hour, sets `accepted_at`, writes a `settings_changes` row, and raises `already_linked` or `invitation_expired` otherwise. `create_organization(name, owner_name)` is the other `service_role` function: it creates the organization, the owner's users row, and links the caller's login. MFA is enrolled before first-run setup because the owner holds `manage:`.

**Gates.** `require_access(organization_id, action, patient_id, department_id)` returns the caller's `users.id`. In order: `actions` row exists (else `unknown_action`); `require_pack` when `actions.pack` is set; caller is a users row of the organization with `retired_at IS NULL OR retired_at > now()` and kind in `staff | machine | pack | importer`; `patient_id`, when given, belongs to the organization (surviving patient); the caller holds the action through `user_roles` → `role_actions` in `department_id` or everywhere; for `manage:` the JWT carries `aal2`. Two widenings, both narrow: `read:queue` on `department_id` passes when the caller holds it in a department that serves `department_id` (`served_departments`, NULL included), and on an `is_outside` department when the caller holds it anywhere in the organization. `require_pack(organization_id, pack)` reads `organization_packs`.

`current_user_id(organization_id)`: the users row with `login_id = auth.uid()` in that organization. When `current_setting('opencare.acting_user_id', true)` is set, it is honoured only when `session_user <> 'authenticator'` and the named row has `kind = 'pack'`; otherwise ignored. So a client cannot set it (its session is `authenticator`), and a pack that sets it from inside `after_write` can at most name another pack's user, which B10's scan forbids at merge.

**The funnels.** `core.write_entry` and `core.change_request` are granted to `pack_%` roles because pack wrappers (`write_ecg`, `laboratory_mark_collected`) end in them. When `current_user LIKE 'pack\_%'`, `write_entry` runs `require_access(organization_id, 'write:' || type, patient_id, department_id)` and `require_pack(organization_id, entry_types.pack)`; `change_request` on its step path runs `require_access(organization_id, 'mark:' || step, patient_id, requests.to_department_id)`; the reply fold passes no step and cannot be reached with one. Core wrappers are gated at the wrapper (spec 01 invariant 14, scanned by B10), so core's own maintenance paths (`retire_organization_pack` releasing holds, `rebuild_record`) are not blocked by a gate meant for packs.

**For packs.** `core.record_settings_change(organization_id, table_name, row_id, changes)` stamps `user_id` from `current_user_id()` and refuses when it is NULL; every `<pack>_save_%` and `<pack>_retire_%` function calls it (B10), so pack settings are attributed in the same history as core's.

### The runner, step by step

1. pg_cron schedules `CALL core.run_pack_calls()` every 5 seconds (pg_cron ≥ 1.5, verified in migration one). pg_cron never overlaps runs of one job, so there is one runner connection at most.
2. The procedure begins `SET ROLE pack_runner; SET statement_timeout = '5s'; SET lock_timeout = '2s'; SET application_name = 'pack_runner'`. On a managed host the job's session user is `postgres` (a member of `pack_runner`); on a self-hosted one the job can be owned by `pack_runner` outright. Either way `current_user` is `pack_runner` from here on, and `pack_runner` holds EXECUTE on `core.next_pack_call` and `core.finish_pack_call` and nothing else.
3. Loop: `SELECT * FROM core.next_pack_call()`, a `security definer` core function that picks the oldest eligible row — `tries < 5 OR tried_at < now() - interval '1 hour'`, `tries = 0 OR tried_at < now() - interval '1 minute' * least(2^tries, 60)`, the pack `is_called_after_write`, `organization_packs` for `(organization_id, pack)` live — with `FOR UPDATE SKIP LOCKED`, sets `tries = tries + 1, tried_at = now()`, and returns the row with its entry and the organization's `pack:<pack>` users id. When the entry no longer exists, it deletes the row and returns the next. `COMMIT`.
4. New transaction: `set_config('opencare.acting_user_id', <pack user>, true)`; `BEGIN … PERFORM <pack>.after_write(entry); … EXCEPTION WHEN OTHERS THEN error := SQLERRM; END`; then `core.finish_pack_call(pack, entry_id, error)`, which deletes the row on success or writes `error_text`. `COMMIT`. (A `COMMIT` cannot sit inside an exception block, so the block ends first.) The dispatch checks `pg_proc.prosecdef AND proowner = ('pack_' || pack)::regrole` before the call and parks the row with `error_text = 'not_definer'` otherwise.
5. A `query_canceled` from `statement_timeout` ends the procedure; the cancelled row's try is already committed, so it sinks behind fresh rows. The back-off makes "fresh rows first" automatic. From five tries the row is parked: still retried hourly (a fixed bug self-heals), counted by `read_organization`, reset by `retry_pack_calls`.
6. A second job every minute terminates any backend with `application_name = 'pack_runner'` and `state_change < now() - interval '2 minutes'` (a pack that defeats the timeout is still bounded; B10 bans the ways to defeat it). A daily job purges `cron.job_run_details` older than three days.

Timing: the runner's `statement_timeout` (5 s) and `lock_timeout` (2 s) are below the API role's 8 s, so even an `after_write` that calls `mark_step` (which takes the patient advisory lock) and then sleeps holds the patient for at most 5 s and a concurrent save still lands. B1 proves it with exactly that fixture.

### The contract of `after_write(entry)`

- **At least once.** The row is deleted only after the call commits, so a kill between the two repeats the call. Therefore idempotent on `entry_id`.
- **Match the entry as it is now.** The runner passes the entry as stored at call time, with `replaced_by_id` and `type` (`entered_in_error` on a strike). The function makes the pack's data match that: "void what I made from `replaces_id`, if any; make what this entry implies, if it is live". So order between an original and its replacement cannot matter (B4), and a day of failures replays correctly.
- **Holds by compare-and-set.** `mark_step(request_id, 'sent', 'held')`. When it fails because the department already started, the pack records "started before payment" on its own side and does not raise: the charge exists unpaid. That is the accepted exposure of an asynchronous hold: seconds, not a blocked clinician.
- **Raise only for "not yet".** A raise means "what I depend on is not there yet" (`price_missing`): the row stays pending, backs off, parks, and the Organization page shows it. A raise is never used for "this entry is not mine": that is a return.
- **Entries only.** A pack reacts to entries, never to steps: steps insert no `pack_calls` row. A step a pack must react to is written as a reply entry by the department that took it.
- **Never a core type, never its own trigger.** The gate refuses a pack user writing a core type. A pack whose own user writes an entry of its own type gets no `pack_calls` row for it, so a pack cannot feed itself forever.
- **No cross-pack dependency.** `pack_billing` has no USAGE on schema `laboratory`; the only shared surface is the record, through the granted `read_…` functions, and those read without opening because the pack user is of kind `pack`.

### Grants, in one place

| Role | Holds | Does not hold |
|---|---|---|
| `authenticated` | EXECUTE on `public` functions (each granted explicitly; the host's default grant is revoked) | any table; any `core` or pack schema function; CREATE on `public`; TEMP |
| `anon` | nothing | everything |
| `service_role` | EXECUTE on `create_organization`, `link_login` | any table in `core`, `public` or a pack schema; any other function |
| `pack_<key>` (NOLOGIN) | ALL on schema `<key>`; EXECUTE on `core.write_entry`, `core.change_request`, `core.record_settings_change`, `require_access`, `require_pack`, `current_user_id`, public `read_…`, public `mark_…` | any core table privilege (so no `FOR UPDATE`); USAGE on `net`, `extensions`, `vault`, `storage`, `auth`, `cron`, `realtime`, `graphql_public`, another pack; `pg_advisory_*`; `pg_read_file`, `pg_read_binary_file`, `lo_import`, `lo_export`, `dblink%`; TEMP; CREATE on `public`; membership in any role; `core.next_pack_call`, `core.finish_pack_call` |
| `pack_runner` (NOLOGIN) | EXECUTE on `core.next_pack_call`, `core.finish_pack_call`, every `<pack>.after_write` | SELECT on any core table; everything above |
| core owner | everything in `core` and `public`; `pg_advisory_*` | — |

Migration one: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role`; `REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role`; `REVOKE TEMP ON DATABASE … FROM PUBLIC, anon, authenticated, service_role, pack_runner` and every `pack_%`; `REVOKE EXECUTE ON FUNCTION pg_catalog.pg_advisory_xact_lock(bigint), (int,int), pg_advisory_lock(…), pg_advisory_xact_lock_shared(…), pg_try_advisory_xact_lock(…), pg_try_advisory_lock(…) FROM PUBLIC; GRANT … TO <core owner>`; default EXECUTE to PUBLIC revoked in `core`, `public` and every pack schema. On a managed host that refuses the `pg_catalog` revoke, B10's ban on `pg_advisory` in pack bodies plus the runner's 5 s timeout are the guard, and B9 records which of the two holds.

### Migrations and files

- Flat Supabase folder; `<timestamp>_core_….sql` or `<timestamp>_<pack>_….sql`. No core file references a pack schema or a `<pack>_` identifier except the two dispatches. No core migration depends on a pack migration.
- A pack file begins with `SET ROLE pack_<key>;` so every object it creates (functions and tables alike) is pack-owned; contains no `ON CONFLICT`; every registry row it inserts (`entry_types`, `packs`, `department_types`, `actions`, `roles`, `role_actions`) carries `pack = '<its key>'` or belongs to its `pack:<key>` role; adds enum values one `ADD VALUE` per file.
- Every function in `core`, `public` and every pack schema is `security definer` with `SET search_path = ''` (or `pg_catalog`), including pack functions that are not public. `pg_temp` shadowing is closed by the TEMP revoke.
- A pack schema is never dropped. A pack is retired by retiring its `entry_types` rows and clearing `is_called_after_write` in one release, and by each organization switching it off; corrections and rebuilds of ten-year-old entries still dispatch its updater.
- Hostile fixture packs live in `supabase/tests/fixtures/`, never under the migrations path, and are applied only by the test runner.

### The client half

- `src/core`, `src/packs/<pack>`, one `src/packs/index.ts`. ESLint `no-restricted-imports`: core never imports packs, packs never import each other, only `index.ts` imports packs.
- `index.ts` maps `department_types.key` → screen, contributes each pack's preset fragment and its `servicesColumns` cell. A pack-owned column (Billing's price) is saved by the pack's own function after core's `save_service` returns; the pack's read function reports services without a row so the Services page marks them. Two calls, not one transaction: a missing price is `price_missing` on the first request, a pending row, never a clinical block.
- The `Action` union is generated from `SELECT key FROM actions` and diffed in CI. Presets are data in the client; a CI check asserts no core preset names a department type whose `pack` is set.
- The core renderer draws every entry from `display_line` and `data.values` (spec 01 test 20).

## c. Invariants

### Enforced by the database

1. **One gate.** Every public function begins with `require_access(organization_id, action, patient_id, department_id)`; the organization and department are resolved from the row being touched.
2. **Identity.** `current_user_id(organization_id)` honours `opencare.acting_user_id` only for a non-`authenticator` session naming a `kind = 'pack'` row.
3. **Actions are rows.** `role_actions.action → actions.key ON DELETE RESTRICT`; `require_access` raises `unknown_action` and runs `require_pack` for pack actions.
4. **Rights.** A caller never changes their own `user_roles` or the `role_actions` of a role they hold; `manage:` actions are granted only by holders, in a scope no wider than the granter's; built-in roles are read-only; `save_user` and `retire_role` take `pg_advisory_xact_lock(hashtext(organization_id::text))` and refuse `last_administrator` when no live user with `login_id IS NOT NULL` would hold `manage:users` and `manage:roles` with `department_id IS NULL`.
5. **Kinds.** `user_roles` only for `staff | machine | pack | importer` (trigger joining `users.kind`); never on an `is_outside` department; a machine user holds `write:` actions in one department and writes replies to open requests sent there, or drafts; a `pack:<key>` role holds `mark:held` and its pack's actions only.
6. **Composite tenant foreign keys:** `user_roles (organization_id, user_id)`, `(organization_id, department_id)`; `served_departments` both sides; `services (organization_id, department_id)`; `templates (organization_id, department_id)`, `(organization_id, user_id)`; `entries (organization_id, department_id)`, `(organization_id, author_id)`, `(organization_id, responsible_id)`; `requests (organization_id, assignee_id)`, `request_steps` via `(organization_id, actor_id)`; carried by `UNIQUE (organization_id, id)` on `users`, `departments`, `roles`; a built-in role passes by trigger.
7. **Unique while live:** `services (organization_id, department_id, code) WHERE retired_at IS NULL`; `users (organization_id, login_id)`; `site_name` by trimmed, case-folded comparison in `save_department`.
8. **Global codes** (`organization_id IS NULL`) have no INSERT path but migrations; `save_service` checks `codes.organization_id IS NULL OR = the caller's organization`.
9. **Settings history.** `settings_changes` and `record_reads` reject UPDATE, DELETE and TRUNCATE; every `save_…`/`retire_…` writes exactly one row; `seen_change_id` older than the row's latest raises `changed_since_read`.
10. **Retire.** `retire_department` refuses open requests and unreviewed results it requested, retires its services, deletes its link rows; `retired_at <= now()` is retired; `services.department_id` moves in place.
11. **Login.** `link_login` sets `login_id` once, within an hour of `invited_at`, sets `accepted_at`; `save_user` has no `login_id` parameter.
12. **Pack boundary.** One schema per pack owned by `pack_<key>`; every pack function `security definer` with pinned `search_path`; every pack relation pack-owned; the grant table above; the two dispatches verify `prosecdef` and owner before calling.
13. **`pack_calls`.** Inserted only by `write_entry` for packs that are on, called after write, and not the author; never on retry, rebuild or step; deleted by the runner on success or missing entry, by `retire_organization_pack`, by `erase_patient`; picked only while the pack is on for the organization.
14. **Runner.** `SET ROLE pack_runner`, `statement_timeout 5 s`, `lock_timeout 2 s`, `application_name = 'pack_runner'`; `next_pack_call` and `finish_pack_call` executable by `pack_runner` only; watchdog at two minutes.
15. **Holds.** `held` is a core `request_step`; `sent` is a legal target only from `held`; switching a pack off releases its holds with the caller as actor.
16. **Record reads.** `read_record` inserts `record_reads`; `record_not_open` for `staff | patient | proxy` without a row in 12 hours; machines, packs and importers read without a row.
17. **After retirement.** Realtime signals go on private channels under one RLS policy on `realtime.messages` (membership InitPlan: `users.login_id = auth.uid() AND retired_at IS NULL AND organization_id = <channel's>`); files only through `read_entry_file` with a 60-second signed URL.
18. **Department types.** `save_department` runs `require_pack` on the type's pack; keys never renamed; `department_types.retired_at`.
19. **Advisory locks.** EXECUTE on `pg_advisory_*` revoked from PUBLIC and granted to the core owner (see the managed-host note).
20. **Rebuild isolation.** `rebuild_record` replays each list in its own `BEGIN … EXCEPTION` block and reports a failing list by name; core lists are rebuilt even when a pack list raises.

### Enforced by CI tests

- **B1 Save time.** Five hostile fixture packs run concurrently mid-transaction — one sleeping while holding `FOR UPDATE` rows and a lock on its own table, one raising in a loop, one waiting on a lock, one calling `mark_step` and then sleeping, one taking the patient advisory lock (if the revoke could not be applied) — while every golden fixture write for the same patients runs under `statement_timeout = '1s'`: every write succeeds within budget; `pack_calls` rows accumulate with `error_text` or age. With the after-write call inside the write this test is provably unpassable.
- **B2 Poison row.** An `after_write` that does `pg_sleep(60)`: the call is cancelled at 5 s, the row shows `tries = 1` and is not eligible for two minutes, a fresh row is processed on the next tick, after five tries the row is parked and `read_organization` counts it, `retry_pack_calls` resets it.
- **B3 Kill mid-call.** The runner backend is terminated between the call and its commit: the row is still pending and no half-made pack row exists.
- **B4 Order.** An original and its replacement processed in reverse order give the same final pack rows.
- **B5 Once.** A double-send makes exactly one `pack_calls` row per pack; a rebuild inserts none; a step inserts none; an entry written by a pack's own user inserts none for that pack; `write_note` returns the same row in the same time with three packs on as with none.
- **B6 Holds.** With an idle runner a hold lands within 10 s of the send; a hold arriving after `collected` fails its compare-and-set, changes nothing, and the charge exists unpaid; a held request cannot be collected; with the runner stopped a CBC is collectable and its charge appears when the runner resumes; `retire_organization_pack` for Billing leaves no request held by its user and no pending row.
- **B7 Grants.** For every `pack_%` role and every core table, `has_table_privilege` is false for SELECT, INSERT, UPDATE, DELETE and TRUNCATE; `pack_runner` cannot SELECT from `entries`; no `pack_%` role holds EXECUTE on `core.next_pack_call` or `core.finish_pack_call`; a hostile `after_write` calling `core.write_entry` with a core type, with another organization's patient, and `core.change_request` with `done`, `cancelled` and `reopened` is refused each time.
- **B8 Ownership and definer.** Every function and relation in a pack schema and every public function prefixed by a pack key is owned by that pack's role; every function in `core`, `public` and every pack schema has `prosecdef` and a `proconfig` pinning `search_path`; `<pack>.after_write` exists for every pack with `is_called_after_write`; every `update_<list>` named by a pack type, retired or not, exists in that pack's schema; anything owned by `postgres` in a pack schema fails the build.
- **B9 Doors.** In `core`, `public` and every pack schema no function is executable by PUBLIC or `anon`; `authenticated` holds EXECUTE only on `public` functions; `service_role` exactly on `create_organization` and `link_login` and no table privilege anywhere; `pack_%` and `pack_runner` hold no USAGE on `net`, `extensions`, `vault`, `storage`, `auth`, `cron`, `realtime`, `graphql_public` or another pack's schema, no EXECUTE on `pg_advisory_*`, `pg_read_file`, `pg_read_binary_file`, `lo_import`, `lo_export`, `dblink%`, and no row in `pg_auth_members` on either side; `has_schema_privilege(role, 'public', 'CREATE')` and `has_database_privilege(role, current_database(), 'TEMP')` are false for `anon`, `authenticated`, `service_role`, `pack_runner` and every `pack_%`; no core table is in a PostgREST-exposed schema, in pg_graphql, or in the `supabase_realtime` publication.
- **B10 Static.** No core function body references a pack schema or an identifier beginning with any `packs.key || '_'`, except the two dispatches; no `update_` body contains `now(`, `clock_timestamp`, `current_date`, `random(`, or a settings table name; no function owned by a `pack_%` role contains `set_config(`, `SET `, `RESET `, `opencare.`, `pg_advisory`, `pg_sleep`, `EXECUTE`, `statement_timeout`, `lock_timeout` or `idle_in_transaction`; every `<pack>_save_%` and `<pack>_retire_%` body calls `core.record_settings_change`; every `'<verb>:<noun>'` literal passed to `require_access` in any body exists in `actions`; every public core function's first statement is `require_access`. (pg_depend does not see inside plpgsql, so this scans source.)
- **B11 Rows only.** The catalog hash is everything in `pg_catalog` outside pack schemas: `pg_proc` bodies and `proacl`, `relacl`, `nspacl`, `pg_auth_members`, `pg_db_role_setting`, `pg_trigger`, `pg_event_trigger`, `pg_policy`, `pg_publication_tables`, and `cron.job` (exactly the runner, the watchdog, the purge and `core.sweep_visits`, hourly). Applying every pack migration after core leaves it unchanged except enum values and rows in the named registries, and core registry rows are compared by content, not count; the `_core_` files alone pass every core fixture; every fixture entry renders with all packs off.
- **B12 Hostile updater.** Writes of the hostile pack's own types fail; every core-type write succeeds; a set containing a hostile item fails as a whole (the documented limit); with a sleeping updater a write of that pack's type is cancelled at its timeout and a concurrent core write for the same patient completes within one timeout after it; rebuild of a patient holding a hostile-type entry rebuilds every core list and reports the hostile list as failed.
- **B13 Client.** The ESLint rule passes; the front-end snapshot with the pack list emptied still renders every fixture entry; no core preset names a department type whose `pack` is set.
- **B14 Fixtures and files.** Hostile packs live under `supabase/tests/fixtures/` and are applied only by the test runner; every `_<pack>_` migration begins with `SET ROLE pack_<key>`, contains no `ON CONFLICT`, and every registry row it inserts carries its key; no `_core_` file references a pack schema.
- **B15 Rights.** An owner of A calling `save_role` on every built-in role and on their own role raises each time; `save_user` on the caller's own roles raises; a department-scoped `manage:users` holder granting everywhere raises; two owners retiring each other concurrently leave exactly one; a machine fixture writing a non-reply result raises; assigning a role to a `patient`-kind user raises; a user with `retired_at` in the future passes the gate until then and is refused after; `link_login` on a linked row raises `already_linked`, on an invitation older than an hour `invitation_expired`.
- **B16 Tenant matrix.** For every function in `pg_proc` in `public` (enumerated at run time, so pack wrappers are covered the day they are added) and for every id parameter (array elements included), a member of B substitutes B's id of the same kind among A's ids and expects a raise; every `after_write` fixture run against A's rows as B's pack user is refused; the `pack:<key>` role of every pack holds no action outside `mark:held` and its own.
- **B17 Signatures.** A golden file of `public` function identity signatures (`pg_get_function_identity_arguments`) may only grow; a removed line needs an entry in `removed` naming the release that dropped the last caller (the offline outbox depends on it).
- **B18 Pack lifecycle.** Switching a pack on for a fixture organization creates its `pack:<key>` user and role; one send yields a processed `pack_calls` row whose `request_steps.actor_id` is that user; switching off leaves no held request by it, no pending row, and a retired user; `erase_patient` leaves no `pack_calls` row for the patient; a pending row whose entry is gone is deleted on the next tick without a call.
- **B19 Actions and history.** The client's `Action` union equals `SELECT key FROM actions`; every settings fixture save writes exactly one `settings_changes` row with a `user_id`; a stale save raises `changed_since_read`; a pack's `billing_save_price` writes a `settings_changes` row with the cashier's `user_id`.

## d. Vocabulary

| Word | Meaning |
|---|---|
| organization | The sharing boundary: one practice or hospital, one set of patients, one set of settings. Permanent. |
| user | A users row: anyone or anything that writes or reads. `kind` says which. |
| staff | A user of kind `staff`. Not a table. |
| role · action | A role is a named set of actions; an action is `'<verb>:<noun>'`. |
| everywhere | A `user_roles` row with `department_id IS NULL`; a `served_departments` row with `served_department_id IS NULL`. |
| department · site · section | A department has one type and one screen; a site is a label on departments; a section is a label on services. |
| served | Whom a serving department (a lab, a reception) works for. |
| ancillary | A core department type that only works its request queue. |
| outside | A department outside the organization, created on first use; a service with `department_id IS NULL`. |
| pack · pack call · runner | A pack is a schema and a role; a pack call is one `pack_calls` row; the runner is the pg_cron job that makes them. |
| hold · held | A request stopped at `held` until released to `sent`. |
| parked | A `pack_calls` row with five or more tries, shown on the Organization page. |
| preset | Client-shipped setup data applied through `save_…`. |

Banned in the schema: admin, org, practice, manifest, feed, starter, active, label, permission, tenant, member, account, group, staff (as a table), owner (as a column).

## e. Renames

| Draft | Final | Why |
|---|---|---|
| `pack_after_write (pack, function_name)` | `packs.is_called_after_write`, function `<pack>.after_write` | A name executed from a table is a door; the schema-qualified name is the contract and B8 checks it exists. |
| `pack_failures` | `pack_calls` | It is the work, not the failures: a row exists from the write until the pack has reacted. |
| `<pack>_after_write(entry)` | `<pack>.after_write(entry)` | One schema per pack. |
| `services.result_type`, `section` | `reply_type`, `section_name` | Replies are the word; a label ends in `_name`. |
| `departments.site`, `contact` | `site_name`, `contact_text` | Suffix rule. |
| `lab_mark_collected` | `laboratory_mark_collected` | Public wrappers are prefixed by the full pack key. |
| `manage:packs`, `save_packs` | `manage:organization`, `save_organization_pack` / `retire_organization_pack` | The Organization page is one area; switching is a row per pack. |
| `retry_pack_call` | `retry_pack_calls(organization_id, pack)` | Per-row Retry with 500 parked rows is not a screen. |
| `staff` (table) | `users.kind = 'staff'` | One person table, one authorization path. |
| `read_to_review()` | `read_to_review(organization_id, department_id)` | The department owns unreviewed results after a doctor leaves. |
| `require_access(organization_id, action, patient_id)` | `+ department_id` | Rights are per department. |
| the pack user's `kind = 'machine'` | `kind = 'pack'` | The identity guard keys on it; a pack is not an analyser. |
| `general` (department type) | `ancillary` | `general` collided with two screen names; `service` with the `services` table. |
| `ALTER ROLE pack_runner SET statement_timeout` | `SET` inside the runner | Role settings do not apply after `SET ROLE`; the procedure sets them itself. |

## f. Removed

- **The after-write call inside `write_entry`** ("guarded"). Replaced by `pack_calls` and the runner. No guard bounds time or locks; B1 proves it.
- **`pack_after_write.function_name` and `pack_failures.retried_at`.** The name is fixed; retries are `tries` and `tried_at`.
- **"Not needed at any hospital size" for compare-and-set on settings.** Two administrators is enough (O20); one optional argument, no table.
- **`ends_at` on `user_roles`.** A future `retired_at` on the user does the same with no column.
- **Per-row Retry as the only path.** `retry_pack_calls` per organization and pack.
- **The "session_user = pack_runner" identity guard.** pg_cron on a managed host runs as `postgres`; the guard keys on the named row's kind instead.
- **Mandatory `switch_on`/`switch_off` per pack.** Core's own duty in `save_organization_pack`; a pack that needs setup reports it through its read function.

## g. Power for free

- **A new lab is rows** (spec 01), and so is a new department type: one `department_types` row and one screen in `index.ts`.
- **Cover, locums, branch sites, a shared reception** are `user_roles` and `served_departments` rows. No schedule, no hierarchy.
- **Setup and imports are re-runnable** because every `save_…` upserts on a client-minted id; a dropped connection at row 400 of 800 is re-run, not repaired.
- **One history.** `settings_changes` holds core and pack settings alike, attributed, insert-only, and gives "who changed the Hb range and when" and two-admin conflict detection for free.
- **The tenant matrix covers every new function on the day it is added,** because it enumerates `pg_proc`.
- **A third-party pack is safe by construction:** the grant list, the definer check at dispatch, the scans and the catalog hash leave it nothing but its own schema and the funnels.
- **Pack health is visible:** parked rows per pack on the Organization page; a fixed bug self-heals through the hourly retry.
- **A retired pack costs nothing:** its schema stays, its entries render, its old entries still correct and rebuild.
- **Rights are auditable in SQL:** who holds what where is three joins; "what can this machine do" is one row.
- **Patient portal later** is one link table (`patient_access`) and one gate clause; nothing here has to move.

## h. Amendments to spec 01

The exact wording is in the spec 01 amendment note delivered with this appendix. In short: the after-write call leaves `write_entry` (step 7 inserts `pack_calls` rows instead); the packs table rows change accordingly; the hold sentence names `held` and compare-and-set; the boundary sentence becomes "control and data flow one way"; `pack_after_write`/`pack_failures` become `packs`/`pack_calls`; `require_access` gains `department_id`; `read_to_review` gains arguments; `read_record` is the open; `held` joins the core enum; invariant 14 covers every schema; invariant 6 gains the new composite keys; invariant 9 notes the advisory-lock revoke; `rebuild_record` isolates each list; test 21 becomes the per-parameter matrix over `pg_proc`; `users.kind` gains `pack`; the appendix wording (`reply_type`, `section_name`, `site_name`, `contact_text`, `laboratory_mark_collected`, the NULL-department meaning, the machine-write rule) follows.

## i. Owner decisions

Listed separately with recommendations: one type per department; presets as client data; site as a label; the name `ancillary`; `is_visited`; MFA for every `manage:` from day one; the asynchronous hold; the 12-hour read window; managed host or self-hosted for migration one.

## j. What the break-tests changed

| Finding | Decision |
|---|---|
| O1 solo GP; the pack user cannot call `mark_step` | Accept: pack roles get EXECUTE on public `mark_…`; `save_organization_pack` creates the `pack:<key>` user and its role row. |
| O2 first-run preset, dropped connection, global codes | Accept: client-minted ids on every `save_…`; global codes from `_core_` migrations only; `UNIQUE (organization_id, department_id, code) WHERE retired_at IS NULL`. |
| O3 second lab, incomplete `served_departments` | Accept: `served_department_id IS NULL` = every department; `save_service` returns `other_providers[]` so the client can list templates naming the other provider. |
| O4 ER lab covering after hours | Accept as a rule: cover is membership; the request stays where it was sent; the reply's `department_id` says who did it. |
| O6 one-week locum, no caller for `link_login` | Accept: `retired_at` may be in the future; one Edge Function `invite` after a gated `invite_user`. |
| O8 doctor leaving with open work | Accept, smaller: `save_user` returns `{open_assigned, to_review}`; no bulk function. |
| O9 retiring a department with unreviewed results and link rows | Accept: refuse on `from_department_id` results too; delete its `user_roles` and `served_departments` rows. |
| O11 reference ranges by sex and age | Accept: `service_field_ranges` is a core table released with the Laboratory pack; edits in place. |
| O12 moving a service between departments | Accept: `services.department_id` moves in place; open requests keep their destination; duplicate code refused. |
| O13 shared reception cannot read the clinics it feeds | Accept, narrower: only `read:queue` widens through `served_departments`; nothing else. |
| O14 outside providers: nobody can read the send-out queue | Accept: `read:queue` on an outside department for anyone holding it in the organization; `user_roles` never names an outside department. |
| O15 branch site; `site_name` typos | Accept: trim and case-fold in `save_department`; the page offers existing names; a `sites` table later. |
| O16 a PFT lab has no core type | Accept with a different key: `ancillary` (owner decision). |
| O18 800-test import | Accept: same rules as O2, plus refusing another organization's code; the importer mints `local:` codes. |
| O19 switching Billing off with holds pending | Accept (it broke): the runner picks rows only while the pack is on; `retire_organization_pack` deletes pending rows and releases the pack's holds. |
| O20 two admins editing one service | Accept, overturning the draft: `seen_change_id` on every `save_…`, `changed_since_read`. |
| O21 the runner reads the record and trips `record_not_open` | Accept: the open rule applies to `staff`, `patient`, `proxy` only. |
| O22 erase with pending `pack_calls` rows | Accept: the runner deletes a row whose entry is gone; `erase_patient` deletes the patient's rows through `entries`. |
| S1 a pack sets the identity GUC and acts as a doctor | Accept (it broke): the GUC is honoured only for a `kind = 'pack'` row; B10 bans `set_config`, `SET`, `RESET`, `opencare.` in pack bodies; pack roles hold nothing on the runner's helpers. |
| S2 a pack ships an invoker function and runs as the core owner | Accept (it broke): every pack function `security definer` with pinned `search_path`; B8 asserts it; both dispatches verify before calling. |
| S3 a pack takes the patient advisory lock | Accept (it broke): EXECUTE on `pg_advisory_*` revoked from PUBLIC; B1 fixture; B9 assertion; B10 ban; the runner's 5 s timeout as the bound on a managed host. |
| S4 account takeover through `link_login` | Accept (it broke): `login_id` set once, within an hour; `invite_user` gated first, then the Edge Function; `save_user` never takes `login_id`; B9 pins `service_role` to two functions. |
| S5 an administrator grants themselves an action | Accept: no self-change; `manage:` granted only by holders in no wider scope; built-in roles read-only; B15. |
| S6 an administrator removes their own role | Handled by S5's rule: `cannot_change_own_roles`. |
| S7 two administrators retire each other | Accept: organization lock; `last_administrator` requires a live, linked holder of `manage:users` and `manage:roles` everywhere. |
| S8 every id parameter with B's ids | Accept: composite tenant keys on every link; save-time checks; test 21 becomes the per-parameter matrix (B16). |
| S9 a retired user's live JWT | Accept: private Realtime channels under one membership policy; `read_entry_file` with a 60 s URL; JWT lifetime unchanged. |
| S10 action manifest drift | Accept: `actions` is a table; FK from `role_actions`; `unknown_action`; the client type is generated (B19). |
| S11 a pack action colliding with core | Accept: no `ON CONFLICT` in pack files; registry rows carry the pack key; B11 compares core registry rows by content. |
| S12 an invitation forwarded to the wrong person | Accept: one-hour invitation; `invited_at`, `accepted_at` shown; `link_login` cannot re-link; retire and re-invite on doubt. |
| S13 a compromised analyser login | Accept: a machine user writes only replies to open requests sent to its one department, or drafts; no `read:`, `mark:`, `manage:`, no everywhere. |
| S14 a patient-kind user given a staff role | Accept: `user_roles` only for `staff | machine | pack | importer`; the portal gate is `patient_access`. |
| S15 unsafe `search_path`, host default grants, CREATE and TEMP | Accept: migration-one revocations; every function in every schema pins `search_path`; B9 asserts CREATE and TEMP. |
| S16 the private funnels do not gate themselves | Accept, scoped: the funnels gate pack callers (`current_user` is a pack role); core wrappers stay gated at the wrapper and B10 scans for it. |
| S17 a pack disables the runner's timeout | Accept: B10 bans the timeout settings (already covered by the `SET` ban); a watchdog job at two minutes. |
| S18 a pack wrapper leaks across organizations | Accept: B16 enumerates `pg_proc`; every pack table carries `organization_id` and every pack read resolves it from the row. |
| S19 exfiltration from `after_write` | Accept: B9 scoped to `core`, `public` and pack schemas, plus the no-USAGE, no-EXECUTE and no-membership assertions. |
| S20 pack settings unattributed | Accept: `core.record_settings_change` granted to packs; B10 asserts pack `save_`/`retire_` call it; `settings_changes` insert-only; `read_settings_changes` gated. |
| X1 a pack updater sleeps under the patient lock | Accept: B10 scans every pack body; B12 sleeping-updater fixture; the O(rows), no-waits rule written down; the limit stays known. |
| X2 the runner holds the patient lock | Accept (it broke): `statement_timeout 5 s`, `lock_timeout 2 s` set by the runner; B1's sleeper calls `mark_step` first. |
| X3 a raising pack updater breaks rebuild | Accept (it broke): `rebuild_record` replays each list in its own block and reports a failing one (spec 01 amendment). |
| X4 a pack removed from the codebase | Accept: pack schemas are never dropped; retire types and clear `is_called_after_write`; B8 iterates retired types. |
| X5 a public wrapper renamed | Accept: the golden signatures file (B17). |
| X6 two packs in order; a pack feeding itself | Accept: a pack is never told about its own writes; packs react to entries, never steps. |
| X8 the hold race and an unnamed interval | Accept: 5 seconds, pg_cron ≥ 1.5; B6 asserts a hold within 10 s. |
| X9 Billing failing silently for a day | Accept, simplified: one back-off formula capped at an hour; parked rows still retried; the count on the Organization page; `retry_pack_calls`. |
| X10 an invoker updater writes core tables | Handled by S2. |
| X12 a pack column on the Services page | Accept as a rule: saved by the pack's own function after core's save; `price_missing` is a pending row, never a clinical block. |
| X13 pack tables owned by `postgres` | Accept: pack migrations begin with `SET ROLE pack_<key>`; B8 asserts `relowner`. |
| X15 two organizations, unnamed creator of the pack user | Handled by O1: `save_organization_pack`; B18. |
| X16 a third-party pack's migration | Accept: B11's hash is defined (ACLs, memberships, role settings, triggers, event triggers, policies, publications, `cron.job`); registry rows carry the key; the pack role's actions are bounded. |
| X17 renaming a department type key | Accept: `department_types.retired_at`; keys never renamed; a rename is a new row. |
| X18 a preset naming an off pack's type | Accept: `save_department` runs `require_pack`; packs contribute preset fragments; a CI check on core presets. |
| X19 a pack calls the funnels directly | Handled by S16: the gate in the funnel refuses a pack user without the action, so a core type, another organization's patient, or `done`/`cancelled`/`reopened` are all refused (B7). |
| X20 the entry is gone before the tick | Handled by O22: `next_pack_call` deletes the row; the erase row's shape is decided with erase. |

Net schema change against the draft: `users` gains `invited_at` and `accepted_at`; `actions` becomes a table; `settings_changes` gains `id`; `department_types` gains `retired_at` and `is_visited`; `served_departments.served_department_id` becomes nullable; `service_field_ranges` is core; `pack_calls` replaces `pack_failures`; no table gains a jsonb junk drawer.

## k. Rejected

The draft's rejections stand: a `staff` table; server-side "where am I"; `department_staff`; per-service access and routing tables; `departments.hold_pack` and born-held now; `pack_feed`, `take_`, a client-fired runner; `pack_after_write.function_name` and `regprocedure`; `roles.actions text[]`, per-organization copies of system roles, `roles.is_system`, `packs.retired_at`; jsonb settings columns; `department_types.screen`, `sees_patients`, `is_clinic`, a `general` key; `templates.kind`, merged flowsheets, `template_items`; preset tables and an 800-service starter; a separate `open_record`; `staff_cover`, three Edge Functions, 15-minute JWTs, `disable_user`, `create_machine_user`, an `invitations` table, claim by e-mail; `retired_at`/`granted_by_id` on link tables and deferred constraint triggers; `restore_` functions, `rename_site`, a registration number, a jsonb contact shape, split names, `initials`; `read_sent_outside`, `read_visit_queue`, `attend:visit` (spec 03); `use_count`, `department_sections`, `unit_key` now, a nightly `check_settings`, mandatory `switch_on`/`switch_off`; the words manifest, practice, feed, starter, label, active, admin, org.

Rejected at final:
- **`ends_at` on `user_roles`.** A future `retired_at` on the user is the same fact with no column and no second filter to forget.
- **A `sites` table now.** A label with a trim-and-case rule covers a branch; the table is additive when an address is needed.
- **`session_user = 'pack_runner'` as the identity guard.** Not true on a managed host; the row's `kind` is the fact that matters.
- **`ALTER ROLE pack_runner SET statement_timeout`.** Role settings apply at session start, not after `SET ROLE`; the runner sets them.
- **Public functions as `security invoker` shims capturing `auth.uid()` (no GUC at all).** Cleaner, but it rewrites spec 01 invariant 14 and every wrapper; the `kind = 'pack'` guard closes the same hole in one line.
- **Gating the funnels for every caller.** It would block core's own maintenance paths (releasing holds on pack-off) behind actions an administrator need not hold; gating pack callers is the boundary that was missing.
- **A hidden `read_queue` window, `mark_fed` in core, steps producing `pack_calls` rows.** Packs react to entries; a step worth reacting to is a reply entry.
- **Born-held requests (`services.is_held_first`) now.** Fails closed for care when Billing fails; the asynchronous hold loses seconds of revenue exposure, never a clinical minute. Additive if a real leak is observed.
- **A `service` department type key.** Collides with the `services` table in every sentence.
- **Per-row Retry only, and five tries as the end.** A parked row that is never retried turns a fixed bug into a manual chore.
- **Names rejected at final:** `pack_failures`, `pack_after_write`, `function_name`, `manage:packs`, `save_packs`, `retry_pack_call`, `general`, `service` (as a type), `active_department_id`, `current_department_id`, `staff_active_department`.

## l. Known limits

- **A pack updater runs inside the write.** It runs under the patient lock in the clinician's transaction. A failing one fails writes of that pack's own types and the set they were saved in; the screen names the failing item and the clinician saves without it. A slow one delays concurrent writes for the same patient up to the API timeout; B10's scan and B12's fixture bound the obvious ways, not a CPU loop.
- **A hold trails the send.** By the tick interval plus queue depth: seconds when healthy, up to five cancelled ticks behind poison rows. A request started before the hold lands is charged unpaid and the pack records it. This is the accepted exposure; born-held is the additive alternative.
- **Settings rows are saved whole.** A stale save is refused with the other administrator's change shown; it is never merged.
- **One type per department.** A department that is two things is two departments. Sections are labels.
- **A site is a label.** Reports group by matching text; a rename is retyping the label per department until a `sites` table is wanted.
- **No schedules.** Cover is membership. The night technician holds a role in the covered department; turnaround reports show the sending department's queue.
- **Packs cannot depend on each other.** The only shared surface is the record. "Charge on collected" is not expressible; charge on `sent` and on the result entry is.
- **Send-outs are found per patient** until spec 03's `read_sent_outside`.
- **An invitation proves control of a mailbox** at one moment. In-person verification is a practice rule; `accepted_at` and the one-hour life are what the database can give.
- **Built-in roles change everywhere at once,** by release. A practice that wants a different `doctor` copies it.
- **Machine users are confined to replies and drafts.** A point-of-care device that files unsolicited results drafts them for a clinician to commit.
- **Pack settings are two calls,** not one transaction with core's save. A service without a price is a pending `pack_calls` row, never a blocked request.
- **The managed-host caveat.** If the host refuses the `pg_catalog` revoke of advisory locks, the guard is B10's scan and the runner's timeout; B9 records which holds.
- **The identity GUC is a design compromise.** It is safe because of one `kind` check; the cleaner shim design is written down in section k for the day it is worth the rewrite.
