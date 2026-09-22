# 02 · The organization

Status: **locked** · 2026-09-22 · amended 2026-09-22 (spec 03): `write:visit` passes on served departments; four actions on the built-in roles; the reception machine exception; `retire_department` refuses open visits; `sex` carries `other`; the sweep in `cron.job` · amends 01: the after-write call leaves `write_entry` (appendix, section h)
Full reasoning, invariants and break-test decisions: [02-organization.appendix.md](02-organization.appendix.md)

## In one sentence

An organization is people, departments and services described in rows; a person does what
their roles allow, where they hold them; and a pack is a schema of its own that reads the
record and is never run by it.

- A **user** is anyone or anything that writes: staff, machine, pack, patient, proxy, importer.
- A **role** is a named set of **actions** (`write:note`, `mark:collected`, `read:queue`,
  `manage:services`). A user holds a role in one department or everywhere.
- A **department** has one type, which picks its screen, and a request queue when it has a
  live service. A site is a label on a department.
- A **pack** is switched on per organization, keeps its tables in its own schema, and hears
  about the record only after a write has committed.

## Seven rules

1. **Settings are rows.** A new lab, a role, a site, a pack for one practice: rows, no deploy.
2. **One gate.** Every public function starts with `require_access(organization_id, action,
   patient_id, department_id)`; organization and department come from the row being touched.
3. **Nobody grants what they do not hold, and nobody changes their own rights.**
4. **Every settings change is one attributed row;** a save from a stale screen is refused.
5. **The record never runs a pack.** A pack reacts through `pack_calls` and the runner, after
   the commit. The one exception is the updater of a pack's own types, in that pack's own writes.
6. **Postgres is the boundary.** A pack is a schema owned by a role that can execute core's
   funnels and touch nothing else. A boundary CI cannot see is not a boundary.
7. **A pack that fails, sleeps or lies blocks nothing:** not a write, not a save, not another pack.

## Tables

| Kind | Tables | Rule |
|---|---|---|
| People and rights | `users` · `roles` · `role_actions` · `user_roles` · `actions` | Users and roles are retired, never deleted; a link row is deleted, and the deletion is a `settings_changes` row |
| Places and work | `departments` · `department_types` · `served_departments` · `services` · `service_fields` · `service_field_ranges` · `codes` · `templates` | Settings (spec 01): retired, never deleted; history never depends on them |
| Packs | `packs` · `organization_packs` · `entry_types` | Shipped by migration; switched on per organization |
| Audit | `settings_changes` · `record_reads` | Insert-only; a trigger refuses update and delete |
| Pack work | `pack_calls` | One row per (pack, entry) from the write until the pack has reacted; then deleted |
| A pack's own | every table in schema `<pack>` | Mutable; carries `organization_id`; holds core ids with no foreign key |

```
organizations      id · name · created_at
users              id · organization_id · kind (staff | machine | pack | patient | proxy | importer)
                   name · title · login_id null · invited_at · accepted_at · retired_at
roles              id · organization_id null (NULL = built-in, read-only) · key · name · retired_at
actions            key ('<verb>:<noun>', verb = write | mark | read | manage) · pack null
role_actions       role_id · action
user_roles         organization_id · user_id · role_id · department_id null (NULL = everywhere)
department_types   key · name · pack null · is_visited · retired_at
departments        id · organization_id · type · name · site_name null · is_outside · contact_text · retired_at
served_departments department_id · served_department_id null (NULL = every department)
services           id · organization_id · department_id null (NULL = outside) · section_name · code · name · reply_type · retired_at
service_field_ranges  service_id · position · sex · age_low · age_high · reference_low/high · critical_low/high
templates          id · organization_id · department_id null · user_id null · name · items · retired_at
packs              key · name · is_called_after_write
organization_packs organization_id · pack · retired_at
settings_changes   id · organization_id · user_id · table_name · row_id · changes · recorded_at
record_reads       organization_id · user_id · patient_id · read_at
pack_calls         pack · entry_id · organization_id · recorded_at · tries · tried_at · error_text    pk (pack, entry_id)
service_fields · codes · entry_types                                          as in spec 01
```

