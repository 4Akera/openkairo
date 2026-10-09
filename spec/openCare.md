# openCare · the specification

One file for the whole system. It replaces specs 00–08, the amendments and the appendices, which are kept in `spec/archive/` for
their history only. Status: **approved by the owner, 2026-09-26**. A later change is written into this file with its date.

openCare is an open-source clinical record. Egypt first (Arabic names, Africa/Cairo); English screens now, Arabic later. Typing
first. Inline cards appended below the line, never overlays on the record. Plain names. Local demo data only: there is no real
deployment, so nothing here needs a data migration.

---

## 1. The layers

```
   screens: base defaults (desk, queue, bench, bed board, record, composer, settings) and pack screens. They only call actions.
                          │  write(set)                                   │  read(query)
 ┌────────────────────────┴───────────────────────────────────────────────┴───────────────────────────┐
 │ PACKS   pharmacy.* …  own types (often extending a base type), checks, visibility rules (hide only), │
 │         settings, screens. React to other layers' types after commit.                               │
 ├────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ BASE    all meaning: 38 types, presence, privacy, checks, derived tables, the review loop,         │
 │         code systems and their rows, settings keys, FHIR mappings. Always on; released with core.  │
 ├────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ CORE    people · patients · places · registry · settings · codes · counters · files · datatypes    │
 │         WRITER (only way in)  ·  READER (only way out, logs every read)  ·  ERASER (2 exceptions)  │
 │         no types, no medicine                                                                      │
 ├────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ SPINE   entries: written once, never changed                                                       │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
   derived tables (who is where, lists, orders, review, values): refreshed from entries only, read only through the reader
   FHIR R4: a mapping of what the reader returns; never stored
```

Each layer uses only the one below it. Nothing reaches the spine except through the writer, and nothing leaves except through the
reader. The two are the core's promise: no screen or pack can go around the base's checks or its privacy rule.

| layer | Postgres | owner role |
|---|---|---|
| spine and core | schema `core` | `postgres` (the migration owner); the eraser functions are owned by the NOLOGIN role `core_eraser` |
| base | schema `base` | NOLOGIN role `base_role` |
| a pack | schema `<key>` | NOLOGIN role `pack_<key>` |
| the API | schema `public` | `postgres`; every function SECURITY DEFINER with `search_path = ''`, granted to `authenticated` |

`authenticated` holds no privilege on any table in `core`, `base` or a pack schema. Realtime publishes no tables.

---

## 2. The spine: `core.entries`

| column | what |
|---|---|
| `organization_id` | first in every key and index |
| `id` | uuid v7, minted by the client, so a retried Done can never land twice |
| `patient_id` | the patient (the survivor of the merged family at the time of writing, §3.2) |
| `type`, `type_version` | a registry key (`problem`, `pharmacy.dispense`) and the shape version it followed. Old entries always read with their own shape |
| `item`, `item_version` | `item` = the id of the entry that started the thing; `item_version` = 1, 2, 3… FHIR `Resource.id` and `meta.versionId`; derived rows key on it; a stale edit is found by version |
| `data` | jsonb, built only from core datatypes (§3.7) and checked against the type version's JSON schema |
| `codes` | text[] of every coding in `data` (`icd10:E11.9`), filled by the writer; GIN index. A copy of `data`, fixed when written |
| `author_id` | the user who wrote it (staff, machine or importer) |
| `source` | `staff` · `machine` · `import` · `patient`, set by the writer from the user's kind, never taken as a parameter |
| `source_system`, `source_id` | optional outside id (analyser message, FHIR `Observation/123`, CSV row); unique per organization, so an import or resend lands once |
| `department_id` | never null. Patient and import entries go to the organization's automatic intake department (work `outside`) |
| `visit_id` | the `item` of the visit's opening entry (`checked_in`, or `admitted` for a stay) |
| `occurred_at`, `precision`, `until` | clinical time with `year`·`month`·`day`·`minute`·`second`. A coarse time is stored as the start of the period in the organization's time zone |
| `recorded_at` | set by the writer after taking the locks: ordering by (recorded_at, id) is the order writes happened |
| `replaces` | a correction: "it was wrong" |
| `refers_to`, `relation` | `answers` · `changes` ("it was right until now") · `about` |
| `set_id` | the Done: all or nothing, the unit of a retry, one Provenance |
| `findings` | the check outcomes kept with the entry: flags, and warnings the user confirmed. A rebuild never runs checks again |

**The item rule** (the writer's; no medicine in it). A new entry starts its own item (`item = id`, version 1). `replaces` and
`changes` continue the target's item (the next version). `answers` and `about` start a new item. The target and the new entry must
declare the same FHIR resource, except `crossed_out`, which continues any item. `unique (organization_id, item, item_version)`.

**Kept rules.** Insert-only, enforced by a trigger and by grants. No copies of note text anywhere else: lists and worklists point to
entries. Everything that happens is an entry, including "made private", "called", "moved to bed 12" and "crossed out". There is no
`code` or `unit` column, no stored FHIR, no `responsible` column (derived from presence), no `privacy` column (privacy is entries).

---

## 3. The core

### 3.1 People
- **login**: an auth account (`auth.users`). **user**: a person in one organization (`core.users`), kind `staff` · `machine` ·
  `importer`. A doctor at two clinics has two users. When a login has more than one live user, the client asks which one and calls
  `choose_user`, which binds the choice to the JWT's `session_id`. Nothing is ever shown across organizations.
- **roles**: bundles of declared actions. Built-in roles belong to a layer (organization null) and are read-only; a clinic copies one
  to make its own. A built-in role may be **built on** a base role: it holds every action of that role as it stands now, plus its own,
  so whatever the base role gains later it gains too. The base's Doctor and Nurse are **everyday** roles: in a department that uses a
  pack they hold the pack's everyday actions (§5.2), and only those. A role's actions are added one at a time, never replaced as a
  list. **holdings** are insert-only rows with a validity period, held everywhere (department null) or in one department.
  Ending a holding inserts a row into `core.holding_ends`. The clock may step back: a holding dated no later than its grant, and
  every end, count once committed; one dated later is live from the later of the transaction's start and the clock.
- `core.may(user, action, department)` → yes/no. **A null department matches only roles held everywhere.** `core.may_somewhere(user,
  action)` answers "in any department". A pack's actions count **only in a department that uses the pack** (`core.department_uses`:
  on for the clinic and ticked there, §5.1 rule 1), so a null department never holds one; an organization-wide pack action needs only
  the pack on (and so it cannot be everyday: `everyday_for_department`). One function (`core.gives(organization, role, action, department)`) answers for a role, and `core.actions_in(user,
  department)` lists what may answers there (read `me` sends it per department, so the client asks the same question). Retired users
  and machine users hold nothing that opens a private item (§5.3).
- Identifiers for users, organizations, sites and departments are stored like patients' (`core.identifiers`, by owner kind).
- **The last administrator.** Somebody must keep `manage:users` and `manage:roles` held everywhere (possibly on two roles). Nobody edits
  their own holdings or a role they hold, and nobody grants an action they do not hold everywhere.

### 3.2 Patients
- Names: ordered given parts (own, father, grandfather), family name and full text, plus an optional Latin form (passport spelling).
  A stored Arabic-folded name (أ/إ/آ→ا, ى→ي, ة→ه, no tatweel or harakat, lower case) with a trigram index, because `unaccent` does not
  fold Arabic. Search matches the folded name, a phone, the record number or any identifier.
- `gender`: male · female · other · unknown. Birth date with precision and an `estimated` flag. An unknown patient has `anonymous`.
- Identifiers `(system key, value, verified)`. The system's check function validates the value (§7.3). The record number is an
  integer from `next_number(organization, 'record_number')`, exported as an identifier in the organization's MR system.
- Relations: mother of, guardian of, not the same person as; each with who recorded it and when.
- **Identity changes are insert-only** (`core.patient_changes` holds each full snapshot); `core.patients` is the current state built from
  them. Death is not a patient field: it comes from the base's `died` entry.
- **Merge.** `merged_into` points to the survivor. The merged family counts as one patient everywhere: reads take the family, the
  writer stores new entries under the survivor and re-reads it after taking the lock. Exported as `Patient.link`.

### 3.3 Places
Organization → sites → departments → **places**. A department has one core `work` key: `desk` · `visits` · `stays` · `bench` ·
`outside`; what each means belongs to the base. A place is a room, bed, chair or cubicle in one table (the word is a label; a bed may
sit in a room). Every organization gets one `outside` intake department automatically. Department flags that carry meaning (private,
encounter class, after Done, works for, review rule) are settings.

### 3.4 Settings
`core.settings (organization_id, id, key, owner_id, thing_id, data, retired, author_id, recorded_at)`: insert-only, so the history is
free. `thing_id` is the setting's own id over time (a service's id; the owner's id for a one-per-owner key). Each key is declared in
the registry with an owner kind (`organization` · `department` · `place`), a JSON schema and an optional check function.
`core.setting_at(organization, key, thing, at)` returns the setting as it stood at a moment; with no moment, the latest committed
row (settings are never dated ahead, and the clock may step back), and a row records after the thing's row before it. **Checks and
refreshes read settings as of each entry's `recorded_at`**, so a later range change never alters an old flag and a rebuild stays
identical. Services, presets, department rules, the packs used here and the Screens line are all settings rows; packs need no
configuration tables of their own. `core.department_uses(organization, department, layer)` answers whether a department uses a layer:
the core and the base always, a pack only while it is on for the clinic and ticked in the department's `department.packs`, as of now
(granted to the base's and every pack's role).
Written only by `public.write_setting`, which checks `may(user, 'manage:settings', owner department)` (or held everywhere for an
organization key; a key that declares its own action needs that one instead, held in any department for an organization key:
`score.signed_off` is `sign:score`, a clinician's act, §5.1 rule 8), the shape and the key's check; every change is an AuditEvent. A refusal names the field it is about when it can
(the error's hint: the shape's, worked out by `core.shape_field` as a path with an array's index, `rows.2.dose`; a check's, by its
finding's `field`), so the form shows it there. A key may declare what its automatic form needs (§3.8, §5.1 rule 7): its fields in
order, each with its words, help, unit and choices' words, and where the form shows (`pack`: the pack's page, a clinic-wide setting;
`department`: the department's card); read `me` sends every key with its shape (the datatypes once; the key's own `$defs` with it), its fields and its form, and
each setting with who changed it last and when; the `audit` read takes `what` (`setting:<key>`) and `thing_id` for one setting's
history.

### 3.5 Codes
- `core.systems`: declared in the registry: key, kind (`code` | `identifier`), canonical URI, version, labels, `closed`, an optional
  check function, a licence note.
- `core.codes (system, code, labels per language, parent, props jsonb, retired_at, replaced_by)`. `props` holds per-system extras (a
  LOINC code's canonical UCUM unit and allowed units, an ATC level, an EDA product's strength and form). Codes are plain data loaded by
  the base, packs and import scripts. Maps between systems come later as `code_maps`, applied only when reading.
- **Entries store system keys, never URIs.** URIs are resolved at export (`{canon}` is one row of `core.canon`).
- `core.code_imports`: each load of a licensed list (`core.record_import(system, version, source, sample)`, called by
  `scripts/import-codes.sh` and by the demo seed, which marks its loads a sample): the version, the source, the system's licence note
  as it stood, the count of codes after it, when. The `reference` read lists each system's latest load (Settings → Reference lists).

### 3.6 Counters and files
- `core.next_number(organization, key, scope, day)`: record numbers, queue numbers (#12), specimen numbers, invoices.
- Files: one private storage bucket `files`, objects at `<organization>/<patient>/<sha256>`. An entry names a file in `data` as an
  attachment. A download link comes only through the reader, and the storage SELECT policy calls the same visibility function. A file
  never signed into an entry is removed after a day. Erase removes the objects.

### 3.7 Datatypes: the only building blocks of `data`
FHIR datatypes, not resources, so they carry no medicine. Every type's JSON schema is built from them; `core.datatypes()` returns the
`$defs` that the declaration inlines.

| datatype | shape |
|---|---|
| coding | `{system: key, code, display}`; `display` is the label as picked, kept because the entry never changes |
| concept | `{text, codings: [coding]}`; `text` is the words as typed; zero codings means "as written" |
| quantity | `{value: "1.50" (a decimal string, so precision is kept), unit: "mmol/L" (as written), ucum: "mmol/L", comparator}` |
| range, ratio | low/high quantities and a text; numerator/denominator (a titre of 1:160) |
| period, partial date | start/end; `{value, precision}` |
| reference | `{to: item · patient · user · department · place, id}` |
| identifier | `{system: key, value}` |
| timing | a subset of FHIR Timing: `frequency`, `period`, `period_unit`, `when` (AC, PC, HS), `bounds_days`, `code` (BID, TID) |
| attachment | `{sha256, sha1, mime, size, name, created}` |

The writer checks every coding (any object with `system` and `code`). A system that is not registered is refused
(`unknown_system`: a bug). An unknown or retired code in a `closed` system lands with a `code_unknown` flag. A quantity whose `ucum` is
not a known UCUM unit lands with a `unit_not_ucum` flag.

### 3.8 The registry
Only migrations write the registry: there is no RPC for it, and neither `authenticated` nor pack roles hold any privilege on it.
Organizations change only labels (through settings) and settings.

```sql
select core.declare_type(
  key => 'medication', version => 1, layer => 'base',
  base_type      => null,                               -- pack types only: the base type this one extends ('given', 'step')
  shape          => '{…JSON schema using #/$defs/…}',
  resource       => array['MedicationRequest','MedicationStatement'],   -- FHIR R4
  to_fhir        => 'base.medication_fhir(jsonb)',      -- the reader's rows of one item → jsonb[] of resources
  line           => 'base.medication_line(jsonb)',      -- the one-line summary, even when a pack's client code is missing
  checks         => array['base.medication_check(jsonb,jsonb)'],   -- (entry, set) → findings
  feeds          => array['base.lists'],                -- derived tables refreshed with this type's items
  claims         => null,                               -- (entry) → text[] such as 'place:<id>'
  may_be_private => false,
  in_record      => true,   -- false hides it from the record view only; the reader and FHIR still include it
  other_patient  => false,  -- may sit in a set beside another patient (the birth card)
  labels         => '{"en":"Medication","ar":"دواء"}');
select core.declare_system  (key, kind, uri, version, closed, check, licence, labels);
select core.declare_table   (key => 'base.lists', layer => 'base', refresh => 'base.lists_refresh(uuid,uuid[])', action => 'read:record',
                             reads => '{}',            -- what of identity its refresh reads ('age', 'sex'): refreshed when that changes
                             entries => true);         -- false: it never sends its rows' source entries (nor their ids), whoever asks (F08)
select core.declare_op      (key => 'pharmacy.stock', layer => 'pharmacy', fn => 'pharmacy.stock_read(uuid,uuid,uuid,jsonb)', action => 'read:pharmacy.queue',
                             patients => false);       -- true: it returns patient ids (patient_ids in its answer), each read-logged (F28)
select core.declare_store   (key => 'billing.payments', layer => 'billing', clear => array['patient_id']);   -- a pack's own table Erase reaches:
                             -- its patient's rows go (clear null), or stay with these columns emptied (D17, D18)
select core.declare_rule    (key => 'base.private', layer => 'base', hidden => 'base.private_hidden(uuid,uuid[])');
select core.declare_action  (key => 'write:note', layer => 'base', scope => 'department', labels => '{…}',
                             everyday => false);       -- a pack's only: held by the everyday roles where a department uses the pack
select core.declare_setting (key => 'department.private', layer => 'base', owner => 'department', shape => '{…}', check_fn => null, many => false,
                             fields => '[{"key":"minutes","labels":{…},"help":{…},"unit":"min","choices":{…}}]',  -- the form's fields, in order
                             form => null);            -- where its automatic form shows: 'pack' (the pack's page) · 'department' (its card)
select core.declare_screen  (key => 'pharmacy.dispensing', layer => 'pharmacy', work => 'bench', labels => '{…}',
                             action => 'read:pharmacy.queue',  -- what a user needs in the department to see its tab; null: anyone working there
                             replaces => array['base.bench']); -- a pack screen: the base screens of its work it stands in for
select core.declare_listener(layer => 'pharmacy', types => array['medication','order'], refresh => 'pharmacy.queue_refresh(uuid,uuid[])');
select core.declare_pack    (key => 'pharmacy', version => 1, requires => '{}', labels => '{…}',
                             charges => false);        -- the pack charges for work (§5.4 core change (d)); read with each department using it
select core.declare_role    (id, key, layer, name, actions, labels, every_action, built_on, everyday);   -- a built-in role (read-only
                             -- to organizations): built_on a base role; everyday the base's only. Its actions are added, never replaced;
                             -- its key in the layer's prefix (pharmacy.pharmacist), its id in the layer's block (…ca01)
select core.declare_setup   (key => 'ward', layer => 'base', work => 'stays', labels => '{…}', packs => '{}',
                             screens => '{"screens":["base.beds"],"opens":"base.beds"}', places => '[{"key":"bed_1","name":"Bed 1","label":"bed"},…]',
                             services => '[…service data…]', presets => '[…preset data, with a shortcut…]',
                             settings => '{"department.encounter_class":{"class":"IMP"}}', help => '{…}');   -- a starter setup (§5.2)
select core.declare_role_action(layer, role, action);  -- one action more, by the role's own layer: the core's, the base's or its own
select core.declare_score   (key => 'gcs', layer => 'base', version => '1974', source => 'Teasdale G, Jennett B. Lancet 1974…',
                             items => '[{"key":"eye","labels":{…},"input":"choice","choices":[{"value":"4","points":4,"labels":{…}},…]},…]',
                             bands => '[{"key":"severe","labels":{…},"min":3,"max":8,"tone":"danger"},…]',
                             labels => '{…}', short => 'GCS', alias => 'gcs', coding => '{"system":"loinc","code":"9269-2"}');
select core.retire_score    ('gcs', '1974');           -- new entries may no longer use that version; its entries keep it
```

**Enforced when something is declared**
- Functions are stored as `regprocedure` OIDs with `md5(prosrc)` beside them. Each must be owned by the layer's role, be SECURITY
  DEFINER with `search_path=''`, and live in the layer's schema. Checks, lines, claims, rules and to_fhir must be STABLE (Postgres then
  refuses writes inside them); refreshes must be VOLATILE.
- Keys must sit inside the layer's prefix: pharmacy cannot declare `note` or `obgyn.x`, nor a code system, a role or a setup outside
  `pharmacy.`; a code system another layer holds is refused (`outside_prefix`). `requires` may not form a loop.
- Role ids: each layer has a reserved block (`core.layers.role_block`: the base's `c0`, pharmacy's `ca`, a later pack the next free
  one, or the one it names: `declare_pack(…, role_block)`, `block_taken`), and a built-in role's id is `00000000-0000-0000-0000-00000000<block><nn>`
  (`outside_block`; the core has none, `no_role_block`). An id another layer holds is refused (`other_layers_role`), and so is a key
  another role holds (`key_taken`): a declaration never takes another layer's role over.
- A setup (§5.2): its key in the prefix; a work of desk, visits, stays or bench (`wrong_work`); words (`label_missing`); the packs it
  ticks are its own layer's or those it requires (`unknown_pack`, `other_pack`); settings only one-per-department keys (`wrong_owner`:
  a clinic-wide key is set on its pack's page, §5.1 rule 7) of the core, the base or its packs (`other_pack`, `unknown_setting`), in
  their shapes (`bad_shape`), never the packs, the line or the setup itself (`not_a_setting`); places each with a key, a name and a
  label (`bad_place`), services and presets in the shapes of `service` and `preset` (a preset with a shortcut and no department,
  `bad_preset`), keys and names once (`duplicate`); a Screens line as the department's check would take it once the packs are ticked
  (`bad_screens`, `unknown_screen`, `wrong_work`, `pack_not_used`, `replaced`, `no_board`, `opens_off_line`).
- A screen's action is the core's, the base's or its own layer's (`unknown_action`); what it replaces are base screens of its work
  (`unknown_screen`), never the bed board (`board_is_base`, §5.1 rule 4).
- A setting's fields: each names a node of the shape by its path (`rows.dose`, through objects and arrays of objects), once
  (`unknown_field`, `duplicate`), with words (`label_missing`); a unit only on a number or a list of numbers (`unit_not_number`),
  choices only of its enum or its list's items' enum, matched as text so a numeric enum's too (`unknown_choice`). A form is only a
  pack's (`not_a_pack`): on its page an organization key, on a department's card a department key (`wrong_owner`), one value per owner
  (`form_many`), and every node it draws has its words (`field_unlabelled`).
- A score (§5.1 rule 8): its key inside its layer's prefix (`outside_prefix`), a source (`source_missing`; stored trimmed), words
  (`label_missing`); items (`no_items`), each once (`duplicate`) with a key, words and an input: `choice` (its choices once, each a
  non-empty text value (`bad_choice`) with words and whole points: `no_choices`, `bad_points`), `yes_no` (points for yes and no) or
  `number` (a unit (`unit_missing`), `decimals` 0–4, a plausible `min`/`max`: numbers at the step, min ≤ max (`bad_number`), and
  ranges in order with whole points and numeric bounds, inclusive, touching at the number's step: `no_ranges`, `ranges_open`,
  `ranges_gap`, `ranges_overlap`, `bad_number`); bands over the total in order, touching and covering every total the items can reach (`no_bands`, `bad_band`,
  `bands_gap`, `bands_overlap`, `bands_cover`), each with words and a state tone or none (`unknown_tone`); an alias no other score has
  (`alias_taken`); a declared version never changes (`version_exists`: a changed table is a new version, and the old row stays).
- `may_be_private` is refused for a type whose resources include MedicationRequest, MedicationStatement, MedicationAdministration,
  Immunization or AllergyIntolerance, pack types included.
- Every derived table has `organization_id, patient_id, item, source_entries uuid[]`, so the reader can mask it, and erase and rebuild
  can find it. A refresh has the signature `(organization uuid, items uuid[])` and recomputes, from entries and settings-as-of only,
  every row it owns that depends on those items.

### 3.9 The writer: `public.write(set)` (the only way in)
The client sends `{set_id, made_at, entries[], confirmed[], seen{item: version}}`; each entry is `{id, type, type_version?, patient_id,
department_id, visit_id?, occurred_at?, precision?, until?, data, replaces?, refers_to?, relation?, source_system?, source_id?}`.
The writer:
1. **Refuses nested calls** (a transaction-local flag) and asserts READ COMMITTED.
2. Takes **identity from the JWT** (the login, the session's chosen user, its organization and kind). Never from parameters or GUCs.
3. **Checks the set ledger** (`core.sets`). The same `set_id` with the same hash (md5 of the entries) returns the stored outcome without
   running checks again; with a different hash it is refused `set_changed`.
4. **Locks**: advisory transaction locks on every patient family in the set plus every claim, in sorted order, with `lock_timeout` 3 s
   (a timeout returns outcome `busy`, which the client retries). It works out each survivor again after locking. Then
   `recorded_at` = the clock, or 1 µs after the latest entry of those families when the clock has stepped back.
5. **Generic checks**, which always refuse: the type exists and is on (its pack on for the clinic; while off only a correction lands:
   `replaces`, or `changes` for a type whose base corrects by change, as a step does); the shape; `may(user, 'write:<type>', the
   entry's department)`, except that where the pack's actions do not count (off, or not used in that department) a correction of its
   entry is written by an author of the item who still holds a role there, in the target's own department (so no department can be
   picked to dodge `may`); the department and visit belong to the organization; one patient family per set unless the type declares
   `other_patient`; `replaces` and `refers_to` targets exist in the family and are visible to the writer; the same-resource item rule;
   registered code systems only.
6. **Assigns item and version** under the lock. A `replaces` or `changes` whose seen version (from `seen`, default the target's own
   version) is older than the item's current version gives `changed_since_opened` (level refuse; a type's check may name it better).
7. **Type checks**: each declared check returns findings `{code, level: refuse | warn | flag, entries}` and never raises. A set is
   **live** when it is staff-sourced and arrives within 5 minutes of its `made_at`; every other set is **late**. `refuse` refuses a live
   set, while a late set lands flagged. `warn` comes back to the composer as an inline card and passes when resent with that code in
   `confirmed` (the confirmation is stored in `findings`). `flag` is stored and raises a review row.
