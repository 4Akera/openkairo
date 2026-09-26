# 06 · The pack contract

Status: **locked** · 2026-09-22 · consolidates the pack rules of 01, 02, 04, 05 and 07 into one
page for the developer who writes a pack; it adds one rule of its own, the slot table (below) ·
amended 2026-09-25 (approved by the owner): core setup — place, person, pack; privacy in four rules ·
amended 2026-09-25 (approved by the owner): private notes; packs bring their own screens; ordering follows works for

## In one sentence

A pack is a guest with its own room and no keys: it ships kinds (entry types, steps, actions,
screens, tools, displays, starter setups, and roles only for narrower jobs), puts its screens and
writing tools only in the departments that choose it and its displays wherever the record is
read, reacts to the record only after the commit, keeps its own data in its own schema, and can
be switched off without the record noticing.

## Seven rules

1. **Packs define kinds; organizations define departments and choose where each pack is used.**
   A pack ships starter setups, never a department type; it never inserts a department, a
   service or a user. Laboratory ships the setup "Laboratory"; the practice makes "Main Lab" and
   "ER Lab" from it. Each is a department whose work is core's and fixed when it is made (desk ·
   visits · stays · bench · outside, spec 02), and whose packs used here (`departments.packs`)
   are its own list, changed on any day.
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
6. **Off means quiet, never broken.** With the pack off its screens, tools and displays go
   quiet, but its entries still render, trend and accept corrections; new ones are refused
   `pack_off`; its schema is never dropped. **Not used here means quiet too:** in a department
   that does not use the pack its screens and tools disappear and its writers refuse
   `not_used_here`; its displays stay and its entries render. Ordering is the exception: it
   follows works for, not packs used here (below).
7. **Every promise is a CI test.** A pack merges only when the boundary tests below pass.

## What a pack ships

| Layer | Ships | Rule |
|---|---|---|
| Registry rows | `packs` (key, name, `works`, is_called_after_write) · `entry_types`, each stating `is_note`, with `is_request` for a type ordered from anywhere, `answers` for a reply type and `follows` for a follow-up type (the `is_request` type whose order it follows up) · `actions` · `role_actions` giving its actions to core's built-in roles · `roles` only for a job narrower than any built-in role | Keys are `<key>_…`, permanent, never reused; every row carries `pack = '<key>'`; no `department_types` row |
| Actions | `write:<key>_<type>`, or `write:<key>_<thing>` for its own data (`write:billing_payment`) · `mark:<key>_<step>` · `read:<key>_<thing>` for its own screens and pages · `manage:<key>_<setting>` | `manage:` only on `<key>_save_…` doors, never for daily work. `write:<key>_<type>` (an entry writer) and `mark:<key>_<step>` are always department scope; only actions over the pack's own data (`write:<key>_<thing>`, `read:<key>_<thing>`) may state organization scope; `manage:` is always everywhere. An everywhere-scope action is given to no built-in role but the owner, which the trigger already does. The migration lint refuses any other scope and any such `role_actions` row |
| Request steps | `ALTER TYPE request_step ADD VALUE '<key>_<step>'`, one per file | Never a closing step: only a reply or a cancel ends a request |
| Schema `<key>` | its tables; `after_write(entry)`; `update_<list>(entry)` for a list it keeps; private helpers | Owned by role `pack_<key>`; every function `security definer`, `search_path` pinned; a table holding free text keeps `entry_id` |
| Public functions | `<key>_write_<type>` · `<key>_mark_<step>` · `<key>_read_…` · `<key>_save_…` (pack settings) | Thin: one gate (see *The database side*), shape `data`, call the funnel |
| Client `src/packs/<key>` | the manifest (`definePack`) · its own screens · registrations in the slots of the slot table · renderers per entry type · starter setups and use defaults · refusal words · the `Action` keys it adds | Registered once in `src/packs/index.ts`; imports core, never another pack |