- **Keys** (`roles`, `actions`, `department_types`, `packs`) are never renamed or reused.
- **Composite tenant foreign keys** carry `organization_id` on every link (`user_roles`,
  `served_departments`, `services`, `templates`; `entries.department_id`, `author_id`,
  `responsible_id`; `requests.assignee_id`). A built-in role passes.
- **Unique while live:** `services (organization_id, department_id, code)`; `users
  (organization_id, login_id)`; a `site_name` differing only by case or whitespace is refused.
  A global `codes` row (`organization_id IS NULL`) is written only by a `_core_` migration;
  `save_service` refuses a code that is neither global nor the organization's own.
- **Core department types:** `clinic` · `reception` · `ward` · `ancillary` (works its request
  queue: PFT, physiotherapy) · `outside` (created on first use; nobody holds a role there).
  Packs add `laboratory`, `imaging`, `pharmacy`; `save_department` runs `require_pack` for those.
- **Core roles:** `owner` · `doctor` · `nurse` · `receptionist` · `technician`. Besides spec 01's
  actions they hold `read:patient` (all five), `write:patient` (receptionist, nurse, doctor),
  `write:visit` (receptionist, nurse, technician, doctor) and `mark:in_consult` (doctor, nurse).
  A pack ships the
  roles its screens need (`cashier`) and one role `pack:<key>` for its own user, holding
  `mark:held` and actions of its own types and steps only. `user_roles` exist only for kinds
  `staff`, `machine`, `pack` and `importer`, never on an outside department. A machine user
  holds `write:` actions in one department and writes only replies to requests sent there — or,
  in a `reception` department, holds `read:patient`, `read:queue` and `write:visit` there and on
  the departments it serves, and only opens visits, marks presence and reads the queue (a kiosk,
  a waiting-room board; spec 03).
- **`served_departments`** says whom a lab or a reception works for: the default provider in
  the picker, the queues a reception may read. A practice with one lab never touches it.

## Functions

```
save_…     save_department · save_service · save_user · save_role · save_template · save_organization_pack
retire_…   retire_department · retire_service · retire_role · retire_template · retire_organization_pack
read_…     read_organization (all a picker needs; read:organization, held by every built-in role)
           read_settings_changes (manage:organization) · read_to_review(organization_id, department_id null = mine)
invite     invite_user (public, gated) → one Edge Function → link_login (service_role) · create_organization (service_role)
gates      require_access(organization_id, action, patient_id, department_id) → the caller's users.id
           require_pack(organization_id, pack)
runner     core.next_pack_call · core.finish_pack_call (pack_runner only) · retry_pack_calls(organization_id, pack)
for packs  core.write_entry · core.change_request · core.record_settings_change · public read_… · public mark_…
```

Every `save_…` takes a client-minted UUIDv7 id and upserts on it (setup and imports are
re-runnable), takes the `settings_changes.id` the screen loaded and raises `changed_since_read`
when a newer one exists, requires `manage:<area>` (organization · departments · services ·
users · roles · templates), and writes one `settings_changes` row. `save_user` retires a person
(`retired_at` may be in the future) and returns `{open_assigned, to_review}` when it does.
`retire_department` is refused while the department has open requests, unreviewed results it
requested, or open visits, and deletes its `user_roles` and `served_departments` rows.
`services.department_id` may change; open requests keep their destination. `link_login` sets
`login_id` once, within an hour of `invited_at`; `save_user` never takes `login_id`.

## Access

- **Actions are rows,** shipped by migration; `role_actions.action` references them;
  `require_access` raises `unknown_action` on a key it does not know and runs `require_pack`
  when `actions.pack` is set. The client's `Action` type is generated from the table.
- **The gate** passes when the caller is an unretired (`retired_at IS NULL OR > now()`) users
  row of the organization holding the action through a role in that department or everywhere;
  `manage:` also needs MFA (`aal2`). `read:queue` and `write:visit` also pass on a department the
  caller's department serves; `read:queue` also passes on an outside department for anyone
  holding it in the organization.
- **Who is calling:** `current_user_id(organization_id)` is the users row with
  `login_id = auth.uid()`. It honours `opencare.acting_user_id` only when the session is not the
  API's `authenticator` and the named row is of kind `pack`: no client and no pack can act as a person.
