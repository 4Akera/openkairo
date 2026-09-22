# 06 · The pack contract

Status: **locked** · 2026-09-22 · consolidates the pack rules of 01, 02, 04 and 05 into one
page for the developer who writes a pack; it adds no rule the core specs do not already hold

## In one sentence

A pack is a guest with its own room and no keys: it ships kinds (types, department types,
actions, roles, screens), reacts to the record only after the commit, keeps its own data in its
own schema, and can be switched off without the record noticing.

## Seven rules

1. **Packs define kinds; organizations define instances.** A pack ships `laboratory` as a
   department type; the practice makes "Main Lab" and "ER Lab". A pack never inserts a
   department, a service or a user.
2. **A pack never alters core.** No core table, column, enum value (except a request step), type
   key or function changes because a pack exists. CI runs core alone, then core plus every pack,
   and diffs every core object.
3. **The record never runs a pack.** A pack hears about an entry through `pack_calls`, after the
   commit, with a timeout, as its own user. The one exception is the updater of the pack's own
   types, inside the pack's own writes, pure and O(rows).
4. **Postgres is the boundary.** One schema per pack, owned by a NOLOGIN role that can execute
   core's funnels and public reads and nothing else. A pack that tries to write a core table gets
   a permission error, not a code review.
5. **A pack's data is its own.** Charges, stock, pregnancies, prices: in `<pack>.*`, carrying
   `organization_id`, holding core ids with no foreign key, upgraded by the pack's own migrations.
6. **Off means quiet, never broken.** With the pack off its entries still render, trend and
   accept corrections; new ones are refused by `require_pack`; its schema is never dropped.
7. **Every promise is a CI test.** A pack merges only when the boundary tests below pass.

## What a pack ships

| Layer | Ships | Rule |
|---|---|---|
| Registry rows | `packs` (key, name, is_called_after_write) · `entry_types` · `department_types` · `actions` · `roles` + `role_actions` | Keys are `<key>_…` / `<key>:…`, permanent, never reused; every row carries `pack = '<key>'` |
| Request steps | `ALTER TYPE request_step ADD VALUE '<step>'`, one per file | Never a closing step: only a reply or a cancel ends a request |
| Schema `<key>` | its tables; `after_write(entry)`; `update_<list>(entry)` for a list it keeps; private helpers | Owned by role `pack_<key>`; every function `security definer`, `search_path` pinned |
| Public functions | `<key>_write_<type>` · `<key>_mark_<step>` · `<key>_read_…` · `<key>_save_…` (pack settings) | Thin: `require_access` + `require_pack`, shape `data`, call the funnel |
| Client `src/packs/<key>` | screens per department type · renderers per entry type · `servicesColumns` · the preset fragment · the `Action` keys it adds | Registered once in `src/packs/index.ts`; imports core, never another pack |

A pack that keeps no list and needs no reaction ships no schema functions at all — Cardiology is
registry rows, three write functions, a screen and an ECG renderer.

## The database side

```
supabase/migrations/<timestamp>_<key>_<what>.sql
  SET ROLE pack_<key>;                       -- first line; the role exists from core's migration
  create schema if not exists <key> authorization pack_<key>;
  create table <key>.service_prices (…organization_id…);
  create function <key>.after_write(entry core.entries) … security definer set search_path = '';
  insert into entry_types (key, name, pack, list) values ('<key>_…', …, '<key>', …);
  …
```

- **The role holds:** EXECUTE on `core.write_entry`, `core.change_request`,
  `core.record_settings_change`, the gates, and every public `read_…` and `mark_…`; ALL on its
  own schema. **Nothing else:** no privilege on any core table (not even a row lock), no USAGE on
  `auth`, `storage`, `realtime`, `cron`, `net`, `vault`, `extensions` or another pack's schema, no
  advisory locks, no TEMP, no CREATE on `public`, no role membership.
- **Migration rules:** no `ON CONFLICT` (a re-run is a failure, not a merge); no core migration
  depends on a pack migration; a pack's later migrations only add to its own schema and registry
  rows; `ADD VALUE` gets its own file. Retiring a type is `entry_types.retired_at`; a schema is
  never dropped.
- **Functions:** every public function starts with `require_access(organization_id, action,
  patient_id, department_id)` then `require_pack(organization_id, '<key>')`; the funnels re-check
  both when the caller is a pack role, so a wrapper that forgets is still refused.
- **Naming:** schema objects `<key>.thing`; public functions `<key>_verb_noun`; type keys
  `<key>_type`; actions `write:<key>_type`, `mark:<step>`; roles `<key>:role`.

## The two reactions (spec 01, restated)

| | `update_<list>(entry)` | `after_write(entry)` |
|---|---|---|
| For | a patient list the pack keeps (pregnancies) | the pack's own data (charges, stock) |
| When | inside the write, under the patient lock; on every rebuild | after commit, from the runner, 5 s timeout; never on rebuild |
| Must be | pure: entry + existing rows → rows; no clock, no settings, no waits, never raises for data it dislikes | idempotent on `entry_id`; makes its data match the entry as it is now (live, replaced, struck); raises only for "not yet" (`price_missing`) |
| May | — | read settings, call `mark_step` (a hold), write its own tables |
| On failure | that pack's own writes fail; core lists still rebuild | retried with back-off, parked after 5, shown on the Organization page |

A pack reacts to **entries only, never to steps**. It sees `replaces_id` and type
`entered_in_error`, so it voids and re-creates what it made from the old entry.

## The client side

