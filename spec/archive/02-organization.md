# 02 · The organization

Status: **locked** · 2026-09-22 · amended 2026-09-22 (spec 03): `write:visit` passes on served departments; four actions on the built-in roles; the reception machine exception; `retire_department` refuses open visits; `sex` carries `other`; the sweep in `cron.job` · amends 01: the after-write call leaves `write_entry` (appendix, section h) · amended 2026-09-25 (approved by the owner): core setup — place, person, pack; privacy in four rules · amended 2026-09-25 (approved by the owner): private notes; packs bring their own screens; ordering follows works for
Full reasoning, invariants and break-test decisions: [02-organization.appendix.md](02-organization.appendix.md)

## In one sentence

An organization is people, departments and services described in rows; a person does what
their roles allow, where they hold them; and a pack is a schema of its own that reads the
record and is never run by it.

- A **user** is anyone or anything that writes: staff, machine, pack, patient, proxy, importer.
- A **role** is a named set of **actions** (`write:note`, `mark:collected`, `read:queue`,
  `manage:services`). A user holds a role in one department or everywhere. Roles decide what a
  person may do, never which tools a department shows.
- A **department** does one kind of **work** (desk · visits · stays · bench · outside), fixed
  when it is made; its work picks its default screen and its settings; it lists the packs it
  uses. A site is a label on a department.
- A **pack** is switched on per organization, keeps its tables in its own schema, and hears
  about the record only after a write has committed. Its screens and writing tools show only in
  the departments that use it; its entries and displays show wherever the record is read.

## Seven rules

1. **Settings are rows.** A new lab, a role, a site, a pack for one practice: rows, no deploy.
2. **One gate.** Every public function starts with `require_access(organization_id, action,
   patient_id, department_id)`; organization and department come from the row being touched.
   The gate, `core.can`, the live channels and the client's list are one function,
   `core.why_not`, over `core.may`: anything shown is allowed.
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
| People and rights | `users` · `roles` · `role_actions` · `user_roles` · `actions` | Users and roles are retired, never deleted — except a mistake nothing ever used (amended 2026-09-24, below); a link row is deleted, and the deletion is a `settings_changes` row |
| Places and work | `departments` · `department_types` · `served_departments` · `services` · `service_fields` · `service_field_ranges` · `codes` · `templates` · `beds` (spec 08 K18) | Settings (spec 01): retired, never deleted; history never depends on them |
| Packs | `packs` · `organization_packs` · `entry_types` | Shipped by migration; switched on per organization; used per department (`departments.packs`) |
| Audit | `settings_changes` · `record_reads` · `note_privacy` (spec 07) | Insert-only; a trigger refuses update and delete |
| Pack work | `pack_calls` | One row per (pack, entry) from the write until the pack has reacted; then deleted |
| A pack's own | every table in schema `<pack>` | Mutable; carries `organization_id`; holds core ids with no foreign key |

```
organizations      id · name · created_at
users              id · organization_id · kind (staff | machine | pack | patient | proxy | importer)
                   name · title · login_id null · invited_at · accepted_at · retired_at
roles              id · organization_id null (NULL = built-in, read-only) · key · name · pack null (a pack's narrower job) · retired_at
actions            key ('<verb>:<noun>', verb = write | mark | read | manage) · pack null · scope (department | organization | everywhere)
role_actions       role_id · action
user_roles         organization_id · user_id · role_id · department_id null (NULL = everywhere)
department_types   key · name · work (desk | visits | stays | bench | outside) · pack null (old pack types, all retired) · is_visited · retired_at
departments        id · organization_id · type · name · site_name null · is_outside · contact_text · packs text[] · retired_at
                   screens text[] (the Screens line: `default` and each ticked pack screen) · opens_on (one of screens)
                   rules (spec 07): patients_wait · review_results · is_private (a private department; was private_visits) · after_done
served_departments department_id · served_department_id null (a desk: the clinics it checks in for · a department with services: whom it works for; NULL = every)
services           id · organization_id · department_id null (NULL = outside on old rows; no longer written) · section_name · code · name · reply_type · retired_at
service_field_ranges  service_id · position · sex · age_low · age_high · reference_low/high · critical_low/high
templates          id · organization_id · department_id null · user_id null · name · items · retired_at
beds               id · organization_id · department_id (stays; or visits, shown as places) · name · bay_name null · position · is_side_room · state · retired_at
packs              key · name · works text[] · is_called_after_write
organization_packs organization_id · pack · retired_at
settings_changes   id · organization_id · user_id · table_name · row_id · changes · recorded_at
record_reads       organization_id · user_id · patient_id · department_id · basis · reason_text null · opened_department_id null · read_at   (spec 07)
note_privacy       organization_id · entry_id (the note's first version: one row covers every version) · patient_id · department_id · is_private · reason_text null · changed_by · changed_at   (spec 07)
pack_calls         pack · entry_id · organization_id · recorded_at · tries · tried_at · error_text    pk (pack, entry_id)
service_fields · codes · entry_types                                          as in spec 01
```