- **The funnels gate pack callers themselves.** When `current_user` is a pack role,
  `core.write_entry` runs `require_access(…, 'write:' || type, …)` and `require_pack`, and the
  step path of `core.change_request` runs `require_access(…, 'mark:' || step, patient_id,
  to_department_id)`. A pack wrapper that forgets its gate is still refused.
- **Rights:** `save_role` and `save_user` refuse to touch the caller's own roles or a role the
  caller holds; a `manage:` action is granted, by edit or by assignment, only by someone who
  holds it, in a scope no wider than their own; built-in roles are read-only (copy to edit).
  `save_user` and `retire_role` take the organization lock and refuse `last_administrator`
  when no live, linked user would hold `manage:users` and `manage:roles` everywhere.
- **Record reads:** `read_record` inserts a `record_reads` row; the other record reads raise
  `record_not_open` without one in the last 12 hours. Kinds `staff`, `patient` and `proxy`
  only; machines, packs and importers read without opening and without a row.
- **After retirement** the gate refuses the next call; Realtime channels are private under one
  membership policy; files come only through `read_entry_file(entry_id, position)`, a 60 s URL.

## The admin's day

Six screens, all rows: **Organization** (packs, parked pack calls with Retry, settings
history), **Departments** (type, site, whom it serves), **Services** (fields, ranges, one slot
`servicesColumns` a pack fills: Billing's price is saved by `billing_save_…` after core's save
returns, recorded through `core.record_settings_change`), **Staff** (people, machines, roles
per department, invited and accepted times), **Roles** (built-in only in v1), **Templates**.
First run: `create_organization` → MFA → pick a preset (client data; each pack contributes its
fragment; the clinic preset ships `served_departments (reception, NULL)` and, with the Laboratory
pack, `(laboratory, NULL)`) → the client loops `save_…` with minted ids, so a dropped connection is re-run, not
repaired. Cover is membership: the night technician holds `technician` in the main lab too; the
request stays where it was sent and the reply says who did it. A department whose pack is off
shows the core request-queue screen until it is empty.

## Packs: the boundary Postgres enforces

- **One schema per pack**, named by its key, owned by a NOLOGIN role `pack_<key>` that owns
  every function and table the pack ships; every function is `security definer` with
  `search_path` pinned. A pack migration is `<timestamp>_<pack>_….sql`, begins with
  `SET ROLE pack_<key>`, contains no `ON CONFLICT`, and every registry row it inserts carries
  its key. No core migration depends on a pack migration. A pack schema is never dropped: a
  pack retires by retiring its types and being switched off per organization.
- **A pack role holds:** EXECUTE on `core.write_entry`, `core.change_request`,
  `core.record_settings_change`, the gates, and the public `read_…` and `mark_…` functions;
  ALL on its own schema; nothing else. No privilege on any core table (so not even a row
  lock), no USAGE on another schema (`net`, `extensions`, `vault`, `storage`, `auth`, `cron`,
  `realtime`, another pack), no advisory locks (EXECUTE on `pg_advisory_*` is revoked from
  PUBLIC), no TEMP, no CREATE on `public`, no role membership.
- **Two dispatches** are the only places core names pack code, and both check that the target
  is a `security definer` function owned by the pack's role before calling it: the updater,
  `format('%I.%I', coalesce(entry_types.pack, 'core'), 'update_' || list)`, inside the write
  under the patient lock (pure, O(rows), no waits, no clock; a failing pack updater fails
  writes of that pack's own types only, and `rebuild_record` replays each list in its own
  block and reports a failing one); and `<pack>.after_write(entry)`, from the runner only.