A pack that keeps no list and needs no reaction ships no schema functions at all — Cardiology is
registry rows and codes, one write function, `/ecg` and an ECG renderer. It needs no department
of its own: a clinic that takes ECGs ticks cardiology.

## Writing tools follow the department; reading follows the record

Every slot a pack can fill has a fixed kind, set by core and not by the pack. A registration
carries only its pack; the slot decides the rest. This table, the slot table, is the only
statement of the rule. No slot adds rows, badges, columns, bands, keys, filters or sort options
to a default screen (Front desk, Queue, Bed board, Bench): a pack brings its own screens instead
(*The client side*). A pack's bench steps and words are its own work on requests of its types,
where the department uses it.

| Kind | Slots | Shown when | Server check |
|---|---|---|---|
| Department tool | commands, cards, reply forms, `registerBench` (steps, words), pack screens, visit actions, department settings, and the actions or `Writer` inside a side section or record view | the department's work is one the slot serves; the department uses the pack; the tool's actions are all allowed here (a screen: ticked on the Screens line and its `actions` allowed here for this person; each of its buttons shown only where its action is allowed) | `why_not` at this department, including used here |
| Order | a command writing an `is_request` type; a command or card writing a `follows` type on this department's own order | an order: a live service answering it works for this department; a follow-up: on this department's own orders of the type it follows; and the action is allowed here | `require_order`: the action at the writer's department, never used here there; for an order, `core.may_order(department, service)` (`not_served`, `not_orderable`, a service that is not live) and the pack used at the service's department (`not_used_there`); for a follow-up, the order its row names (`data.order_id`) is of the type it follows, for the same patient, not cancelled, and was placed from the writer's department (`request_not_found` otherwise) |
| Record display | banner items, side sections, record views, checks (warnings), key tests, entry, visit and patient prints | the pack is on and the reader may read the record (`read:record`). A section or view shows when the patient has entries of the pack's types, when its `when` holds, or when the department uses the pack | `begin_read` (either form); never used here |
| Render | renderers (`Card`, `Full`, `Print`) and the pack's card opened by Correct | always, whether the pack is on or off, used or not | a correction: `write:<type>` at the entry's department, skipping pack-on and used here |
| Organization | organization pages, pack settings, the services column, refusal words, starter setups | the pack is on and the organization action is allowed | the door's action and pack-on |

- **"Packs used here" is for the department doing the pack's own work:** its screens, its reply
  forms, its bench steps, its commands for its own entries. Reading is the record, read under the
  normal rules: read permission plus privacy (spec 07). In a dental clinic `/anc` is not listed
  and the server refuses it `not_used_here`, although the Doctor role holds obgyn's actions; the
  "Pregnant 28+3" banner and the `/rx` pregnancy warning still show there, because obgyn is on
  in the organization.
- **Ordering follows "works for".** If a department works for yours, you can order from it,
  whatever packs your department uses: a ward orders blood from the blood bank without using
  laboratory. **The bedside part goes with the order:** the department that placed an order may
  record the follow-up that belongs to it (the transfusion of the blood it ordered), checked
  against that order, again whatever packs it uses.
- **A pack adds nothing to a default screen:** no row badges, extra columns, bands, row keys,
  filter chips or sort options. Its marks on a patient (Isolation, Pregnant 28+3, NEWS 7) show in
  the patient's banner and record, and on that pack's own screens; never on the default lists,
  and never on another pack's screen (packs never read each other).
- **Each slot has default works**, which a registration may only narrow (core's commands serve
  visits, stays and bench).
- **Displays** each have a level, `alert` or `info`: the banner shows every alert and up to three
  infos, then "+N". Packs used here come first. Reads are one batched read per pack per screen,
  never one per row.
- Core applies the table in one place (`shown()`). A pack never tests pack-on or used here
  itself.

## The one permission function

A pack never writes its own permission test. It gives its actions to roles through registry
rows, and every gate asks one function (spec 02):