- **Keys** (`roles`, `actions`, `department_types`, `packs`) are never renamed or reused; nor
  are the five works.
- **Composite tenant foreign keys** carry `organization_id` on every link (`user_roles`,
  `served_departments`, `services`, `templates`; `entries.department_id`, `author_id`,
  `responsible_id`; `requests.assignee_id`). A built-in role passes.
- **Unique while live:** `services (organization_id, department_id, code)`; `users
  (organization_id, login_id)`; a `site_name` differing only by case or whitespace is refused.
  A global `codes` row (`organization_id IS NULL`) is written only by a `_core_` migration;
  `save_service` refuses a code that is neither global nor the organization's own.
- **Work.** Every department does one kind of work, fixed when it is made (a change is refused
  `work_fixed`):

  | Work | On screen | Core type |
  |---|---|---|
  | desk | Front desk | `reception` |
  | visits | Clinic | `clinic` |
  | stays | Ward | `ward` |
  | bench | Lab, X-ray or pharmacy (also theatre, blood bank, PFT, physiotherapy) | `ancillary` |
  | outside | Outside | `outside` |

  The work is stored once, on the core department type: one live core type per work. Pack
  department types are retired; a pack ships starter setups instead. Code tests the work, never a
  type key. `is_visited` (desk, visits, stays) and `is_outside` stay as columns, checked against
  the work. The work decides the default screen, which settings a department shows (Settings by
  work, below), what serving means, and how visits open (spec 03): desk and visits at Here, stays
  only by admission, bench and outside never.
- **Outside is one thing:** a department whose work is outside, created on first use. Nobody
  holds a role there, no pack is used there, it is in no picker, and it only receives requests;
  the sender types their replies in (source `outside`).
- **Beds** belong to stays departments. The same rows, called **places** on screen, may belong to
  a visits department (ER cubicles, dialysis chairs). One live visit per bed or place (spec 08 K18).
- **Packs used here.** `departments.packs` lists the packs a department uses. A pack must be on
  in the organization (`pack_off`) and made for the department's work (`packs.works`,
  `not_for_this_work`). Unticking a pack is refused `pack_in_use`, with counts, while the
  department owns live services answered by the pack's types or has open requests of its types
  addressed to it. Switching a pack off for the organization keeps the ticks: its screens, tools
  and displays go quiet, and its entries still render. The rows are the only truth; nothing is
  ticked at run time. Packs used here is for the department doing the pack's own work: its
  screens, its reply forms, its bench steps, its commands for its own entries. Ordering needs
  none of it (Checks in for, works for, below).
- **A service is live** when it is not retired and, if its reply type belongs to a pack, that
  pack is on and used at the service's department (or the department is outside). Send, `/order`,
  `write_request` and `read_organization` use only live services (`core.service_live`).
- **Screens.** Every department has one **default screen**, decided by its work: Front desk
  (desk), Queue (visits), Bed board (stays), Bench (bench); outside has none. Its actions are the
  department's basic work: check in, call, see, Done, admit, move, transfer, discharge, collect,
  release. Packs add nothing to it: no badges, columns, bands, keys, filters or sort orders.
  **Each specialty pack brings its own screens**, full screens designed for that work, with their
  own layout (chronic care's diabetic and hypertensive patients with their reviews due, the
  emergency track board, the labour board, the ICU hourly chart, the drug round, the tooth chart).
  They act only through core's actions and the pack's own, so every rule still holds, and they
  show only in a department that uses the pack. **A pack screen can replace the default screen**,
  with whatever actions it has: turning the pack on for the department means agreeing to what its
  screen does. Only one pack screen replaces the default in a department; other pack screens are
  tabs. The basic actions are never truly lost: they also live on the patient's own visit screen,
  and the default screen can be ticked back on at any time. **Never without a screen:** when the
  pack is switched off or no longer used there, or its screen is unticked, the default screen
  comes back by itself. A pack's marks on a patient (Isolation, Pregnant 28+3, NEWS 7) show in the
  patient's banner and record and on that pack's own screens, never on the default screen's lists
  and never on another pack's screen. The cashier is a desk that uses billing, not a sixth kind of
  work.