- **After the write.** `write_entry` inserts one `pack_calls` row per pack that is on for the
  organization, has `is_called_after_write`, and did not itself write the entry; a retry, a
  rebuild and a step insert none. The **runner** is one pg_cron job every 5 seconds, run as
  `pack_runner` under `statement_timeout 5 s` and `lock_timeout 2 s`, below the API's 8 s.
  Per row: `next_pack_call()` locks it, adds a try, returns the entry (or deletes the row when
  the entry is gone), commit; then `set_config('opencare.acting_user_id', <the organization's
  'pack:<pack>' user>)`, `<pack>.after_write(entry)` in an exception block, delete the row or
  write `error_text`, commit. Retry at `tried_at + 2^tries` minutes, capped at an hour; from
  five tries the row is **parked** and counted on the Organization page. A pack the organization
  has switched off is skipped. A watchdog ends a runner backend older than two minutes.
- **The contract of `after_write`:** at least once, so idempotent on `entry_id`; it makes the
  pack's data match the entry as it is now (live, replaced or struck), so order cannot matter;
  it may hold a request (`mark_step 'sent' → 'held'`) and, when the compare-and-set fails
  because the department already started, records that on its own side and does not raise; it
  raises only when what it needs is not there yet (`price_missing`), which keeps the row
  pending. It reacts to entries only, never to steps, and never writes a core type.
- **Holds.** `held` is a core step; `sent` is a legal target only from `held`. Billing holds
  seconds after the send; the cashier's `billing_mark_paid` releases (`mark:sent`).
  `retire_organization_pack` deletes the pack's pending rows, retires its user, and releases
  every request whose latest `held` step is that user's, with the caller as actor.
- **The client half:** `src/core`, `src/packs/<pack>`, one `src/packs/index.ts`; ESLint forbids
  core → pack and pack → pack imports; `servicesColumns` is the one slot; the core renderer
  draws every entry from `display_line` and `data.values`. Pack settings
  (`billing.service_prices`) live in the pack schema, keyed by core ids; core never joins them.

CI proves each promise with one test (appendix, section c): save time under hostile packs ·
poison row · kill mid-call · order · once · holds · grants · ownership and definer · doors ·
static scans of every core and pack body · rows only · hostile updater, including rebuild ·
client · fixture placement · rights · the tenant matrix over every public function and every id
parameter · public signatures only grow · pack lifecycle · actions match the client.

## Naming

Suffixes and abbreviations as spec 01. Words: organization · user · staff · role · action ·
department · site · section · service · served · pack · pack call · runner · hold · preset.
Not used in the schema: admin, org, practice, manifest, feed, starter, active, label,
permission, tenant, member, account, group, staff (as a table).

## Decisions taken

One type per department, queues derived from its services · presets as client data applied
by `save_…` · site as a label · MFA for every `manage:` action · holds trail the send ·
`ancillary` · `is_visited` · 12-hour record-open window · managed Supabase.

## Decide-now items (already reflected above)

`actions` as a table · built-in roles read-only · self-change and last-administrator rules ·
composite tenant keys on every link · client-minted ids on every `save_…` · global codes from
migrations only · one schema and one `security definer`-only role per pack · the funnels gate
pack callers · after-write through `pack_calls` and the runner, never in the write · `held` in
the core enum · `service_field_ranges` with the Laboratory pack · `department_types.retired_at`
and `is_visited` · migration-one revocations · MFA for `manage:` · the golden signatures file ·
the hostile fixture packs from day one.

## Written as rules now, built later

Custom roles and the role editor · patient and proxy users through `patient_access`, never
`user_roles` · machine logins with the first analyser · born-held requests
(`services.is_held_first`, additive) · restricted records and `record_reads.reason_text` · a
`sites` table when a site needs an address · a codes page · `erase_patient` telling packs ·
(`read_sent_outside` and visit queues landed in spec 03).

## Known limits

A pack updater runs inside the write, so a failing one fails the set it was saved in · a hold
trails the send by seconds · a pack that hangs holds one runner invocation for up to 55 s (the
cron job's `statement_timeout`; a timeout cannot be armed from inside a running call) and is
parked after five tries · on managed Supabase the migration runner is not a superuser, so the
advisory-lock revoke is a no-op and the runner timeout plus the static scan are the guard (B9), and a request already started is charged unpaid · settings rows are
saved whole (a stale save is refused, not merged) · one type per department · a site is a
label · no schedules: cover is membership · packs cannot depend on each other · an invitation proves control of a mailbox, nothing more ·
built-in roles change everywhere at once, by release.