8. **Inserts** the entries, fills `codes`, stores `findings`, writes the set ledger row.
9. **Refreshes**: every derived table fed by the new entries' types and their targets' types, with the touched items (the new entries'
   items, their targets' items and their visits). Base tables refresh inline and must succeed. A pack's tables fed by its own types
   refresh inline inside a savepoint; an error marks (pack, patient) stale, never refuses, and queues the same refresh in the outbox to
   be tried again. A pack listening to another layer's types gets an outbox row, drained after commit by a pg_cron job every 5 seconds,
   with the same refresh. The job is a lone `call core.drain_outbox()`: a command of two statements runs as one transaction block, where
   the procedure's commit per row is refused. Live work drains before a catch-up's (§5.2 Off). A failed row is tried again, and parked
   after five tries; a stale mark clears once none of the pack's work for that patient is failing. A pack off for the clinic is
   neither refreshed nor heard (its rows are dropped by the drain). Each drained row sends its patient's content-free record hint, and
   each run one hint per clinic it touched (a row done, failed, parked or dropped), every 50 rows and at its end, so a pack's worklist
   and Settings → Packs catch up without polling and a catch-up of hundreds of patients does not restart every open queue per row. Settings → Packs shows "N patients to refresh", the work failing and parked, with Retry.
10. Sends a realtime hint with no content (`record:<patient>`, `organization:<id>`), and returns `{set_id, outcome, entries: [{id, item,
   item_version}], findings}`. It never returns rows, so a refusal cannot leak private data.

Outcomes: `landed` · `refused` · `warn` · `busy`. Generic refusal codes: `not_signed_in`, `choose_user`, `nested_write`,
`set_changed`, `unknown_type`, `pack_off`, `bad_shape`, `not_allowed`, `wrong_organization`, `wrong_patient`, `two_patients`,
`not_found`, `already_replaced`, `wrong_resource`, `unknown_system`, `changed_since_opened`, `empty_set`.

### 3.10 The reader: `public.read(query)` (the only way out)
- One VOLATILE function. It logs in the same transaction; if the log insert fails, the read fails. The log (`core.read_log`) keeps one
  row per (user, patient, purpose) per 10 minutes: organization, user, department, patient, purpose, what (items or the query), the
  withheld count, time. *Built 2026-10-08 (owner, D19, with core change (f)):* reads merged into one row lose none of what each read —
  `core.read_merge` joins two lists detail by detail (each value once), keeps a detail only one names, else the later's, and every
  reader logs its details as lists (`items`, `tables`, `patients`, `searches`, `records`, `files`, `fhir`). A pack operation that
  returns patient ids (`declare_op(…, patients => true)`) names them in its answer's `patient_ids`, and `public.pack_op` logs one read a
  patient (`ops`: its key; purpose the request's, PATADMIN unless it says — chosen in the build, awaiting the owner); one that declares
  so and names none is refused `patients_unnamed`. `purpose` is a registered key: TREAT (default), ETREAT, PATADMIN, HOPERAT, HRESCH, PATRQT, BTG; free text is
  only added to it.
- Read shapes (`query.shape`):

| shape | returns | needs |
|---|---|---|
| `me` | the login's users, the chosen user, the organization, departments (each with the packs it uses, what each of those declares (`declared`: `{"<pack>":{"charges":…}}`, §5.4 core change (d)) and its Screens line: the one set, else its work's screens of the base and of the packs it uses, the base's first, without a base screen one of those stands in for), sites, places, users, roles, actions, current settings, the registry the client needs (every screen with its action and what it replaces; every score table, each version), stale counts | a live user |
| `patients` | search hits: identity and open visits | `read:patients` somewhere |
| `patient` | one patient's identity (the banner) | `read:patients` somewhere |
| `record` | banner, lists, visits, a page of entries (filters: types, visits, departments, before), key values, hidden counts | `read:record` in the department |
| `item` | every version of an item and the entries that refer to it | `read:record` in the department |
| `table` | rows of one derived table with a fixed filter, plus their source entries and patients | the table's declared action in the department |
| `file` | a storage path for one attachment | the entry is visible |
| `fhir` | an R4 Bundle (`bundle`) or International Patient Summary (`ips`) for a patient | `read:record` and `export:fhir` |
| `log` | the read log, opened-anyway and privacy changes | `read:log` |
| `audit` | settings and admin changes; `what` and `thing_id` narrow it to one setting's history | `manage:settings` |
| `reference` | the licensed lists loaded here: each system's latest load (version, source, licence, sample or not, codes, when) | a live user |
| `score` | a score worked out by the server while the clinician types (`core.score(score, version, inputs)`: each item's points, the points so far, and once every item is answered the total and its band; a value it cannot score is a problem of its item, never a raise); no version: the latest in use; not logged | a live user |

- It collects the source entry ids of every row and calls each visibility rule once as `rule(reader, ids[]) → hidden ids[]`. Rules only
  hide and combine with OR over hidden (AND over visible); a rule that raises means hidden, and is logged. Base rules apply to every
  type, a pack's only to its own types. Types that may never be private skip every rule. Only the base's `opened_anyway` grants
  anything.
- A hidden entry becomes a placeholder: "Private note · Psychiatry · 3 Sep", with no data, no author and no findings. Derived rows that
  came from it are masked too (a private result's values vanish from trends and counts): a row is withheld when its own item has a
  hidden source entry.
- **The row rule** (every derived table, a pack's above all): a row copies data only from its own item; from other items it copies
  only facts that are never private (a medicine's name, an order's service). So masking by the row's item is enough. The pack
  contract suite proves it on every pack table (§8.8).
- FHIR mappings take the reader's rows as input, never `entries`. No `service_role` is used for a patient read.

### 3.11 The two exceptions (owned by `core_eraser`; the permanence trigger allows only `current_user = core_eraser`)
- **Erase** (the law): removes the merged family from entries, every registered table (base and packs), patient stores and storage,
  then refreshes what it touched. *Built 2026-10-08 (owner, D17, core change (g)):* it reaches the tables a pack declares
  (`core.declare_store`: the layer's own table holding organization_id and patient_id, never a derived one, the eraser able to delete
  its rows or empty the columns named — `store_needs`, `derived_table`, `keeps_patient`, `unknown_column`, `not_nullable`,
  `eraser_cannot`): their rows go, or stay with those columns emptied (billing's payments keep their amounts and receipt numbers, D18). The log (`core.erasures`) keeps only the fact: who, when, reason, row count. Only a user holding
  `erase:patient` everywhere, with a second factor, never pack or machine users; the writer never calls it.
- **Redact** (a misfiled entry): blanks `data` and `codes` on the whole item and keeps tombstones (id, type, patient, set, times); logs
  `core.redactions (entry, by, at, reason)` without quoting the content; refused while other entries refer to it unless they are
  redacted too; then refreshes and removes files. The copy on the right patient is a new `import` entry, linked only in the redaction
  log. Shows as "Removed · misfiled · date"; FHIR shows `entered-in-error`.

### 3.12 The other doors (public, SECURITY DEFINER, each checks `may`)
`my_users` (the live users of this login, one per organization, to choose from), `choose_user`, `create_organization` (a login with no user makes the first organization and becomes its owner), `save(what, row)` and
`remove(what, id)` for `organization` · `site` · `department` · `place` · `user` · `role` (remove only what nothing ever used;
anything used is refused `in_use` and retired instead), `save_patient` (register or change identity), `merge_patients`,
`write_setting`, `setup` (a starter setup on a new or an existing department, §5.2), `erase_patient`, `redact`. Every change is a
row in `core.audit` (an AuditEvent).

---

## 4. The base (schema `base`, role `base_role`; first-party, always on)

Type keys are identifiers (`checked_in`, `list_review`); their labels are the words ("Checked in", "List review"). Every status is
FHIR's own code wherever the meaning matches, so the mapping is identity and the screen labels stay plain.

### 4.1 Clinical types

| type | purpose · key fields | FHIR R4 | codes |
|---|---|---|---|
| `note` | text and/or files · kind (history, progress, plan, letter, scan, consult reply…), text, language, attachments | DocumentReference (docStatus amended on correction) | LOINC 11506-3, 34117-2, 11488-4, 34111-1, 28570-0, 18842-5, 18776-5 |
| `vitals` | one set of measurements · a quantity per stable key: `bp`{sys,dia}, `hr`, `rr`, `temp`, `spo2`, `weight`, `height`, `bmi`, `head`, `pain`, `glucose`; method, site | Observation panel 85353-1 + one Observation per key, id `{item}-{key}` | LOINC 85354-9 (8480-6/8462-4), 8867-4, 9279-1, 8310-5, 2708-6 + 59408-5, 29463-7, 8302-2, 39156-5, 9843-4, 72514-3, 41653-7 (glucose 2339-0); UCUM |
| `observation` | one coded fact · code, value (quantity, concept, text or date) | Observation | LOINC (smoking 72166-2, pregnancy 82810-3, LMP 8665-2) |
| `problem` | a problem or visit diagnosis · concept, category (problem-list-item · encounter-diagnosis), clinical status, verification (`/dx ?` = provisional), severity, body site, onset/abatement (partial date or words), note | Condition | WHO ICD-10; HL7 condition statuses |
| `allergy` | allergy or intolerance · concept, type, category (food · medication · environment · biologic), criticality, statuses, reactions[{manifestation, severity}], note | AllergyIntolerance | ATC or EDA ingredient, ATC class; local allergens and reactions |
| `medication` | a medicine · **basis** (prescribed · reported), drug concept, dosage {text, dose, timing, as needed + reason, route}, duration, quantity, instructions, reason → problem items, status (active · stopped · completed), send (to a dispensing department) | prescribed: MedicationRequest per version (id = entry id); the item: MedicationStatement | EDA, ATC, UCUM, v3 route, GTS timing |
| `given` | a dose given or not · what (→ medication item or a concept), dose, route, site, lot, status completed · not-done + reason | MedicationAdministration (a vaccine pack type maps to Immunization) | EDA, ATC, CVX |
| `list_review` | "reviewed" or "none known" for problems, medications or allergies (`/nka`) | List.emptyReason; IPS absent-unknown | IPS absent-unknown |
| `order` | one service asked of one department · service (id, code, name as it stood), target department, priority (routine · urgent · asap · stat), status (active · on-hold · revoked · completed), question, reason, answers | ServiceRequest (requisition = set) | organization service codes + LOINC |
| `step` | the performing department's progress on an order · status (received · accepted · rejected · in-progress · on-hold · completed · cancelled · failed), step key (one of the service's steps), reason, specimen number. The first step `answers` the order; later steps `change` it | Task (fulfil); the key is businessStatus | HL7 task status |
| `result` | an answer to an order, or an outside result · code, status (preliminary · final · corrected · amended), analytes[{key, code, name, value, text, interpretation, reference range copied at write, critical range}], conclusion, attachments | DiagnosticReport + Observation per analyte, id `{item}-{key}` | LOINC, UCUM, v3 ObservationInterpretation |
| `procedure` | something done · code, status, performed time, body site, outcome, reason | Procedure | local |
| `question` | the department an order went to asks whoever ordered it (`about` → the order; §5.3: the pharmacy asks the doctor); on their To review until answered | Communication (about the ServiceRequest) | — |
| `reviewed` | the requester saw an answer (`about` → result or step), or answers a question (`note`, `action`: give_anyway · changed) | Task (review), completed | — |
| `alert` | a standing warning (DNR, isolation for HBV or HCV, fall risk, other) · concept, status (active · inactive), period; ended by an inactive version that `changes` it, once; never names HIV (`names_hiv`) | Flag | local (`local.alert`: dnr, isolation_hbv, isolation_hcv, fall_risk…) |
| `pregnancy` | pregnant or not, a base fact (§5.1 rule 3) · status (current · ended), pregnant, LMP (partial date) or weeks (0–45), reason (why it ended), note; ended by a version that `changes` it, once | Observation 82810-3 (LA15173-0 Pregnant · LA26683-5 Not pregnant; LMP 8665-2 or 49051-6 weeks as a component; ended: effectivePeriod) | LOINC |
| `breastfeeding` | breastfeeding or not, a base fact · status (current · ended), breastfeeding, note | Observation 63895-7, valueBoolean | LOINC |
| `died` | death · time with precision, cause | Patient.deceasedDateTime | WHO ICD-10 |
| `score` | a score worked out by the server (§5.1 rule 8) · score (a declared table's key), version (the one it used, kept), inputs (by item: a choice's value, yes/no, a number as a decimal string), total, band | Observation (the table's coding or its name; valueInteger the total; the band in words; a component per item with its points) | LOINC (GCS 9269-2, 9267-6, 9270-0, 9268-4) |
| `crossed_out` | "this should not be here" · reason (typo · wrong value · wrong patient · late information · other), text | the target's next version, entered-in-error; Provenance NULLIFY | local reasons |

Corrections: `replaces` gives the next version (Observation and DiagnosticReport status `corrected`). A requester's cancel or hold is
an `order` that `changes` the order. The performer's "not done" is a `step`. Preliminary → final is a `changes`. A change of dose is a
`medication` that `changes` the medication; stopping it is a `medication` with status `stopped` that `changes` it.

### 4.2 Presence (each move `changes` the visit's latest version, so each move is a new Encounter version)

| type | meaning | Encounter (R4) |
|---|---|---|
| `checked_in` | starts the visit item in a department: reason, how arrived, priority, here | arrived; class from the department's `encounter_class` |
| `here`, `not_here` | the desk's presence marker | local |
| `called` | a clinician called the patient (calling is not seeing) | local |
| `back_to_waiting` | back to the queue: not here after a call (a missed call), sent out, other | local |
| `away` | stepped out, coming back (to the lab, to pay); after 30 minutes shows as not here | local |
| `urgent` | priority changed (urgent · routine) | priority |
| `assigned` | a clinician takes the visit | participant |
| `seen` | seen by a clinician (written by the composer with the first clinical entry, or implied by `done`) | in-progress; participant ATND |
| `transferred` | Send to…: the same visit moves to another department | location |
| `left` | left before the end (not seen: cancelled; seen: finished + `aadvice`) | cancelled / finished |
| `done` | the clinician's Done; `wait` (Wait for results; unsaid, true) keeps the visit open while orders are out | finished; period.end |
| `admitted` | starts a stay item (`about` the visit it came from), department of work `stays`, optional place; admit source required | class IMP; admitSource |
| `moved` | the stay moves to another place | location[] |
| `discharged` | ends the stay; disposition required | finished; dischargeDisposition |

`base.presence` holds one row per open or recent visit/stay: patient, department, place, state (`waiting` · `called` · `with` · `pending`
· `back` · `done` · `left` · `in_bed`, and for stays `admitted` · `discharged`), here, away since, urgent, assigned, called count and
missed calls, seen at, times. Time-based states are worked out when reading, never by a timer that writes: away for more than 30
minutes shows as not here; a visit with no move for 12 hours shows as left on screens; an opened anyway lasts 12 hours. Arrived,
called and seen, and the visit's day, are clinical times (each move's `occurred_at`, the same as written unless written late), while
the moves count in the order they were written (built 2026-10-06, for the demo's relative times; Done keeps when it was written,
which "Since Done" compares with). An order's times (`base.orders`: sent `ordered_at`, answered `answered_at`, `last_at` and its
day) are clinical times too, and so are pharmacy's prepared and dispensed (`pharmacy.queue`); a Done holds the visit for the orders
open at its clinical time; the chart's steps and a bench's reply show the clinical time.

**A stay takes only its own moves**: `admitted`, `moved`, `discharged`, `assigned`, `urgent` (and a `crossed_out`). A visit's moves on
a stay (`called`, `seen`, `back_to_waiting`, `done`, `left`, `here`, `not_here`, `away`, `transferred`; another ward with the bed is a
later round) are refused `not_a_visit`, and one that lands late never moves it. Entries written in the stay land and move nothing, so
the patient screen on a stay has no Done: Sign writes the drafts as one set and the patient keeps the bed ("Admitted · Bed 3 · day 2").

**The review of results while the patient waits.** A `done` with `wait` and orders out leaves the visit `pending`; when every order
from it has an answer it is `back`, and the clinician sees the patient again. A result that arrives while the patient still waits in
the visit is seen there; it needs a review row only when critical, when the patient left or was marked not here before being seen
again, or when it was corrected after being seen.

### 4.3 Privacy (the base's one visibility rule, `base.private`): hide the story, never the fact
- Types that may be private: `note` and `result`, and pack types that declare it. Medications, allergies, given, problems, vitals,
  orders and presence always show. A doctor must see the lithium.
- An item is private when the latest `private` or `not_private` entry about it says so; otherwise it follows its department's
  `private` setting as of the item's first `recorded_at`. A correction shares the item, so it shares the privacy, and an earlier version
  never shows what the item hides.
- Who reads a private item: holders of a live role with `read:record` in its department (a role held everywhere does not count; a
  machine, importer or retired user never counts); an author of any of its versions; the visit's responsible clinician (`assigned` to
  them, or `seen` or `done` by them in that visit; calling is not seeing; these moves come only from the visit's own department,
  refused `other_department` otherwise, and one that landed late and flagged makes nobody responsible); for an answer to an order, the order's author and holders of `read:record` in the ordering department; anyone
  with an `opened_anyway` for this patient and department in the last 12 h.
- `private` / `not_private` are written by an author of the item or a holder of `read:record` in its department; `not_private` needs a
  reason. A striker (the author of a `crossed_out`) is not an author of the item.
- `opened_anyway` needs a reason (TREAT · ETREAT · PATADMIN · other with a few words); machine, importer and pack users cannot write it.
- `!` at the start of a composer line writes a `private` entry in the same set. FHIR: `meta.security` R or N; `opened_anyway` exports
  as an AuditEvent with purpose BTG, never as a resource.

### 4.4 Checks (base)
- **Claims**: `admitted` and `moved` claim `place:<id>`, so two patients cannot both pass "the bed is free". `base.presence` has no unique
  index on beds: a late conflict lands and shows on the bed board as a conflict.
- **Presence**: `called` needs a waiting visit, and a second `called` for the same version is `already_called`; `discharged` needs an
  admitted stay, and a stay refuses a visit's moves (`not_a_visit`, §4.2); `checked_in` refuses a second open visit of the patient in
  the same department (`already_here`, and the client reuses the open visit); `transferred` needs an open visit and another department.
- **Orders**: a service must belong to the target department; the target must work for the ordering department (`not_served`); a
  `result` may answer only an order whose service answers with results, and a note only a note-answered one (`wrong_answer`); a step
  (and a pack type extending it) that names a step key names one of the `steps` of its order's service as the service stands now, or
  it is refused `unknown_step` (the first step finds the order it answers; a later one, through the step it changes); keys come in any
  order and may repeat (a sample collected again); a step with a status only (in progress, held, not done) names none. A service
  without steps or retired, or an order with no service id, lists none; a service lists each key once (`duplicate`).
- **Standing facts** (`alert`, `pregnancy`, `breastfeeding`, one check `base.fact_check`): an end (`ended`, an alert `inactive`)
  `changes` the fact (`nothing_to_end`) and only one still standing (`already_ended`: an ended fact is over, a new one starts its own
  item); an alert, in any version, never names HIV in its words, note or codings (`names_hiv`: the word, HIV1 and `_hiv` too, AIDS,
  spelled out, in Arabic, the ICD-10 codes B20–B24, Z21, R75, Z20.6, Z71.7, O98.7; `base.names_hiv` and the client's `namesHiv` hold
  one pattern); one current pregnancy and one breastfeeding at a time (`already_recorded`: a new line changes the standing one); a
  pregnancy's dates only when pregnant (`dates_not_pregnant`), an LMP or weeks, not both (`lmp_or_weeks`), an LMP a real day
  (`bad_lmp`) never after the day written (`lmp_future`); a warning for a current pregnancy's LMP more than 44 weeks back
  (`lmp_long_ago`; an end written after the delivery is not warned) and for a man recorded pregnant (`sex_male`).
- **Scores** (`base.score_check`, §5.1 rule 8): the server adds the inputs up again with the version the entry names and refuses a
  total or band that differs (`score_mismatch`); a score or version not declared (`unknown_score`) or retired (`score_retired`), an item
  unanswered (`score_incomplete`), a value it cannot score (`bad_input`); a pack's score where the department does not use the pack
  (`pack_not_used`). Nothing ever recomputes an old entry.
- **Warnings** (inline cards): allergy clash and duplicate therapy (by ATC ingredient and class), a dose above the usual, a problem
  already on the list.
- **Flags**: an unknown code, a unit that is not UCUM, a late conflict, a stale correction, a critical result (LL, HH, AA).

### 4.5 Derived tables (keyed by item or uuid v5(item, key); refreshed from entries and settings-as-of only)

| table | holds | serves | read action |
|---|---|---|---|
| `base.presence` | visit or stay: patient, department, place, state, here, away, urgent, assigned, calls, times | desk, queue, bed board | `read:queue` |
| `base.lists` | patient, list (problems · medications · allergies), item, status, current entry, last review | the record's lists, IPS | `read:record` |
| `base.orders` | order item: requester, ordering and target department, service, status, step, priority, due, answers | bench worklists, open orders | `read:bench` or `read:record` |
| `base.review` | the item to review, for whom (a user or department), why (result · not seen · corrected · critical · flag), critical | the review loop | `read:review` |
| `base.values` | patient, item, key, code, numeric value, ucum, interpretation, at | trends, key results | `read:record` |
| `base.deceased` | patient, died item, time | the banner | `read:patients` |

**The review loop.** A `result` answering an order raises a review row for the order's author (why `result`, or `critical`), unless
the patient was still waiting in the ordering visit and saw it there (then only a critical one); a correction raises it again
(`corrected`); a `step` that ends an order (rejected, cancelled) raises one too. The department's `review_results` setting (`critical`
· `abnormal` · `all`, as of the result) decides which results of a patient who is not waiting need review. A `reviewed` about the
latest version clears it. Flagged entries raise a review row for the entry's department.

### 4.6 Settings keys, actions, roles and screens
- Settings keys: `organization.time_zone`, `organization.packs_used` and `score.signed_off` (declared by the core; the last written by
  `sign:score`, §5.1 rule 8), `organization.record_view` (visits ·
  entries), `department.private`, `department.encounter_class`, `department.after_done` (next · queue),
  `department.review_results`, `department.works_for` (a bench: department ids, or all), `department.checks_in_for` (a desk: the
  clinics it checks in for, or all), `department.packs` (the packs used here, §5.1 rule 1: each a known pack, on for the clinic, once:
  `unknown_pack`, `pack_off`, `duplicate`), `department.setup` (the starter setup it was made from, kept by the setup door, §5.2), `department.screens` (the Screens line: its tabs in order and which opens first; each
  screen declared, the base's or of a pack this department uses, of its work, once, never beside a base screen one of them replaces,
  a department of places keeping its bed board, and opens on the line: `unknown_screen`, `pack_off`, `pack_not_used`, `wrong_work`,
  `replaced`, `duplicate`, `no_board`, `opens_off_line`), `service` (owner = the performing department: code, name, section, LOINC coding,
  answer type, steps (in order; keys such as `collected`, `received`), fields with LOINC, UCUM units, ranges by sex and age, critical
  ranges, choices), `preset` (name, shortcut, lines, services, department or all), `place.closed`.
- Actions: `write:<type>` for every type; `read:patients`, `read:record`, `read:queue`, `read:bench`, `read:review`, `read:log`,
  `export:fhir`, `manage:patients`, `manage:settings`, `manage:users`, `manage:roles`, `manage:places`, `erase:patient`, `sign:score` (the
  core's: sign a score's version off for the clinic; the Doctor holds it).
- Built-in roles (fixed ids): Owner `…c001` (every action, held everywhere), Doctor `…c002`, Nurse `…c003`, Reception `…c004`, Lab
  technician `…c005`. A pack may ship its own (Pharmacist `…ca01`, Store keeper `…ca02`).
- Default screens: front desk (`base.desk`, work `desk`, tab for `read:patients`), queue (`base.queue`, `visits`, `read:queue`), bench
  (`base.bench`, `bench`, `read:bench`), bed board (`base.beds`, `stays`, `read:queue`; the one board of every department of places,
  §5.1 rule 4); then the patient's chart, composer,
  settings, the style guide (`/design`). All of them write and read through the same two doors.
- **A department's screens** (§5.1 rules 5 and 6): the client draws each declared screen with the component registered under its key
  (`registerScreen(key, Component)`, `src/core/screens/registry.ts`; the base's four in `screens/base.ts`). The department's Screens
  line is its one row of tabs: only the tabs whose action the user holds there, at most five in the line's order, then **More · n**,
  which opens the rest in the row (and stays open, with no Fewer, while the selected tab is one of them; each department starts
  folded); it opens on the line's `opens`, keeps the selected tab in the link (`?tab=`), and the selected tab is the title. A pack
  screen whose pack is not used there gives back the base screens it replaces, and Settings edits the line as it shows. A screen that
  replaces the bench lists every request sent to the department. Every screen sits in the kit's frame.
- **The chart** is the patient screen: the clinic visit and the ward stay (`/visit/:id`) and the record with no encounter
  (`/patient/:id`). Whose visit it is: the queue row, else who-is-where (`base.presence`), else the patient of the link.
  - *Banner* (sticky, one line in zones by §5.1 rule 3; no queue line above it: the queue is the clinic's home): *who* (name, age,
    sex, number, deceased; the phone is in the Summary) · *where* (in consult · follow-up · 12 min, or Admitted · Bed 3 · day 4, day 1
    the admission's clinical day; urgent) · *safety*, the same in every department (`model/banner.ts`): severe allergies by name
    (high criticality or a severe reaction) and the others counted, or No known allergies / Allergies not asked (warn); the active
    alerts in short words (DNR, Isolation · HBV, Isolation · HCV, Fall risk in warn; words naming HIV read Isolation); "1 critical to
    review", the patient's critical results waiting whoever they wait for (opens the review list); Pregnant · n wk (weeks from the
    LMP, or the weeks said plus the weeks since; past 44 weeks never ended, "Pregnancy · check (n wk)" in warn), Breastfeeding · then
    this department's pack words (`registerBannerWords`, `src/core/screens/chart/words.ts`): two, best ranked, then **+n**, which
    opens the rest as a second line in the banner and folds it again (Fewer). No vitals: the Summary shows them with their trend. Actions: a clinic visit of mine in consult, **Done** (Sign N · Done → next, ⌘↵: signs and closes the
    visit now; results that come later go to the review list) and, only while this visit has orders out (with those its drafts sign),
    **Wait for results · n** (⌘⇧↵: Done, the visit open until they are answered); its back arrow sends the patient back to the waiting
    room with the visit open, what is written signed into it (nothing written: as they were before the call, in their place, no
    missed call). No More (owner, 2026-10-07): where Done goes next is `department.after_done`; Not here is the desk's. A stay, **Sign** (into the stay, no move) and **Discharge** (inline chooser); otherwise "with Dr. X — theirs to
    finish", **Sign N** (outside any visit) and **Start visit**.
  - *Center*: notices (the error line; the writer's warnings, Sign anyway), the composer (for `write:note | write:vitals | write:order`),
    the long note, the drafts drawn as the blocks they will be, then what the center shows (`?at=`): this visit's signed sets (one card
    per set; a prescription, a requisition, the problems, the allergies of a set are one block each), a stay's days with **Since
    yesterday**, **Since Done** for a clinic patient back with results; an older visit (read-only, Esc back), Outside a visit, the
    **Whole record** (by visit or by day per `organization.record_view`, paged), results over time, one entry with its Details under
    it. A kind filter (`?kind=`, `[` `]`) narrows each. Nothing opens over the record.
  - *Record panel* (right; tabs under 640 px, on a phone): the **Summary** — the phone, active problems, current medicines, allergies
    and alerts, pregnancy & feeding (when either is recorded, each with End), last
    vitals, key results, last visits, still waiting, each with its limit and empty state, and before Last visits each shown pack
    section's Summary line — then Problems, Medicines, Allergies & alerts, History, Results, Documents, Visits & stays, and the packs'
    sections by §5.1 rule 2. Every section comes from one registry (`registerSection`, `src/core/screens/chart/sections.ts`; the
    base's in `panel/base.ts`; the packs' data in a read of its own), and the section chips above them (§5.1) jump to each; list
    actions seed the composer; a fact opens its entry in the center.
  - *Glance*: the Summary's first five items at half their limits and the visits, read-only — beside the bench grid for a reader
    holding `read:record` there, and in place of the chart for a reader who may not read the record (presence and identity only; the
    desk's card folds out the same visits).
  - *Keys*: `/` the composer · Alt+P / M / A start /dx /rx /al · ⌘↵ Done (Sign in a stay; Sign N for someone else's patient) · Alt+R
    the record's sections and back · 1–9 the section chip in that place (never while typing) · `[` `]` the kind filter · ↵ a block's
    Details · Esc closes them, then back to this visit · Alt+J Who's in.

#### Design system
One system for core and packs (`src/core/ui`, imported as `@core/ui`): **tokens** in `src/core/styles.css`, a light and a dark value
each (canvas, surface, raised, sunken, paper; fg, muted, faint; line, line-strong, hover, focus, selection, overlay, band; accent and danger, warn, ok,
info, each with `-soft`, `-line` and `-fg`; text 11–22, radii sm–xl, shadows xs–md, the layers, `split` 640 px); the theme is the
user's choice (System, Light, Dark; per browser, no flash). **The kit** builds every screen: buttons, fields, chips, tags and badges,
callouts, sections, tabs, rows (a pack's marks in one place on each, `ListRow` `marks`), the banner, the split frame, KV, the analyte table, steps, stat, sparkline and line chart, and a
department's frame (`ui/frame.tsx`: `ScreenTabs`, `ScreenFrame` with its one toolbar, `NotForRole`, a line inside a list at `sm`;
`Empty` for nothing here). **The rule**
`opencare/tokens-only` (ESLint) refuses raw palette classes, literal colours, off-scale sizes and `dark:` anywhere outside the kit;
colour marks state, never type, and never alone (a glyph or a word goes with it). **`/design`** shows every token with its live
contrast (all pairs AA in both themes), every component and state, the record's blocks and the charts; it is the one reference a
pack builds against.

### 4.7 The composer
The composer turns typed lines into one set. `/v 120/80 88` becomes `vitals` with codings by stable key; `/dx` a `problem`; `/rx` a
`medication`; `/al` an `allergy`; `/nka` a `list_review`; `/order cbc, hba1c` two `order`s (a word fitting two services asked, never guessed; a pack
that answers orders adds its own word, the laboratory's `/lab cbc, dm follow-up, troponin stat ? chest pain`, §5.1 rule 1); `/preg 12w` (or `lmp 2026-08-01`, `no`,
`end delivered`) a `pregnancy`, `/bf` (`no`, `end`) a `breastfeeding` and `/alert dnr · hbv · hcv · fall · <words>` (`end dnr`) an
`alert`, each with its card, changing or ending the fact that stands (an alert never names HIV); `/score gcs 4 5 6` (or a score's
alias, `/gcs e4 v5 m6`) a `score`, its card asking the server as it fills (§5.1 rule 8); a plain line a `note`; `!` a `private`
entry about the line's entry; `#preset` expands the preset's lines. Warnings come back as inline cards below the line. Done is one set
that includes `seen` (when not yet seen) and `done`; drafts live in the browser (IndexedDB per user, patient and department), cleared
at sign-out. The drafts are drawn under the line as the blocks they will be (the exact type and data the set will write), and
`/note` alone, a card's long note or a long draft's edit open the long note inline under the line (⌘↵ adds, Esc closes), so the
record stays in view. A pack's command is offered only in a department that uses its pack; typed elsewhere, an inline card says where
it works ("/x is used in: …").

---

## 5. Packs
- A pack is a key (`pharmacy`), a schema and a role (`pack_pharmacy`), registry declarations inside its prefix, and client screens
  under `src/packs/<key>/`. It is built exactly like the base.
- **`base_type`**: a pack type that is a base idea names it, and the base's checks, privacy, lists, review loop, record line and FHIR
  mapping apply. The pack adds its fields under `data.<pack>`. `pharmacy.dispense` extends `step`, answering the order sent to the
  pharmacy.
- **May**: add types, checks, inline refreshes and visibility rules for its own types; react to base or other packs' types only through
  listeners after commit; add settings keys, screens, roles and code systems.
- **May not**: redefine base ideas; loosen visibility; declare outside its prefix; call the writer from a check or refresh; reach the
  network; read another pack's tables; hold any privilege on core tables.
- **Dependencies**: `requires` other packs, with no loops, checked at declaration.
- **Off** (not in `organization.packs_used`): its types refuse new entries except corrections and cross-outs (a correction by an
  author of the item, §3.9 step 5), nobody holds its actions, its entries stay on every chart read-only, and its visibility rules keep
  applying, and its tables are not rebuilt. **On again**: it catches up in the background, its progress in Settings → Packs (§5.2
  Off). There is no removal while
  its entries exist.
- A pack screen may look nothing like the base's and may replace a department's default screen (declared with `replaces`, registered
  with `registerScreen`), but it calls the same actions. It is
  built from the kit (`@core/ui`) and the tokens only (`opencare/tokens-only`, §4.6 Design system), so it reads natively in both
  themes; a record block of its own type goes through `registerRenderer(type, { Block })`, drawn inside the chart's shell. A colour
  the tokens lack is asked for in core, never invented in the pack.
- **No new packs until the owner says so.** The packs he asked for: pharmacy and laboratory (§5.3), billing (§5.4, to build), radiology (§5.5, 2026-10-08), and the departments of beds — ward, ER, ICU, CCU, the labour ward and dialysis, "all at once, they share
  common things" (§5.6, 2026-10-08); after them ObGyn's clinic, paediatrics, surgery with theatre and anaesthesia, family medicine and
  internal medicine with its branches (cardiology, haematology, nephrology, respiratory, oncology), "the last" group (§5.7, pictures
  2026-10-08).

### 5.1 How a pack shows up (decided with the owner, one rule at a time, from 2026-10-04)
- **Rule 1 · on per department.** Two switches: the clinic turns a pack on (`organization.packs_used`), then each department ticks
  the packs it uses, from those (Settings → Departments → *Packs used here*; a starter setup ticks its own). One tick brings
  everything together: the pack's tabs on the department's Screens line, its chart section (rule 2), its composer commands, its
  banner words and its marks on the department's lists. Where a pack is not ticked, its commands are not offered; the composer says
  where they work ("/anc is used in: ObGyn clinic"). Unticking hides these there and keeps every entry; a patient's section still
  shows by rule 2 when they have its data. A pack off for the clinic cannot be ticked anywhere. *Added 2026-10-07 (owner):* a pack that
  answers orders (the laboratory, the pharmacy, later radiology) offers its order command where a department using it **works for**
  this one, not where it is ticked: `/lab` shows in every department the Laboratory serves (its `department.works_for`), searches only
  that pack's services there, and typed elsewhere says where it orders from ("/lab orders from: Laboratory"). Its words are the
  pack's own, declared with the command (radiology's `/xr`, `/us`, `/ct`, each its section), never typed by an admin; the department
  comes from the pack's starter setup; the admin decides only which departments use the pack and whom each serves. A word fitting
  two services is never guessed (the card under the line asks), and the base's `/order` still searches everything. *Built
  2026-10-07:* a command declares `orders` (and `groupTitle`, its group's words in the / list); `notHere` says why one is not offered
  (where it is used, or where it orders from; in the department itself, "a test asked for here starts as a walk-in");
  `orderRequests` (`visit/parse.ts`) reads codes, names, a preset's name or shortcut, `stat`/`urgent` and `? the question` (kept as
  the order's question), and `matchesOf` takes every best match at the first step that finds any, so more than one is asked (its
  choices in the card and under the suggestions; one chosen puts its code in the line; nothing is added until it is). A pack's order
  command may add a word to each test it suggests (`hint`) and a line under the card (`note`): the laboratory's `/lab`
  (`packs/lis/order.tsx`) says each test's tube and, under the card, the tubes and the fasting to tell the patient. It offers every
  service of the departments using the pack that serve this one, as those departments have them; one that takes no sample shows no
  tube. What a department offers is its own setting: an X-ray belongs to an imaging department, not the laboratory.
- **Rule 2 · a pack's section in the chart.** It shows when this department uses the pack *and* the patient fits it, or when the
  patient already has that pack's data. Each pack declares its fit once, by age and sex (Pregnancy: women 10–55; Growth: under 19);
  a clinic cannot change it. Base sections always show. Every other section waits behind **More · n**, which opens in place as more
  chips (never a menu over the record). Order: Summary, this department's pack sections, the base sections, then other packs'
  sections that have data. A section that shows because of private data shows the fact, not the story (§4.3). *Built 2026-10-06:*
  a fit is a sex (any · female · male) and an age from and to in days, months or years, both inclusive in completed units (Growth:
  to 18 years), by the clinic's day; a female-only section leaves out only men and a male-only one only women (other and unknown
  fit both), and an age not known fits. A pack section names the types whose entries are its data (a pack type extending a base one
  is found by either); the chart reads them with their cross-outs in a read of their own (never on the facts page, whose alerts
  feed the banner), so has-data sees an item hidden from the reader as the reader's placeholder, and an item crossed out or
  redacted does not count. A section whose data is all hidden says "private" on its chip, gives no
  Summary line and lists the placeholders ("Private dispense · Psychiatry · 3 Sep"); the pack is handed only what the reader may see.
  A pack off for the clinic with no data on this chart waits nowhere (not even behind More).
- **Rule 3 · the banner stays short.** One line in fixed zones, split by thin lines: *who* (name, age, sex, record number) · *where*
  (the encounter in words: "Admitted · Bed 3 · day 3", "In consult · 12 min") · *safety*, the same in every department: allergies
  (severe ones by name, "not asked" in amber), the base alerts (DNR, isolation for HBV and HCV, never HIV, fall risk), critical
  results waiting, pregnant or breastfeeding (base facts, since they change what is safe to prescribe or image) · *this department's
  packs*: at most 2 words, each pack ranking its own, then **+n**. +n opens a second banner line in place and folds it again; nothing
  pops over the record. The phone number and everything else live in the Summary. *Built 2026-10-06:* the zones are the kit
  banner's (`zones`, `second`), thin lines from 640 px, wrapping without them on a phone (the actions wrap first); safety is worked
  out from the record alone, never the department (`safetyOf`); a pack registers its words with a rank (1 first,
  `registerBannerWords`), read from its types' entries in the packs' own read; only the packs the department uses speak (its
  `department.packs` through the directory), sorted by rank, then the department's pack order; a pack whose words fail says nothing.
  Pharmacy's: "n to collect" while a dispense waits prepared.
- **Rule 4 · one board per place.** Beds, chairs and cubicles always show on the one base board, the same in every ward, ICU, labour
  ward, dialysis unit and ER. A pack the department uses adds one line to each tile (its words: "Ventilated d2 · NorAd 0.15 · MAP 62",
  "6 cm · past alert line") and at most 2 buttons of its own, after the base buttons; Admit, Move and Discharge are always the base's,
  in the same place. A list of work that is not places (the theatre list, the radiology worklist, dispensing) may be the pack's own
  screen: then it is the department's only screen for that work, never a second tab beside the base one, and it does the base
  actions (call, start, done) itself. *Built 2026-10-06:* every tile of the board (`ward/BedBoard.tsx`, `ward/Tile.tsx`) is the
  base's part on top (the bed; who is in it, sex and age; the stay's day, 1 the admission's; the responsible clinician; the reason),
  then one pack line, then the buttons at its foot. A pack registers its words once (`registerTileLine(pack, (row, ctx) → {words}`,
  `ward/tiles.ts`; words plain, or one by one each with its own state tone, which colours only that word, never the line) and at most two buttons (`registerTileButton(pack, {label, show(row), onClick or path})`; a third is
  refused, and so is a base button's word: Admit, Admit here, Move, Discharge); only the packs the department uses (its
  `department.packs` through the directory) speak, each in turn on the one line in the department's pack order, and a pack whose
  words fail says nothing. The base's Admit here (a free bed), Move and Discharge (a taken one) come first and always hold their
  place: for whoever may not admit they are drawn off ("not for your role"), never left out; then at most two pack buttons on a
  taken bed, in the department's pack order. A stay admitted with no bed here is a tile too, with the packs' line and buttons (the
  base's move and discharge are a bed's). A pack word takes a colour only for a state (ok, info, warn, danger); any other tone is
  dropped. **Marks on the lists** are the same idea: `registerRowMark(pack, (row, ctx) → {word, tone})` (`screens/marks.ts`), one
  per pack, read from the row's patient, visit and orders, drawn in one place on each row (after what it says) of the desk, the
  queue and its requests, and the bench, only from the packs the department uses, in its pack order. A mark sees only what its
  reader may read: a row carries its visit's orders only for whoever holds `read:bench` where the list is read (a Doctor; not a
  Nurse, nor the desk's Reception). No pack screen stands in for the board: `declare_screen` refuses one that replaces `base.beds`
  (`board_is_base`), and a department of places keeps the board on its line (`no_board`; the client draws it first should a line
  leave it out, and Settings cannot take it off). Pharmacy's mark: "Rx to collect" on the clinic queue, for whoever reads its
  orders, while a prescription waits prepared at the pharmacy (open and started, whatever the service calls its steps, as its
  Dispensing screen's Prepared and its banner word); none on the desk, whose Reception reads no orders, nor on the bench, whose In
  progress says it.
- **Rule 5 · one frame for every screen.** The platform draws it for base and pack screens alike: the department's tab row, then one
  toolbar (the screen's views on the left; search, date and the main action on the right), then the content, at one width with one
  margin everywhere. No heading under the tabs: the selected tab is the title. The pack fills only the content; empty and "not for
  your role" states use the kit's one component for each.
- **Rule 6 · one row of tabs.** The department's tabs are the only tab row. A screen's own views (Collect, Receive, To verify…) are
  counted filters in its toolbar, with a state colour only when the count needs action ("To call 1"). A tab shows only to roles that
  can use it. At most 5 tabs, the department's most used first, then More · n, which opens in place.
- **Rule 7 · every setting editable in the app.** Each pack setting is declared with its shape, and the platform draws its form from
  that shape (a choice, a number with its unit, a small table, a list to add to), with the same checks as the server; a pack may add
  its own editor only for a complex setting (a price list, a growth table), inside the same frame. Clinic-wide settings sit on the
  pack's page (Settings → Packs → Emergency: the triage scale); per-department ones on that department's card (its zones and places).
  A change takes effect from the moment it is saved; the old value stays in the history with who changed it and when. Licensed
  reference lists (EDA drugs, WHO growth charts, ICD-10) come in by import script and show read-only with their version, source and
  licence. *Built 2026-10-06:* `declare_setting(…, fields, form)` (§3.8); the automatic form (`src/core/screens/settings/form/`: a
  pure model drawing a choice as chips, a number with its unit, words, yes/no, a small table of up to four plain columns with rows to
  add and remove, a list to add to (words, numbers, or choices to tick; larger objects as a group each), a sub-section as a group, a
  datatype left to the pack's editor; a choice keeps its value as declared, a number's too; checked against the same shape as the
  server, each error and each refusal the server names a field for under that field, and one at a path the form does not draw (inside
  a datatype, a key the shape no longer names) at its nearest drawn place, else over the Save, so a refusal is never silent; a saved
  value starts the form less any key its shape no longer names); each setting in its card with Save, "Changed by … · when" and a History fold (the `audit` read by
  setting); `registerSettingEditor(key, Component)` draws a pack's own editor in the same card. Settings → Packs → *pack* lists its
  clinic-wide settings; Settings → Departments → a department shows, for each pack it uses, a card of that pack's per-department ones;
  Settings → Reference lists shows each loaded list (a demo's marked "demo sample, not the full list"). Pharmacy's: `pharmacy.late_after`
  (per pharmacy, 5–1440 min, 30 by default: Dispensing marks a prepared row waiting longer "late · n min" and counts Prepared in
  warn) and `pharmacy.counselling` (for the clinic: a note shown above Give, which its check refuses empty while shown,
  `note_missing`).
- **Rule 8 · a score is worked out once.** Each score (NEWS2, SOFA, APACHE II, Aldrete, GCS, PHQ-9, EPDS…) is a declared points
  table with a version and its source, and the server is the only place that adds it up: a card asks the server while the user
  types, and the record, the board tile and the review list all show that one result. An entry keeps the version it used ("NEWS2 6,
  2017"); a new version applies to new entries only, and nothing is recomputed. Settings → Scores shows every table read-only, with
  its version, its source and the clinician who signed it off for this clinic. *Built 2026-10-06:* `core.declare_score(key, layer,
  version, source, items, bands, labels, short, alias, coding)` (§3.8) keeps one row per version in `core.scores`; an item is a choice
  (points per choice), yes/no (points for each) or a number with its unit and decimals (points per inclusive range); the bands over
  the total carry words and a state tone or none (GCS: 3–8 severe in danger, 9–12 moderate in warn, 13–15 mild). `core.score(key,
  version, inputs)` is the one sum, granted to the base and every pack role, and the API reaches it through the `score` read. The base
  type `score` keeps `{score, version, inputs, total, band}`, and its check adds it up again with that version (§4.4); `core.retire_score`
  closes a version to new entries. The composer's `/score` (and each score's alias) opens an inline card: chips with the table's points,
  yes/no, a number with its unit; while it fills, the card asks the server (debounced, a late answer to older inputs dropped) and shows
  each item's points, the total and the band in its words; Done waits for the server's answer to what the card holds and writes it. A
  pack's score is offered and written only where the department uses the pack. Signing a version off is the setting
  `score.signed_off` (`sign:score`, which the Doctor holds — any doctor may sign a score off, decided with the owner 2026-10-07; who
  and when are the setting's); Settings → Scores shows each table, the
  sign-off or "not signed off for this clinic" (the score still works), Sign off and Withdraw, and earlier versions folded. The base's
  score is the Glasgow Coma Scale (1974, LOINC 9269-2), which every department uses.
- **Rule 9 · each pack brings its own demo.** Its own 2–3 patients for its main path, with real-sounding, unique names and believable
  values; a demo login for each role it declares, on the sign-in page grouped by department, so every screen is checked as the person
  who uses it (never as Admin). Times are relative to the moment the demo loads ("arrived 40 min ago", "admitted 2 days ago"); one
  command reloads it. No pack writes on another pack's patients, except one shared journey patient (GP → ER → ward → ICU → ward →
  home, follow-up booked) whose steps the packs add in order. The demo passes the packs' fit tests (rule 2): no adult values on a
  baby. *Built 2026-10-06:* `npm run db:demo` (`scripts/demo.sh`) loads `supabase/demo/load.sql` in one transaction: the kit
  (`supabase/seeds/demo_kit.sql`), the base's seed (`seeds/dev.sql`: the clinic, departments made from the base's setups, what the clinic changed since,
  presets, a person for each of its roles) and day (`demo/base.sql`), each pack's seed and day (`seeds/pharmacy.sql`, `demo/pharmacy.sql`), then
  the clinic's own choices that join two packs, which no pack may make (`seeds/clinic_packs.sql`, `demo/clinic_packs.sql`; *chosen in the
  build 2026-10-08, awaiting the owner*), then the
  shared journey (GP → ward → home with a follow-up booked), one file per layer's step in its order (`demo/journey/1-base.sql`,
  `2-pharmacy.sql`, `9-base.sql`; a pack's step names only its own ids and is skipped while the pack is off). A reset
  runs the seeds (`seeds/*.sql`). Everything is written through the doors as the user each step names (`demo.w` stops the load on a
  refusal or a flagged entry); only the logins are the auth service's own rows. Run again, it reloads: the seeds add only what is
  missing (`demo.setup` a department from its setup, `demo.grant` a holding, `demo.tick` a pack, `demo.screen` a tab on the Screens line,
  `demo.setting` written once) and
  each demo patient is erased through the eraser's door and written again, so it leaves a working day; each stay takes its bed
  when it is free, else the ward's next free one as the writer finds them (`demo.w_bed`), so a patient admitted in the app never
  stops a reload. Every
  time is minutes, days or years before the load (`demo.ago`, `demo.born`, through the kit's one clock `demo.now`; the scan in
  `npm run test:demo` refuses a calendar date, a year or `now()` in any demo file). Today's day spans the five hours before the
  load; loaded before 05:00 those minutes are squeezed in proportion into the time since midnight, so every visit stays today's
  and in order. Ids: the base keeps its fixed ones, a pack's are `demo.id(<pack>, <name>)` (uuid v5 in its namespace), and a
  row outside the file's layer is refused (§5.2); a setup's things take their ids from their keys (`demo.bed(n)`, `demo.service`). The
  sign-in page lists the people grouped by department from `src/core/shell/logins.generated.ts`, which `npm run gen:logins`
  writes from the seeded people and the kit's one password (`demo.password()`) and `db:test` checks like the shapes; a click
  opens that department. Pharmacy's: the Pharmacy
  department (from its setup: the tick, the line, its service and late mark), the clinic's counselling note, Dr. Reem Hamdy (Pharmacist) and Hesham Ragab (Store keeper); its three patients (one
  prepared 55 minutes ago and late, one prepared 10 minutes ago to collect with a second to prepare, one given) and the journey's
  medicines for home. The base's: a waiting room (the longest 40 minutes, a four-year-old urgent), one in consult, the morning
  done (a pregnant woman at 24 weeks, a breastfeeding mother and her three-month-old, a sample on its way, a result back), two
  admitted, a private note in Psychiatry, alerts (DNR, fall risk, isolation for HBV), a critical result waiting, and Nadia Kamel's
  full chart.
- **The section chips** (the owner's choice A): one row. Summary, then this department's pack sections, a thin line, then the base
  sections, then More · n. Each chip carries its count or its state in words ("Medicines 1", "Allergies not asked", "Results 1
  critical", "Chronic care on target"); a section declares that word as it declares its Summary line. Colour only for a state
  (critical red, not asked amber), never to mark a pack: the department's packs are told apart by their place and the line. Keys
  1–9 jump to the chip in that place. Chips that do not fit the row's width fold into More too, from the end, so More is always
  in sight and the row never runs past its edge; the Summary and a chip with a state word ("1 critical", "not asked") never fold.
  Opened, the row wraps onto a second line so every chip is in sight, Fewer last. On a phone it sits under the banner. *Built 2026-10-06:* the base's words —
  Problems the active ones, Medicines the current ones, Allergies "not asked" (amber), "none known" or a count (red with the
  severe ones counted, "2, 1 severe"), Results a count or "n critical" (red), History, Visits and Documents (once the section has
  been opened, since its files are read then; "3+" while earlier pages remain) a count; a count of none says nothing. Problems,
  Medicines and Allergies count this patient's list drafts as their section heads do (a drafted allergy or none known clears "not
  asked"). The row never wraps (it scrolls sideways on
  any width); More's chips open after the rest, with their sections under the others, and Fewer folds them; the thin line shows
  only when this department has a pack section in the row. A pack's Summary line shows only while its section is in the row.

### 5.2 What a pack may read and do (decided with the owner, 2026-10-06)
- **Reading.** A pack reads only through core doors, never core tables: identity (age at a moment, sex, birth date and its precision,
  deceased, unknown), a patient's entries by kind, a visit's entries, the lists, latest values by code, open orders and dues, code
  properties, departments and their places, staff identifiers. **Masked by default**: in a check or a screen the reader is the person
  writing or reading, taken from the session, never passed in, so a pack sees only what that person may see. Only a refresh or a
  listener reads unmasked, and its rows keep `source_entries` for the reader to mask. A pack row copies data only from its own item;
  from other items it copies only facts that are never private. A permanent test proves no private value leaks into a pack table.
  *Built 2026-10-06:* the doors, granted to every pack role by `core.create_pack` (never to the API):

  | door | returns |
  |---|---|
  | `base.pack_identity(org, patient, at)` | sex, birth date and its precision, estimated, unknown, deceased and when (the base's `died`), the age at the moment in completed years, months and days by the clinic's day |
  | `core.pack_kind(org, patient, kind, filter)` | the family's entries of a kind, a pack type extending it included (`core.kinds`), newest first; filter `data` (contained), `codes` (any), `from`/`to` (clinical time), `current` (each item's latest version, while still of the kind), `limit` (applied last, after the filters and the masking) |
  | `core.pack_visit(org, visit, kind)` | the visit's own moves and every entry written in it, oldest first |
  | `core.pack_entries(org, items)` | every version of these items, what refers to them and what they refer to |
  | `core.pack_rows(org, table, query)` | rows of a base table through the registry (never another pack's): `patient`, `where`, `latest {by, at}` (newest by `at`'s own type), `limit` (applied last) — the lists, latest values by code, open orders and dues; at most 2000 matching rows are read |
  | `core.pack_codes(system, codes)` | labels, parent, props, retired |
  | `core.pack_department(org, department)` | its work, the packs it uses, its places |
  | `core.pack_staff(org, users)` | name, title, kind and identifiers (syndicate numbers) |

  Masked means: the reader is `core.me()`, and a read for another organization is refused `wrong_organization`; a hidden entry comes
  back as its placeholder (no data, codes, findings, author or end time, as the reader's); a data or codes filter matches only what
  the reader may see, and a hidden match takes no place in the limit; a table row with a hidden source entry is withheld before the
  latest is picked and the limit applied, so the latest value is the latest the reader may see. Unmasked means a refresh or a
  listener under way: the core runs each one through `core.run_refresh`, which marks this backend's transaction in `core.unmasked`
  with the clinic it runs for (no pack holds a privilege on it, nor may call `run_refresh`) for the call's length; an unmasked read
  of another clinic is refused `wrong_organization` too.
- **Roles.** Each specialty has its own role, declared by its pack and **built on a base role**: an Obstetrician holds everything a
  Doctor holds plus ObGyn's actions, an Anaesthetist is Doctor plus anaesthesia, a Midwife is her own role built on Nurse plus births;
  whatever the base role gains later, the specialist gains too. A pack marks some actions *everyday* (`/anc`): in a department that
  ticks the pack, its ordinary Doctors and Nurses hold those, and only those. A pack's actions count only in departments that tick it
  (rule 1). Jobs that are neither doctor nor nurse have their own plain roles (radiographer, cashier, store keeper, social worker).
  Actions are added one at a time, never by replacing a whole list. *Built 2026-10-06:* `declare_role(…, built_on => Doctor)`; an
  action `declare_action(…, everyday => true)`; Doctor and Nurse are the base's everyday roles; `declare_role_action` adds one action
  (a pack adds only to its own roles); `core.gives` answers for a role in a department (§3.1). Pharmacist, Lab technician and
  Reception stay plain, and so does pharmacy's Store keeper (it reads the dispensing queue and writes nothing). Settings → Roles shows what a role is built on ("Built on Doctor"), its own actions by kind and by pack, and
  the everyday ones a Doctor or Nurse holds where a department uses the pack.
- **Export.** A pack's FHIR adds beside its base type's mapping, never replaces it; the result is valid R4 (one value per choice
  element); a mapping that fails fails the tests. *Built 2026-10-06:* a pack type with a base type always maps as that base type's
  `to_fhir`; its own `to_fhir` (handed the base's resources as `base`) only adds — new resources, or elements on one of the base's
  (the same resourceType and id), merged by `core.fhir_beside`: an element the base set is never overwritten (a list is added to),
  a choice element takes no second value. A pack's patch of the Patient (`{"patch":"Patient",…}`, the form the base's `died` uses)
  merges the same way into the Patient. Every resource is checked (`core.fhir_problems`: a resourceType, an id FHIR takes, one
  value per choice element at any depth), the Patient with every patch, the places, the people and the Provenance too. A mapping
  that raises, overwrites or breaks R4 refuses the export, `fhir_failed` or `fhir_invalid`, naming the type and the mapping that
  failed (the base's when the base's raised), never the data. The IPS gives each entry a plain `urn:uuid:` fullUrl, once in the
  bundle: the id when it is a uuid no other resource shares, else uuid v5(patient, Type/id). Pharmacy's dispense exports as the base's Task with an `output`
  naming each MedicationDispense it adds (`{item}-d1`…: what was given, how much, when handed over, on which MedicationRequest; not
  given, the medicine prescribed, declined, and why).
- **Off.** With a pack off for the clinic, its entries stay on every chart, read-only; only new entries of its types stop (corrections
  and cross-outs still land: a correction by an author of the item who still holds a role in the target's department, written
  there, since nobody holds the pack's write action while it is off; a cross-out is the base's), its actions stop, and its tables are not rebuilt. Turned on again, it catches up in the background and
  shows its progress. *Built 2026-10-06:* while off, the writer neither refreshes its tables nor queues its listeners, a merge and
  the rebuild check leave its rows as they were, and turning it off drops its pending work. Turned on (`core.catch_up`), its earlier
  work is dropped and one outbox row per patient and refresh is queued (its tables in declaration order, then its listeners), drained
  after commit like a listener's, live work first, never in the switch's own transaction; `core.catch_ups` keeps how many patients it
  started with, and read `me` sends each pack's `catch_up` (patients, left), so Settings → Packs reads "catching up · 120 of 400
  patients" and follows the drain's hints.
- **Setup and guards.** A starter setup ticks the department's packs and adds what is missing (places, services, presets, settings);
  on an existing department it never overwrites what staff changed and shows the difference instead. A pack declares only inside its
  prefix: types, settings, actions, roles, code systems, demo ids. A table that reads age or sex says so, and only those are
  refreshed when identity changes. Nothing fails silently: a pack's failed background work shows in Settings → Packs with Retry.
  *Built 2026-10-06 (piece 9a):* a layer declares setups (`core.declare_setup`, §3.8, `core.setups`): the base's Clinic (the queue;
  patients wait, critical results to review, Next after Done; a Follow-up visit preset `/fu`), Ward (the bed board; eight beds,
  `bed_1`–`bed_8`; inpatient; a Ward round preset `/round`), Laboratory (the bench; works for all; CBC, HbA1c, creatinine, lipids,
  lithium with their steps and ranges) and Front desk (checks in for all); pharmacy's Pharmacy (ticks pharmacy; opens on Dispensing;
  its dispensing service with one step, prepared; late after 30 minutes; works for all; the counselling note is the clinic's, on the
  pack's page). One door, `public.setup({setup, department_id, name?, site_id?, position?, apply?})` (needs `manage:places` held
  everywhere): without `apply` it answers the parts against the department as it stands (a department not yet made: as if empty); with
  `apply` (`true`: every part to add; or a list of parts) it makes the department when new (the setup's work), then adds the accepted
  parts in order (the packs ticked, appended to what is ticked; the settings; the places; the services; the presets, for this
  department; the Screens line), each through its own door (`save`, `write_setting`), so each is checked and audited as if staff had
  typed it, then one `setup` AuditEvent, and keeps `department.setup`. Each part is *to add* (missing), *the same*, *differs* (staff
  changed it: the answer shows here and the setup's, and applying it is refused `would_overwrite`) or *blocked* (its pack is off for
  the clinic: `pack_off`); something staff retired, deleted (a place: its delete in the audit, by its id or its name here) or unticked (a pack this
  department ticked once) differs and is never added again. A row is found by its id, else its key
  (a place's key, a service's code, a preset's shortcut), else its name, case aside; a preset for all departments with that shortcut or
  name serves here too. A thing's id comes from the department and its key (`core.setup_id(department, kind, key)`, uuid v5), never
  its place in the list. With no line set, a department's default line that is already the setup's is the same (none is written).
  Run twice, it adds nothing: not a setting row, a place or an audit row. Read `me` lists the setups of the layers on here.
  Settings → Departments: a new department starts **from a setup** or blank (chips; the setup's words, its name and site, and what it
  will add, asked of the door), and a department's **Compare with its setup** (the one it was made from while still of its work, else
  one of its work to pick) folds out under its row: the difference in one line ("would add 2 beds, 1 preset; your Screens line differs"), then each part (to add
  with **Apply**, what differs with here and the setup's, what waits, the same folded), and **Apply all n missing** (`setup.ts`, pure); Apply waits while the department's editor holds unsaved changes,
  and a clean editor follows what was applied. Made from a setup, the new department's card closes.
  The guards: `declare_system` and `declare_role` check the prefix like every declaration; a role's id sits in its layer's reserved
  block and an id or key another role holds is refused (§3.8); pharmacy's roles are `pharmacy.pharmacist` and `pharmacy.store_keeper`.
  The demo's ids per layer (piece 8) are checked as they are written: each seed and day says its layer first (`demo.layer`), every id
  `demo.id` gives is kept with its layer (`demo.ids`), and a department, place, setting's thing, person or patient a seed writes outside
  its layer's namespace is refused `outside_namespace` (the base's fixed ids and `demo.id('base', …)`; a pack's `demo.id(<pack>, …)`;
  the journey's patient, any layer's). The demo's departments are made from setups (`demo.setup`): Front desk, General Practice and
  Psychiatry (Clinic), the Medical Ward (Ward), the Laboratory and pharmacy's Pharmacy; what the clinic changed since (Psychiatry
  private, the psychiatry consult, the clinic's presets) is written after, as staff would; the Laboratory offers only lab tests
  (its chest X-ray removed 2026-10-07: an X-ray is an imaging department's).
  *Built 2026-10-06 (piece 9b):* `declare_table(…, reads => '{age}' | '{sex}')` (`unknown_read` otherwise; a refresh calling the identity door
  without it is refused `identity_undeclared`: when declared, by its source and that of the functions of its own schema it names,
  five calls deep; and when it runs, since `core.run_refresh` marks the refresh under way and `base.pack_identity` refuses a pack's
  refresh whose table declares no reads, however it was reached); `save_patient` works out what changed (sex; the birth date, its precision or
  estimate) and `core.identity_changed` refreshes only the tables that read it, the base's inline, a pack's in the background. Every
  failed refresh or listener is an outbox row with its error (kind listener, refresh, catch_up or identity); read `me` counts each
  pack's stale patients, rows failing (tried again), parked (five tries) and waiting; Settings → Packs words them ("2 refreshes failed
  · trying again", "1 refresh failed five times and stopped", "3 patients to refresh") with **Retry** (`public.retry_pack`, for
  whoever changes settings everywhere, audited): failed and parked rows are tried again, and a patient stale with no work waiting gets
  its refresh queued; the marks clear when it succeeds.
- **Reference data.** Licensed lists come in by import script (rule 7); the demo loads a small sample of each, labelled "demo sample,
  not the full list".
- **What the base adds for §5.1** (built 2026-10-06: a department's packs used here; the frame, toolbar and tab row with the action
  each tab needs; the fit test, chip words and Summary lines; banner words with their rank; the pregnant and breastfeeding facts;
  setting shapes with labels and units, and the form drawn from them; the board tile line and buttons and the marks on the lists; score
  tables and a read that scores while typing; the demo loader with relative times, logins per role and ids per pack; starter setups
  and the guards; the rest not yet): a department's packs used here; the fit test; chip words and Summary lines;
  banner words with their rank; the board tile line and buttons; the frame, toolbar and tab row with the action each tab needs;
  setting shapes with labels and units, and the form drawn from them; score tables and a read that scores while typing; the demo loader
  with relative times, logins per role and ids per pack; the pregnant and breastfeeding facts. The core client stops naming pharmacy
  (eight places today); pharmacy goes behind the same registries every pack uses. *Built 2026-10-06:* no core file names a pack
  (ESLint `opencare/no-pack-names`: a pack's key, each folder under `src/packs`, never appears in `src/core` outside generated
  files); *from 2026-10-08, chosen in the build:* nor another pack's key in a pack's own files (the same rule given its own key), and
  `test:registries` scans both and every pack's imports (only `@core`, a library or its own folder). A pack that answers prescriptions registers where they go and its words on a medicine (`registerSend`, `visit/send.ts`:
  the composer's chip, the list's Send, the prescription's and the list's state words); its reply form says its last step (`done`)
  and what its requests carry from its own table (`details`); its refusals' words come from it (`registerWords`, `db/words.ts`).

### 5.3 The first packs: pharmacy and laboratory (decided with the owner from pictures, 2026-10-07)
The pictures (`/pictures.html`, `src/pictures/`, dev only) are the agreed screens. Built in pieces, one at a time, each committed and
shown: (1) walk-ins on the shared bench and at the desk; (2) the pharmacy's day one; (3) asking the doctor; (4) the pharmacy's stock;
(5) the laboratory pack; (6) the large lab's switches.
- **Walk-ins (base, every bench):** a patient with no order from inside openCare — a paper request, or who asks. Started on any bench
  (`N`, *Walk-in*) or at the desk, with one card in two steps: first *who* (one search by name, phone or record number, *New patient*
  the desk's card), then *what for* (the bench's own services as big buttons; a pack may put its own line first: the laboratory's
  `/order` and its six most-asked tests, the pharmacy's `/rx`), *who asked* folded and optional (the outside doctor's name, `asked_by`
  on the order). It is an order like any other: it joins *To do*. A bench orders only for itself; a desk only for the benches it checks
  in for. Results stay in the record; a walk-in's results to review go to the bench's own list. *Built 2026-10-07 (piece 1):*
  `bench/WalkIn.tsx` (+ Walk-in, the + key), `bench/WhatFor.tsx` (also in the desk's patient card: a bench's name, "Laboratory…"),
  `bench/walkins.ts`; the order's `asked_by`, kept in `base.orders`; `walk_in_elsewhere`; a service only ever sent from a chart (a
  pack's automatic answer, as dispensing) is not offered; the lab technician and reception hold `write:order`.
- **Pharmacy:** *To give*, *Prepared* (only with the setting *Prepare first*, off by default: one person prepares, another hands over;
  wards), *Owed*, *Given today*. A clean row gives in one click; a row with a mark (allergy, duplicate, dose, out of stock) opens the
  check: real amounts (boxes and strips from the pack size), directions in Arabic, the allergy that asks the doctor, out of stock given
  as another brand with the same active ingredient or partly owed, who received it. *Ask the doctor*: a card in the chart above the
  line and a line on the doctor's *To review* (not the queue, which the patient has left after Done; a queue mark only while still
  there); any doctor of that department may answer; the answer goes back to the pharmacy's row at once. *Built 2026-10-07 (piece
  2):* `pharmacy.queue` carries the prescription's own words, its warnings (the medicine's findings, `confirmed` when the doctor
  signed anyway) and what is owed (status `owed`); the dispense takes `instead_of`, `directions`, `owed` and `received_by`;
  `pharmacy.prepare_first`; `packs/pharmacy/Check.tsx` (the check), `directions.ts` (Arabic directions, the amount),
  `substitutes.ts` (another brand, from the drug list's synonyms); the chart's Pharmacy section says Given in part. Pack sizes
  (boxes and strips) come with stock. *Built 2026-10-07 (piece 3):* the base type `question` (`about` an open order, from the
  department it went to; Communication) puts a `question` row on the requester's To review (*Pharmacy asks*, Answer); the chart shows
  it as a card above the line (`chart/center/Questions.tsx`): Give it anyway (a reviewed entry, action `give_anyway`) or Change (the
  medicine stopped and its order revoked with the answer, action `changed`, then /rx opened); the pharmacy's table carries the
  question and the answer, and a doctor's "give it anyway" is the pharmacist's reason. Lab technicians and pharmacists may ask.
- **Stock (part of the pharmacy pack, its setting *Keep stock*, off by default):** products in the pharmacy's settings (brand, active
  ingredient, strength, form, pack size, EDA code, barcode); a small table of the pack's own for what comes in, moves and is counted
  (received with batch and expiry, moved, counted with a reason), only ever added to, who and when on every row, its own action; what
  is given is the dispense records, never copied (on hand = received − given − adjusted, per place and batch; each Give takes the
  first to expire). Not chart entries; the table is the original data (not rebuilt from entries). Screens: *Stock* (All · Low ·
  Expiring · Out of stock, pharmacy or main store; a product's movements), *Receive* a delivery, *Count* a shelf. *Built 2026-10-07
  (piece 4):* `pharmacy.keep_stock`, `pharmacy.product` (many, per pharmacy, written with `write:pharmacy.stock`, which the
  pharmacist and the store keeper hold), `pharmacy.stock` (its own table: received, counted, expired, damaged; clock time), and the
  derived `pharmacy.given` (each thing a dispense gave from a product, by batch). A pack's own table is reached through one core door,
  `public.pack_op`, and the operations a pack declares (`core.declare_op`: owned, definer, pinned, its action checked in a department
  that uses the pack); such an operation counts as registered, so it may read its own pack's derived tables (one that returns patient
  ids declares so and each is read-logged, §3.10, core change (f); otherwise it returns no patient
  data). The Stock tab (`registerScreen(…, shown)`: only where the pharmacy keeps stock); each give records its product and its batch,
  first to expire (a generic prescribed: the brand with the most on hand); the check shows what is on hand. *Built 2026-10-07 (piece
  7, the main store; owner: one step, no requests, the store and the pharmacies only, the store a department of the pack):* the
  products are the clinic's one list (`pharmacy.product`, the organization's, written with `write:pharmacy.stock` held anywhere) and
  each place that keeps stock has its own minimums (`pharmacy.minimums`, a table a place; a place keeps a product it has a minimum
  of or that moved there). The starter setup `pharmacy.store` (Main store: the pack, Keep stock, Stock its one tab, no dispensing).
  Send (`do: 'send'` through `pharmacy.stock_write`) moves lines to another place that keeps stock in one step: a `sent` row here and
  an `arrived` row there, one `transfer_id`, the batch and its expiry with it, never more of a batch than is here (`not_enough`;
  elsewhere `not_a_stock_place`). The read gives every product with this place's on hand, batches, minimum and `kept`, and what the
  other places have against their minimums (`elsewhere`), so a store's **Low at pharmacies** view lists what to send, and Send adds
  what a place is low on, in the boxes back to its minimum. Movements say "Sent to …" and "From …", in boxes. Wards' stock comes
  with a ward pack.