- `src/packs/<key>/index.ts` exports `{ key, departmentScreens, renderers, servicesColumns,
  presetFragment, actions }`; `src/packs/index.ts` is the only place packs are named.
- A department screen receives `{ department, queue, openVisit, openRequest }` from the shell and
  calls core hooks (`useRecord`, `useQueue`, `writeSet`, `markStep`) — the same ones the core
  screens use. It never calls a pack's public function that is not its own.
- Renderers: `{ Card, Full, Editor }` per type; missing → core's fallback draws `display_line`,
  `values[]`, `text`, files.
- `servicesColumns`: one slot on the Services settings page; the pack's column saves through its
  own `<key>_save_…` after core's `save_service` returns.
- Preset fragment: rows for `save_…` (departments of its types, a starter service catalogue with
  fields, its roles' assignments) applied by the client with minted ids; never a migration.
- ESLint: `src/core` may not import `src/packs/*`; a pack may not import another pack.

## Lifecycle

| Moment | What happens |
|---|---|
| Release | the pack's migrations run in every database; empty tables and unused functions cost nothing |
| Enable | `save_organization_pack` → one `organization_packs` row; its department types, actions and screens appear; `rebuild_record` replays existing entries through its updater |
| Disable | `retire_organization_pack`: retires the row, deletes pending `pack_calls`, retires its user, releases holds it placed; departments of its types show the core request-queue screen until empty |
| Upgrade | the pack's own migrations, additive; a data-shape change bumps `schema_version` and the renderer reads both; old entries never migrate |
| Retire a type | `entry_types.retired_at`; it accepts only replacements from then on |
| Remove the pack | never: keys are permanent; the schema stays; the organization row is retired |

## The tests a pack must pass

Every one is a CI job in core that runs against every pack, plus the hostile fixture packs
that prove the boundary from the other side.

1. **Core alone.** Core migrations pass with zero packs; every core fixture renders.
2. **No core drift.** Core plus this pack: no core table, column, function, policy, grant or
   enum (except `request_step` values) differs from core alone.
3. **Ownership and definer.** Every object in `<key>` is owned by `pack_<key>`; every function is
   `security definer` with `search_path` pinned.
4. **Grants.** `pack_<key>` can execute exactly the funnels, gates and public reads/marks, and
   holds nothing on any core table or foreign schema.
5. **Static scan.** No pack body names a core table, `pg_advisory`, `SET ROLE`, `cron`, `net`, or
   `EXECUTE format` with a caller-supplied name.
6. **Doors.** Every public `<key>_…` function called cross-organization with every id parameter
   substituted (the tenant matrix) raises; called without the pack enabled raises `pack_off`.
7. **Off still renders.** Every fixture entry of the pack's types renders, trends and accepts a
   correction with the pack disabled.
8. **Updater purity.** `update_<list>` on the fixture set gives identical rows on replay, in any
   order of unrelated entries, with the clock frozen and settings altered.
9. **After-write contract.** `after_write` called twice for one entry changes nothing the
   second time; called for a replaced entry voids and re-creates; a raising or sleeping
   `after_write` (the hostile fixture) delays no `write_entry` by more than 0 ms and is parked
   after five tries.
10. **Signatures only grow.** The golden signatures file gains lines and never loses one.
11. **Actions match the client.** Every action the client names exists in `actions` with
    `pack = '<key>'`, and vice versa.
12. **Preset applies twice.** The preset fragment applied to a fresh organization and again
    changes nothing the second time.

## A pack, worked: Laboratory

Rows: `department_types laboratory`; steps `collected`, `received`, `verified`; `actions
mark:collected, mark:received, mark:verified`; `roles laboratory:technician`. No entry type of its
own: a specimen is a step's `changes {specimen_no}`, and a result is core's `result`.
Schema: `laboratory.specimens (organization_id, specimen_no, request_ids[], collected_at…)` and
`laboratory_mark_collected(request_ids[], specimen_no, occurred_at)`. No updater, no after_write.
Client: the bench screen (sections, buckets, one tube → many requests, the result grid over
core's `write_result`), a `servicesColumns` column for section. Preset fragment: a laboratory
department and a coded catalogue with fields. Core's `result` type does the rest.

## Checklist for a pack author

1. Pick a key; it is forever.
2. List the kinds: types, department types, steps, actions, roles.
3. Decide: do I keep a list (updater) or my own data (after_write) — or neither?
4. Write the migration in the shape above; run test 2 before writing a function.
5. Public functions: gate, `require_pack`, shape `data`, one display line, call the funnel.
6. Renderers for every type; the fallback must look acceptable before yours exists.
7. A screen per department type, built from core hooks.
8. Fixtures: three entries per type, one replaced, one struck, one with the pack off.
9. The preset fragment, applied twice.
10. Run the twelve tests; nothing else is reviewed until they pass.

## Decisions taken

One page, no new rules · a specimen is a step's `changes`, not an entry · pack public functions
are thin wrappers over the funnels · the preset fragment is client data · twelve tests as the
merge gate.

## Written as rules now, built later

Third-party packs (same contract, same tests; distribution is not designed) · a pack that
depends on another (forbidden until a real case appears) · pack-to-pack signals.

## Known limits

Packs cannot depend on each other · a pack cannot refuse a core write (a controlled-drug rule
is a warning in its screen, not a block) · a pack's reaction trails the write by seconds ·
one `after_write` per pack · a pack cannot add a column to a core settings page beyond the one
`servicesColumns` slot.