- **Starter setups** are client data, shipped by core or by a pack: a work, the pack itself,
  rules, its screens (which are ticked, which opens first), beds or places, services and
  works-for. **New department** makes a fresh id with the name the administrator types. **Add to
  this department** ticks the pack and adds only what is missing: services match on code and beds
  on name, nothing is overwritten, and the result says "kept yours: cbc". A setup never names another pack and never assigns roles. A pack
  may also declare **use defaults**: what it adds to any department of a work when that
  department starts using it.
- **Core roles:** `owner` · `doctor` · `nurse` · `receptionist` · `technician`. Besides spec 01's
  actions they hold `read:patient` (all five), `write:patient` (receptionist, nurse, doctor),
  `write:visit` (receptionist, nurse, technician, doctor), `write:paper_request` (receptionist;
  spec 05) and `mark:in_consult` (doctor, nurse).
  A role is a job title with a list of actions, given to a person everywhere or in one
  department. Built-in roles are read-only; a clinic copies one to make its own, with no link
  back. A copy of a pack role keeps its `pack`, so it too counts for nothing while the pack is
  off. A pack adds its actions to the built-in roles through its own registry rows (Doctor gets
  obgyn's write actions); that is safe because the gate also checks that the department uses the
  pack. A pack ships a role only for a job narrower than any built-in role (`billing_cashier`),
  and one role `pack_<key>` for its own user, holding `mark:held` and actions of its own types
  and steps only. A retired role counts for nothing anywhere, and so does a pack role whose pack
  is off. `user_roles` exist only for kinds `staff`, `machine`, `pack` and `importer`, never on an
  outside department (`outside_department`). A machine user holds `write:` actions in one
  department and writes only replies to requests sent there — or, at a desk, holds
  `read:patient`, `read:queue` and `write:visit` there and in the clinics that desk checks in
  for, and only opens visits, marks presence and reads the queue (a kiosk, a waiting-room board;
  spec 03).
- **Checks in for, works for.** `served_departments` has one meaning for each kind of work, and
  no rows never means every:
  - **A desk checks in for** visits departments: chosen ones, or Every (the NULL row: every live
    visits department). No rows means none. Any other target is refused `not_a_clinic`.
  - **A department that owns live services works for** chosen departments, or Every. No rows
    means only itself. A department may always order its own services, except those whose reply
    type answers something; Send creates those (`not_orderable`).
  - **Routing.** When several services match, one order decides, the same in client and server:
    its own service › a service whose department names this one › one at the same site › Every.
    A tie asks (`choose_service`). The server works this out (`core.may_order`) and returns
    `send_to` and `orders_from` for each department.
  - A new department starts with Every, except a stays department: its services serve only itself.
  - **Ordering follows works for.** If a department works for yours, you can order from it,
    whatever packs your department uses. **The bedside part goes with the order:** the department
    that placed an order may record the follow-up that belongs to it, like the transfusion of the
    blood it ordered, checked against that order (Access, below).
  - **Consults and bed requests** read no works-for. A consult (a department and a question) goes
    to a visits or stays department (`consult_not_here` otherwise); the consult pickers list only
    these. Where the reply is written changes nothing about its privacy: a note keeps its
    department (spec 07). A bed request is a core request marked `is_admission`, written only by
    /admit and only to a stays department (`not_a_stay`).
  - Serving routes requests. The only right it carries is the desk's reach (Access, below).

## Functions

```
save_…     save_department · save_service · save_user · save_role · save_template · save_organization_pack · save_bed (spec 08 K18)
retire_…   retire_department · retire_service · retire_role · retire_template · retire_organization_pack
read_…     read_organization (all a picker needs, and the caller's rights per department; any live member with a live role)
           read_settings_changes (read:settings_changes) · read_to_review(organization_id, department_id null = mine)
invite     invite_user (public, gated) → one Edge Function → link_login (service_role) · create_organization (service_role)
gates      require_access(organization_id, action, patient_id, department_id) → the caller's users.id
           require_pack(organization_id, pack)
           core.may(user, organization_id, action null, department_id null)
           core.why_not(user, organization_id, action, department_id, correction false, desk false)
           core.works_in(user, department_id) · core.checks_in_for(desk_id, clinic_id) · core.service_live(service_id) · core.may_order(from_department_id, service_id)
runner     core.next_pack_call · core.finish_pack_call (pack_runner only) · retry_pack_calls(organization_id, pack)
for packs  core.write_entry · core.change_request · core.record_settings_change · public read_… · public mark_…
```

Every `save_…` takes a client-minted UUIDv7 id and upserts on it (setup and imports are
re-runnable), takes the `settings_changes.id` the screen loaded and raises `changed_since_read`
when a newer one exists, requires `manage:<area>` (organization · departments · services ·
users · roles · templates), and writes one `settings_changes` row. `save_user` retires a person
(`retired_at` may be in the future) and returns `{open_assigned, to_review}` when it does.
`save_department` takes the type once (`work_fixed` after), the packs the department uses, its
Screens line and its serving rows (above). The Screens line is `screens` (☑ Default screen, ☑
each pack screen of a pack used there) and `opens_on` (the screen that opens first, one of them).
The default screen may be unticked only when a pack screen is ticked (`bad_setting` otherwise);
then the screen named by `opens_on` replaces the default and the other pack screens are tabs.
Unticking a pack drops its screens; when `opens_on` named one of them, `default` is ticked again
and `opens_on` becomes `default`, and any other pack screens stay tabs. When the screen `opens_on`
names cannot show (its pack is off, unticked or not used here, or this person may not use it),
the default screen shows and opens first. A pack screen shows to a person only when they hold the
actions it names there; a machine user of a desk always gets the board view. One Save that ticks
a pack in several departments calls it once per department, so each keeps its own stale-save
check. `retire_department` is refused while the department has
open requests, unreviewed results it requested, or open visits, and deletes its `user_roles` and
`served_departments` rows. `save_service` refuses a pack reply type in a department that does
not use the pack (`not_used_here`). `services.department_id` may change; open requests keep their
destination; a service answered by a pack's type moves only to a department that uses the pack.
`read_to_review`'s "mine" needs `mark:reviewed` somewhere; a department's list needs
`mark:reviewed` held there; the requester may always review their own results. `link_login`
sets `login_id` once, within an hour of `invited_at`; `save_user` never takes `login_id`.

## Deleting a mistake (amended 2026-09-24)

Anything a practice sets up is retired, not deleted, because the record points at it. The one exception is a
mistake nothing ever used: `delete_service`, `delete_department`, `delete_role`, `delete_user`, `delete_template`
delete for good what no row points at — a service never ordered and in no preset (its fields and ranges go with it),
a department with no services, no one's role, no visit or entry (its serving links go with it), a role nobody holds, a
person who never signed in (their roles go with them), and any preset (the record never points at one). Anything else
is refused `in_use` and stays to be retired: every link to these tables blocks a delete, none cascades, so the database
itself decides. Each delete is a `settings_changes` row carrying the name.

## Access

- **Actions are rows,** shipped by migration; `role_actions.action` references them;
  `require_access` raises `unknown_action` on a key it does not know and runs `require_pack`
  when `actions.pack` is set. The client's `Action` type is generated from the table. Every
  action has a **scope** (`actions.scope`):

  | Scope | Counts from | Actions |
  |---|---|---|
  | department | a role held in that department, or held everywhere | writes, marks, `read:queue` |
  | organization | any live role | `read:patient`, `write:patient`, `read:record`, `read:organization`, `read:cohort` |
  | everywhere | only a role held everywhere, with a second factor (`aal2`) | `manage:*`, `read:settings_changes`, `read:record_reads` |

  A pack action takes its verb's default unless its registry row says otherwise: `manage` →
  everywhere; `read` → organization; `write` and `mark` → department.
- **The gate is one rule, stated once.** `core.may` lists what a person may do, and where;
  `core.why_not` answers one call: null when allowed, the reason otherwise. `require_access`,
  `core.can`, the live channels and `read_organization`'s `me.departments` are built on these
  two, so anything shown is allowed. A call passes when the caller is an unretired
  (`retired_at IS NULL OR > now()`) users row of the organization; holds a live role (not
  retired; a pack role, or a copy of one, only while its pack is on) that has the action, counted
  by its scope; for a pack action, the pack is on and, for a department-scope `write:` or `mark:`
  done by a person, the department **uses** the pack (not for an order or the bedside part that
  goes with it, below); and, for an everywhere-scope action, has a second factor.
  Refusals come in this order: `unknown_action`, `pack_off`, `not_a_member`, `mfa_required`,
  `department_missing`, `not_used_here`, `not_allowed`. A department-scope action with no
  department is `department_missing`: no department never means any department. The second
  factor belongs to the session, not the person: `core.may` ignores it and `why_not` refuses
  `mfa_required`. `me.actions` marks everywhere-scope actions `needs_second_factor` while the
  session is `aal1`, and the client shows those pages behind the step-up.
- **Used here** is checked only for department-scope `write:` and `mark:` pack actions done by
  people, through `require_write`, `begin_reply` and the step path (spec 06), always at the
  department that acts. Never in reads, updaters, `after_write`, calls by the pack's own user, or
  corrections. It is for the department doing the pack's own work: its screens, its reply forms,
  its bench steps, its commands for its own entries. **Ordering follows works for:** an order (a
  `write:` of an `is_request` type) is never tested for used-here. `require_order` checks the
  action at the ordering department and `core.may_order`: a live service answering it works for
  that department (a live service's department uses the pack; `not_used_there` otherwise).
  **The bedside part goes with the order:** the department that placed an order may record the
  follow-up that belongs to it (the transfusion of the blood it ordered), gated at that
  department and checked against that order, with no used-here test. The follow-up names its
  order in `data.order_id`, never in `reply_to_id`; the order must be of the type it follows, for
  the same patient, and not cancelled. An order written in a stay goes with the stay: after a
  transfer, the ward the stay moved to records its follow-up (spec 08 K4). A reply to a request sent
  outside is typed by the department that sent it, the same way. `core.may` lists order and
  follow-up actions (a `write:` of an `is_request` or a `follows` type) wherever the role holds
  them and the pack is on, so the client's list and `why_not` agree.
- **Corrections.** A correction is gated `write:<type>` at the original's department and skips
  pack-on and used-here for the action; `correction := true` is passed for a correction and
  never to skip used-here. A pack role whose pack is off still counts for nothing, correction or
  not.
- **The desk's reach** is the only right beyond a person's own departments, and it is opt-in.
  People who hold a role at a desk may, in the clinics it checks in for, read the visit queue
  and move visits, through these calls only, which pass `desk := true`: `read_visit_queue`,
  `read_patients` (open visits in the clinics the desk checks in for), `open_visit`,
  `mark_present`, `mark_visit_priority`, `mark_visit` (its `write:visit` moves),
  `mark_visit_routing` (not its transfer form), and `core.can` for the `queue:` channel. Every
  other call, core's or a pack's, gets no reach. `core.may` gives a `via = 'desk'` row for
  `read:queue` or `write:visit` only when the person's role held at the desk itself holds that
  action. It stops there: not the request queue, not department review lists, not send-outs, not
  beds; a reader without `read:record` sees queue rows with counts ("2 results in"), not test
  names. A desk's act for one of its clinics through a pack (bookings) is gated at the desk,
  `why_not(person, action, desk)`, so the desk must use the pack; it also needs `core.checks_in_for(desk, clinic)` and `core.require_used(clinic, pack)`.
  The clinic's own staff act at the clinic as usual. Nothing else widens anything: works-for
  gives a lab's or a pharmacy's staff no right in the departments it works for, and holding
  `read:queue` opens no outside department's queue; a sender reads its own send-outs with
  `read_sent_outside(organization_id, department_id)`.
- **Works in** is its own test, `core.works_in(user, department)`: a staff user (kind `staff`)
  holds a live role scoped to that department (a role held everywhere does not count, so the owner
  does not) that allows `read:record`. A pack, machine or importer user never works in a
  department, whatever role it is given there. It decides who reads a private note: the people who work in the
  department where it was written, plus its author and responsible clinician (spec 07). Its
  author, or anyone who works in its department, may make a note private or not private. It is
  never computed through the gate.
- **Who is calling:** `current_user_id(organization_id)` is the users row with
  `login_id = auth.uid()`. It honours `opencare.acting_user_id` only when the session is not the
  API's `authenticator` and the named row is of kind `pack`: no client and no pack can act as a person.
- **The funnels gate pack callers themselves** (amended 2026-09-25). Inside a `security definer`
  function `current_user` is its owner, so the funnels learn who called them through an invoker
  entry. `core.write_entry` and `core.change_request` are `security invoker` entries, the forms
  granted to pack roles and called by core's own wrappers too. Each records `current_user` in a
  transaction-local setting and calls its `security definer` body, which reads the setting once,
  clears it, and refuses a call that did not come through the entry. No pack body may call
  `set_config` or `SET` (the static scan), so a pack cannot forge it. When the caller is a
  `pack_%` role and the actor is a person, the funnel re-runs the gate the door should have run,
  chosen from the row, not from the door:
  - a correction → `write:<type>` at the original's department, skipping pack-on and used-here;
  - a reply → `begin_reply`'s rule;
  - an `is_request` type → `require_order`'s rule;
  - the bedside part of an order → at the department that placed the order, checked against
    the order its row names (`data.order_id`);
  - otherwise → `write:<type>` or `mark:<step>` at the entry's department or the request's
    to-department, used-here included.

  A pack door that forgets its gate is still refused. The pack's own user skips used-here, never
  pack-on. `core.release_hold` releases a hold only when this pack's own user placed it, with the
  person as actor.
- **Rights:** `save_role` and `save_user` refuse to touch the caller's own roles or a role the
  caller holds; built-in roles are read-only (copy to edit). **Settings rights work only from a
  role held everywhere.** `save_user` refuses a role holding an everywhere-scope action when it
  is given in one department (`everywhere_only`), and any role on an outside department
  (`outside_department`). A settings or audit right is granted, by edit or by assignment, only by
  someone who holds it everywhere. `save_role` refuses `everywhere_only` when it would add an
  everywhere-scope action to a role that someone holds in one department, and names them. No
  built-in role but the owner holds an everywhere-scope action (spec 06). Each Settings page is
  shown to the people whose actions its saves need. `save_user` and `retire_role` take the
  organization lock and refuse `last_administrator` when no live, linked user would hold
  `manage:users` and `manage:roles` everywhere.
- **Record reads:** `read_record` opens a record and inserts a `record_reads` row with the
  department it was opened from and a basis (spec 07); the other record reads raise
  `record_not_open` without one in the last 12 hours. `read_record` names a department where the
  caller holds a role, or the caller holds one everywhere (`not_allowed` otherwise). The basis
  `visit` or `request` is recorded only when the reader holds a role scoped to that department,
  or is the visit's assignee or the request's requester; otherwise it is `none`. Pack users log
  with the basis `pack`; machine and importer users with their own basis, `machine`, and are
  listed on the review. Open anyway is for staff only.
- **After retirement** the gate refuses the next call; Realtime channels are private under one
  membership policy, and `record:<patient>` also needs a record opened in the last 12 hours.
- **Files.** Entry files sit in a private bucket with no `storage.objects` policy for
  `authenticated`, so a client can neither list nor sign a path. One Edge Function, called with
  the user's JWT, calls `read_entry_file(entry_id, position)` as that user (which runs
  `require_open` and `note_hidden`) and signs the returned path with the service role for 60 s.
  The path itself is never returned to the client. An upload goes through the same function,
  which mints the path and a signed upload URL.

## The admin's day

The screens, all rows: **Organization** (time zone, record view),
**Departments** (work, site, packs used here, screens, checks in for / works for, rules, beds or
places), **Services** (fields, ranges, pack columns: Billing's price is saved by `billing_save_…`
after core's save returns, recorded through `core.record_settings_change`), **Staff** (people,
machines, roles per department or Everywhere, shown as "Doctor · Cardiology", invited and accepted
times), **Roles** (built-in, read-only; a clinic copies one to make its own), **Presets** (the `#`
shortcuts), **Packs** (on or off, parked pack calls with Retry; turning a pack on opens its card: "Use it in" chips pre-ticked by
the works it is made for, its starter setups, and the clinic's own roles to give its actions to),
and under **Advanced**, Record reads and Settings history. Each page is shown to the people whose
actions its saves need. First run: `create_organization` → MFA → pick starter setups (client
data from core and each pack that is on; core's are Front desk, General clinic, Ward, Laboratory)
→ the client loops `save_…` with minted ids, so a dropped connection is re-run, not repaired. A
new department starts with Every, except a stays department. Cover is membership: the night
technician holds `technician` in the main lab too; the request stays where it was sent and the
reply says who did it. A department whose pack is off opens on its default screen again.

## Settings by work

One table decides which department settings show; Settings renders it.

| Setting | desk | visits | stays | bench | outside |
|---|---|---|---|---|---|
| Packs used here | yes | yes | yes | yes | no |
| Screens | yes | yes | yes | yes | none |
| Checks in for / works for | checks in for | works for, if it owns services | own services only | works for | works for |
| After Done | no | yes | no | yes (Release) | no |
| Patients wait | no | yes | no | no | no |
| Results to review | no | yes | yes | yes | no |
| Private department | no | yes | yes | no | no |
| Beds or places | no | places | beds | no | no |
| Contact | no | no | no | no | yes |

Screens *yes* is the Screens line: ☑ Default screen (unticked only when a pack screen is
ticked), ☑ each screen of a pack used there, and **Opens on**. Private department is the rule of
spec 07: every note written there is private. On screen the works are place words: Front desk ·
Clinic · Ward · Lab, X-ray or pharmacy · Outside. The keys (`desk`, `visits`, `stays`, `bench`,
`outside`) stay in the schema and the code.

## Packs: the boundary Postgres enforces

- **One schema per pack**, named by its key, owned by a NOLOGIN role `pack_<key>` that owns
  every function and table the pack ships; every function is `security definer` with
  `search_path` pinned. A pack migration is `<timestamp>_<pack>_….sql`, begins with
  `SET ROLE pack_<key>`, contains no `ON CONFLICT`, and every registry row it inserts carries
  its key. A pack inserts no `department_types` row; it ships starter setups (client data). No
  core migration depends on a pack migration. A pack schema is never dropped: a
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
  rebuild and a step insert none. A private note reaches only a pack used in the department where
  it was written (spec 07). The **runner** is one pg_cron job every 5 seconds, run as
  `pack_runner` under `statement_timeout 5 s` and `lock_timeout 2 s`, below the API's 8 s.
  Per row: `next_pack_call()` locks it, adds a try, returns the entry (or deletes the row when
  the entry is gone), commit; then `set_config('opencare.acting_user_id', <the organization's
  'pack:<pack>' user>)`, `<pack>.after_write(entry)` in an exception block, delete the row or
  write `error_text`, commit. Retry at `tried_at + 2^tries` minutes, capped at an hour; from
  five tries the row is **parked** and counted on the Packs page. A pack the organization
  has switched off is skipped. A watchdog ends a runner backend older than two minutes.
- **The contract of `after_write`:** at least once, so idempotent on `entry_id`; it makes the
  pack's data match the entry as it is now (live, replaced or struck), so order cannot matter;
  it may hold a request (`mark_step 'sent' → 'held'`) and, when the compare-and-set fails
  because the department already started, records that on its own side and does not raise; it
  raises only when what it needs is not there yet (`price_missing`), which keeps the row
  pending. It reacts to entries only, never to steps, and never writes a core type.
- **Holds.** `held` is a core step; `sent` is a legal target only from `held`. Billing holds
  seconds after the send; the cashier's payment releases through `core.release_hold`, which
  moves held → sent only when the pack's own user placed the hold, with the cashier as actor.
  `retire_organization_pack` deletes the pack's pending rows, retires its user, and releases
  every request whose latest `held` step is that user's, with the caller as actor.
- **The client half:** `src/core`, `src/packs/<pack>`, one `src/packs/index.ts`; ESLint forbids
  core → pack and pack → pack imports; a pack shows its own screens and adds to core only through
  spec 06's slot table, never to the default screen: **writing tools follow the department**
  (commands, cards, reply forms, bench steps, its screens and pages show where the department
  does the slot's work, uses the pack, and the person may act there; an order shows where a live
  service answering it works for the department, and the bedside part on the department's own
  orders), **reading follows the record** (entry renderings, banner items, side sections, record
  views and prescribing warnings show wherever the record is read while the pack is on; entries
  render even when it is off); the core renderer draws every entry from `display_line` and
  `data.values`. Pack settings
  (`billing.service_prices`) live in the pack schema, keyed by core ids; core never joins them.

CI proves each promise with one test (appendix, section c): save time under hostile packs ·
poison row · kill mid-call · order · once · holds · grants · ownership and definer · doors ·
static scans of every core and pack body · rows only · hostile updater, including rebuild ·
client · fixture placement · rights · the tenant matrix over every public function and every id
parameter · public signatures only grow · pack lifecycle · actions match the client.

## Naming

Suffixes and abbreviations as spec 01. Words: organization · user · staff · role · action ·
department · site · section · service · served · pack · pack call · runner · hold · preset.
Added 2026-09-25: **work** (what a department does: desk · visits · stays · bench · outside) ·
**scope** (department · organization · everywhere) · **packs used here** · **default screen**
(core's screen for a department's work) · **pack screen** · **Opens on** · **private department**
· **private note** · **checks in for** (a desk) · **works for** (a department with services) ·
**works in** (a role held there that reads the record) · **place** (on screen, a bed in a visits department; in identifiers a
department is always `department`) · **starter setup** (client data that makes or fills a
department). A **preset** is the `#` shortcut and nothing else. "Starter" stays out of the schema.
Not used in the schema: admin, org, practice, manifest, feed, starter, active, label,
permission, tenant, member, account, group, staff (as a table).

## Decisions taken

One kind of work per department, fixed; queues derived from its services · starter setups as
client data applied by `save_…` · site as a label · MFA for every `manage:` action (with 2026-09-25,
every everywhere-scope action) · holds trail the send · `ancillary` · `is_visited` · 12-hour
record-open window · managed Supabase. Added 2026-09-25 (approved by the owner): a department
chooses the packs it uses, and pack department types are retired · one permission function ·
three action scopes; settings rights only from a role held everywhere · serving has one meaning
per work, and no rows never means every · the desk's reach is the only widening, opt-in per
call · ordering follows works for, and the bedside part goes with the order · the funnels learn
their caller through an invoker entry · pack roles only for narrower jobs · privacy is per note,
kept by the department it was written in (spec 07) · each specialty pack brings its own screens,
and one may replace the default screen with whatever actions it has; packs add nothing to the
default screen.

## Decide-now items (already reflected above)

`actions` as a table · built-in roles read-only · self-change and last-administrator rules ·
composite tenant keys on every link · client-minted ids on every `save_…` · global codes from
migrations only · one schema and one `security definer`-only role per pack · the funnels gate
pack callers · after-write through `pack_calls` and the runner, never in the write · `held` in
the core enum · `service_field_ranges` with the Laboratory pack · `department_types.retired_at`
and `is_visited` · migration-one revocations · MFA for `manage:` · the golden signatures file ·
the hostile fixture packs from day one.

## Written as rules now, built later

Patient and proxy users through `patient_access`, never
`user_roles` · machine logins with the first analyser · born-held requests
(`services.is_held_first`, additive) · restricted records and `record_reads.reason_text` · a
`sites` table when a site needs an address · a codes page · `erase_patient` telling packs ·
"make a department like this one" · a review line when a role grant changes who reads private
notes · (`read_sent_outside` and visit queues landed in spec 03; custom roles and the role editor
in 0033).

## Known limits

A pack updater runs inside the write, so a failing one fails the set it was saved in · a hold
trails the send by seconds · a pack that hangs holds one runner invocation for up to 55 s (the
cron job's `statement_timeout`; a timeout cannot be armed from inside a running call) and is
parked after five tries · on managed Supabase the migration runner is not a superuser, so the
advisory-lock revoke is a no-op and the runner timeout plus the static scan are the guard (B9), and a request already started is charged unpaid · settings rows are
saved whole (a stale save is refused, not merged) · one kind of work per department, fixed · a
site is a label, and has no settings of its own · no schedules: cover is membership, and it has no
end date (roles are removed by hand) · packs cannot depend on each other · an invitation proves
control of a mailbox, nothing more · built-in roles change everywhere at once, by release.