- **Laboratory:** *Collect* (tubes by colour, the sample number written on them until labels print, fasting asked at the grey tube,
  *Collected* or *Couldn't collect* with a reason the doctor sees) and *Results* (one grid per section, ranges by age and sex, flags as
  typed, the change check against the last result, calculated values such as LDL and eGFR). A critical value is only a notice —
  "Critical: tell Dr. X now", then *Release*; logging the call (who, when, read back) is later. Critical limits per test are the
  laboratory director's to confirm in Settings (a starter list ships). *Built 2026-10-07 (piece 5a):* the pack `lis` (its words
  "Laboratory"; its role block cf; migration 12, privileges moved to 13): its starter setup `lis.laboratory` (Collect and Results in
  place of the bench; 28 tests, ranges by sex and a child's where it differs, critical limits), `lis.sample` (S-MMDD-NNNN, a counter
  per laboratory and day, through `public.pack_op`), the derived `lis.values` (each number a patient had, by analyte key, for the
  change check, read with `read:lis.values`, which its technician — built on the base's lab technician — holds); Collect (tubes by
  colour from the test or its section, the sample number on each collected step, fasting asked, couldn't collect with a reason);
  a pack's own walk-in step (`registerWalkInStep`: the laboratory's /order line and its six most-asked tests). The demo's Laboratory
  is the base's, served by the pack (`demo.serve`: its setup, and its screens as the line). *Built 2026-10-07 (piece 5b):* Results
  (`packs/lis/Results.tsx`): one grid per section of what was collected — a column per field (unit and range in the head), a cell
  where the patient has that test; flags by the range that fits sex and age; LDL (Friedewald, not when TG ≥ 400) and eGFR (CKD-EPI
  2021, adults) worked out; the change check against the patient's last value within 30 days (`lis.values`; a step for some tests,
  a share for the rest); a critical value's notice (tell the doctor who asked; a walk-in, the patient or the doctor who asked), then
  Release writes each test whose fields are all there as a final result. 19 more LOINC codes in the base's list (the panels, urea,
  eGFR 2021, troponin, the serology). The demo: Rania and Osama, each with an earlier result, collected this morning.