- **`core.why_not(user, org, action, department, correction default false, desk default
  false)`** answers one call: null means allowed, otherwise the reason. **`core.may(user, org,
  action, department)`** (the last two optional) lists what a person may do, and where. The gate
  (`require_access`), `core.can`, the live channels and the client's list (`me.departments`) are
  all built on these two, so anything shown is allowed. Used here is tested at the department
  asked about, never for an order or what goes with it: an order action (a `write:` of an
  `is_request` type) and a follow-up action (a `write:` of a `follows` type) are listed wherever
  the role holds them and the pack is on; `require_order` checks them against works for or
  against the order instead, and `begin_reply` checks a reply typed in for a request sent outside
  against its order.
- **Refusals** come in this order: `unknown_action`, `pack_off`, `not_a_member`, `mfa_required`,
  `department_missing`, `not_used_here`, `not_allowed`.
- **Roles decide what a person may do, never which tools a department shows.** A pack adds its
  actions to core's built-in roles (Doctor gets obgyn's write actions); that is safe because the
  gate also checks that the department uses the pack. A pack ships a role of its own only for a
  job narrower than any built-in role (`billing_cashier`, `inpatient_assistant`). `roles.pack`
  tags it, and it counts for nothing while the pack is off. A retired role counts for nothing
  anywhere.
- **Scopes.** Every action has a scope (`actions.scope`). A pack action takes its verb's default
  unless its row says otherwise: `write:` and `mark:` → department (a role held there, or held
  everywhere); `read:` → organization (any live role); `manage:` → everywhere (only a role held
  everywhere, with a second factor). An entry writer (`write:<key>_<type>`) and a step
  (`mark:<key>_<step>`) are always department scope; only an action over the pack's own data may
  state organization scope; `manage:` is always everywhere. No built-in role but the owner holds
  an everywhere-scope action.
- **Nothing widens.** The only reach beyond a person's own departments is a desk's: its staff may
  read the visit queue and move visits in the clinics it checks in for, and only through core's
  visit calls that ask for it (`desk := true`, spec 02); no pack door gets it. A desk's act for
  one of its clinics (bookings) is gated at the desk, `why_not(person, action, desk)`, so the
  desk must use the pack; it also needs `core.checks_in_for(desk, clinic)` and
  `core.require_used(clinic, pack)`. The clinic's own staff act at the clinic as usual.

### Which doors check used here

Only department-scope `write:` and `mark:` pack actions done by people, at the department doing
the pack's own work (its screens, its reply forms, its bench steps, its commands for its own
entries). The check runs through `require_write`, `begin_reply` (at the request's
to-department) and the step path. It never runs in:

- orders and what goes with them: `require_order` checks an order against works for (and the
  pack used at the service's department, `not_used_there`), and a follow-up against its order;
  a reply to a request sent outside, which the department that sent it types in, goes with the
  order too;
- reads, including `begin_read` in either form;
- updaters and `after_write`;
- calls by the pack's own user;
- corrections.

K1's static scan fails a function that calls both `begin_read` and `require_used`.

## The database side

```
supabase/migrations/<timestamp>_<key>_<what>.sql
  -- 1. registry rows, as the migration owner (the pack role holds nothing on core tables)
  insert into core.packs (key, name, works, is_called_after_write) values ('<key>', …, '{visits}', false);
  insert into core.entry_types (key, name, pack, is_note, …) values ('<key>_…', …, '<key>', false, …);
  insert into core.actions (key, pack) values ('write:<key>_…', '<key>');   -- then role_actions
  -- 2. its role and its schema (from K2 on)
  select core.create_pack_role('<key>');
  -- 3. its objects, as its role
  set role pack_<key>;
  create table <key>.service_prices (…organization_id…);
  create function <key>.after_write(entry core.entries) … security definer set search_path = '';
  reset role;
  -- 4. thin public doors, each granted to authenticated
  create function public.<key>_write_…(…) …;
```

- **The role holds:** EXECUTE on `core.write_entry` and `core.change_request` (the invoker
  entries, and their bodies, which refuse a call not made through the entry),
  `core.record_settings_change`, the gates and helpers (`core.why_not`, `core.may` and
  `core.release_hold` among them), and every public `read_…` and `mark_…`; ALL on its own
  schema. **Nothing else:** no privilege on any core table (not even a row lock), no USAGE on
  `auth`, `storage`, `realtime`, `cron`, `net`, `vault`, `extensions` or another pack's schema, no
  advisory locks, no TEMP, no CREATE on `public`, no role membership.
- **The pack's user:** each enabled pack has one user holding `pack_<key>`. It acts only from the
  runner and is gated at the funnels; it skips used here, never pack-on. It may hold a request.
  `core.release_hold(request_id)` moves held → sent only when this pack's own user placed the
  hold, and records the calling person as the actor. Any other request move made from pack code
  for a person is re-gated by the funnel as that person (below).
- **Migration rules:** no `ON CONFLICT` (a re-run is a failure, not a merge); no `department_types`
  row; no core migration depends on a pack migration; a pack's later migrations only add to its
  own schema and registry rows; `ADD VALUE` gets its own file. Retiring a type is
  `entry_types.retired_at`; a schema is never dropped.
- **Gates:** every public function starts with one gate, and every gate asks `core.why_not`:
  - `core.require_write` for a writer (a correction when `replaces_id` is set);
  - `core.require_order` for an order and for its follow-up: the action at the writer's
    department, never used here there. An order (an `is_request` type) also needs
    `core.may_order` for the service and the pack used at the service's department. A follow-up
    (a `follows` type) names its order in `data.order_id`, which `write_entry` checks on every
    write of that type, a correction included (a correction keeps it, `reply_mismatch`
    otherwise): the order's type, patient, not cancelled, placed from the writer's department
    (for an order written in a stay, the stay's department now: a transfer carries the stay's
    orders, spec 08 K4). A follow-up never carries `reply_to_id`;
  - `core.begin_reply` for a reply, at the request's to-department (a request sent outside
    gates at the from-department, with source `outside`, and goes with the order: no used here
    there). It returns the reply's department, and the door writes with it: the to-department,
    or the from-department for a request sent outside. `write_entry` refuses `wrong_department`
    for a reply naming any other;
  - `core.begin_read` for a read, of one patient or of a list.

  A `<key>_save_…` door checks its `manage:` action, and calls `core.require_used(department,
  pack)` when it writes rows per department.
- **The funnels re-check.** `core.write_entry` and `core.change_request` are `security invoker`
  entries over `security definer` bodies, so the body knows the role that called (spec 02).
  When a pack door calls for a person, the funnel re-runs the gate the door should have run,
  chosen from the row, not from the door: a correction → `write:<type>` at the original's
  department, skipping pack-on and used-here; a reply → `begin_reply`'s rule; an `is_request`
  or a `follows` type → `require_order`'s rule (a follow-up against the order its
  `data.order_id` names); otherwise `write:<type>` or `mark:<step>` at the entry's department
  or the request's to-department, used-here included. A door that forgets its gate is still
  refused.
- **Naming:** schema objects `<key>.thing`; public functions `<key>_verb_noun`; type keys
  `<key>_<type>`; steps `<key>_<step>`; actions as in *What a pack ships*; roles `<key>_<role>`;
  the pack user's role `pack_<key>`.

## The two reactions (spec 01, restated)

| | `update_<list>(entry)` | `after_write(entry)` |
|---|---|---|
| For | a patient list the pack keeps (pregnancies) | the pack's own data (charges, stock) |
| When | inside the write, under the patient lock; on every rebuild | after commit, from the runner, 5 s timeout; never on rebuild |
| Must be | pure: entry + existing rows → rows; no clock, no settings, no waits, never raises for data it dislikes | idempotent on `entry_id`; makes its data match the entry as it is now (live, replaced, struck); raises only for "not yet" (`price_missing`) |
| May | — | read settings, call `mark_step` (a hold), write its own tables |
| On failure | that pack's own writes fail; core lists still rebuild | retried with back-off, parked after 5, shown on the Packs page |

A pack reacts to **entries only, never to steps**. It sees `replaces_id` and type
`entered_in_error`, so it voids and re-creates what it made from the old entry.

## The client side

Every registration fills a slot of the table in *Writing tools follow the department; reading
follows the record*. That table, not the pack, decides where it shows.

- **The manifest.** `src/packs/<key>/index.ts` calls `definePack({ key, name, actions, usedBy })`,
  which stamps `pack` on every registration it returns. `usedBy` names the works whose
  departments are pre-ticked when the pack is turned on; it lies within `packs.works`.
  `src/packs/index.ts` is the only place packs are named.
- **The default screen.** Every department has one, core's, decided by what it does: Front desk
  (desk), Queue (visits), Bed board (stays) or Bench (bench); outside has none. Its actions are
  the department's basic work: check in, call, see, Done, admit, move, transfer, discharge,
  collect, release. A pack adds nothing to it.
- **Each specialty pack brings its own screens:** full screens designed for that work, with
  their own layout. `registerDepartmentScreen({ works, key, label, actions, Screen })` registers
  one for the works it serves; `actions` are what the screen needs to work, and it shows to a
  person only where they hold them all. Chronic care (IM): today's diabetic and hypertensive patients with last
  HbA1c, blood pressure and trend, reviews due or overdue, one-key review (listed through core's
  read that finds a clinic's patients by problem, spec 08). Emergency: the track board by triage
  level with fast buttons. Obgyn: the labour board. Critical: the ICU hourly chart. Inpatient:
  the drug round. Dental: the tooth chart.
- A pack screen receives `{ department, queue, openVisit, openRequest }` from the shell and acts
  only through core's actions and the pack's own: core hooks (`useRecord`, `useQueue`,
  `writeSet`, `markStep`) — the same ones the core screens use — and its own doors, so every rule
  still holds. It never calls another pack's function and never shows another pack's marks.
- **A pack screen can replace the default screen**, with whatever actions it has. Turning the
  pack on for the department means agreeing to what its screen does. The basic actions are never
  truly lost: they also live on the patient's own visit screen, the default screen can be ticked
  back on at any time, and it comes back by itself when the pack is turned off.
- **The Screens line** in the department's settings (spec 02, spec 05): ☑ **Default screen** (it
  can be unticked only while a pack screen is ticked), ☑ each screen of the packs used there,
  and **Opens on** (which screen opens first). Only one pack screen can replace the default in a
  department; other pack screens are tabs.
- **Never without a screen.** If the pack is turned off, unticked in the department, or its
  screen unticked, the default screen comes back by itself, and it shows to a person who may not
  use the screen that replaced it (who does not hold its `actions` there). A desk's machine user
  always gets the board view.
- **Pages.** `registerOrganizationPage` draws `/p/<pack>/<page>`, in the shell menu, gated by an
  organization action. Work in one department is a pack screen, not a page.
- **Renderers:** `{ Card, Full, Print }` per type; missing → core's fallback draws
  `display_line`, `values[]`, `text`, files. They draw whether the pack is on or off, used or not.
- **Composer commands:** `registerCommand({ name, label, example, works, actions, pack, parse,
  empty })` adds `/name` to the composer for the pack's own types. `actions` lists every action
  its drafts need, at least one of them the pack's own. It is listed where the department's work
  is in `works`, the department uses the pack, and every action is allowed there. An order (a
  command writing an `is_request` type) is listed instead wherever a live service answering it
  works for the department and its actions are allowed there, and a follow-up command on the
  department's own orders of the type it follows. A name that is taken is refused. A
  pack never gives a core command or a core card its own version: it adds its own under a new
  name. `registerCard({ function, Editor, line, pack })` draws the card for the pack's own write
  function. A draft may carry `after` from a fixed core list (`mark_visit_priority`), run after
  `write_set` the way `mark_visit` is.