- **Large lab (separate switches in the laboratory's settings, all off for a small lab):** sample labels (printed barcodes; printing
  is approved, these labels first, §5.4 *Printing*), scan to receive (a rejected tube goes back to Collect), collection chairs (each its
  list, patients called by number), results from analysers (a small outside program, as the network is closed to packs), release
  normal results by themselves (no flag, no big change, the analyser content), a second person checks, turnaround targets per section.
  *Built 2026-10-07 (piece 6):* one card on the laboratory's page, `lis.large` (all off by default). *Turnaround targets* (minutes per
  section from the sample's last step — collected, or received where tubes are scanned in): a row past its target turns amber with
  "late · n min", and Results opens a *Late* view gathering them. *A second person checks*: Release writes a preliminary result (the
  doctor sees it as preliminary; a critical one reaches the doctor at once), *To check* shows each patient's report with every value
  there to change, and Approve writes each result's next version final — never one's own release, only a lab senior (`lis.senior`,
  `approve:lis.results`); the base now reads a final that replaces a preliminary as the result's first final, not a correction.
  *Scan to receive*: the Receive tab (`lis.receive`, shown only then) takes a sample number, marks its tests received (a received
  step) and says where each tube goes; Results types only what was received; a tube rejected (haemolysed, clotted, too little, wrong
  tube, no number) holds its tests with the reason and sends them back to Collect as *new sample*, where a new number is given.
  *Collection chairs* (0–12): a collector picks a chair (kept in the browser), each patient's tests of the day get a ticket number in
  the order they came (`lis.tickets`, the pack's own table, naming the orders, never the patient; `lis.tickets` and `lis.call`
  through `public.pack_op`), Call next calls the next with no chair (stat first) and the chair's card holds who it called, ready to
  collect; one another chair called is taken only on purpose (`called_elsewhere`). Sample labels, results from analysers and releasing
  normal results by themselves are placeholders on the card, read-only with a small *later* beside them (a field declared `later`
  holds its value by the shape's `const`; `core.check_fields` refuses one without). The queue's row carries its latest step's data
  (the sample number, a reason) and its latest answer. The demo adds Nabil (a lipid profile collected two and a half hours ago), two
  walk-ins waiting to be collected (Dina; Omar, stat) and the senior, Hala Mansour (senior@demo.com). *Fixed 2026-10-07:* a sample
  number is the patient's tests', not a screen's — `lis.sample` takes the orders and gives the same number on every screen that opens
  them (a reload, another user, later) until a tube is sent back, then a new one, never the rejected one (`lis.sample_orders` keeps
  which orders each number went to; the rejected step carries its number); before, each screen drew its own, so the tubes could carry
  one number and the record another. Receive says why a number finds nothing (never given; given to whom and not marked Collected
  yet; saved under another number, via `lis.sample_of`) and receives by hand a tube with no number or one that will not scan.

### 5.4 Billing (the owner's decisions, 2026-10-07 and 2026-10-08; built in part 2026-10-08, each item marked)
The owner asked for billing on 2026-10-07 ("let make billing next"), approved its pictures that day and decided the rest in chat;
early on 2026-10-08 he answered the audit of that day's build (D1–D36, F08, F28) and had this branch rewound to before it, so nothing
of billing is built here. That afternoon he chose three simplifications, **soft checks**, **open prices** and **a department's own
priced lines** (below), widened the third from the pharmacy to every department ("it should not just pharmacy any department which
send own prices and billing don't know about them"), and approved the core and base changes (a)–(g) at the end of this section in
place of the earlier list. The afternoon's decisions stand over anything earlier that conflicts; what they replace is marked "replaced
by the owner, 2026-10-08" and is no longer to build. This section holds only his decisions, each with its date: "owner" means his own
words or a picture he approved, nothing else; a choice made in writing this section down is marked "chosen in the build, awaiting the
owner". Every item is **to build**; the change that builds one replaces its mark with "built" and the date. What this section does not
say is not decided: a build that needs a core or base function, table, column, registry option, read field or client hook not listed
under *Core and base changes the owner approved* adds none and stops and asks the owner first (owner, 2026-10-08). The pictures as he
approved them are at commit `687d535` (branch `billing-sonnet-2026-10-08`, `src/pictures/billing.tsx`: bill-list, bill-pay,
bill-receipt, bill-held, bill-settings, bill-today; `src/pictures/later.tsx`: rx-payfirst, hold-doctor, ins-setup, ins-pay,
ins-approval, ins-claims, print-label, print-receipt); they are described here in words and are not on this branch. Where a picture
says "held", read "waiting" (the soft check, below).

- **The rules** (owner, 2026-10-07):
  - Money never reaches the record or the chart. The chart keeps what was ordered and given; billing keeps its own tables. Only words
    reach the chart (a waiting order's word), never an amount, a price, a number or an insurer's decision (hold-doctor). *Built 2026-10-08:* billing's own tables, reached only by its
    operations; a charge row holds no amount and sends no record entries, so the record read carries none (no entry holds a price, a
    receipt or a reason: billing.sql). The waiting word is billing's soft check (core change (c)), a word and a tone only: *built
    2026-10-08* (`packs/billing/rows.ts`, `rowWaits`; a word with a digit is dropped by the core besides).
  - A department that does not use billing (§5.1 rule 1) sees no money word: no price, no fee, no charge, no Pay or Send to cashier
    button and no waiting word, not even on an order it sent to a department that uses billing. *Built 2026-10-08 for billing's screens and operations:* drawn, and
    answered (else `not_used_here`), only where the department uses billing; *built 2026-10-08 on the rows:* billing's button and its
    word are drawn only for the packs the list's department uses (core changes (a), (c)), and a department's own prices show only where a
    pack it uses charges (billing declares `charges => true`, core change (d)).
  - A card folds out under its row, never a pop-up, a menu or anything over the record (the standing rule, 2026-09-24; bill-pay).
    *Built 2026-10-08* (the cashier's list: the payment card and the receipt under the row).
  - The original money data (payments, refunds, drawer closings, claim lines and their marks; and, from 2026-10-08, the prices the
    cashier types, the bills sent to the cashier and the reasons for going ahead before payment) is only ever added to; a mistake is
    a new row with its reason; a closed drawer and a claim line are never edited (bill-today, ins-claims). Erase is the one exception
    (below). *Built 2026-10-08:* a trigger on each refuses every change but the eraser's.
  - Care is never blocked: billing waits on a screen, never in the server (bill-held; owner, 2026-10-08, *Pay first* below).
    *Built 2026-10-08:* nothing of billing refuses a write; Pay first is a read (`billing.waiting`).
  - Billing is a pack like any other (§5): it names no other pack's types, tables, settings or ids, holds no privilege on core tables,
    learns what another department charges for its own work only from the lines that department's rows hand it (*A department's own
    priced lines*, below; owner, 2026-10-08), and brings its own demo (§5.1 rule 9). *Built 2026-10-08:* no billing file names another pack (test:billing scans them); its demo
    (*Demo*, below). Hearing what others give through a
    chargeables door: replaced by the owner, 2026-10-08 (*Later*).
- **What is charged** (owner, 2026-10-07): a department's **visit fee**, once the patient is seen there (bill-settings); each
  ordered **service** that has a price, charged to the department that performs it; and the **lines a department hands** for the work
  it prices itself, the pharmacy's medicines first (owner, 2026-10-08; "each medicine on a prescription, at its product's price" is
  replaced by the owner, 2026-10-08). Without a price a thing is free and never waits (bill-settings, rx-payfirst); a service priced
  *At the order* is not free (below). A price billing keeps belongs to the thing that owns it (a service, a department's visit fee)
  and is copied into the charge as it stood when ordered; a later price is for later orders. *Built 2026-10-08:* `billing.charges`, from
  the base's visits, orders and their steps after commit (a listener), with the settings as they stood when the order or the seeing was
  written, where the charging department used billing then (so an untick neither drops a charge nor charges the past); seen as the
  base's presence counts it (a seen or done move, or what a clinician writes there after the call); a visit sent on is charged in each
  department it was seen in that bills. *Chosen in the build, awaiting the owner:* the charge keeps the moment (`priced_at`) and billing's
  operations read its price as of then, so no amount sits in a derived row the record read sends to every reader of the record.
- **Where prices live:**
  - Services: billing's own page, **Billing → Prices**, separate from Settings → Services (owner, 2026-10-08, D27; the bill-settings
    picture had a Price column inside Settings → Services, which would need a base door); each service a price, none, or *At the
    order* (below). *Built 2026-10-08* (`billing.price`, a row a service, its department's, by `write:billing.prices`; checked: one a
    service, a price or At the order, no more than 10,000,000).
  - The visit fee and **Pay first**, per department, in the pack's table *Each department* (Settings → Packs → Billing; bill-settings,
    owner, 2026-10-07), and on the department's own card like every per-department setting (§5.1 rule 7). *Built 2026-10-08 in part:* Pay first on the
    department's card (`billing.pay_first`), and, from the wiring, a switch in each department's head on Billing → Prices. *Chosen in the
    build, awaiting the owner:* Pay first is written by whoever sets prices there (`write:billing.prices`, the accountant's; the owner holds
    every action), so both places work for the same person; Billing → Prices lists every bench that uses billing too. The visit fee is kept as a service's price is, a row
    of its department on Billing → Prices (`billing.visit_fee`), so neither the department's card (whose form draws one value a department)
    nor the pack's table *Each department* is built.
  - **A department's own work**: in its own pack's settings, never in billing's (owner, 2026-10-08). The pharmacy's medicines: a
    price on each product in the pharmacy's own product list, per box, and per strip where it is sold in strips; it needs no *Keep
    stock* (bill-settings, rx-payfirst, owner, 2026-10-07). A department shows these prices only where it uses a pack that declares
    that it charges (core change (d)), and names no such pack (owner, 2026-10-08, D8). *Built 2026-10-08 (the pharmacy's):* `pharmacy.product`
    takes `price_box`, `strip_size` (units a strip) and `price_strip`, plain numbers from 0 to 10,000,000 (`pharmacy.product_check`: a
    strip price needs its size, `strip_size_missing`; a strip smaller than its box, `strip_not_smaller`); asked through `chargesHere`,
    never a pack's name, the prices show in the new-product card (Stock) and in **Prices**, a card above Dispensing's list from its
    toolbar for whoever holds `write:pharmacy.stock` (each product of the clinic's one list, box and strip, Save per row through the
    settings door). *Chosen in the build, awaiting the owner:* Prices sits on Dispensing's toolbar (so a pharmacy that keeps no stock
    can price), and no currency word is shown, the currency being the charging pack's to say. *Shown 2026-10-08* wherever billing is used:
    billing declares that it charges.
  - The reasons a charge may be waived (Staff, Charity, Follow-up within 7 days): the clinic's own list on the pack's page
    (bill-settings, owner, 2026-10-07); a discount takes its reason from that list only, never free text (owner, 2026-10-08, D35).
    *Built 2026-10-08* (`billing.reasons`; the pay operation refuses another, `unknown_reason`).
- **A service priced at the order** (the feature: owner, 2026-10-07, "make 2, 3"; how it is kept: **open prices**, owner,
  2026-10-08): the price list may say *At the order* for a service. Its order reaches the cashier unpriced, and the cashier types its
  price on the payment card; billing keeps that price in its own insert-only table with who typed it and when, never in the order,
  the record or a pack's `details` (D1). The doctor's order card has no price box, and no pack adds a field to the order card.
  *Built 2026-10-08:* the card's empty price, kept as the payment's line (`typed`, with the payment's who and when). Replaced by the owner, 2026-10-08: the **Price** box on the order card where both departments use billing (D2), Done
  waiting for that price (D33's bound on the box) and billing saving it just before Done (D1); the order-card extension point.
  - *Chosen in the build, awaiting the owner:* the typed price is above nothing and no more than 10,000,000 (the bound D33 set for the
    box); under Pay first such an order waits like any priced one until the cashier prices it and takes the payment.
- **Charges** (owner, 2026-10-08): billing's charges come from entries and settings only, as every derived table does (§3.8); what is
  paid, owed and waived, and the insurer's share, are worked out when read, from billing's own original tables (D12, which settles
  D25); no core door lets a pack have its own tables worked out again. The charges table sends no record entries with its rows (F08,
  core change (e)). A charge is paid once, wherever it is taken (owner, 2026-10-07). Billing locks per charge, always in the same
  order, inside its own data, and no core door to lock a patient is added for it (D13). *Built 2026-10-08* (`billing.lock`: each charge and line, sorted). *Chosen in
  the build, awaiting the owner:* a charge is void when its order is revoked, crossed out, or closed undone where it was sent (rejected,
  cancelled, failed); one still holding money shows on the payment card, to give back from its receipt, and, from the fixes of
  2026-10-08, puts the patient on the cashier's list with **to give back** even where nothing else is owed (old audit F11: the cashier
  is told). A line sent to the cashier is void the same way when its order is closed undone or crossed out after it was sent: nothing
  more is owed for it, and paid it is listed to give back; a line its department sends after the stop (for what was given before it)
  stands (`billing.stopped`, read from the order's entries as the base reads its status; `billing.sent_void`).
  - *Chosen in the build, awaiting the owner:* the lines a department hands are not charges (they come from a screen, not from
    entries); billing keeps them only once they are taken (a payment's lines) or sent (an open bill), and the owed sum adds them in.
- **A department's own priced lines** (owner, 2026-10-08):
  - Any department that prices its own work (the pharmacy first; later any other pack) hands its priced lines (a name, a quantity,
    an amount) on its own list rows, through the core's generic *lines due* row field (core change (b)). Billing does not know these
    prices before they are handed. *Server built 2026-10-08:* lines reach billing only as handed (to `billing.send`, or paid with
    `billing.pay`). *Built 2026-10-08 (the core's field, the pharmacy's lines and billing's button on them; tested with a test-only
    Physiotherapy that prices its own sessions, billing.sql and test:billing):* a row carries `lines: {name, quantity, amount, order?}[]` (`screens/rows.ts`
    `DueLine`, `dueLines` drops a line with no words, a quantity not above nothing or an amount below nothing, and rounds to the
    hundredth). The pharmacy hands, on each Dispensing row of work (To give, Prepared, Owed, and a waiting word's view), each medicine
    to give as written, or as checked in the open fold (another brand, part, not given), counted in its product's own units
    (`packs/pharmacy/pricing.ts`): whole boxes, then strips for the rest where it is sold in strips, else a box more; one box where it
    cannot be counted in them (a syrup, a cream, an amount not known); the fold shows each medicine's price ("1 box + 1 strip · 220")
    and the total beside Give, only where a pack it uses charges. A medicine with no price on its box, or not on the list, hands no
    line (free). Nothing of it reaches an entry. *Chosen in the build, awaiting the owner:* a line's name is the brand and its unit
    ("Augmentin 1 g · box", "· strip"; a product of one unit, its brand alone); strips that would fill a box are a box. *Fixed
    2026-10-08 (old audit F38 and its kin), chosen in the build, awaiting the owner:* a row hands what each order comes to **so far**:
    what was given of it already, each dispense counted apart in its product's units (the pharmacy's own table keeps it,
    `pharmacy.queue.given`: a part, then the rest), and what is to give now; **Given today** hands what was given (read from the
    pharmacy's own table), so a medicine given before it was paid or sent still shows Pay or Send to cashier there (for the 24 hours
    the list keeps it).
  - Billing's button on that row (core change (a)) reads **Pay** where the department takes payment here: the money is taken at that
    counter, on billing's payment card folded out under the row. It reads **Send to cashier** where the department does not: billing
    saves the lines as an **open bill** in its own insert-only table, and the main cashier takes them with the rest of the visit.
    *Server built 2026-10-08:* `billing.send` (an open bill in `billing.sent`; a resend for an order replaces its lines not yet paid) and
    a row's lines paid at its counter (`billing.pay`, `handed`). *Built 2026-10-08 on the rows* (`registerRowAction('billing')`,
    `packs/billing/rows.ts` and `RowCard.tsx`): Pay folds out the payment card with the row's lines (handed) beside what the patient owes
    this desk; Send to cashier lists the lines and their total and sends them, then "Sent to the cashier", and the row's button reads
    *Sent to cashier* while nothing changed. *Fixed 2026-10-08, chosen in the build, awaiting the owner:* billing hands on only the
    **rest** of each order beyond what it already holds of that department's own lines (`billing.waiting` with `lines`: paid, on a
    payment that stands, of kind handed or sent — a service charge for the same order never counts — and, to pay here, owed on its
    open bill, which is paid as itself): by name, the quantity not held yet at the line's own price; where what is held is not told
    by name, the difference of the sums as one line ("… · rest"). So the rest of a medicine given later is charged in addition, a line
    left unticked on the card stays owed (and its order waits under Pay first until all of it is paid), and nothing is handed twice; to
    send, an order goes again only where its rest is not what its open bill holds (the resend replaces what was not paid). The server
    checks it: every order handed or sent is locked with the lines and charges of the payment, and comes with what the row knew billing
    held of it (`basis`); a payment or a bill sent since refuses it (`total_changed`), and a card paying an open bill replaced since is
    refused the same way (old audit F38's concurrency, the pay–resend race). A line with no order is always handed (billing cannot tell
    it was paid). *Chosen in the build, awaiting the owner:* lines are sent by whoever works the department's list (`read:bench`, the
    base's); …anyway is recorded by whoever may do the work (below).
  - Billing never names, in its code, the department or pack the lines came from; it trusts the amounts as handed and records who
    took or sent them, and when. *Built 2026-10-08.*
  - *Chosen in the build, awaiting the owner:* each line names the order it belongs to where it has one, so Pay first can wait per
    order; on the payment card and the receipt a sending department's lines for a patient are one line, the department's name as
    the clinic calls it (read from the row, never named in code) and the lines' names, with the sum ("Pharmacy · Augmentin 1 g,
    Cidophage 500, Nexium 40"), in place of D10's "Medicines" line and "Medicines (3)", which would need billing to know what the
    lines are.
  - Replaced by the owner, 2026-10-08: **when a medicine is charged** (sent where the pharmacy has Pay first, otherwise given, priced
    on what was handed over; D32), a paid medicine charge growing to what was given (D24), the pharmacy telling billing a
    prescription's worth through the chargeables door, and everything a pack reports as given charged and printed as a medicine
    (D31).
- **Taking payment** (owner, 2026-10-07):
  - Any department may switch on **Takes payment here**: its own charges (the lab takes the lab's), or everyone's (the main cashier). One
    money table; each person closes their own drawer; the clinic's totals add every drawer's. *Built 2026-10-08* (`billing.desk`: none, own or everyone; *chosen in the build, awaiting
    the owner:* each drawer's float is the desk's setting, as the bill-today picture counts it).
  - **The main cashier** is a department made from billing's own starter setup, Cashier (its tabs Cashier and Today); a reception may
    tick the same switch instead. It has no check-in screen and its people check nobody in (owner, 2026-10-08, D36). *Built 2026-10-08* (`billing.cashier`; *chosen in the build, awaiting the owner:* a third tab, Prices, shown
    only to whoever sets prices; and two small setups, `billing.clinic` and `billing.bench`, that tick billing and change nothing else).
  - **The cashier's list** (bill-list): views *To pay* · *Paid today* · *Nothing to pay*; search by record number or name, or scan a
    card. One row a patient who owes: who, what for ("Visit · 2 tests · 3 medicines"), where someone already waits ("Laboratory is
    waiting", in warn) and the amount, the sum of the lines, so nobody adds anything up. A patient appears once something priced was
    ordered or seen, or a department sent its lines to the cashier (a walk-in too). A patient whose work was done before payment is
    marked so on the list, "done before payment" (owner, 2026-10-08). *Built 2026-10-08* (`billing.owed`, grouped and paged on the server,
    newest first; search through the reader; the mark from billing's …anyway reasons; what for in words: "Visit · CBC, HbA1c · Pharmacy";
    scanning a card not built). *Fixed 2026-10-08, chosen in the build, awaiting the owner:* pages follow the order the cursor reads
    (newest first, then by patient, both descending), so patients owing from the same moment are each listed once; a patient paid for
    work not done (a void charge or sent line still holding money) is listed with **to give back** (old audit F11).
  - **The payment card** (bill-pay) folds out under the row: each line ticked, with where and when it came from ("Laboratory ·
    ordered 10:24"); a line unticked is left for later, since only what is ticked is paid and only that stops waiting; a line priced
    at the order comes with an empty price for the cashier to type (above); *Add a discount* (D) with a reason from the list; Cash
    (received, change) or **Card** (tonight: owner, 2026-10-08); one key takes it (↵). *Built 2026-10-08* (`PayCard.tsx`; the total it
    showed must be the server's, `total_changed`; what was paid for work not done is said under the lines, to give back from its
    receipt, even where nothing else is owed).
  - **Pay on a row** (owner, 2026-10-07, "make 2, 3"; its places and Send to cashier, owner, 2026-10-08): billing's one button among
    a row's actions (core change (a)) on the desk, the clinic queue, the base bench and the bench patient page, and on every pack list
    built on the core `ListRow` (the pharmacy's Dispensing, the laboratory's Collect and Receive): **Pay** where the department takes payment
    here and the patient owes what this desk takes (its charges, or the lines the row hands); **Send to cashier** where the row hands
    lines and the department does not take payment; none otherwise, nor for a role that may not. Pay folds the cashier's own card out
    under the row. *Built 2026-10-08* (billing's row action, *A department's own priced lines* above): Pay for whoever takes payment
    there (`write:billing.payment`, and `read:billing.cashier` to learn who owes: `billing.owed` for the list's patients), Send to
    cashier for whoever works the list (`read:bench`); seen in the browser on Dispensing (Pay at the Pharmacy's counter, Send to cashier)
    and on the cashier's list. *Chosen in the build, awaiting the owner (fixes, 2026-10-08):* once paid on a row, **View receipt**
    shows its receipt there, as kept.
  - **The receipt** (bill-receipt) is shown and kept: the clinic, the clinic's receipt number (R-00412), the date and time, the patient
    and record number, the lines, the total, the cash received and the change, who took it. Where work was waiting, its word goes;
    nothing else changes in the chart. *Built 2026-10-08* (shown and kept; no print button).
  - **A refund** is a payment of its own, naming the receipt it undoes, with its reason, and prints its own slip (print-receipt,
    ins-claims). *Built 2026-10-08:* any day, once, a whole receipt (Give back… with its reason, its own number); its slip with printing.
  - **Today** (bill-today): *Taken today* (and the receipts), *Cash* (in the drawer, with the float), *Card*, *Waived* (the charges and
    their reasons); a row per cashier (receipts, cash, card, waived); **Close the drawer**: the float plus the cash taken is what is
    expected, counted against what is there, a difference needs its reason, and the closing is a new row, never edited (closing the
    drawer tonight: owner, 2026-10-08). *Built 2026-10-08* (`billing.day`, this desk's, or the clinic's for `read:billing.accounts`, the
    accountant's; a row a department whose work was paid; `billing.close`). *Fixed 2026-10-08, chosen in the build, awaiting the owner:*
    a day's numbers never change afterwards: a discount is waived on the day it was given, as what is taken is taken, and a refund's day
    carries its reversal; whose work was paid shares each payment's total (its discount taken off) among its lines by their amounts,
    so the rows add up to what was taken less what was given back; the drawer's count is sent as the card read it ("1,250" is
    1250.00), and billing's refusal words are its own (`drawer_count`, never the pharmacy's stock-count words).
  - A running balance for a stay: not needed (owner, 2026-10-08).
- **Pay first: a soft check** (the switch: owner, 2026-10-07, bill-held, rx-payfirst, hold-doctor; a screen rule, never a server
  refusal: owner, 2026-10-08):
  - Off by default: pay after, at the cashier at the end of the visit. Switched on, a department's priced work that is not paid
    waits: its order shows the word **"Waiting for payment"** on the performing department's row, through the core's soft check (core
    change (c)), and the word goes the moment the payment is taken; nobody clears it by hand, and marking the order urgent never
    clears it. The writer never refuses work because of it, and nothing of it is kept in core. *Built 2026-10-08:* `billing.waiting` (of the
    orders a row names, those waiting and gone ahead, with Pay first and Takes payment here as they stand; words only, but for what it
    holds of a department's own lines per order when its row asks, `lines`) and billing's soft check (`registerSoftCheck('billing')`):
    an order billing holds unpaid (a priced charge, or a line sent to the cashier) in a department with Pay first, and, *chosen in the
    build, awaiting the owner,* under that department's own Pay first an order whose lines its row hands come to more than is paid of
    them (billing knows them only as handed: Dispensing hands its rows' lines to the soft check too; sent is not paid). *Fixed
    2026-10-08 (old audit F22), chosen in the build, awaiting the owner:* an open order sent to a Pay first department that the charges
    have not heard yet (the listener's few seconds after commit, or a listener parked) waits already where it will be charged: priced,
    or At the order, as the price stood when it was written, where the department used billing then (`billing.priced_order`), so no
    window leaves a test free to collect. Seen in the browser: the Laboratory's Collect,
    Magdy's blood count paid at the Cashier (his HbA1c left for later) moved to To collect at once, the HbA1c still waiting.
  - **Per order** (owner, 2026-10-08, D6; "Build now no pics"): only the waiting order's buttons are greyed; the patient's other
    orders on the same row stay workable; a stop (couldn't collect) is never greyed; a row opens with one free order; a collection
    chair calls a patient with one free test; a patient with free and waiting tests is in *To collect* for the free ones and in
    *Waiting for payment* for the others, a view named by its word, with its count (D9). *Built 2026-10-08, the core's part:* the base bench,
    lab Collect and pharmacy Dispensing keep only free orders in To do / To collect / To give, and add one counted view a word for the
    orders a pack holds there (named by the word, D9); a waiting row's buttons are greyed with the word as their title, a stop stays
    (Couldn't collect, Not given, not done); a bench row opens while one of the patient's orders is free; the chairs number and call
    only free tests; the bench's patient page greys a waiting order's card (not done still works) and Request.tsx greys Start, Resume
    and Release (not done and Decline work). *Fixed 2026-10-08:* on the bench's patient page a pack's own form stays open on a waiting
    order, so its stop (Not given) can be chosen and saved; only a stop is ready there while the order waits (`isStop`); the
    laboratory's Receive draws the word, the button and Receive anyway… too (a scan takes only the free tests and says how many wait).
  - **…anyway** (owner, 2026-10-08): **Collect anyway…**, **Give anyway…**, and **Answer anyway…** for a doctor of the performing
    department on the page that answers consults and reports (D4), are always possible, with a one-line reason (an emergency, or a
    patient who will pay after: bill-held), on an inline card under the row or the answer. Whoever may do the work may do it anyway;
    there is no right of its own. Billing records the reason in its own insert-only table, with who and when. *Fixed 2026-10-08, chosen in
    the build, awaiting the owner:* billing checks it so: whoever may write a step on the order or its answer (the service's: a result,
    a reply, a pack's own) in that department, by the writer's own rule for every type's right (`write:` and the type), never only
    whoever reads the list (a store keeper may not). The base bench and its
    patient page go ahead as Collect and Dispensing do (D7). *Built 2026-10-08, the core's part:* **Collect anyway…** (Collect), **Give
    anyway…** (Dispensing), **Answer anyway…** (Request.tsx) and, *chosen in the build, awaiting the owner,* **Go ahead anyway…** on the
    base bench and its patient page, offered only to whoever may do that work; the card (`screens/RowCards.tsx`) asks one line of
    reason (required, at most 200 letters) and hands it to each pack holding the orders, its own orders only (`anyway`); once recorded,
    those orders are free in this app. *Built 2026-10-08:* `billing.anyway` (the order sent here, the reason, who and when) through
    billing's soft check, one an order; an order gone ahead never waits again (`billing.waiting` leaves it out, after a reload too), the
    cashier's row marks the patient "done before payment" and no longer says the department is waiting for it. *Chosen in the build,
    awaiting the owner:* going ahead with an order whose lines the row hands and that were not sent or paid sends them to the cashier
    first as an open bill (only what is not paid nor on its open bill as it stands, read again at that moment), so the patient still
    owes them and the cashier sees the work was done before payment.
  - **The doctor's chart shows only the word** (owner, 2026-10-08), where the ordering department uses billing (the rule above):
    never the reason, an amount or a price. **Not built, awaiting the owner:** core change (c) as approved reaches the lists and the
    page that answers consults and reports, not the chart's order card, and how the word reaches the chart is not decided. The
    chart's order line drawing the soft check (built earlier on 2026-10-08, a client hook beyond (a)–(g)) and billing's `anywhere`
    read for it were taken out in the fixes of that evening, until the owner says how (a core door is his to approve).
  - The word shows only where the performing department uses billing (D3) and has Pay first on, as its settings stand now: unticking
    billing or switching Pay first off takes the words away at once; the settings history keeps the change, as for every setting.
    *Built 2026-10-08* (read as it stands now, on every list's live read).
  - Replaced by the owner, 2026-10-08: the hard hold (the writer refusing the performing department's work on a held order, D4, D6),
    the hold decided in the same save as the order (D26), a hold lifted by a setting and recorded as such (D3), a setting change
    reaching billing through the listener queue for it (D11; that nothing of a pack runs inside a settings save still stands), the
    override right (D21), and the reason kept with the hold with "Given though it was held" in the chart (D5).
- **Insurance** (owner, 2026-10-07; ins-setup, ins-pay, ins-approval, ins-claims, hold-doctor; tomorrow: owner, 2026-10-08):
  - **Insurers** on the pack's page (Settings → Packs → Billing → Insurance): what the patient pays, **a share or a flat amount** (20%,
    10 EGP flat, 0%); the insurer's own price list beside Cash, where a service it does not price falls back to Cash; and the services
    it approves first, per service and insurer. A patient has one insurer on file, or none (cash). *To build.*
  - **Paying with an insurer**: the insurer as a mark on the cashier's row; the card shows each line's price, what the insurer pays and
    what the patient pays, with the totals; only the patient's share is taken; the insurer's share is the insurer's debt, a line of its
    claim, never a payment; the receipt says both. *To build.*
  - **Approvals** wait the way Pay first does, a soft check, never a server refusal (owner, 2026-10-08), in the warning tone and naming
    the insurer: **"Waiting for approval · Misr Insurance"** (owner, 2026-10-08, D22). The Insurance desk is a department with the tabs
    Approvals and Claims; Approvals has *To ask* · *Asked* · *Decided today*, a row each waiting order (the patient, the service, the
    insurer, the price, who asked), folding out the insurer's approval number with **Approved** (the word goes at once), **Refused…**
    (asks the insurer's reason) and **Not asked yet**. A refusal reaches the doctor in words only, "Not approved · Misr Insurance";
    the number and the reason never reach the chart. *To build.*
  - **A refused approval lets the patient pay cash** (owner, 2026-10-07): the order is priced again from the Cash list and its word
    goes when paid, everywhere, whether or not Pay first is on (owner, 2026-10-08, D23). *To build.*
  - **The claim sheet**: one per insurer a month, line by line (the date, the patient, the service, the approval number, what the
    insurer owes) with the count and the total; **Mark sent** and **Mark paid…**; a line is never edited, a mistake is a credit line in
    the next sheet with its reason, like a refund; **Print the sheet** (A4). After an Erase it still prints, the line reading *erased
    patient* (owner, 2026-10-08, D28). *To build.*
  - Insurance on a department's own priced lines (medicines) needs the chargeables door (*Later*, owner, 2026-10-08).
- **Demo** (§5.1 rule 9): *built 2026-10-08.* Billing's seed: the main Cashier from its setup with Mona Saad, its cashier; General
  Practice and the Laboratory bill (the GP's visit fee, five lab prices, the lithium level At the order); Pay first at the Laboratory;
  Wael Shawky, accountant, everywhere. Its day: Magdy owes his visit, a blood count and an HbA1c, both tests waiting for payment at the
  Laboratory; Hoda paid at the Cashier in cash; Waleed's lithium level to price. *Chosen in the build, awaiting the owner:* what joins
  two packs is the clinic's, never a pack's, so it has its own seed and day after every pack's (`seeds/clinic_packs.sql`, in the
  reset's seed list; `demo/clinic_packs.sql`): the Pharmacy bills and takes its own payment, the pharmacist holding the Cashier's role
  there, with billing's Today on the Pharmacy's line to close their own drawer (fixes, 2026-10-08); and the box of Glucophage given
  Hamdy ten minutes ago is an open bill sent from the Pharmacy to the cashier (with his visit, 195.00 on the cashier's list; the 30
  tablets still owed are handed on his Owed row, beyond that bill).
- **Erase** (owner, 2026-10-08): Erase reaches the tables a pack declares (D17, core change (g)). Billing's money rows (payments,
  their lines, claim lines) keep their amounts and receipt numbers and lose the patient link and the approval number (D18); its other
  rows of the patient go (the insurer on file, the insurer's answers). *Built 2026-10-08* for payments (the patient emptied; their lines
  stay), open bills and the reasons for going ahead (gone); insurance's rows come with insurance.
  - *Chosen in the build, awaiting the owner:* a typed price and an open bill, once paid, live on as the payment's lines; unpaid,
    they go with the patient, and so do the reasons for going ahead before payment.
- **Printing** (owner, 2026-10-07, with the print-label and print-receipt pictures; tomorrow: owner, 2026-10-08):
  - Through the browser's own print dialog, its printer chosen there once per computer; no driver of ours. Print is always a person's
    button (its key **P** where the screen shows one), never automatic; *Print again* is a reprint, never a new number. Specimen labels
    first, then the receipt; the claim sheet prints on A4 (ins-claims). *To build.*
  - **Specimen labels**, where the laboratory prints them (*Sample labels*, a Large lab switch, §5.3): at Collected, "Collected · 3
    tubes · labels ready", **Print 3 labels** (P), *Print again*. One label a tube, no bigger than 50 × 25 mm: the patient's name, age
    and sex, the record number, the date and time, the tube's word (never its colour alone), fasting where asked, and the sample number
    with its barcode, which is what Scan to receive reads. Every tube of a sample carries the sample's one number (owner, 2026-10-08,
    D34). *To build.*
  - **The receipt** prints as it is shown and kept, at a thermal roll's width, saying nothing the screen did not; **Print receipt** (P)
    and *Print again*; every later copy is marked "Reprint" with its time; a refund prints its own slip naming the receipt it undoes.
    *To build.*
- **Not to be built** until the owner asks again: the laboratory's critical-call log (its picture, lab-call, was left out: owner,
  2026-10-07, "leave number 5"); a critical value stays a notice (§5.3).
- **The order of work** (owner, 2026-10-08): tonight, the billing pack with core changes (a)–(g): charges, Billing → Prices with *At
  the order*, payments in cash and by card, the cashier, Today and Close the drawer, Pay or Send to cashier on a row with the
  departments' own lines, and Pay first as a soft check; tomorrow, insurance and printing; later, the chargeables door. (The order
  of 2026-10-07, "the two core doors, medicines and Pay first", is replaced by the owner, 2026-10-08.)
- **Known gaps** are listed as open defects, never written as normal behaviour (owner, 2026-10-08, D33).
- **Later** (owner, 2026-10-08): the chargeables door on the server (a pack says "given, worth N", and a pack that charges hears it
  without naming the giver), for insurance on medicines or ward bills; with it, a second pack that gives (radiology) needs its own
  word, insurer prices and approvals, and the charge then keeps the pack (D31). The base declaring which of its types are work on an
  order and which statuses are stops, for the core's hold check (D29), went with the hold: replaced by the owner, 2026-10-08.
- **Open, awaiting the owner** (found in writing this section down, and in the review of 2026-10-08): how the waiting word reaches the
  doctor's chart (*Pay first*, above: not built; the chart's soft check was taken out, a core door is his to approve); a line a row
  hands with no order cannot be told paid, so it is handed again after it is paid (every line the pharmacy hands has its order); a
  service of a department that hands its own lines (the pharmacy's Dispensing) can be priced in Billing → Prices, and then every
  prescription is charged that price as a service besides the medicines its rows hand (and under Pay first waits on it too), and
  billing cannot tell such a service apart without naming its pack (old audit F31; pinned by a test: a paid service charge never
  stands for the medicines' lines, which are still handed); a department cannot withdraw an open bill it sent (only its order's stop
  voids it; a refund makes a paid open bill owed again unless its order was stopped): whether it may, with a reason, is his to say;
  money a department's own lines took for more than was then given (a part paid, the rest not given) is not listed to give back —
  billing knows those lines only as handed — so its receipt is given back by hand; Given today hands its lines for the 24 hours the
  list keeps a row, so a medicine given and neither paid nor sent in that time is not handed again; a part paid at one price and its
  rest handed at a later one is priced by name at the line's own price now.

#### Core and base changes the owner approved
Exactly these, approved by the owner on 2026-10-08 (afternoon) in place of the earlier list; nothing else in core or base changes
for billing. Each is **to build**, in the core's own files, never a pack's (owner, 2026-10-08, D30).
- **(a) A row action** (with the billing pictures, owner, 2026-10-07; its places, owner, 2026-10-08): a client hook through which a
  pack the department uses may put one button of its own on a list row (billing's Pay or Send to cashier) and fold its own card out
  inline under the row; drawn on the desk, the clinic queue, the base bench and the bench patient page, and on any pack list built on
  the core `ListRow`. *Built 2026-10-08:* `registerRowAction(pack, {load?, button,
  Card})` (`screens/rows.ts`, drawn by `useRows.tsx`): one a pack (a second, the core's or the base's refused); `load(rows, ctx)` reads
  the pack's own data once a list (again on the clinic's hints, when the list's patients or orders change, and on `close(true)`; never
  on a timer, so a list left open reads and logs nothing on its own: fixes, 2026-10-08); `button(row, ctx, data)` gives its word or none; only
  the packs the department uses, in its pack order; a pack that fails, or whose data is loading or failed, says nothing; one card is
  open a list, folded out under the row (`ListRow`'s `below`; the button in `extra`, after the row's own actions or its who, never in
  their place — a Back row keeps its doctor); a card that fails says nothing; `close(true)` reads the packs' data again. Drawn on the
  desk's lines, the clinic queue and its requests, the base bench (and Done today), the bench's patient page (in its header, the card
  under it), Dispensing, Collect and Receive.
- **(b) Lines due**: a generic field a screen may attach to its rows, the lines it prices itself (a name, a quantity, an amount),
  for row actions to read. *Built 2026-10-08:* `PackRow.lines` (`DueLine`: name, quantity, amount, and the
  order it belongs to, *chosen in the build, awaiting the owner*); `dueLines`, `dueTotal`.
- **(c) A soft check**: a client hook through which a pack may mark a single order on a row as waiting, with a word and a tone
  (never an amount, a price or a number; the word may name an insurer, D22); the core greys that order's buttons, leaves the row's
  other orders workable, and offers an inline *…anyway* card whose reason the pack records; on the lists of (a) and on the page that
  answers consults and reports (`Request.tsx`). No writer refusal, no override right, no hold table in core. *Built 2026-10-08:* `registerSoftCheck(pack, {load?,
  waiting, anyway})`: `waiting(row, ctx, data)` names orders on the row with a word and a tone; only orders on the row, from the packs
  used there, in pack order (the first word; every pack holding an order is asked to record); a state tone only; a word with a digit
  is dropped (never an amount, a price or a number); a failing pack says nothing; the row shows the word with the packs' marks;
  `anyway({row, orders, reason, ctx})` records going ahead; a stop is never greyed (`isStop`: what a form would write on a waiting
  order counts only when it is a stop). Drawn as a word on the doctor's chart: taken out on 2026-10-08 (it went beyond the approved
  places; *Pay first*, above).
- **(d) A pack declares that it charges** (D8): an option of `core.declare_pack`; the department read carries the packs each
  department uses with what they declare. *Built 2026-10-08:* `core.declare_pack(…, charges => true)`
  (`core.layers.charges`; declared again, it says so again); read `me` gives each department `declared`, each pack it uses with what
  it declares; the client asks `chargesHere(dept)` (`screens/rows.ts`), never naming a pack. The pharmacy and the laboratory declare
  no charging; billing declares it does (`charges => true`), so the pharmacy's prices show wherever billing is used. Not added to
  `core.pack_department` (a pack on the server has not needed it).
- **(e) "Sends no record entries"** (F08): a per-table flag of `core.declare_table`; a table so declared never sends its rows'
  source entries, whoever asks; billing's charges table is declared so. *Built 2026-10-08* (`core.derived.entries`; `core.table_out`
  for the table, record and included reads: no entries and no source ids; its rows are still masked by them).
- **(f) Read-logging pack actions** (F28): a pack operation that returns patient ids declares so, and the core writes one read-log row
  per patient it returns; reads merged into one row of the ten minutes lose none of what each read (D19). *Built 2026-10-08*
  (`declare_op(…, patients)`, `public.pack_op`, `core.read_merge`; §3.10).
- **(g) Erase reaches a pack's declared tables** (D17, `core.declare_store`): billing keeps amounts and receipt numbers and loses the
  patient link after an Erase (D18, *Erase* above). *Built 2026-10-08* (`core.stores`; §3.11).
- **Later** (owner, 2026-10-08): the chargeables door (server); the core client print facility (the browser's own print dialog at a
  paper's size, printing what a pack hands it, which is what its screen shows); what insurance needs of the core.
- Replaced by the owner, 2026-10-08, and not to build: the holds door (approved in principle on 2026-10-07; D3, D4, D6, D14, D15,
  D20), the same-save hold decision (D26), the lift-by-setting record (D3), the override right (D21), the settings-change listener
  (D11), a hold's short name beside its word (D22: the soft check's word carries it), the order-card field (D1), and the
  chargeables door for now (D16; *Later*).

### 5.5 Radiology (the owner's answers to the pictures, 2026-10-08; built 2026-10-08, merged)
The pictures `/pictures.html#rad-order` … `#rad-settings` (`src/pictures/radiology.tsx`) were drawn by Claude; the owner answered
their questions on 2026-10-08 ("1 two tabs, 2-6 ok, 7 yours"). What the owner decided:
- **Two tabs** (Q1): *Scan* for the radiographer (one list for every room, a filter by kind: X-ray, Ultrasound, CT, MRI; To scan ·
  Scanned today · Couldn't scan) and *Report* for the radiologist (To report · Drafts · Signed today), as the laboratory's Collect and
  Results. Each shows only to the roles that use it. Where the department uses bookings, its To book view and Diary join (§bookings).
- **X-rays reported or not** (Q2): each exam says whether it is always reported or only if the doctor asks; with no report the films
  go with the patient and the order comes back to the doctor for their own reading.
- **The report in one step** (Q3): the radiologist writes and signs; a switch *Report in two steps* (a resident or typist writes, a
  radiologist signs) is off by default.
- **Safety facts shown, never a stop** (Q4): eGFR (with its age), metformin and allergies before contrast, and pregnancy for women
  12–50 before an X-ray or a CT, on the doctor's card and again at the scan; pregnant asked at the door and kept in the record (the
  base's `pregnancy`); eGFR under 30, the radiologist decides at the scan.
- **Contrast and reactions in the record** (Q5): the contrast given is the base's `given`, a reaction the base's `allergy`.
- **Later, not day one** (Q6): the link to the clinic's image viewer (PACS), the dose record, MRI safety screening, a chart section of
  past studies, protocols.
- **The walk-in** (Q7): the bench's two steps; *what for* is the `/xr` `/us` `/ct` `/mri` line and the exams asked for most, with
  what to tell the patient (in Arabic).
- As the laboratory's: a critical finding is only a notice ("Critical: tell Dr. X now", then Sign); the report reaches the doctor's
  To review by the base's review loop and shows in the chart, the impression first. Booking a time is the bookings pack's; paying is
  billing's row button.
- *Proposed by Claude, awaiting the owner:* contrast with or without is two exams (two services, two prices), so no field is needed
  for it; the report is the base's `result` with the findings (LOINC 18782-3) and the impression (19005-8) as text analytes, a
  critical one marked AA so the base's loop raises it as critical; the list's row says "contrast" and the numbers show when the row
  opens (a mark sees only the row, and an eGFR may be private). Three core changes, **approved by the owner 2026-10-08 ("a b c yes,
  go")**: (a) an order may carry a pack's own words (a pack type extending `order`: the side, portable, report asked); (b) a pack's
  order card is handed what the chart already shows (latest values, current medicines, allergies); (c) an order finished with no
  answer to come (an X-ray not reported) puts a row on the requester's To review for their own reading.
- *Built 2026-10-08 (lane `radiology`), the core's part:* (a) `core.write_action(type)`: a pack's type whose base is `order` is
  written with the base's `write:order` wherever its writer orders from (the writer and the base's correction and cross-out checks
  ask it; a pack off still refuses new entries, `pack_off`); the client's order draft and a walk-in may carry `as` (`PackOrder`,
  `db/entries.ts`: the type and the pack's words, kept under `data.<pack>`); Done counts such an order as an order. (b) the composer's
  `Ctx.record` (the patient, latest values, current medicines, allergies and their review, as the chart holds them). (c) the review
  loop: a `step` completing an order whose service answers with a result or a note raises a row for the order's author, why
  `no_answer` (only the base's own `step`, and the service as it stood when ordered); To review says "no report", names the exam
  (from the order, where the reader may read orders; else the row's own line, and the list never fails for it) and offers *Your
  reading*, a line under the row written as a note in the record and kept as the `reviewed` entry's note (an order's Details shows
  a review's note). With them, an order word may name its `section` (an order command searching only one section of its
  pack's services, as rule 1 said: "each its section").
- *Built 2026-10-08, the pack* (`radiology`, migration 14, privileges moved to 15; role block cc): its order type
  `radiology.request` (the base's order's shape plus `radiology` {side left · right · both, portable, report}; its line says the side)
  and its table `radiology.requests` (those words, for its screens, `read:bench`); `report:radiology.studies` (the Report tab);
  Radiologist (`radiology.radiologist`, built on Doctor) and Radiographer (`radiology.radiographer`, a plain role: the bench, the
  record, the step, pregnant, the contrast given, an allergy, walk-ins); screens `radiology.scan` (in place of the bench;
  for whoever writes the scan, `write:step`: the radiographer, while the radiologist's line opens on Report) and `radiology.report`;
  its FHIR adds the part and side as the ServiceRequest's bodySite ("knee, left") and the side, portable and a report asked as orderDetail; settings `radiology.exams` (by service code: a side asked, with contrast, what to tell the patient and in
  Arabic, reported always or if the doctor asks) and `radiology.options` (ask pregnant at the door, on); the starter setup
  `radiology.department` (38 exams: 14 X-ray, 8 ultrasound, 9 CT, 7 MRI — with and without contrast two exams — each a result with
  Findings and Impression after one step, *scanned*; 7 report templates as its presets; works for all; chest, abdomen and sinus
  X-rays reported only when asked). Client (`src/packs/radiology/`): `/xr /us /ct /mri` (`line.ts`, `order.tsx`: the exam by code or
  the start of its words, left/right/both, +c/−c, portable, report, urgent/stat, ? the question; +c takes the exam with contrast and
  nothing the one without, then the one whose every word was typed, else asked; contrast spelled out ("with contrast", "contrast", "+contrast"; "without",
  "w/o", "non-contrast", "plain") is +c or −c, "with and without" (±, with/without, with or without) is asked, and a +c no exam with
  contrast fits (or a −c every exam fitting is with contrast) is refused, never dropped; a single l or r is no side; under the card what to tell the patient and, before
  contrast or an X-ray, the facts: eGFR and its age within 30 days — worked out from creatinine (in mg/dL; µmol/L converted, an unknown
  unit gives none) by CKD-EPI 2021 when that is the newer —, metformin alone or in a combination, allergies, pregnant); the walk-in step (`Step.tsx`: the line and the six asked for most); Scan (`Scan.tsx`: To scan · Scanned today ·
  Couldn't scan, a kind chip each, stat first; a row per exam with its side, portable, walk-in and who asked, *side not said*, *ask
  pregnant*, *contrast*, the packs' marks and buttons; the scan card: the name and birth date to say, the side big, the question;
  before contrast the facts from the record, under 30 *Contrast agreed* (by whom: the department's radiologists offered where the reader may see who holds what, else typed) or
  *Without contrast*, fasting
  where its prep says so, the contrast given (agent, mL, lot) and any reaction; an X-ray's views; pregnant for a woman of 12–50 before
  an X-ray or a CT: what is recorded always shown, asked at the door where the switch is on; one set: the step — `completed` when no
  report is asked, else `in-progress`, decided only once the order's words are read — with a note of the views, the contrast and
  reaction, who agreed and who scanned, the base's `pregnancy` changing the one standing, dated today (pregnant again as recorded writes none, its LMP or weeks kept, and
  the note says it was confirmed at the door, unless the record is overdue for a check), `given`, and a reaction as an `allergy` unless
  already listed (then with the dose given); nothing is decided before the record, the standing pregnancy and the order's words are
  read (a record not read: the radiologist decides on contrast); Couldn't scan with a reason, keeping the answer given at the door); Report (`Report.tsx`: To report · Drafts · Signed today; the list beside the report;
  *Before*: the last report of the same part of the body, of any kind, from the departments that use radiology, and its impression
  (never one crossed out, nor one of the other side, looked for once this order's side is read), *Compared* writes it into the findings; the kind's templates first;
  Findings and Impression; *Critical…*: "Critical: tell Dr. X now", then *Sign · critical*; drafts kept in the browser; a report signed
  leaves the list at once; Sign writes the
  base's result, final, the impression first among the analytes and as the conclusion). Demo (`seeds/radiology.sql`,
  `demo/radiology.sql`): Radiology, Dr. Mai Farouk (radiology@demo.com) and Ahmed Saber (xray@demo.com); Samia (CT with contrast,
  urgent, metformin, creatinine 2.6), Nour (a walk-in knee X-ray, left), Mona (a walk-in ultrasound), Tamer (MRI), Adel (CT brain, stat,
  scanned), Wael (an ultrasound scanned, his earlier one reported), Laila (a chest X-ray, film only, on Dr. Ali's To review). Tests:
  `supabase/tests/radiology.sql`, `npm run test:radiology`.
  *Not yet:* a ward patient's bed on the Scan list (the row says the ward; the bed needs the queue to read the patient's place, a core
  question); a walk-in's "? question" (the walk-in card says it is not kept; keeping it on the order is a core question); on the order
  line, with contrast is known by the exam's name ("… with contrast"), since the composer reads no setting (the walk-in, the cards and
  the scan read the department's tick); the *Report in
  two steps* switch (Q3: off by default; built when a clinic needs it); the chart shows the report through
  the base's result block (its Findings and Impression as rows, then the impression), not a radiology block of its own — that would need
  a renderer per pack for a base type (a core question); the Booked mark and To book come with bookings; the images viewer, dose, MRI
  screening, priors section and protocols are later (Q6).

### 5.6 The departments of beds: ward, ER, ICU, CCU, labour ward, dialysis (pictures 2026-10-08; nothing decided, nothing built)
The owner asked for these six together on 2026-10-08 ("they share common things"). The pictures `/pictures.html#stay-map` …
`#hd-schedule` (`src/pictures/stays.tsx`, `ward.tsx`, `er.tsx`, `icu.tsx`, `labour.tsx`, `dialysis.tsx`; shots in
`spec/shots/2026-10-08/stays/`) were drawn by Claude. *Everything below is proposed by Claude, awaiting the owner*; each question is
numbered as on its picture.
- **The shape** (Q1): one shared pack, *Ward nursing* (`ward`), ticked by the ward, the ER, ICU, CCU and the labour ward: the drug
  round and the treatment sheet, observations with NEWS2 and when the next are due (in the labour ward, obgyn's MEOWS in NEWS2's
  place), fluid balance, handover, the discharge letter. Four small packs on top: `emergency` (triage, the board's waiting list, not
  triaged first, then by level; where the patient goes, the base's Discharge in the ER with the moves of Q3; police case), `critical`
  (one pack, two starter setups ICU and CCU: the hourly chart, infusions titrated, ventilator settings, SOFA, the daily goals; CCU's
  rows: rhythm, chest pain, ST, heparin by aPTT, the pain-to-needle times and the angiography plan), `obgyn` (its labour ward part
  now: the board's line, the partograph, the birth, the baby's record; MEOWS after birth; the clinic part with the next group) and
  `dialysis` (the unit by shift and chair; who is due this shift as the pack's own rows under the board, read from the schedule; the
  session; the standing schedule with one-off moves; monthly bloods), which does not tick the ward pack.
- **Every board is the base's** (rule 4): delivery beds, cots, resus bays, cubicles and dialysis chairs are places. The packs speak on
  the tile's one line and with at most two buttons a tile (Give and Obs; Triage and Where to; ICU chart and Goals; Partograph and
  Birth; Readings and End). Where two packs offer buttons the department's pack order decides (two in all): the ER, ICU and CCU put
  their own pack first (emergency, ward; critical, ward), so Give and Obs are not on their tiles (the stay and the Drug round tab have
  the doses); on the labour ward (obgyn, ward) obgyn's show only while she is in labour, then Give and Obs. On ICU and CCU tiles the
  ward pack says only a late dose; the hourly chart speaks there. Dialysis's Start is the base's Admit here into the scheduled chair
  with the session begun in the same Done; End asks the weight after, then does the base's Discharge.
- **Base entries wherever the base has the idea**: each dose is the base's `given` (a pack type extending it carries the dose time and
  who checked); vitals, scores (NEWS2, SOFA, Apgar as declared tables; MEOWS as a declared table of triggers, a yellow one point and a
  red two, the doctor called at two, shown as "MEOWS 2 yellow"), procedures for lines (the day counts itself), the medication list at
  discharge. The packs' own types only for what the base lacks: triage, fluid in/out, ventilator settings, an infusion's rate, the
  daily goals, a labour examination, the birth, a dialysis session and its machine readings. Tables of their own only where the data
  is not entries: the dialysis schedule (Q13).
- **Shown, never a stop**, as everywhere: the facts beside a dose, NEWS2's response, past the alert line, past the triage level's
  time, a fall in blood pressure on dialysis — each a notice; the clinician decides.
- **Questions for the owner**: (Q1) the shape above; (Q2) ER and dialysis patients as short stays in a place (no core change) or a
  core change letting a visit sit in a place; and a small base change the dialysis picture needs either way: a pack's own rows under
  the board (who is due this shift, not yet in a chair); (Q3) a base change: a stay passes to another department (ER → ward, ward ↔
  ICU, the labour ward → a separate postnatal ward where a clinic has one; the pictures keep postnatal beds in the labour ward, where
  it is the base's Move), drawn as the first stay ending and the next starting from it in one set; or one stay that changes department
  (one admission time, each department's part read from its moves); or, as today, a discharge and a new admission; (Q4) a high-alert
  dose given with no second checker lands flagged for the ward's review, or is refused; (Q5) NEWS2 written with every ward /v (drawn);
  air/oxygen and ACVPU as two new base vitals keys (a base change) or only inside the score; (Q6) the triage scale: five levels with a
  time to the doctor (drawn with the Australasian times, now/10/30/60/120 min; Manchester's are now/10/60/120/240), or ESI (levels by
  danger and by the tests and treatments needed, no times); (Q7) the ICU's hourly column as one set signed once by the nurse (drawn),
  or each value its own entry signed as typed and the chart only drawing them by hour; (Q8) SOFA each morning and the FAST HUGS BID
  goals as one round card signed once (drawn), or SOFA as a score of its own and the goals a separate checklist, each signed apart;
  (Q9) the WHO's modified partograph (drawn) or the Labour Care Guide (the picture says what each would say about the same woman);
  (Q10) a core change: the baby's record made in the birth's own Done, or "New baby" through the desk's door first; (Q11) a base
  change: `note` kind *handover* (drawn), or the ward pack's own handover type with no base change; (Q12) the discharge letter as a
  new printout (drawn), or kept in the record with only the prescription printed; (Q13) the dialysis schedule as the pack's own table
  (drawn) or the bookings pack; (Q14) CCU as the critical pack's second setup (drawn) rather than its own pack.
- **Later, not day one**: ward stock (the pharmacy's "wards' stock comes with a ward pack"), the controlled drugs book, diets and the
  kitchen, care plans, wound and pressure-area charts, fall and pressure-risk scores, APACHE II, the ICU census, monitor and
  ventilator feeds, mass casualty, the ER's and dialysis's monthly returns.

### 5.7 The clinics: ObGyn, paediatrics, internal medicine and its branches, surgery with anaesthesia, family medicine (pictures 2026-10-08; the owner chose every drawn answer, 2026-10-08; building)
The owner asked for this last group on 2026-10-08 ("make last obgyn, peds, IM and it's branches, surgery anasthesia, family medicine").
The pictures `/pictures.html#clinics-map` … `#family-checks` (36: `src/pictures/clinics.tsx` shared parts, `obgyn.tsx`, `paeds.tsx`,
`medicine.tsx`, `haemonc.tsx`, `surgery.tsx`, `family.tsx`; shots in `spec/shots/2026-10-08/clinics/`) were drawn by Claude.
The questions continue the beds' numbering, Q15–Q50, each on its picture. **The owner, 2026-10-08: "drawn choice for all, start
building in parallel make it fast like 8 hrs all"** — every question's drawn choice below is his answer, the pictures are the agreed
screens, and the core and base changes the drawn choices need are approved: a pack's one line under the base's `/rx` card and under
`/v` (Q23, Q33, Q22's z-scores); `/v` reading length and head (Q22); `/transfuse`, a pack's command that is not an order, offered where
the department using the pack works for this one (Q36); a step of a pack's in the desk's New patient for the family file (Q49); and,
as drawn on the chemotherapy day unit, today's cycles not yet in a chair as the pack's rows under the board (the base change of beds
Q2, for the day unit). Build plan: `spec/build-clinics.md`. Nothing else in core or base without a yes.
- **The shape** (Q15, Q16): as the beds, shared packs for what many departments do and small packs for a specialty's own. *Vaccines*
  (the schedule, `/vax`, due and overdue, the vaccination room's list) and *Chronic care* (registers worked out from the problem list,
  each condition's targets and checks due, `/review`) are shared; on top, *ObGyn* (its clinic part beside the labour ward's),
  *Paediatrics*, *Cardiology*, *Nephrology*, *Respiratory*, *Haematology*, *Oncology*, *Surgery*, *Theatre*, *Anaesthesia* and
  *Family*. Family medicine ticks five packs (its own, chronic care, vaccines, paediatrics, ObGyn), never copies of them. The map
  picture lists every department with the packs it ticks, in its order.
- **How each shows up** is §5.1's: a section in the record with its fit (Pregnancy women 10–55; Gynaecology women 10 and over; Growth
  under 19), banner words, composer commands with their card under the line (`/anc` `/obus` `/fp` `/pn`; growth through the base's `/v`, `/dev`,
  `/vax`; `/review` `/ecg` `/echo` `/hf` `/spiro`; `/blood` `/transfuse` `/inr` `/cancer` `/chemo`; `/op` `/preop` `/opnote`;
  `/checks`), one mark a row, a tile line and two buttons on a board (the children's ward, the chemotherapy day unit's chairs,
  recovery's bays), and a pack's own screen only for work that is not places (the vaccination room's list, the chronic care list,
  the theatre list, the family files).
- **Base entries wherever the base has the idea**: vitals (weight, length, head, BP), results (the clinic's scan, the ECG, spirometry,
  the INR, the echo answering its order), procedures (an IUD's change, the operation), the given (vaccines, blood, every drug in
  theatre), scores (EPDS, CHA₂DS₂-VASc, CAT, ACT, RCRI, STOP-BANG, Aldrete, PEWS), problems, medications, orders. The packs' own
  types only for what the base lacks: the antenatal check, the periods, the birth (the labour ward's), development, a patient's own
  target, the INR clinic's week, the cancer (extends problem), the cycle and `/blood` (extend order), the transfusion record (extends
  given), the WHO checklist's parts, the pre-op, the anaesthetic record, the operation note (extends note). Tables of their own only
  where the data is not entries: the family's household.
- **Worked out, never typed**: the weeks from the EDD, the fundus against the weeks, the fetal weight's centile, z-scores from the WHO
  tables, the dose per kg, Holliday–Segar, what is due by age and sex or by the schedule, the KDIGO square, predicted spirometry, BSA
  and each chemotherapy dose, time in range. **Shown, never a stop**: a small baby, a dose out of range, a renal dose, the checks before a
  cycle, the medicines to stop before an operation, a count that does not add up — each a notice; the clinician decides.
- **Questions for the owner**, by picture: (Q15) shared packs plus small ones; (Q16) family medicine ticking five packs; (Q17) the
  pregnancy's record as one section; (Q18) the clinic's own scan as a result with no order; (Q19) gynaecology's dues worked out and
  said in amber; (Q20) a birth elsewhere written as the birth entry; (Q21) the antenatal starter rows (Egyptian practice or WHO 2016)
  and the queue word's order; (Q22) WHO or Egyptian growth tables, and a base change: `/v` reads length and head; (Q23) a core change:
  a pack's one line under the base's `/rx` card (paediatrics' dose per kg, nephrology's renal list, Q33), and the clinic's own dose
  list; (Q24) the milestone list and the newborn checks' home; (Q25) vaccines as a shared pack; (Q26) the national schedule loaded
  read-only, and the child's card as a new printout; (Q27) Brighton or the national PEWS on the children's ward; (Q28) registers from
  the problem list; (Q29) the chronic list on day one; (Q30) targets once for the clinic, a patient's own beside them; (Q31) the ECG
  in the clinic and the echo at a bench; (Q32) heart failure's target doses as a setting; (Q33) the renal line under `/rx` (the core
  change of Q23); (Q34) GLI-2012 worked out by the server; (Q35) the Blood bank on the laboratory pack; (Q36) a core change:
  `/transfuse` offered where the Blood bank works for the department; (Q37) the INR clinic's pack; (Q38) the dosing table suggesting
  the week; (Q39) who may change a chemotherapy regimen; (Q40) the day unit ticking ward nursing too; (Q41) the operation as an order
  to the Theatre (the order door of §5.5 a); (Q42) the theatre list as the pack's own screen; (Q43) the medicines to stop kept in the
  pre-op (or a base change: a medicine held from a future date); (Q44) each checklist part signed when said; (Q45) the anaesthetic
  record signed once; (Q46) the post-op orders signed by the surgeon in theatre (or a core change: drafts that travel); (Q47) three
  packs, Surgery, Theatre, Anaesthesia; (Q48) recovery as a department of places (beds Q3); (Q49) the household as the family pack's
  own table (or a core link between patients, with beds Q10); (Q50) a row's marks, one a pack, or two then +n.
- **Core and base changes these pictures ask, each needing a yes**: a pack's line under the base's `/rx` card (Q23, Q33); `/v` reading
  length and head (Q22); `/transfuse` offered by "works for" though not an order (Q36); a step in the desk's New patient for the family
  file (Q49). They lean on doors already asked: the pack order type and the facts handed to the order card (§5.5 a, b; `/op`, `/blood`,
  `/chemo`), the stay passing between departments (beds Q3; recovery), a pack's rows under the board (beds Q2; the day unit). A
  result written in the clinic with no order (`/ecg`, `/obus`, `/spiro`) is the base's outside result; no composer command writes one
  yet.
- **Later, not day one**: a licensed children's dose reference, ASQ-3 or Denver II, links to the ministry's heel-prick and hearing
  results, reminders by SMS; Doppler and the biophysical profile, colposcopy, infertility; insulin titration, KFRE, Holter and stress
  echo, ECG and spirometer files, a peak-flow diary; blood bank stock and barcodes, MRI T2* trends; AJCC stage tables, the tumour
  board's list; monitor feeds into the anaesthetic record, sterilisation and implant registries, theatre use reports, e-signed consent;
  home visits and the ministry's family planning returns.
- *Built 2026-10-08 (lane `clinics-shared`), the core and base changes the drawn choices need* (tag `clinics-core-ready`):
  **C1** `registerCardLine(pack, 'medication' | 'vitals', title, line)` (`visit/lines.ts`, `CardLines.tsx`): a pack the department uses
  adds its rows under the base's /rx and /v cards (its name over them; words plain or each with a state tone) and its short words after
  the draft's line (the drafts' block hands `BlockEnv.draftLine`); the line reads the card's fields, what the chart shows (`Ctx.record`),
  the clinic's settings (`Ctx.org`) and the moment; only the packs the department uses speak, in its pack order, one line a pack and card,
  a pack whose line fails says nothing; nothing is stored and nothing waits for it. **C2** `/v` reads `len`/`length` and `hc`/`head`/`ofc`:
  a length is written as the base's `height` with `method` *lying*, the head as `head`; a length and a height in one line are refused; the
  card for a child under two is Wt, Length, Head, Temp, Pulse, RR, SpO₂, and anyone else's the adult card with length or head when said
  (`visit/vitals.ts`). **C3** a pack command declared `worksFor` is offered where the department ticks the pack or a department using it
  works for this one (`Ctx.servedBy`), and typed elsewhere says where it is offered; the pack's cards draw wherever such a command is
  offered (`cardFor`: the Blood bank's transfusion card on a ward); migration 22 (`core.declare_served(type)`): a pack
  type extending a base type (not order) declared *served* is written with the base type's action (`write:given` for a transfusion
  record), and the pack's own check asks `core.pack_serves(org, department, pack)` (granted to it by the declaration) to refuse
  `not_served` elsewhere. **C4** `registerNewPatientStep(pack, {show, Part, missing, after})` (`shell/newPatientSteps.ts`): asked in
  New patient (the desk's and ⌘K's) where the pack is on and its own setting says so; Register waits for what it is missing; once
  registered the pack does its own with the new patient, and a step that fails says so with Continue. **C5** `registerBoardRows(pack,
  {title, view, useRows, start, buttons})` (`ward/rows.ts`, `PackRows.tsx`): a pack's rows of today's work not yet in a place, under the
  board (a patient with a stay here left out), counted as a view of the board's toolbar; Start is the base's admission into a free place
  chosen inline, with the pack's own entries in the same set; at most two buttons of the pack's own, never a base word. Tests:
  `npm run test:clinics-core`, `supabase/tests/clinics_core.sql`. The privileges migration is now `20260926000099_privileges.sql`, and
  `core.lock_pack` is defined in `20260926000010_core_guards.sql` so a pack migration below 99 may call it (tag `clinics-core-ready-2`).
- *Built 2026-10-08 (lane `clinics-shared`), Vaccines* (`vaccines`, migration 23, role block e0; pictures #vax-chart, #vax-room): each dose is
  the pack's type `vaccines.dose` extending the base's `given` (the vaccine as its drug with its CVX code, `vaccines.cvx`; route, site,
  lot, expiry; given or `not-done` with its reason; under `data.vaccines` the series, the dose number, *here* or *card* with the card's
  date) — everyday where a department ticks the pack; its line ("Vaccine · MMR dose 1 · lot 4K21M07 · exp 03/2027 · right arm, under
  the skin"); its FHIR adds an Immunization (dose number, lot, site, route, a card's copy not a primary source) beside the base's
  MedicationAdministration; its table `vaccines.doses` for the room. The schedule: the national rows are the setting `vaccines.national`
  (the MOHP's, birth to 18 months, its version and source), written only by the import's action `import:vaccines.national` that no role
  holds, so it shows read-only — the demo loads a sample said to be one; the optional rows are the clinic's own `vaccines.optional`
  (pneumococcal, rotavirus, varicella, hepatitis A, influenza, tetanus in pregnancy: the setting's declared default until the clinic
  saves its own, since a starter setup carries only a department's settings). Due is worked out from the birth date, the doses
  and each row's earliest age and the interval after the last dose of its series; overdue four weeks after; too late past a latest age
  (rotavirus); tetanus in pregnancy only while the base's pregnancy stands; from 19 years no child row is due (a dose recorded still
  shows). Client (`src/packs/vaccines/`): `/vax mmr 1, opv 5` (lot,
  exp, a site, `card <date>`, `not <why>`), the dose's card (given or not, here or from the card, lot, expiry, site chips, given by) and
  under it the child's schedule (due and overdue, temperature, allergies, a live vaccine in the last four weeks, the optional ones not
  chosen as chips, the next worked out); the Vaccines section (the national rows by age, given with its date and *card* or *here*, not
  given with why, overdue, due; the optional ones apart), its chip ("2 overdue"), Summary line and banner word ("2 vaccines overdue");
  the room's own screen `vaccines.room` (the Vaccination room's line alone; a tab beside the queue in a clinic using the pack, as drawn
  for family medicine) (Due today: Here and Not here yet; This week; Overdue · to call with the
  phone and *Called*, a note on the record; Given today) and its walk-in (who, then what is due today as chips, the earlier doses on the
  MOHP card to copy, Start checks the child in and opens the visit with each dose drafted). The setup `vaccines.room`; the Vaccinator
  (`vaccines.vaccinator`, built on Nurse: also checks a walk-in in, registers a child, finishes the visit). Demo: the Vaccination room,
  Rokaya Ghoneim (vaccines@demo.com); Farida Bassem (13 months, OPV 5 and MMR 1 overdue, here), Talia Nassef (2 months, here), Layan
  Hegab (18 months and five weeks, to call), Seif Yehia (4 months, never here: the walk-in). Tests: `supabase/tests/vaccines.sql`,
  `npm run test:vaccines`. *Not as drawn:* the child's card printout (printing is not on this branch) and the booking of the next visit
  (bookings') are left out; the room's marks on other departments' queues ("9-month vaccines due") wait for a mark that reads a pack's
  data (a core door, asked below).
- *Built 2026-10-08 (lane `clinics-shared`), Chronic care* (`chronic_care`, migration 24, role block e1 unused; pictures #chronic-visit,
  #chronic-list): the clinic's conditions, targets and checks as one setting `chronic_care.conditions` (its declared default the drawn table: diabetes,
  hypertension, CKD, heart failure, asthma, COPD; a condition's codes are the register, ICD-10 by its start; a target a measure, a sign
  and a value — a pressure's two; a check its codes and every how many months, sooner while off target; the list's window, 18 months).
  Registers come from the problem list (active; resolved takes the patient off); the measures are the base's latest values by code; a
  check is done when any entry with one of its codes was written — the base's values, or the coded observations and procedures the
  pack keeps (`chronic_care.checks`, a listener) — and a check two conditions share is counted once. Its one type `chronic_care.target`
  (a patient's own target with its reason, everyday; it wins over the clinic's) and its table. Client: the Chronic care section (each
  condition with its code and since, its measures against the target with the last values as a line, its checks done or due), its chip
  ("3 due"), Summary line and banner words ("HbA1c 8.2 ↑", "3 checks due"); `/review dm` (the feet and the eyes as the base's
  observations coded `chronic_care.check:feet|eyes` — their card's chips: monofilament, pulses, skin, foot risk; seen here, referred, an
  outside report — and the tests the clinic's checks find due, drafted as orders where a service here does them; under the card the
  review's last date, each test due or not with its next date, and for a foot at risk what to tell the patient in Arabic); `/target htn
  bp < 150/90 ; 81, falls`; the Chronic care tab `chronic_care.list` (Off target, Checks overdue, All; a chip per condition; the patients
  seen here within the window; a row opens the chart). The setup `chronic_care.clinic` (a Diabetes clinic). Demo: Dr. Iman Sherif
  (diabetes@demo.com); Ashraf Mokhtar (in consult: diabetes, hypertension, CKD 3a; HbA1c 8.2, BP 146/90, LDL 112; eyes, feet and urine
  ACR due), Fawzia Darwish (81; her own target BP < 150/90, falls), Wafaa Abdelmoneim (diabetes and asthma; inhaler technique due).
  Tests: `supabase/tests/chronic_care.sql`, `npm run test:chronic_care`. *Not as drawn, and why:* the key is `chronic_care` (the core says
  "chronic" of a problem term, which the no-pack-names rule reads as naming the pack); the list's Next visit and "none booked first" are
  bookings' and Print the list is printing's, both left out; the flu vaccine check is the immunisation pack's data, which this pack may
  not read; a referral for the eyes is the doctor's /order (the review records "referred"); the review's card is registered for the base's
  observation where the department ticks chronic care; the chart banner counts checks without the facts page (feet and eyes reviewed show
  in the section, the chip and the list); the queue's "3 due" mark waits for the core door asked below.
- *Built 2026-10-08 (lane `clinics-shared`), Family medicine* (`family_medicine`, migration 25, role block e2 unused; pictures
  #family-folder, #family-day, #family-checks): the household as the pack's own table (`family_medicine.households`: the file number by
  the unit, address, phone; `family_medicine.members`: who belongs and how, one file a patient, Erase reaching it), written through its
  ops — `of_patient` and `find` for whoever finds patients, `start`, `join`, `leave` for whoever registers them (manage:patients) — only
  where the department ticks the pack. The checks due by age and sex as the setting `family_medicine.checks` (its declared default the drawn table; who is a
  sex, an age from and to, a BMI from an age; met by codes, never ticked); `family_medicine.files` (New patient asks for a file, on).
  Client: the Family section (the file, its address and phone, each member — a name opening their chart — with what they are due: the
  banner words of the packs this department uses, read through the core's banner-word registry from each member's record, so no pack
  reads another's data, then their family checks), the Checks section (due or met; its chip "2 due", Summary line, banner word), /checks
  (the due checks a service here does, drafted as orders; under the card the list and the family's members), the Families screen
  (`family_medicine.files`: find a file by its number, a phone, an address or a member's name; open it; add a member), and the desk's
  New patient step (core change C4: join a file found by its number, the phone or the address, with how they are related; start a new
  file at an address; or not now). The setup `family_medicine.medicine` (Family medicine: its queue and Families). Demo: Dr. Hazem Ouda
  (family@demo.com); file 1182 — Ayman Abdelrahman, his wife Basma Hegazy (in consult; sugar and cervical screening due), his mother
  Zeinab Hamouda (diabetes, HbA1c late; waiting), Yassin (6, waiting) and Malak (14 months). The clinic's choices
  (`seeds/clinic_packs.sql`): Family medicine ticks chronic care and the immunisation pack after its own, and its line is the queue, Families
  and the immunisation list; the desk ticks family medicine (its door checks the department uses it). Tests: `supabase/tests/family_medicine.sql`, `npm run
  test:family_medicine`. *Not as drawn, and why:* the key is `family_medicine` (the core's word "family" — a patient's family name, the
  chart's families of types — would read as naming the pack); Book (bookings') and the Gynaecology section (ObGyn's) are left out; the
  file number is not a banner word (it would need the pack's read on every chart); the queue's per-pack marks (Q50) wait for the core door
  asked below.
- *Asked by the lane, for the owner:* a row mark that reads a pack's own data (as row actions do, with a load) — today a mark sees only
  the row (patient, visit, orders), so "9-month vaccines due", "3 due", "2 checks due" (and paediatrics' "weight z −2.3", ObGyn's
  "32 w · BP 142/92") cannot be drawn on the queue without it.

---

## 6. Standards

### 6.1 Code systems (stored by key; the URI is resolved at export)

| key | URI | used for | ships |
|---|---|---|---|
| `icd10` | http://hl7.org/fhir/sid/icd-10 (WHO 2019, not CM) | problems, diagnoses, cause of death | import script per installation; the demo seed loads the composer's catalog subset |
| `loinc` | http://loinc.org | vitals, observations, analytes, orders, note kinds | committed subset + notice |
| `ucum` | http://unitsofmeasure.org | every quantity | committed common units |
| `atc` | http://www.whocc.no/atc | ingredient and class: allergy and duplicate checks | import script; the demo seed loads the catalog subset |
| `eda` | {canon}/sid/eg-eda-drug (minted) | the Egyptian drug product | import script |
| `cvx`, `gtin` | http://hl7.org/fhir/sid/cvx, https://www.gs1.org/gtin | vaccines, pack barcodes | with the pack |
| HL7 | terminology.hl7.org | statuses, v3 route, TimingEvent, ObservationInterpretation, ActCode, Confidentiality, PurposeOfUse, v2-0203, admit source, discharge disposition, IPS absent-unknown | committed |
| `local` | {canon}/CodeSystem/{name} | allergens, reactions, procedures, cross-out reasons, alerts | committed |
| per organization | {canon}/CodeSystem/local/{organization id} | a clinic's own service codes, with a LOINC coding beside | settings |

No SNOMED CT (Egypt is not a member and no required binding needs it); `concept.codings` is a list, so it can be added later without a
new type version. ICD-11 comes later through WHO maps applied when reading. Arabic labels are openCare data beside the published names.

### 6.2 Units
Every value keeps the unit as written plus its UCUM code; the value is a decimal string. The codes row of each LOINC code holds the
canonical UCUM unit and the allowed units. Trends and checks convert when reading (mg/dL ↔ mmol/L). Nothing is ever rewritten.

### 6.3 Identifiers

| what | v2-0203 | system key |
|---|---|---|
| National ID | NI | `eg-national-id`: 14 digits, century digit, YYMMDD, governorate, sex digit, check digit (its algorithm is not published, so it is not verified); cross-checks birth date and sex. It warns and never refuses; it prefills birth date, sex and governorate |
| Passport | PPN | `passport-<ISO3>` |
| Record number | MR | `mrn` (per organization) |
| Insurance member | MB | `eg-payer-<key>` |
| UNHCR registration | — | `unhcr` |
| Staff syndicate numbers | MD / PRN | `eg-syndicate-<key>` |

Addresses: governorate as ISO 3166-2:EG (EG-C, EG-GZ, EG-ALX), country EG. Phones as E.164 (+20…).

### 6.4 FHIR mapping rules (R4 4.0.1)
1. `Resource.id` = item; `meta.versionId` = item_version; `meta.lastUpdated` = recorded_at. A type with several resources uses
   `{item}-{key}` (uuid v5(item, key) when that would pass the 64 characters an id may have: a long analyte key); a resource that is
   one per entry (MedicationRequest) uses the entry id. Any other derived id is uuid v5(item, key).
2. `meta.profile` = {canon}/StructureDefinition/{type}|{version}. Private items → `meta.security` R, others N.
3. subject → the survivor Patient; encounter → `Encounter/{visit_id}`; recorder/asserter → the PractitionerRole of the author.
4. occurred_at + precision → a FHIR partial date in the organization's time zone; until → Period.end; recorded_at → recordedDate,
   authoredOn or issued.
5. One **Provenance** per set: targets are every resource version in the set; activity CREATE, UPDATE or NULLIFY.
6. A login → Practitioner; a user → PractitionerRole; a machine → Device. Organization → Organization; site → Location si; department →
   Organization (partOf) + Location wa; room · bed → Location ro · bd with operationalStatus from `base.presence`.
7. The read log → AuditEvent. Settings changes, merge, erase and redact are AuditEvents too.
8. Erased resources vanish. Redacted ones show as entered-in-error. Merge maps to Patient.link.
9. "None known" is a `list_review` exported with IPS absent-unknown codes, never an empty list.
10. The first export is the **International Patient Summary**: Composition + Patient, Condition, MedicationStatement,
    AllergyIntolerance, Immunization, results and Procedure. `{canon}` defaults to `https://opencare.example` until the owner picks the
    project's domain (one row of `core.canon`).

---

## 7. Decisions the owner approved (2026-09-26 defaults)
1. **ICD-10**: WHO ICD-10 2019; an ICD-10-CM coding beside it only if a payer requires it.
2. **Canonical URL**: a domain the project owns, chosen before the first real export; only keys are stored, so nothing waits on it.
3. **Two patients in one set**: only for types that declare `other_patient`.
4. **Live vs late**: 5 minutes from Done to arrival; older, offline, machine and import sets land flagged instead of being refused.
5. **Licensed code files** (WHO ICD-10, ATC, EDA): an import script per installation (`scripts/import-codes.sh`), no files in the
   repository; the demo seed loads only the subset the composer's catalog names.
6. **Patient- and machine-reported facts** land but feed lists and the review loop only after a staff member accepts them with a
   `changes` entry; a lab service may declare autoverification.

---

## 8. Guardrails and the permanent tests
1. **Rebuild = live.** `core.rebuild_check()` recomputes every registered table from entries (refreshes only, never checks) and
   compares row by row. It runs in the test suite and can run nightly on the live database.
2. **Boundary scan**: only the writer, reader, refreshes and eraser name `entries` or a registered table; only the writer and refreshes
   write derived tables (grants).
3. **Privacy canary**: a private note and result carry a marker; every exposed function and storage path is called as a user who may not
   read them; the marker never appears.
4. **Concurrency**: two sessions call one visit, admit two patients to one bed, correct one item: one of each wins; a late copy lands
   flagged.
5. **Registry integrity**: OIDs, owners, volatility, prefixes, may_be_private against the resource, prosrc hashes; every key a core, base or
   pack function reads from entry or setting data (`-> 'data'`, `x.data`, `core.setting_at(…)` and what holds them) is a property some
   declared shape names, and a line or to_fhir reads only keys of the types it serves.
6. **FHIR**: the demo patients export as an R4 Bundle and an IPS whose resources pass the structural checks; every coding resolves;
   every unit is UCUM.
7. **Tenancy matrix**: every read and write across organizations sees nothing.
8. **Pack contract**: one suite for every pack (prefix, grants, refresh = rebuild, canary on its types, off and on, and the row rule:
   a private note and result with a marker, then every pack table scanned: the marker never lands, and a row's source entries from
   other items are all of types that may never be private).

The client's entry and setting types (`src/core/db/shapes.generated.ts`) are generated from the declared shapes by `npm run gen:shapes`;
the test run ends with `gen:shapes --check` and fails when they are stale.

`scripts/db-test.sh` runs every `supabase/tests/*.sql` (one rolled-back transaction each; `-- needs: reset` suites commit;
`-- expects:` counts expected errors). **Acceptance**: every check of the suites before the rebuild has a green counterpart or is
listed as retired with its reason in `supabase/tests/ported.md`, and the eight permanent tests pass.

---

## 9. Kept, later, dropped
**Kept**: correction vs change · type version per entry · signed sets · clinical time with precision · facts land (live vs late) ·
merged family · users per organization · organization first in every key · permanent namespaced text keys, never enums · no copies of
note text · two named exceptions · labels are data (Arabic is a translation) · packs never redefine base ideas · calling is not seeing ·
the read log · the Screens line.

**Later, with no core redesign**: patient portal and proxies, consent, VIP/HIV restrictions, drug rounds, escalations, order sets,
e-prescriptions and referrals, the FHIR API (read, search, `$export`), devices, offline clinics, AI scribes, ICD-11 and `code_maps`,
SNOMED, Coverage and claims, Appointment, Communication, FamilyMemberHistory, clinic-own forms, outside developers' packs, the HL7
Java validator in CI.

**Dropped**: a generic task engine in the core, field-level privacy, separate tags/marks/links tables, read leases, privacy groups,
converters, a sandbox API, API versions by date, sync cursors, timers that write (`sweep_visits`), `core.drafts`, a `code` column,
stored FHIR JSON, URIs, `responsible` and `display_line` on entries, an `outside` source kind, separate `cancelled` and `not done`
types, parked pack calls with per-call Retry, Postgres enums.

---

## 10. Names

| name | means |
|---|---|
| entry · item · version | one fact · the thing it is about over time (its first entry's id) · the entry's place in the item |
| set | one Done, all or nothing (`set_id`) |
| type · base type | a declared kind of entry · the base idea a pack type extends |
| work · place | a department's key (desk, visits, stays, bench, outside) · a room, bed, chair or cubicle |
| user · login | a person in one organization · the account behind them; the column is always `user_id` |
| `may` · writer · reader · eraser | the one permission question · the only way in · the only way out · the two exceptions |
| check · finding · claim | a type's rule · its outcome (refuse, warn, flag) · a lock on a shared thing (`place:<id>`) |
| refresh · derived table · listener | recompute rows from entries · a table holding nothing entries do not · a pack's refresh on others' types, after commit |
| setting | an insert-only row of configuration, read as of a moment |
| system · coding · concept · quantity | a code or identifier system · one code · words plus codes · a value with unit and UCUM |
| live · late | a staff set arriving within 5 minutes of Done · everything else |
| order · medication | the type names in code and on screen; a service's label may still say Consult |
| Send to… · moved | the desk's button to another department (writes `transferred`) · only for beds and places |

---

## 11. Build record
- 2026-09-26: the core v3 build, in one pass. The migrations before it are in `supabase/archive/baseline-2026-09-25/`, the old suites in
  `supabase/archive/tests-2026-09-25/`, the old specs in `spec/archive/`.
  - **Migrations** `20260926000001`–`…12`: core spine · registry · writer · reader · other doors · base codes · base tables · base types ·
    FHIR · guards (rebuild check, cron jobs, file sweep) · the pharmacy pack on the new contract · privileges (every routine revoked from
    PUBLIC, then granted by name).
  - **Seeds**: `auth.sql` (demo logins), `codes.sql` (ICD-10, ATC, the local catalogs; generated by `scripts/gen-codes.py`), `dev.sql`
    (the demo clinic, written through the doors). `scripts/demo-day.sql` fills a day through `write`; `scripts/import-codes.sh` loads a
    licensed code set.
  - **Tests**: 16 suites, 430 checks, all green, the eight permanent tests among them (`supabase/tests/ported.md` maps the old checks).
    The composer's pure half: `npm run test:composer`, 12 groups, including drafts → entries (codings, UCUM quantities).
  - **Client**: every screen reads through `read` and writes through `write` or the other doors. `src/core/db/views.ts` builds the
    screens' view models from server rows; `src/core/db/entries.ts` turns drafts, moves, bench answers and reviews into entries.
    New: the ward's bed board (admit to a free bed, move, discharge). Settings writes rows through `save`/`remove` and everything else
    through `write_setting`; the change list is the `audit` read; Record reads is the `log` read.
  - **Found in the browser pass and fixed**: the outbox job ran as two statements and never committed (now a lone `CALL`, with a guard
    check in the pack contract suite); drained batches now send hints; a department's reads check rights where the read is made, not
    where the screen stands; the pharmacy's answer waits until its own table names the drug.
- 2026-09-27: the core round after v3.
  - **Order steps are real** (§4.4): a service lists its steps; the writer refuses a key its order's service does not list
    (`unknown_step`); `base.orders.step_key` keeps the latest key through status-only steps; the bench offers each order its service's
    next step (the client step registry is gone) and Settings → Services edits them. 16 suites, 441 checks.
  - **Data keys checked** (§8 test 5): the registry suite scans every core, base and pack body for the keys it reads from entry or
    setting data and fails on one no shape declares (a `dosge` probe is caught); none was found. 16 suites, 447 checks.
  - **Client types from the shapes** (§3.7–§3.8, §8): `scripts/gen-shapes.ts` reads `core.types` and `core.setting_keys` and writes one
    type per datatype, entry type (the latest version) and setting, with `EntryData` and `SettingData`; `EntryIn`, `writeSetting`, the
    builders, a pack's answer (`toWrite`) and the screens' inline sets are checked against them, and `views.ts` reads entry data through
    `dataOf` and settings by key. The compile found writes the shapes refuse, fixed in the client (no shape changed): a stopped
    medication or a refuted allergy not at hand lost its required drug or concept, a note answer could go without text, a blood pressure
    with one side blank. `db-test.sh` ends with `gen:shapes --check`. 16 suites, 447 checks.
  - **Settings editors**: sites (with the departments, behind `manage:places`); a department's site, kind of encounter and Screens
    line; its places inline (bed, room, chair, cubicle: add, rename, reorder, close with a reason, delete what nothing used, else retire).
  - **Reviewed** (find, then an adversarial check of each finding): a preliminary answer shows before the step reached; the step key
    outlives a new step item; a step may not take a bench word (`reserved_step`) and the Services editor refuses what a key cannot
    hold (Arabic, accents); a save keeps a retired site, department or place retired from the day it was; a new department stores its
    kind of encounter only when chosen; Settings waits for the directory after a save (no double Add, no stale reorder); a blood
    pressure needs both sides at Done; the data-key scan also reads `select … into`, coalesce defaults and setting_at arguments.
    16 suites, 453 checks.
- 2026-09-27 (later): the fix round.
  - **Stay mode** (§4.2, §4.4): a stay takes only its own moves; `called`, `seen`, `back_to_waiting`, `done`, `left`, `here`,
    `not_here`, `away` and `transferred` on it are refused `not_a_visit`, and the presence refresh ignores one that lands late, so a
    note or vitals saved in a stay no longer ends it or frees its bed. The patient screen on a stay reads "Admitted · Bed 3 · day 2";
    Sign (⌘↵) writes the drafts into the stay with no move and stays on the patient; Discharge sits inline for whoever may write it;
    no Done, Next, Return to waiting or clinic line. A stay's status is `admitted` · `discharged` (never in consult, never a queue
    row). The fixture's nurse also works in the ward: she signs vitals and a note in a stay (still admitted, same bed) and the visit
    moves are refused. 16 suites, 465 checks.
  - **The clock steps back** (§3.1, §3.4, §3.9): the Docker VM's clock (or an NTP step) made a holding or setting written a moment
    ago read as not yet valid (a test run failed about once in 25), an ended holding read as live, and could record a later set
    before an earlier one. As of now, a setting counts once committed (a moment keeps the filter); a holding dated no later than its
    grant and every end count once committed, a holding dated later from `core.now_safe()` (the later of the transaction's start and
    the clock); the writer records after the latest entry of the set's families (under their locks) and `write_setting` after the
    thing's row before; the writer's hidden-target check knows a stored target by its set, not its time. The admin and spine suites
    date rows a second ahead to stand for the step. The privacy suite's "nowhere in the record" check matched `9.9` inside a time
    (…:29.9…) now and then; it matches the value only. 16 suites, 473 checks.
  - **Reviewed** (find, then an adversarial check): another department can no longer claim a visit by a move (`other_department`),
    calling no longer counts as seeing for private notes, and a refused move sent late makes nobody responsible; entries and settings
    keep one order across a clock step (each is dated after the organization's latest other); a stay in bed exports as in progress
    however long since its last move.
- 2026-09-27 (evening): one design system and the new chart (`scratchpad/build-plan.md` steps 1–3; the owner approved every default).
  - **Design system** (§4.6): tokens and the dark theme (`src/core/styles.css`, `index.html`'s no-flash script, `ui/theme.ts`); the kit
    split into `src/core/ui/*` and re-skinned; `/design`; `opencare/tokens-only` as a warning; the import guards fixed (three
    overlapping `no-restricted-imports` had left only the db-client one in force); `scripts/codemod-tokens.mjs`. Every screen swept to
    tokens (the codemod one directory at a time, then hand fixes: the kit's `Menu`, `Callout`, `Chip`, `Switch`, `Avatar`, `NavItem`, `ListRow`), tone names
    (brand → accent, amber → warn, red → danger, blue → info; "here" ok, "back" accent), the raw palette cleared, the theme in the user
    menu. The rule became an error in step 4, when the re-export shims (`settings/parts.tsx`, `lists/ListRow.tsx`,
    `renderers/PatientLine.tsx`) and the old tone names (`LegacyTone`, `Heading`'s `brand`/`alert`) went.
  - **The chart** replaces the visit screen (§4.6): `src/core/screens/chart/` — a pure model (items, the encounter, the record's lists,
    values, the Summary, the screen's decisions; `npm run test:chart`, 31 groups), the blocks (one design per entry type, a pack's
    `Block` inside the same shell), the record panel, the center, the banner and its actions, the glance. Moved and gone:
    `visit/VisitScreen.tsx`, `Record.tsx` (its entry drawer is a block's Details, its results table the center's), `Side.tsx` (the
    panel's list actions, every one kept), `KeyResults.tsx` (Summary · key results), the composer's draft list and long-note drawer
    (drafts as blocks, the long note inline), `CardLine`, `useEntries`, `useResultsTable`. The review list opens the result in the
    chart (`?at=entry:`); old `?entry=` and `?view=results` links still land.
  - **The read fix**: `useRecord` put the visit in its query key while the results table read with none, so a visit opened from the
    queue read the whole record twice; the key is the patient and department now, the view is built in `select`.
  - **Empty until something writes them** (designed places and empty states, no writer yet): reported medicines, alerts, procedures,
    family and social history, documents (no uploader). History's LOINC codes (10157-6, 11331-6, 11341-5, 71802-3) are in the base
    codes. The demo day's Nadia Kamel fills the chart: two past visits and a three-day stay.
- 2026-10-06: platform piece 1 — departments tick packs; one frame; one tab row (§5.1 rules 1, 5 and 6), proven on pharmacy.
  - **Server**: `department.packs` (base; `unknown_pack`, `pack_off`, `duplicate`); `core.department_uses` (granted to `base_role` and
    every pack role); `core.screens` gains `action` and `replaces` (`declare_screen` checks both); `department.screens` gets its check
    (`unknown_screen`, `pack_off`, `pack_not_used`, `wrong_work`, `replaced`, `duplicate`, `opens_off_line`); read `me` carries each
    department's packs used here and its line, and every screen's action and replaces. `pharmacy.dispensing` replaces `base.bench`.
  - **Client**: the screen registry (`registerScreen`); `Department.tsx` draws the line as the one tab row (role filter, five then More ·
    n in place, `?tab=`); the kit's frame (`ScreenTabs`, `ScreenFrame`, `NotForRole`), adopted by the desk, the queue (Queue · Requests
    for us · To review as views), the bench (to collect · in progress · done today as views, sections beside them) and the bed board
    (all · in · free · closed); pharmacy's Dispensing (To give · Prepared · Given today; Prepared, Give all, the form folded out under
    the row; every request sent here, Answer for the bench's page; the bench's keys) is the Pharmacy department's only screen; the composer offers a pack's command only where its pack is used and says where
    otherwise; Settings → Departments: Packs used here, and a Screens line of the base's screens of the work and the ticked packs'. Gone
    from the core client: the department type guessed from a `pharmacy.` screen and the work-based default screen.
  - **Demo**: the Pharmacy ticks pharmacy; its line is `[pharmacy.dispensing]`.
  - **Reviewed** (find, then an adversarial check of each finding): read `me` builds a department's default line from its ticked packs
    too (one tick brings the tab, with no line stored); Settings edits the line as the department shows it (a pack screen off or
    unticked is back to the bench, and replaces nothing in the choices), so it can always be corrected; Dispensing lists every request
    sent to the department (a lab that ticks pharmacy loses none of its work) and has the bench's keys (↑↓, ↵ folds the row, `/`,
    Esc); Fewer is not offered while the selected tab is behind More, and More starts folded in each department; a preset's pack line
    says where the command works, not "not for your role"; the bed board's In counts what it shows; every empty and not-for-role
    state is the kit's `Empty` or `NotForRole`.
  - **Tests**: 17 suites, 529 checks (new `screens`: 41); `npm run test:screens` (new), 9 groups; `test:composer` 13 groups; `test:chart`
    22 + 9 groups.
- 2026-10-06: platform piece 2 — chart sections and their chips (§5.1 rule 2 and "The section chips"), proven on pharmacy.
  - **Client**: one section registry (`registerSection`, `src/core/screens/chart/sections.ts`) replaces the record panel's fixed list;
    the base's eight register in `panel/base.ts` with their chip words (`model/chips.ts`); a pack's declares its fit, its types (its
    has-data test) and its chip word and Summary line. The rule is one pure function (`arrange`, and `sectionsOf` with the words, the
    private fact and the Summary lines); every pack section's types are read with the cross-outs in a read of their own
    (`usePackEntries`), so hidden entries count as placeholders.
    The chips are one row (Summary, this department's pack sections, a thin line, the base's, other packs' with data, More · n in
    place; on a phone sticky under the banner, scrolling sideways); keys 1–9 jump to a chip; the Summary shows a pack's line while its
    section shows. Pharmacy's section lists each dispense (products and amounts, or the medicine a not-given one answers; when; Given ·
    Prepared · Not given), its chip "n supplied", its Summary line the last supply. No server change.
  - **Reviewed** (find, then an adversarial check of each finding): the packs' types left the facts page (500 entries, newest first)
    for a read of their own, so a chronic patient's refills can no longer push an old DNR off the banner, nor old dispenses off
    has-data; a redacted dispense (data blanked, `wrong_patient`) is no data, so it no longer brings the section onto that chart as
    "1 prepared", and a dispense with no state it knows is left out; the Documents chip says "3+" while earlier pages remain; the
    Problems, Medicines and Allergies chips count the list drafts as their heads do; a pack section is a skeleton while its read is
    under way, never "Nothing dispensed yet"; a not-given row names the medicine its order is about.
  - **Tests**: `npm run test:sections` (new), 17 groups: age and fit at the boundaries, the rule (used here or not, fit, data, a pack
    off), the order and More, private data as the fact only, a section's own entries, Summary lines, the registry, the base words,
    pharmacy's, and one per review finding (redacted, the packs' own read, Documents "n+", drafts on the chips, the medicine not
    given). `test:chart` 22 + 9 groups, `test:composer` 13, `test:screens` 9; 17 suites, 529 checks (unchanged).
- 2026-10-06: platform piece 3 — the banner in zones and the base facts it needs (§5.1 rule 3), proven on pharmacy.
  - **Server**: two base types, `pregnancy` and `breastfeeding` (36 in all), each current until a version that `changes` it ends it;
    one check for the standing facts, `base.fact_check`, which the `alert` now takes too (`nothing_to_end`, `already_ended`,
    `names_hiv`, `dates_not_pregnant`, `lmp_or_weeks`, `lmp_future`; warnings `lmp_long_ago`, `sex_male`); their lines and FHIR
    (Observation 82810-3 with the LOINC answer and the LMP or weeks, 63895-7; an ended fact as a period); LOINC 49051-6, 63895-7,
    LA15173-0, LA26683-5 and the alerts `isolation_hbv`, `isolation_hcv` in the codes; the Doctor and the Nurse write them.
  - **Client**: the kit's banner takes zones and a second line; the chart's banner is who · where · safety · this department's words
    (`model/banner.ts`, `words.ts`), the phone moved to the Summary, which shows Pregnancy & feeding with End; the composer's `/preg`,
    `/bf` and `/alert` with their cards (`visit/facts.ts`, `FactCards.tsx`), a new line changing the standing fact and `end`
    ending it (End on the Summary and on an alert seeds it); the facts page reads the two new types and a block draws them;
    pharmacy's banner word "n to collect". `/design` shows the banner in zones.
  - **Reviewed** (find, then an adversarial check of each finding): the safety zone counted critical results through the reader's
    own waiting list, so a critical result waiting for the ER showed only there; it now counts the patient's critical review rows
    whoever they wait for (one per result). `names_hiv` caught only the token "hiv": AIDS, the name spelled out, HIV1, a code such as
    `isolation_hiv` or B20, a note, or an inactive version got through and would show in every department; now one pattern
    (`base.names_hiv`, the client's `namesHiv`) checks the words, the note and every coding in every version, and the Allergies &
    alerts panel and the alert block never draw words or a note naming HIV. Ending a pregnancy after the delivery warned
    `lmp_long_ago`; only a current one is warned. A pregnancy never ended counted weeks for ever; past 44 weeks it reads "Pregnancy
    · check (n wk)" in warn, on the banner and in the Summary. An impossible LMP (2025-02-30) raised in the check and landed flagged;
    the composer refuses it and the server says `bad_lmp`. Two clinicians could each start a current pregnancy (or breastfeeding);
    the second is refused `already_recorded`. A bare `/alert` opened a card set to DNR, so Enter drafted a DNR; it starts with no kind
    and asks what the alert is. The banner's actions no longer keep one line on a phone (they wrap). The client has words for the
    facts' codes.
  - **Tests**: 18 suites, 579 checks (new `facts`: 50 — the declarations, shapes, checks, a change by another clinician, ending once,
    a correction of an end, an alert written and ended, HIV refused in every form, a bad LMP, one current fact at a time, an end long
    after the LMP, FHIR); `npm run test:banner` (new), 13 groups — the zones' order, who without the phone, allergies, alerts (HIV
    never named, one pattern with the server's), critical results, pregnant and breastfeeding, the safety zone the same in every
    department and for every reader, a pregnancy past 44 weeks, the pack words (department filter, rank, two, +n), the second line,
    the registry, pharmacy's word; `test:composer` 15 groups (the facts' commands and entries, a bare /alert, a bad LMP),
    `test:chart` 22 + 9, `test:sections` 19, `test:screens` 9.
- 2026-10-06: platform piece 4 — what a pack may read, and roles (§5.2 Reading, Roles, Off; §3.1, §3.9 step 5, §3.10 the row rule).
  - **Reading**: the pack doors (§5.2's table), masked by default (the session's user; `wrong_organization` across clinics); only a
    refresh or a listener reads unmasked, every one now run through `core.run_refresh` (the writer, the outbox drain, a merge, a pack
    on again, redact, the rebuild check). `core.pack_entries` is masked too (it was always unmasked).
  - **Roles**: `core.roles.built_on` and `everyday`, `core.actions.everyday`; `core.gives`, `core.actions_in`; `may`, `may_somewhere`
    and `holders_in` count a pack's actions only where its department uses the pack, a base role's actions for what is built on it, and
    the everyday actions for Doctor and Nurse there. `declare_role` adds, never replaces; `declare_role_action`. Read `me` sends each
    role's `built_on`, `everyday` and `own` actions, each action's `everyday`, and `me.may` per department; the client's `mayIn`
    reads it. Settings → Roles: "Built on Doctor", the own actions by pack, the everyday ones.
  - **Off**: a correction of a pack entry while the pack is off (or not used in the department) lands for an author of the item;
    before, it was refused `not_allowed` because nobody held the pack's write action.
  - **Tests changed where the contract changed**: admin's "the owner holds a pack's action" now asks in a department that ticks the
    pack (and that it holds it nowhere else); the pharmacy and pack contract suites tick the pack where its actions are used; the
    boundary scan lists the new doors.
  - **Reviewed** (find, then an adversarial check of each finding): the correction path could be taken with the pack on, by picking an
    unticked department (a former pharmacist, now a ward nurse, completed a dispense): it now needs the target's own department; a new
    pack entry in an unticked department slipped past `may` (a null in the test) and is refused `not_allowed`; `pack_kind` applied its
    limit before the data and codes filters and the masking (the newest note, hidden or of another kind, hid an older match), now last;
    `pack_rows` cut an unordered slice before withholding and `latest` (a limit of one gave whichever row came first), now newest
    first by `at`'s own type, withheld, then limited; an unmasked read took any clinic's id (the mark now names the clinic the refresh
    runs for); a hidden entry's placeholder kept its end time; an organization-wide action can no longer be everyday
    (`everyday_for_department`); Settings → Roles shows the everyday actions of a role built on Doctor or Nurse.
  - **Tests**: new `pack_reads` (48: each door masked as a reader without rights and in full as one with them, in a check as the
    writer, unmasked in a listener with rows the reader masks, refused with no session or across clinics, a listener refused another
    clinic, a filter and a latest before the limit, a pack entry refused where the department does not tick the pack) and `roles` (30:
    pharmacy's actions only where ticked, a probe pack's specialist built on Doctor gaining a base action declared later, its everyday
    action held by a GP Doctor and a Nurse only where the department ticks the probe pack, unticked and off, no everyday
    organization-wide action); `pack_contract` +6 (the row rule); `pharmacy` +6 (off: its holders keep nothing, a correction by its
    author lands, by anyone else not, a cross-out lands; on: a former pharmacist's change refused in the ward and in the pharmacy).
    19 suites, 620 checks; `test:composer` 13 groups, `test:chart` 22 + 9, `test:screens` 9, `test:sections` 19.
- 2026-10-06: platform piece 5 — every setting editable in the app (§5.1 rule 7; §3.4, §3.5, §3.8, §3.10), proven on pharmacy.
  - **Server**: `core.setting_keys.fields` and `form`; `declare_setting(…, fields, form)` checks each field against the shape once
    (`unknown_field`, `duplicate`, `label_missing`, `unit_not_number`, `unknown_choice`, `field_unlabelled`, `wrong_owner`,
    `not_a_pack`, `form_many`, `bad_fields`); `write_setting`'s refusals name their field in the hint (`core.refuse_at`; the shape's
    by `core.shape_field`, a check's by its finding's `field`); read `me` sends each key's shape, fields and form, the datatypes once,
    and each setting's author; the `audit` read takes `what`; `core.code_imports` and `core.record_import` (the import script and the
    demo seed record each load) and the `reference` read. Pharmacy: `pharmacy.late_after` (per pharmacy) and `pharmacy.counselling`
    (for the clinic, with `pharmacy.counselling_check`: `note_missing` at `note`); the demo shows a counselling note.
  - **Client**: the automatic form (`settings/form/`: `model.ts` pure, `AutoForm.tsx`, `SettingCard.tsx` with Save, who and when,
    History; `registerSettingEditor`); Settings → Packs → *pack*, the department's pack cards, Settings → Reference lists; Dispensing
    marks a prepared row late past the pharmacy's limit and shows the counselling note above Give; `Refusal.field`.
  - **Tests**: new `settings` (43: the declarations and every refusal of a bad one, a probe pack's setting with every kind of field,
    read `me`, a refusal's field from the shape (a table's cell, a sub-section's field, a choice, an unknown key) and from a check, who
    may, a pack off, the history by setting, the reference lists with the demo's sample and a later full load); `npm run test:settings`
    (new), 8 groups — each kind of shape drawn, the checks by path, what is sent and the defaults, a refusal rendered under its field,
    the history's words, a pack's own editor, pharmacy's late mark and counselling note. 21 suites, 713 checks; `test:composer` 15
    groups, `test:chart` 22 + 9, `test:screens` 9, `test:sections` 19, `test:banner` 13.
  - **Review fixes**: an error at a path the form does not draw (a datatype's inside, a key a pack's upgrade dropped, a check's own
    field) moved to its nearest drawn place or over the Save (`placeErrors`), a whole item's error shown under its head, and a saved key
    the shape no longer names left out of the form's start (`prune`); a numeric choice keeps its number (chips, lists of choices, the
    history's words), and `check_fields` matches choices' words as text and takes a list's unit and choices from its items; `not_a_pack`
    for any form on a layer that is not a pack; read `me` keeps a key's own `$defs` and the client merges them; a department's pack card
    read-only while the clinic has the pack off; Undo draws the editor again (a box's unread text goes); chips in a named group (not a
    radio group), each Remove named, a number's name with its unit. `settings` 48 checks (a list of choices with words, a list of
    numbers with a unit, a numeric choice with words, `not_a_pack` on a department form, a key's own `$defs` in read `me`);
    `test:settings` 11 groups (a numeric choice, errors placed, a whole item's error, the dropped key, a key's own `$defs`).
    After the fixes: 21 suites, 718 checks; `test:composer` 15 groups, `test:chart` 22 + 9, `test:screens` 9, `test:sections` 19,
    `test:banner` 13, `test:settings` 11; typecheck, eslint and the build clean.
- 2026-10-06: platform piece 6 — one board per place, the tile line and buttons, and pack marks on the lists (§5.1 rule 4, rule 1's
  marks), proven with a test-only probe pack and on pharmacy.
  - **Server**: `declare_screen` refuses a pack screen that stands in for `base.beds` (`board_is_base`); the Screens line of a
    department of places keeps the board (`no_board`).
  - **Client**: the tile registry (`registerTileLine`, `registerTileButton`, `ward/tiles.ts`: one line a pack, at most two buttons a
    pack and on a tile) and the one tile (`ward/Tile.tsx`: the bed; who, sex and age, the stay's day, the responsible clinician; the
    packs' one line; the base's Admit here, Move and Discharge first at the foot, then the packs'); the row marks (`registerRowMark`,
    `screens/marks.ts`, one a pack), drawn by the kit's `ListRow` (`marks`) and the desk's lines, on the desk, the queue and its
    requests, and the bench; only the packs the department uses speak, a colour only for a state. The Screens line keeps the board
    (drawn first should a stored line leave it out; Settings cannot take it off). The queue's rows carry their visit's orders.
    Pharmacy's mark "Rx to collect" (the clinic queue, a prescription prepared). `/design` shows the board with a probe pack's line
    and buttons, and a queue row with a mark.
  - **Reviewed** (find, then an adversarial check of each finding): pharmacy's mark counted only a step named `prepared`, so a
    dispensing service whose steps are named otherwise (`ready`, `counted`) showed the order under Prepared and "1 to collect" on the
    banner but no mark; it now counts an order to the pharmacy that is open and started, as Dispensing and the banner do. The mark
    claimed the desk, but the desk's rows carry orders only for a reader with `read:bench` there, which Reception never holds (nor a
    Nurse on the queue): a mark sees only what its reader may read, so pharmacy marks the clinic queue only, and the spec says so. A
    pack could register a tile button named Admit, Move or Discharge; refused. For whoever may not admit, the base's buttons were
    left out and the packs' moved into their place; they are drawn off ("not for your role") and keep it. A stay with no bed here
    had the packs' line but never their buttons; it has them. `/design`'s board sample centred its tiles, so their buttons did not
    line up at the foot as on the board; they stretch.
  - **Tests**: 20 suites, 674 checks (`screens` 45: +4, a pack board for places refused twice and never declared, a ward's line
    without the board); `npm run test:board` (new), 12 groups — the probe's registrations (a third button, a second line or mark,
    the base and its button words refused), its line only where used, one line in the department's pack order, a failing or blank pack silent, state
    tones only, the base's buttons first and in place (off, not left out, for whoever may not admit), a stay with no bed (the packs'
    buttons), at most two pack buttons in pack order with show(), a button's click and path, the marks (used here, one a pack, order,
    tone), a row as a mark reads it, pharmacy's mark (the queue only; any step name); `test:screens` 10 groups (the board
    kept), `test:composer` 15, `test:chart` 22 + 9, `test:sections` 19, `test:banner` 13.
- 2026-10-06: platform piece 7 — a score is worked out once (§5.1 rule 8; §3.4, §3.8, §3.10, §4.1, §4.4, §4.6, §4.7), proven on the
  base's Glasgow Coma Scale and a test-only probe score.
  - **Server**: `core.scores` (one row per version, never changed) and `core.declare_score` with its refusals; `core.retire_score`;
    `core.score(key, version, inputs)`, the one sum (each item's points, the points so far, the total and its band once complete; a
    value it cannot score is its item's problem), granted to the base and every pack role and reached by the API through the `score`
    read; read `me` sends every table. The base type `score` (37 in all) with `base.score_check` (`score_mismatch`, `unknown_score`,
    `score_retired`, `score_incomplete`, `bad_input`, `pack_not_used`), its line ("GCS 14, 1974 · Mild") and its FHIR Observation;
    the Doctor and the Nurse write it. GCS 1974 with LOINC 9269-2, 9267-6, 9270-0, 9268-4. A setting key may name its own action
    (`declare_setting(…, action)`): `score.signed_off` by the core's `sign:score`, which the Doctor holds (one live sign-off per
    version, `already_signed`). The demo day's Nadia Kamel has a GCS 15 on admission.
  - **Client**: `/score` and each score's alias (`/gcs e4 v5 m6`) in the composer, a pack's score only where the department uses the
    pack; the score's inline card (`visit/ScoreCard.tsx`, pure model `visit/score.ts`): chips with the table's points, yes/no, a number
    with its unit, the server asked as it fills (debounced; an answer to older inputs dropped; a failed ask says so with Try again),
    each item's points, the total and the band in its words and state tone, "not signed off for this clinic" when so; Done waits for
    the server's answer to what the card holds and writes its total. A score counts and filters under the Whole record's Other. The record's score block; Settings → Scores (each table read-only, its source and version, the
    sign-off with who and when, Sign off and Withdraw for `sign:score`, earlier versions folded).
  - **Tests**: new `scores` (98: GCS declared, every refusal of a bad declaration (a number with no unit or a bad min/max, a choice
    whose value is not a text), the probe's every kind of input at its boundaries
    and each problem, the bands, the read, the check refusing a mismatch, an unknown, incomplete or bad input and a retired version, a
    pack's score where unused, an old entry keeping its version, line and total after a new version is declared, FHIR, the sign-off:
    who may, once per version, withdrawn and signed again, its history; the same table again with its source padded); `registry` counts
    37 base types; `npm run test:scores` (new), 7 groups — /score and the alias, /score alone, the card's state only from the server's
    answer for these inputs, what a draft needs, its line and its entry, the debounced preview with fake timers, a failed preview,
    Settings' words; `test:chart` checks every type a kind counts is one its filter reads. 22 suites, 820 checks; `test:composer` 15,
    `test:chart` 23 + 9, `test:screens` 10, `test:sections` 19, `test:banner` 13, `test:settings` 11, `test:board` 12.
  - **Review** (fixed): the Whole record's Other filter did not read scores, though Other counted them; a number item's unit and
    min/max were not checked, so a bad min made `core.score` raise; a choice's value could be a number, which the card and the record
    cannot match; the same declaration with a padded source refused `version_exists`; a failed preview left the card "Working out the
    total…" with no way to ask again.
- 2026-10-06: platform piece 8 — each pack brings its own demo (§5.1 rule 9), proven on pharmacy and the base.
  - **Loader**: `npm run db:demo` (`scripts/demo.sh`, one transaction) loads `supabase/demo/load.sql`: the kit, the base's seed and
    day, each pack's seed and day, the shared journey; `scripts/include.awk` expands its `-- include:` lines for it and for the suites.
    It reloads any time (the seeds add only what is missing; each demo patient is erased through `erase_patient` and written again)
    and stops on a refusal or a flagged entry. Gone: `seeds/auth.sql` (each seed makes its own people's logins) and
    `scripts/demo-day.sql` (the base's day is `demo/base.sql`, pharmacy's part `seeds/pharmacy.sql` and `demo/pharmacy.sql`).
  - **The kit** (`supabase/seeds/demo_kit.sql`, schema `demo`, local only): ids per layer (`demo.id`), people and holdings added one
    at a time (`demo.person`, `demo.grant`), a pack turned on and ticked (`demo.pack_on`, `demo.tick`), a tab appended to the Screens
    line (`demo.screen`), settings written once, patients erased and registered (`demo.patient`, ages by `demo.born`), entries at
    minutes before the load (`demo.ago`, `demo.e`, `demo.move`, `demo.w`), a clinic visit, the lab's steps and results.
  - **Relative times**: `base.presence` keeps arrived, called, seen and the day as clinical times and `base.orders` its sent,
    answered, last moved and day (and `pharmacy.queue` its prepared and dispensed), §4.2, so "arrived 40 min ago", "a result an hour
    ago" and "prepared 55 min ago" read true whenever it loads; seen is the earliest clinical time of the first set written after
    the call, picked in a fixed order so a rebuild picks the same.
  - **Logins**: every built-in role has a demo person with a real name (the owner Amira Lotfy, Sara Mahmoud, Mai Samir, Karim
    Fawzy; pharmacy's Dr. Reem Hamdy and its new plain Store keeper role `…ca02`, Hesham Ragab); `npm run gen:logins` writes
    `src/core/shell/logins.generated.ts` from them and `db:test` checks it; the sign-in page lists them by department.
  - **Tests**: new `demo` suite (38: the demo loaded twice in a row with nothing refused or flagged, the same patients, entries,
    settings, holdings and people again, rebuild = live; the longest wait 40 minutes, in consult 8, every open visit within 12 hours,
    Nadia on day 3; alerts, a critical result, pregnant and breastfeeding; pregnancy only for women 10–55, weight and heart rate for
    the age, no blood pressure on a baby, haemoglobin ranges by sex; a demo person with a login for every built-in role; pharmacy only
    on its own patients and the journey's, one late and one to collect; the journey in order with a follow-up booked); `rebuild`
    runs the new demo (+1: the journey's dispense; Nadia's chart lists the base's kinds); `npm run test:demo` (new), 6 groups: no
    fixed date in any demo or seed file (and the scan catches each way of writing one), the load order, a pack's ids in its own
    namespace and no table written, the sign-in page from the generated file only, a person per role. 22 suites, 761 checks;
    `test:composer` 15 groups, `test:chart` 22 + 9, `test:screens` 10, `test:sections` 19, `test:banner` 13, `test:settings` 11,
    `test:board` 12, `test:demo` 6; typecheck, eslint and the build clean.
  - **Review** (10 findings, all fixed): the journey's steps clamped to midnight or to 08:00 fell out of order before 09:00 (now
    plain `demo.ago` times, in order); pharmacy's step sat in the shared journey file (now `demo/journey/<n>-<layer>.sql`, one per
    layer, the later ones finding the patient and stay by `demo.kept`); the password was typed twice (now `demo.password()`, which
    `gen:logins` writes as `DEMO_PASSWORD` for the sign-in page); the README's layout (seeds, `supabase/demo/`, the scripts); a
    patient of the app in a bed the demo named stopped a reload with bed_taken (`demo.w_bed`: the bed named, else the next the
    writer takes); loaded after midnight the morning fell on yesterday (the kit's one clock `demo.now`, today's minutes squeezed
    into the time since midnight before 05:00); orders' sent and answered times and the chart's steps were write times (now
    clinical, a Done holding for orders open at its clinical time). Tests: `demo` 38 → 56 (the journey strictly in order with the
    round's note, every visit and both admissions today's and ten done today, Salma's lipids sent 144 and back 60 minutes ago,
    lab orders answered at their result's time, Hamdy waiting 47 minutes; reloaded with two of the app's patients in Beds 3 and 4;
    loaded as at 00:30 with rebuild = live); `rebuild` checks Nadia moved off her first bed, not Bed 5; `test:demo` 6 → 7 (no
    `now()` in a demo file, the journey's files in order with each pack's step naming only its ids, the password from the
    generated file and named once in the kit). 22 suites, 779 checks; `test:composer` 15, `test:chart` 22 + 9, `test:screens` 10,
    `test:sections` 19, `test:banner` 13, `test:settings` 11, `test:board` 12, `test:demo` 7; typecheck, eslint and the build clean.
- 2026-10-06: platform piece 9a — starter setups and the registry's guards (§5.2 "Setup and guards"; §3.8, §3.12, §4.6, §5.1 rule 9).
  - **Server**: `core.setups` and `core.declare_setup` with its refusals; the base's Clinic, Ward, Laboratory and Front desk and
    pharmacy's Pharmacy; `core.setup_id`; `core.setup_parts` (to add, the same, differs, blocked) and the door `public.setup`
    (preview, or apply all or a list of parts, through `save` and `write_setting`; `would_overwrite`, `unknown_part`, `unknown_setup`,
    `wrong_work`, `pack_off`), `department.setup`, read `me` lists the setups. Guards: `declare_system` checks the prefix and refuses a
    key another layer holds; `core.layers.role_block` (base `c0`, pharmacy `ca`, the next pack the next free), `declare_role` checks the
    prefix, the block (`outside_block`, `no_role_block`) and refuses another role's key (`key_taken`); pharmacy's roles renamed
    `pharmacy.pharmacist`, `pharmacy.store_keeper`.
  - **Demo**: every department made from a setup (`demo.setup`); beds and lab services take their setups' ids (`demo.bed`,
    `demo.service`, `demo.thing`); `demo.layer`, `demo.ids` and `demo.mine` refuse a seed row outside its layer's namespace.
  - **Client**: Settings → Departments starts a department from a setup or blank, and compares a department with its setup with Apply
    for each missing part (`settings/Setups.tsx`, pure `settings/setup.ts`); `runSetup`; `Department.setup`, `Organization.setups`.
  - **Tests changed where the contract changed**: `roles` declares its probe roles inside the probe's prefix (`probe.specialist`);
    `boundary` names the new door; `demo` registers its two app patients through `save_patient` (the kit takes only the demo's ids).
  - **Tests**: new `setups` (104: the five setups and read `me`; every refusal of a bad declaration; a setup asked about, then run, on a
    new department, each thing's id from its key, audited; run twice, nothing; the same rows in another order name the same things; the
    fixture's changed ward (its own beds matched by name, a retired bed and a changed kind of encounter differ and are refused
    `would_overwrite`, one part accepted, then the rest); the fixture's pharmacy ticked with its service kept; the lab's changed CBC,
    line and works-for kept while the missing services are added; a pack off, the wrong work, an unknown setup, someone who may not;
    the code-system and role guards; a demo seed row outside its namespace refused); `demo` +4 (every department records its setup,
    the ward's beds are the setup's, nothing missing after a reload, the Pharmacy's pack and one service); `pack_contract` +1
    (systems, setups and roles in prefix and block); `tenancy` +2 (the setup door across clinics). `npm run test:setups` (new), 9
    groups — the spec's summary line, counts by kind, ticks and the line, differences named never offered, run twice, a pack off,
    the rows' order and Apply, what a difference says, values in words; `test:demo` 8 (+1: each file says its layer first, the kit
    checks the namespace, departments from setups). 24 suites, 988 checks; `test:composer` 15, `test:chart` 23 + 9, `test:screens`
    10, `test:sections` 19, `test:banner` 13, `test:settings` 11, `test:board` 12, `test:scores` 7, `test:demo` 8, `test:setups` 9;
    typecheck, eslint and the build clean.
  - **Review** (7 findings, all fixed): a bed staff deleted (`remove('place')`, no row left) counted as to add, so Apply all or the
    next demo reload made it again; a place with no row is now matched against its delete in the audit (by its id, or its name in
    this department) and differs ("removed here; not added again"). A pack staff unticked counted as to add and was ticked again
    (Apply all, the demo's `demo.setup`); a pack this department ticked once, or whose list staff retired, now differs ("unticked here;
    not ticked again", "your Pharmacy tick differs"). Compare's Apply under an open department editor left its draft stale, so the next
    Save wrote the old packs and line back: Apply waits while the editor holds changes, and a clean draft follows the department as
    it stands (`useDraft.refresh`). A department whose work changed since its setup was stuck on `wrong_work`; it compares with its
    own setup only while that is of its work, else one to pick (`compareChoice`, pure). Making a department from a setup ended in
    "Discard your unsaved changes?" over a department already made; made, the card closes (`onMade`), and only Cancel asks. Tests:
    `setups` 104 → 112 (a setup bed deleted differs, is refused `would_overwrite` and not made by Apply all; staff's own bed by the
    setup's name, deleted, the same; a pack unticked differs, refused, and stays unticked); `test:setups` 9 → 11 (removed and
    unticked in words and never offered; which setup a department compares with). 24 suites, 996 checks; `test:composer` 15,
    `test:chart` 23 + 9, `test:screens` 10, `test:sections` 19, `test:banner` 13, `test:settings` 11, `test:board` 12, `test:scores`
    7, `test:demo` 8, `test:setups` 11; typecheck, eslint and the build clean.
- 2026-10-06: platform piece 9b — export, off and on, Retry, and the core free of pharmacy (§5.2 Export, Off, Setup and guards; §3.8,
  §3.9 step 9, §5.1 rule 4), proven with test-only probe packs and on pharmacy.
  - **Export**: a pack type maps as its base type, and its own mapping only adds beside it (`core.fhir_beside`); every resource is
    checked (`core.fhir_problems`); a mapping that raises, overwrites the base or breaks R4 refuses the export (`fhir_failed`,
    `fhir_invalid`) where it used to be dropped with a warning. Pharmacy's `pharmacy.dispense_fhir` adds a MedicationDispense per
    thing given (or one declined) and an `output` on the base's Task (`resources` Task, MedicationDispense; the pack roles may call
    the core's FHIR helpers). Found by exporting the demo: a `reviewed` about a consult's note pointed at a Task; it points at the
    DocumentReference.
  - **Off and on**: a pack off is not refreshed by the writer, a merge or the rebuild check, and its listeners are not queued; its
    pending work is dropped when it goes off and by the drain. On again it catches up in the background (`core.catch_up`,
    `core.catch_ups`, outbox kind `catch_up`), never in the switch's transaction; read `me` sends the progress.
  - **No silent failures**: an inline refresh that fails is queued in the outbox with its error, beside the stale mark; one row's work
    is `core.drain_one` (the job's procedure and the tests' `core.drain` both use it), live work first; a success clears the
    patient's stale mark once none of the pack's work for them is failing. `public.retry_pack` (Retry) queues failed and parked work
    again, and the refresh of a stale patient with nothing waiting. Settings → Packs (`settings/PackList.tsx`, words in
    `settings/packWork.ts`) shows catching up, failing, parked and stale, with Retry; the Settings home counts failed work.
  - **Identity**: `core.derived.reads`, `declare_table(…, reads)` (`unknown_read`, `identity_undeclared`); a change of sex or birth
    date refreshes only the tables that read it (`core.identity_changed`).
  - **The core free of pharmacy**: the send registry (`visit/send.ts`: `registerSend`, `sendTarget`, `sendWordsOf`, the plain words
    when no pack speaks), the reply form's `done` and `details` (`replyDetails`), `registerWords` (`db/words.ts`, split from
    `rpc.ts`), `worksFor` pure in `db/views.ts`; reads.ts, entries.ts, `FINAL_STEP`, the card, the composer, the medicine list, the
    Summary and the prescription block read them; the step test is the base type's. Pharmacy registers its words
    (`packs/pharmacy/answers.ts`). `/design`'s record sample uses its own sample type. ESLint `opencare/no-pack-names` fails on a
    pack's key anywhere in `src/core` (generated files aside).
  - **The tile line**: a pack's words are plain or one by one, each with its own state tone, which colours only that word.
  - **Tests changed where the contract changed**: pharmacy's and the pack contract's "on again" drain before they look (and check that
    nothing was rebuilt in the switch's own transaction); the boundary scan lists the new doors and `retry_pack`; the composer's and
    the chart's fixtures register the sender a pack would; the board's probe colours one word (and a whole-line tone is dropped).
  - **The review** found ten things (two pairs the same), all fixed with a check that fails without the fix: a pack's patch of the
    Patient skipped the merge and the R4 check (it now merges beside the Patient, and the Patient, places, people and Provenance
    are checked; a set that wrote no resource, a death, no longer breaks the Provenance filter); a lab analyte key long enough to
    pass 64 characters in `{item}-{key}` refused the whole export (that id is now uuid v5(item, key), and its set's Provenance still
    names it); `identity_undeclared` read only the refresh's own source (the declaration now follows its own schema's helpers, and
    `base.pack_identity` refuses at run time a pack's refresh whose table declares no reads, `core.unmasked.refresh`);
    `fhir_failed` blamed the pack when the base's mapping raised (it names the mapping that was running); a failed or parked row
    sent no hint and a catch-up sent one per row (`core.drain_hints`: one per clinic per run, every 50 rows and at its end, a failure
    included); the IPS gave `{item}-d1` resources a fullUrl that is not a uuid, and a department's Organization and Location one
    fullUrl (a plain uuid, once each). `export` 50 (+15: the base's mapping named, a patch over gender or a second deceased[x]
    refused, an extension added, the long analyte key, the IPS fullUrls), `pack_work` 68 (+6: a helper refused when declared, a
    hidden one when it runs, a declared one runs, the door masked outside a refresh, a failing drain's hint); 25 suites, 997
    checks, every `test:*` script, typecheck, eslint and the build clean.
  - **Tests**: new `export` (35: the dispense's Task as the base maps it with the pack's output, the MedicationDispense given and the
    one declined, valid R4 and every reference resolving, the merge and the checks, a mapping that raises, overwrites or breaks R4
    refused naming only the type and mapping, every demo patient exported valid with its MedicationDispenses) and `pack_work` (62: the
    reads declared and refused, off with no work, on catching up in batches with its progress and live work first, off dropping its
    work, the drain dropping a pack off's row, on again, a failed listener and inline refresh, parked, Retry refused and allowed, the
    marks cleared, a stale patient with nothing waiting, identity refreshing only the tables that read sex or age); `pharmacy` 31,
    `pack_contract` 33, `boundary` 10; 25 suites, 976 checks. `npm run test:registries` (new), 7 groups — no target until a pack
    registers, pharmacy's words and target (works_for), a prescription sent on and its line, the reply form's done and details, the
    refusals' words, the no-pack-name scan of every core file and of each way of writing one, Settings → Packs' words and Retry.
    `test:board` 12 (one word coloured, drawn), `test:composer` 15, `test:chart` 23 + 9, `test:screens` 10, `test:sections` 19,
    `test:banner` 13, `test:settings` 11, `test:scores` 7, `test:demo` 7; typecheck, eslint and the build clean.
- 2026-10-07: **the bench speaks generally** (the owner): the base bench's views are To do · In progress · Done today and its older work
  "Not started, older days"; a pack the department uses may give its own words (the lab's "To collect"), registered by pack, never by
  a department type. `test:registries` 8 groups.
- 2026-10-08: the billing pack, its server and screens, with core changes (e), (f) and (g) (§5.4; the row button, the lines due, the
  soft check and the charging declaration, core changes (a)–(d), are built beside it and wired after the merge).
  - **Core**: `declare_table(…, entries)` and `core.table_out` (a table that sends no record entries nor their ids, whoever asks);
    `declare_op(…, patients)` and `public.pack_op` logging one read a patient an operation returns (`patients_unnamed`);
    `core.read_merge` (two reads of ten minutes keep both: lists joined detail by detail) and every reader logging its details as
    lists; `core.stores` and `core.declare_store` (Erase deletes a pack's declared rows, or empties the columns named).
  - **Billing** (migration 13, privileges 14): `billing.charges` (derived, no amount, no entries sent); its own tables only ever added
    to (`sent`, `payments`, `payment_lines`, `anyway`, `drawers`; a trigger refuses all but the eraser); its operations (`owed`, `lines`,
    `paid`, `day`, `pay`, `refund`, `close`, `send`, `waiting`, `anyway`); prices (`billing.price`, `billing.visit_fee`), Pay first,
    Takes payment here with the float, the waiver reasons; the Cashier and Accountant roles (block ce); the Cashier setup and two that
    tick billing on a clinic or a bench; the clinic's receipt numbers; the day in the clinic's time zone. Screens: Cashier (To pay ·
    Paid today · Nothing to pay, the payment card and the receipt under the row, Give back…), Today (totals, the drawer closed), Prices.
  - **Demo**: billing's seed (the Cashier; GP and the Laboratory bill; the GP's visit fee, five lab prices, the lithium level At the
    order; Mona Saad, cashier; Wael Shawky, accountant, everywhere) and day (Magdy owes, Hoda paid in cash, Waleed's line to price).
    Seeds now run in a listed order (`supabase/config.toml`): billing's after the base's.
  - **Tests**: `billing` (161 checks: declarations; prices and their refusals; charges as they stood, void, a later price, a department
    not billing; payments and every refusal; who owes paged and searched; Pay first and …anyway; refunds any day; only ever added to;
    the desk's scope; lines sent and handed; the drawer; the day; the read log and its merge; stores declared and refused; the row rule; Erase; Nothing
    to pay; an untick; off); `boundary` checks every layer's schema; `demo` counts billing's patients and its Cashier. `npm run
    test:billing` (10 groups).
- 2026-10-08: **core screen hooks for §5.4** (the owner's approved changes (a)–(d); billing itself is built beside it): row actions
  (`registerRowAction`), lines due (`PackRow.lines`), soft checks (`registerSoftCheck`, the "…anyway" card) in `screens/rows.ts`,
  `useRows.tsx` and `RowCards.tsx`, drawn on the desk, the queue and its requests, the base bench and its patient page, Request.tsx,
  Dispensing and Collect (and, awaiting the owner, the word on the chart's order line); `ListRow` takes `extra` (after its own actions
  or who) and `below` (a card under the row); `core.declare_pack(…, charges)` with each department's `declared` in read `me` and
  `chargesHere`; the pharmacy's prices per box and per strip (`pharmacy.product`, `pharmacy.product_check`, Prices on Dispensing, the
  new-product card), its priced lines on Dispensing's rows and the price and total in the fold; the demo's products priced; a pack
  names no other pack (lint and `test:registries`). Seen in the browser with a stand-in pack (not committed): a Back row keeps its
  doctor beside Pay; Collect's waiting tests in their own view, Collect anyway with its reason, the free ones still to collect; the
  bench patient page's waiting card greyed; Dispensing's lines and Prices; the word on the chart's order. Tests: `declares` (new, 15)
  and `stock` 40 (+6: prices, the strip refusals); 30 suites, 1236 checks; `test:board` 22 (+10), `test:pharmacy` 9 (+4), `test:lis`
  11 (+1), `test:registries` 9 (+1); every `test:*` script, typecheck, eslint and the build clean.
- 2026-10-08: **billing wired to the rows** (§5.4; lane-doors merged): billing declares that it charges; its row action (Pay, Send to
  cashier, Sent to cashier) and its soft check (Pay first per order, "…anyway" recorded) on every list of a department that uses it,
  for lines from any department (a test-only Physiotherapy in the tests); `billing.waiting` leaves out what went ahead, answers the
  chart (`anywhere`, words only) and, asked, a department's own open bills per order; the cashier's row no longer says a department
  waits for work gone ahead; `billing.anyway` hints the clinic; Pay first on Billing → Prices (`write:billing.prices`); Dispensing hands
  its rows' lines to the soft check. Demo: Pay first at the Laboratory; the clinic's own choices between packs (the Pharmacy bills and
  takes its own payment; Hamdy's box sent to the cashier). Seen in the browser (`spec/shots/2026-10-08/`): Collect's Waiting for payment,
  a test freed once paid at the Cashier, Pay at the Pharmacy's counter, Send to cashier, the cashier's list with the sent lines and
  "done before payment". Tests: `billing` 183 (+22), `demo` 69 (+7); `test:billing` 14 groups (+4); `test:demo` holds the clinic's
  choices to their own rule (after every pack, before the journey, only ids of packs loaded before them, through the doors).
- 2026-10-08: **billing tonight: fixes from review** (§5.4; none of it a core or base addition beyond (a)–(g)):
  - **A department's own lines given in part** (old audit F38 and its kin): a row hands what each order comes to so far (the pharmacy's
    own table keeps what was given, each dispense apart: `pharmacy.queue.given`), Given today included; billing hands on only the rest
    beyond what it holds of that order (paid lines of kind handed or sent, and to pay here its open bill), by name at the line's own
    price, so a rest given later is charged in addition, a line left unticked stays owed and waits, and a paid service charge never
    stands for the lines; `billing.pay` and `billing.send` lock each order and check the row's `basis` (`total_changed`), and a card
    paying an open bill replaced since is refused.
  - **Void open bills** (old audit F11 for sent lines): a line sent before its order was closed undone or crossed out is owed no more;
    paid, it and a void charge put the patient on the cashier's list with "to give back".
  - **Pay first before the charges have heard an order** (old audit F22): it waits from the moment it is written, where it will be
    charged (`billing.priced_order`); At the order waits until priced and taken.
  - **…anyway** for whoever may do the work (a step or the order's answer there), not whoever reads the list.
  - **Who owes** paged in the order its cursor reads; **the day** shares each payment's discount among its lines and keeps a day's
    waived as it was (a refund's day carries its reversal); the drawer's count sent as read ("1,250"); billing's refusal codes its own.
  - **Core** (within (a) and (c)): the chart's soft check (`useOrderWaits`, list `chart`) and billing's `anywhere` read taken out, as
    beyond the approved places, awaiting the owner; the packs' row data read on hints and changes, never every 15 s; on the bench's
    patient page a pack's form stays open on a waiting order for its stop (`isStop`). The laboratory's Receive draws (a) and (c).
  - **Pay on a row**: View receipt once paid. **Demo**: the pharmacist's Today on the Pharmacy's line (Dispensing, Stock, Today); Hamdy's
    part given as Glucophage, so his Owed row hands the rest beside the open bill.
  - **Tests**: `billing` 237 (+54: given in part, paid and sent, stale counters and the pay–resend race, void bills and money to give
    back, the listener's window, At the order under Pay first, …anyway's gate and a doctor's consult, F31 pinned, paging at one moment,
    a day's totals), `pharmacy` 60 (+9: given so far), `demo` 70 (+1); `test:billing` 19 groups (+5), `test:board` 24 (+2),
    `test:pharmacy` 10 (+1), `test:lis` 12 (+1), `test:registries` 9; 31 suites, 1490 checks. Seen in the browser
    (`spec/shots/2026-10-08/` 6–8): the cashier's list and card; a Pay first row on Collect with Collect anyway…; Hamdy's Owed row
    paying the rest beside his open bill (paid in two, each once; View receipt; the pharmacist's drawer closed from "1,090").
- **Open**: erase and redact remove the storage rows of files, not their bytes, until a Storage API sweep is built.