- **Replies and the bench:** a pack's reply type says what it answers (`entry_types.answers`,
  e.g. the pharmacy's dispense answers `prescription`); core routes a sent prescription by the
  department's `send_to`, worked out on the server, and never names the pack. A reply form may
  offer a one-click bench release (`quick: 'Give all'`, written from `toWrite(request,
  undefined)`). `registerBench({ steps, words, for: { replyTypes, requestTypes } })` names a
  pack's bench steps and segment words; a bench that mixes packs shows neutral words. The core
  bench stays neutral: scan, to do · in progress · done today, one row per patient. A service
  whose requests Send creates (its reply type answers `prescription`) is never ordered by hand:
  `/order` does not offer it and `write_request` refuses it `not_orderable`.
- **Follow-ups:** the bedside part goes with the order. A type that records the follow-up of an
  order says so in its registry row, `follows` (`laboratory_blood_given` follows
  `laboratory_blood_request`); the client reads it from `read_organization`. The department that
  placed the order records it on that order, named in `data.order_id` (never `reply_to_id`, which
  would fold it into the order as a reply), gated by `require_order` against the order, whatever
  packs it uses. Bench steps are never follow-ups: they belong to the department doing the work.
- **Settings:** `registerPackSettings({ Panel })` under the pack's card on Settings → Packs;
  `registerDepartmentSettings({ works, Panel })` under the department's pack chip, saving through
  a `<key>_save_…` door that calls `core.require_used`; `registerServicesColumn({ for: 'all' |
  'departments using' })`, whose column saves through the pack's own `<key>_save_…` after core's
  `save_service` returns.
- **Starter setups** are client data, never a migration. `registerStarterSetup({ key, name, work,
  rules, screens, beds, services, serves })` holds a work, the pack itself, rules, a Screens line
  (which of the pack's screens are ticked, whether the default stays, and which opens first),
  beds or places, services, and whom it works for. Core's saves apply it in one of two ways:
  - **New department:** a fresh id and the name the administrator types.
  - **Add to this department:** ticks the pack and adds only what is missing. Services match on
    code and beds on name. Nothing is overwritten, and the result says "kept yours: cbc".

  A setup never names another pack and never assigns roles. `registerUseDefaults({ work,
  services })` says what the pack adds to any department of that work when the department starts
  using it, applied the Add way (inpatient adds a Medicine doses service to stays). The seeds
  apply the same setups through `scripts/starter-sql.ts`.
- **Lookups:** department tools by the department's work, `dept.packs` and `dept.can`; screens by
  the same and the department's Screens line; record displays by the packs that are on and the
  reader's read right; renderers always. `dept.can` reads `me.departments`, which the server
  built with `core.may`.
- ESLint: `src/core` may not import `src/packs/*`; a pack may not import another pack.

## Privacy for packs

Hide the story, never the fact (spec 07). A note is private when it is written in a private
department, or when a clinician makes it private while writing it (`!` at the start of the line,
or Private on its card); later its author or anyone who works in its department can make it
private or not private (not private needs a reason, and every change is logged). A private note
is read by the people who work in the department where it was written, its author and its
responsible clinician; one that answers a request, also by whoever asked and the people who work
in the asking department. Everyone else sees *Private note* (or *Private reply*): no text, no
author. A note keeps its department for ever. Everything else shows: visits, dates, department
names, clinicians, medicines, results, problems, allergies, vitals and requests. The test is per
note, `core.note_hidden`. A pack keeps to the same test:

- **Every entry type states `is_note`** (the lint fails a row that leaves it out). A pack's note
  written in a private department is private, and its writer can make it private like any note:
  core reads `!` at the start of every line and draws the Private tick on every note card, a
  pack's included; a pack never draws its own. Only the notes of a line become private, never a
  fact. A type that holds both story and fact is split: psychiatry's risk is two entries,
  `psychiatry_risk` (the level, not a note) and `psychiatry_risk_note` (the text, a note),
  written by one command in one Done. There is no special masking.
- **A note type keeps no list** (a check refuses `is_note` with `list` or `pack_list`).
- **Banner items are the record:** they need `read:record` and show in the patient's banner and
  record, never on a default screen (the Front desk's card included) and never on another pack's
  screen.
- **Pack reads go through `begin_read`**, in either form, which returns the hidden entry ids. A
  pack table holding free text keeps `entry_id`, and its read masks a row when its entry is
  hidden, as core masks a hidden note. A list read returns rows only for the patients
  `begin_read` kept; masking by hidden ids alone is not enough. A note can be made private or not
  private after it is signed, so a pack never keeps its own copy of a note's privacy: it asks at
  every read.
- **Files** on a pack entry sit in a private bucket with no storage policy for `authenticated`;
  one Edge Function signs a path for 60 s only after `read_entry_file` has passed `note_hidden`
  and `require_open` as the user (spec 02); a note type never carries an outside URL.
- **Prints** draw only what the reads returned, under the organization and the site; exports and
  claims carry no note text.
- **The after-write fan-out** never sends a private note to a pack that is not used in the
  department where the note was written. `call_types` NULL means every non-note type.
- **Corrections:** a private note is corrected or struck only by its author or someone who works
  in its department (spec 07); a correction of a private note is private; a correction keeps its
  original's visit, department and `reply_to_id` (`reply_mismatch`).
- A pack's user, like a machine or an importer, cannot open private notes anyway and never works
  in a department, whatever role it holds there (spec 02).

## Lifecycle

| Moment | What happens |
|---|---|
| Release | the pack's migrations run in every database; empty tables and unused functions cost nothing |
| Enable | `save_organization_pack` → one `organization_packs` row; its card asks which departments use it (chips pre-ticked from `usedBy`), offers its starter setups, and lists the clinic's own roles to give its actions to; one Save calls `save_department` once per department, and nothing is ticked at run time; its displays appear, and its screens and tools where it is used; `rebuild_record` replays existing entries through its updater |
| Use here | `save_department(…, packs)` ticks it for a department whose work is in `packs.works` (`not_for_this_work`); its use defaults add what is missing; its screens join the department's Screens line. Unticking is refused `pack_in_use` while the department owns live services answered by its types or has open requests of its types addressed to it; once unticked, the default screen comes back by itself if its screen had replaced it |
| Disable | `retire_organization_pack`: retires the row, deletes pending `pack_calls`, retires its user, releases holds it placed; departments keep their ticks; its screens, tools, displays and roles go quiet; where its screen had replaced the default screen, the default comes back by itself; its entries render |
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
   `EXECUTE format` with a caller-supplied name; no function calls both `begin_read` and
   `require_used`. The migration lint: no `department_types` row; every `entry_types` row states
   `is_note`; a `manage:` action is checked only by `<key>_save_…` doors; an action's scope is one
   its form allows; no `role_actions` row gives an everywhere-scope action to a built-in role.
6. **Doors.** Every public `<key>_…` function called cross-organization with every id parameter
   substituted (the tenant matrix) raises; called without the pack enabled raises `pack_off`,
   except a writer door called with `replaces_id` of a live entry of its type (a correction),
   which passes (test 7).
   Each door has a privacy sample: a private note-type row, read by someone who does not work in
   the department where it was written, shows no text; and a patient the list form did not keep,
   with a private pack note, gets no row back.
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
    `pack = '<key>'`, and vice versa. Every registration carries its pack; `usedBy` lies within
    `packs.works`; a command lists at least one of the pack's own actions, and its `actions`
    cover every function its parser can emit.
12. **Starter setups apply cleanly.** A starter setup added to the same department twice changes
    nothing and keeps the administrator's edits; created new twice, there are two departments.
13. **Not used here.** For each work, the fixture has one department using every pack made for
    that work and one using none. For every door, at a department that
    does not use the pack: writers, steps and replies refuse `not_used_here`; ordering doors pass
    where a live service answering the order works for the department, and a follow-up passes on
    the department's own order (and is refused on another department's); reads, banner items and
    `after_write` still work; a correction passes; the pack's user passes; `me.departments`
    agrees with `why_not` for every pack action, and at a department not using the pack it lists
    the pack's order and follow-up actions and no other department-scope pack action. On the
    client, `shown()` hides every screen and tool of the pack there and keeps its displays and
    renderers; a department whose pack screen replaced the default screen gets the default back
    when the pack is unticked there, turned off, or its screen unticked; and a person without the
    replacing screen's `actions` there, and the desk's machine user, get the default screen.

## A pack, worked: Laboratory

Rows: `packs laboratory` with `works {bench}`; steps `laboratory_collected`,
`laboratory_received`; actions `mark:laboratory_collected`, `mark:laboratory_received`, given to
core's Technician and Nurse through the pack's own `role_actions` rows. No role of its own and no
department type. No entry type of its own: a specimen is a step's `changes {specimen_no}`, and a
result is core's `result`.
Schema: `laboratory.specimens (organization_id, specimen_no, request_ids[], collected_at…)` and
`laboratory_mark_collected(request_ids[], specimen_no, occurred_at)`, gated at each request's
to-department, so a department that does not use laboratory is refused `not_used_here`. No
updater, no after_write.
Client: `registerBench` for its steps and words on its own requests (no screen of its own; one
tube → many requests; results through core's `write_result`); a services column for tube and
section. Starter setup "Laboratory" (bench · laboratory · works for Every · a coded catalogue
with fields); a lab that already exists starts using the pack through Add to this department.
Ordering follows works for: the clinics and wards the lab works for order from it with core's
`/order`, whatever packs they use. Core's `result` type does the rest.

## Checklist for a pack author

1. Pick a key; it is forever.
2. List the kinds: entry types (each with `is_note`), steps, actions, the works it is made for,
   starter setups; a role only for a job narrower than any built-in role.
3. Decide: do I keep a list (updater) or my own data (after_write) — or neither?
4. Write the migration in the shape above; run test 2 before writing a function.
5. Public functions: the right gate (write, order or follow-up, reply, read), shape `data`, one
   display line, call the funnel.
6. Renderers for every type; the fallback must look acceptable before yours exists.
7. Tools for the works you serve, in the slots of the slot table; your own screens, built from
   core hooks and acting only through core's actions and yours; nothing added to a default
   screen.
8. Fixtures: three entries per type, one replaced, one struck, one with the pack off.
9. Starter setups: added twice to one department, and created new twice.
10. Run the thirteen tests; nothing else is reviewed until they pass.

## Decisions taken

One page; its one rule of its own is the slot table · a specimen is a step's `changes`, not an
entry · pack public functions are thin wrappers over the funnels · starter setups are client
data; a department chooses its packs · writing tools follow the department, reading follows the
record · a pack brings its own screens and adds nothing to a default screen; one pack screen may
replace it, with whatever actions it has · ordering follows works for, and the follow-up goes
with the order · one permission function, which no pack repeats · every pack entry type states
`is_note`, and a pack's note is private like core's · thirteen tests as the merge gate.

## Written as rules now, built later

Third-party packs (same contract, same tests; distribution is not designed) · a pack that
depends on another (forbidden until a real case appears) · pack-to-pack signals · a pack's own
answer to "still in use here?" (`<key>.in_use`) before a department unticks it.

## Known limits

Packs cannot depend on each other · a pack cannot refuse a core write (a controlled-drug rule
is a warning in its screen, not a block) · a pack's reaction trails the write by seconds ·
one `after_write` per pack · a pack adds to the patient's screens only through the slots in the
slot table, and nothing to a default screen · a pack never gives a core command or card its own
version · a pack's marks show on its own screens, never on another pack's.
