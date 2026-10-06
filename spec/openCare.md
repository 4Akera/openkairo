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
 │ BASE    all meaning: 36 types, presence, privacy, checks, derived tables, the review loop,         │
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
  to make its own. **holdings** are insert-only rows with a validity period, held everywhere (department null) or in one department.
  Ending a holding inserts a row into `core.holding_ends`. The clock may step back: a holding dated no later than its grant, and
  every end, count once committed; one dated later is live from the later of the transaction's start and the clock.
- `core.may(user, action, department)` → yes/no. **A null department matches only roles held everywhere.** `core.may_somewhere(user,
  action)` answers "in any department". A pack's actions need the pack in the organization's `packs_used` setting. Retired users and
  machine users hold nothing that opens a private item (§5.3).
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
organization key), the shape and the key's check; every change is an AuditEvent.

### 3.5 Codes
- `core.systems`: declared in the registry: key, kind (`code` | `identifier`), canonical URI, version, labels, `closed`, an optional
  check function, a licence note.
- `core.codes (system, code, labels per language, parent, props jsonb, retired_at, replaced_by)`. `props` holds per-system extras (a
  LOINC code's canonical UCUM unit and allowed units, an ATC level, an EDA product's strength and form). Codes are plain data loaded by
  the base, packs and import scripts. Maps between systems come later as `code_maps`, applied only when reading.
- **Entries store system keys, never URIs.** URIs are resolved at export (`{canon}` is one row of `core.canon`).

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
select core.declare_table   (key => 'base.lists', layer => 'base', refresh => 'base.lists_refresh(uuid,uuid[])', action => 'read:record');
select core.declare_rule    (key => 'base.private', layer => 'base', hidden => 'base.private_hidden(uuid,uuid[])');
select core.declare_action  (key => 'write:note', layer => 'base', scope => 'department', labels => '{…}');
select core.declare_setting (key => 'department.private', layer => 'base', owner => 'department', shape => '{…}', check_fn => null, many => false);
select core.declare_screen  (key => 'pharmacy.dispensing', layer => 'pharmacy', work => 'bench', labels => '{…}',
                             action => 'read:pharmacy.queue',  -- what a user needs in the department to see its tab; null: anyone working there
                             replaces => array['base.bench']); -- a pack screen: the base screens of its work it stands in for
select core.declare_listener(layer => 'pharmacy', types => array['medication','order'], refresh => 'pharmacy.queue_refresh(uuid,uuid[])');
select core.declare_pack    (key => 'pharmacy', version => 1, requires => '{}', labels => '{…}');
select core.declare_role    (id, key, layer, actions, labels);   -- a built-in role (read-only to organizations)
```

**Enforced when something is declared**
- Functions are stored as `regprocedure` OIDs with `md5(prosrc)` beside them. Each must be owned by the layer's role, be SECURITY
  DEFINER with `search_path=''`, and live in the layer's schema. Checks, lines, claims, rules and to_fhir must be STABLE (Postgres then
  refuses writes inside them); refreshes must be VOLATILE.
- Keys must sit inside the layer's prefix: pharmacy cannot declare `note` or `obgyn.x`. `requires` may not form a loop.
- A screen's action is the core's, the base's or its own layer's (`unknown_action`); what it replaces are base screens of its work
  (`unknown_screen`).
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
5. **Generic checks**, which always refuse: the type exists and is on (its pack used here); the shape; `may(user, 'write:<type>',
   the entry's department)`; the department and visit belong to the organization; one patient family per set unless the type declares
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
   refresh inline inside a savepoint; an error marks (pack, patient) stale and never refuses. A pack listening to another layer's
   types gets an outbox row, drained after commit by a pg_cron job every 5 seconds, with the same refresh. The job is a lone
   `call core.drain_outbox()`: a command of two statements runs as one transaction block, where the procedure's commit per batch is
   refused. Each drained batch sends the same content-free hints as a write, so a pack's worklist catches up without polling.
   Settings → Packs shows "N patients to refresh".
10. Sends a realtime hint with no content (`record:<patient>`, `organization:<id>`), and returns `{set_id, outcome, entries: [{id, item,
   item_version}], findings}`. It never returns rows, so a refusal cannot leak private data.

Outcomes: `landed` · `refused` · `warn` · `busy`. Generic refusal codes: `not_signed_in`, `choose_user`, `nested_write`,
`set_changed`, `unknown_type`, `pack_off`, `bad_shape`, `not_allowed`, `wrong_organization`, `wrong_patient`, `two_patients`,
`not_found`, `already_replaced`, `wrong_resource`, `unknown_system`, `changed_since_opened`, `empty_set`.

### 3.10 The reader: `public.read(query)` (the only way out)
- One VOLATILE function. It logs in the same transaction; if the log insert fails, the read fails. The log (`core.read_log`) keeps one
  row per (user, patient, purpose) per 10 minutes: organization, user, department, patient, purpose, what (items or the query), the
  withheld count, time. `purpose` is a registered key: TREAT (default), ETREAT, PATADMIN, HOPERAT, HRESCH, PATRQT, BTG; free text is
  only added to it.
- Read shapes (`query.shape`):

| shape | returns | needs |
|---|---|---|
| `me` | the login's users, the chosen user, the organization, departments (each with the packs it uses and its Screens line: the one set, else its work's screens of the base and of the packs it uses, the base's first, without a base screen one of those stands in for), sites, places, users, roles, actions, current settings, the registry the client needs (every screen with its action and what it replaces), stale counts | a live user |
| `patients` | search hits: identity and open visits | `read:patients` somewhere |
| `patient` | one patient's identity (the banner) | `read:patients` somewhere |
| `record` | banner, lists, visits, a page of entries (filters: types, visits, departments, before), key values, hidden counts | `read:record` in the department |
| `item` | every version of an item and the entries that refer to it | `read:record` in the department |
| `table` | rows of one derived table with a fixed filter, plus their source entries and patients | the table's declared action in the department |
| `file` | a storage path for one attachment | the entry is visible |
| `fhir` | an R4 Bundle (`bundle`) or International Patient Summary (`ips`) for a patient | `read:record` and `export:fhir` |
| `log` | the read log, opened-anyway and privacy changes | `read:log` |
| `audit` | settings and admin changes | `manage:settings` |

- It collects the source entry ids of every row and calls each visibility rule once as `rule(reader, ids[]) → hidden ids[]`. Rules only
  hide and combine with OR over hidden (AND over visible); a rule that raises means hidden, and is logged. Base rules apply to every
  type, a pack's only to its own types. Types that may never be private skip every rule. Only the base's `opened_anyway` grants
  anything.
- A hidden entry becomes a placeholder: "Private note · Psychiatry · 3 Sep", with no data, no author and no findings. Derived rows that
  came from it are masked too (a private result's values vanish from trends and counts).
- FHIR mappings take the reader's rows as input, never `entries`. No `service_role` is used for a patient read.

### 3.11 The two exceptions (owned by `core_eraser`; the permanence trigger allows only `current_user = core_eraser`)
- **Erase** (the law): removes the merged family from entries, every registered table (base and packs), patient stores and storage,
  then refreshes what it touched. The log (`core.erasures`) keeps only the fact: who, when, reason, row count. Only a user holding
  `erase:patient` everywhere, with a second factor, never pack or machine users; the writer never calls it.
- **Redact** (a misfiled entry): blanks `data` and `codes` on the whole item and keeps tombstones (id, type, patient, set, times); logs
  `core.redactions (entry, by, at, reason)` without quoting the content; refused while other entries refer to it unless they are
  redacted too; then refreshes and removes files. The copy on the right patient is a new `import` entry, linked only in the redaction
  log. Shows as "Removed · misfiled · date"; FHIR shows `entered-in-error`.

### 3.12 The other doors (public, SECURITY DEFINER, each checks `may`)
`my_users` (the live users of this login, one per organization, to choose from), `choose_user`, `create_organization` (a login with no user makes the first organization and becomes its owner), `save(what, row)` and
`remove(what, id)` for `organization` · `site` · `department` · `place` · `user` · `role` (remove only what nothing ever used;
anything used is refused `in_use` and retired instead), `save_patient` (register or change identity), `merge_patients`,
`write_setting`, `erase_patient`, `redact`. Every change is a row in `core.audit` (an AuditEvent).

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
| `reviewed` | the requester saw an answer (`about` → result or step) | Task (review), completed | — |
| `alert` | a standing warning (DNR, isolation for HBV or HCV, fall risk, other) · concept, status (active · inactive), period; ended by an inactive version that `changes` it, once; never names HIV (`names_hiv`) | Flag | local (`local.alert`: dnr, isolation_hbv, isolation_hcv, fall_risk…) |
| `pregnancy` | pregnant or not, a base fact (§5.1 rule 3) · status (current · ended), pregnant, LMP (partial date) or weeks (0–45), reason (why it ended), note; ended by a version that `changes` it, once | Observation 82810-3 (LA15173-0 Pregnant · LA26683-5 Not pregnant; LMP 8665-2 or 49051-6 weeks as a component; ended: effectivePeriod) | LOINC |
| `breastfeeding` | breastfeeding or not, a base fact · status (current · ended), breastfeeding, note | Observation 63895-7, valueBoolean | LOINC |
| `died` | death · time with precision, cause | Patient.deceasedDateTime | WHO ICD-10 |
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
| `done` | the clinician's Done; `wait` (default the department's `patients_wait`) keeps the visit open while orders are out | finished; period.end |
| `admitted` | starts a stay item (`about` the visit it came from), department of work `stays`, optional place; admit source required | class IMP; admitSource |
| `moved` | the stay moves to another place | location[] |
| `discharged` | ends the stay; disposition required | finished; dischargeDisposition |

`base.presence` holds one row per open or recent visit/stay: patient, department, place, state (`waiting` · `called` · `with` · `pending`
· `back` · `done` · `left` · `in_bed`, and for stays `admitted` · `discharged`), here, away since, urgent, assigned, called count and
missed calls, seen at, times. Time-based states are worked out when reading, never by a timer that writes: away for more than 30
minutes shows as not here; a visit with no move for 12 hours shows as left on screens; an opened anyway lasts 12 hours.

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
- Settings keys: `organization.time_zone` and `organization.packs_used` (declared by the core), `organization.record_view` (visits ·
  entries), `department.private`, `department.encounter_class`, `department.after_done` (next · queue), `department.patients_wait`,
  `department.review_results`, `department.works_for` (a bench: department ids, or all), `department.checks_in_for` (a desk: the
  clinics it checks in for, or all), `department.packs` (the packs used here, §5.1 rule 1: each a known pack, on for the clinic, once:
  `unknown_pack`, `pack_off`, `duplicate`), `department.screens` (the Screens line: its tabs in order and which opens first; each
  screen declared, the base's or of a pack this department uses, of its work, once, never beside a base screen one of them replaces,
  and opens on the line: `unknown_screen`, `pack_off`, `pack_not_used`, `wrong_work`, `replaced`, `duplicate`, `opens_off_line`), `service` (owner = the performing department: code, name, section, LOINC coding,
  answer type, steps (in order; keys such as `collected`, `received`), fields with LOINC, UCUM units, ranges by sex and age, critical
  ranges, choices), `preset` (name, shortcut, lines, services, department or all), `place.closed`.
- Actions: `write:<type>` for every type; `read:patients`, `read:record`, `read:queue`, `read:bench`, `read:review`, `read:log`,
  `export:fhir`, `manage:patients`, `manage:settings`, `manage:users`, `manage:roles`, `manage:places`, `erase:patient`.
- Built-in roles (fixed ids): Owner `…c001` (every action, held everywhere), Doctor `…c002`, Nurse `…c003`, Reception `…c004`, Lab
  technician `…c005`. A pack may ship its own (Pharmacist `…ca01`).
- Default screens: front desk (`base.desk`, work `desk`, tab for `read:patients`), queue (`base.queue`, `visits`, `read:queue`), bench
  (`base.bench`, `bench`, `read:bench`), bed board (`base.beds`, `stays`, `read:queue`); then the patient's chart, composer,
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
    opens the rest as a second line in the banner and folds it again (Fewer). No vitals: the Summary shows them with their trend. Actions: a clinic visit of mine in consult, **Done** (Sign N · Done → next, ⌘↵) and **More**, whose
    choices (goes home / waits, → next or back to the queue, Not here, Return to waiting) open in a strip under the banner, never a menu
    over the record; a stay, **Sign** (into the stay, no move) and **Discharge** (inline chooser); otherwise "with Dr. X — theirs to
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
callouts, sections, tabs, rows, the banner, the split frame, KV, the analyte table, steps, stat, sparkline and line chart, and a
department's frame (`ui/frame.tsx`: `ScreenTabs`, `ScreenFrame` with its one toolbar, `NotForRole`, a line inside a list at `sm`;
`Empty` for nothing here). **The rule**
`opencare/tokens-only` (ESLint) refuses raw palette classes, literal colours, off-scale sizes and `dark:` anywhere outside the kit;
colour marks state, never type, and never alone (a glyph or a word goes with it). **`/design`** shows every token with its live
contrast (all pairs AA in both themes), every component and state, the record's blocks and the charts; it is the one reference a
pack builds against.

### 4.7 The composer
The composer turns typed lines into one set. `/v 120/80 88` becomes `vitals` with codings by stable key; `/dx` a `problem`; `/rx` a
`medication`; `/al` an `allergy`; `/nka` a `list_review`; `/order cbc, hba1c` two `order`s; `/preg 12w` (or `lmp 2026-08-01`, `no`,
`end delivered`) a `pregnancy`, `/bf` (`no`, `end`) a `breastfeeding` and `/alert dnr · hbv · hcv · fall · <words>` (`end dnr`) an
`alert`, each with its card, changing or ending the fact that stands (an alert never names HIV); a plain line a `note`; `!` a `private`
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
- **Off** (not in `organization.packs_used`): its types refuse new entries except corrections and cross-outs, and its visibility
  rules keep applying. **On again**: its tables are refreshed for the organization before its screens show. There is no removal while
  its entries exist.
- A pack screen may look nothing like the base's and may replace a department's default screen (declared with `replaces`, registered
  with `registerScreen`), but it calls the same actions. It is
  built from the kit (`@core/ui`) and the tokens only (`opencare/tokens-only`, §4.6 Design system), so it reads natively in both
  themes; a record block of its own type goes through `registerRenderer(type, { Block })`, drawn inside the chart's shell. A colour
  the tokens lack is asked for in core, never invented in the pack.
- **No new packs until the owner says so.** Pharmacy is the one pack, ported as the proof.

### 5.1 How a pack shows up (decided with the owner, one rule at a time, from 2026-10-04)
- **Rule 1 · on per department.** Two switches: the clinic turns a pack on (`organization.packs_used`), then each department ticks
  the packs it uses, from those (Settings → Departments → *Packs used here*; a starter setup ticks its own). One tick brings
  everything together: the pack's tabs on the department's Screens line, its chart section (rule 2), its composer commands, its
  banner words and its marks on the department's lists. Where a pack is not ticked, its commands are not offered; the composer says
  where they work ("/anc is used in: ObGyn clinic"). Unticking hides these there and keeps every entry; a patient's section still
  shows by rule 2 when they have its data. A pack off for the clinic cannot be ticked anywhere.
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
  actions (call, start, done) itself.
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
  licence.
- **Rule 8 · a score is worked out once.** Each score (NEWS2, SOFA, APACHE II, Aldrete, GCS, PHQ-9, EPDS…) is a declared points
  table with a version and its source, and the server is the only place that adds it up: a card asks the server while the user
  types, and the record, the board tile and the review list all show that one result. An entry keeps the version it used ("NEWS2 6,
  2017"); a new version applies to new entries only, and nothing is recomputed. Settings → Scores shows every table read-only, with
  its version, its source and the clinician who signed it off for this clinic.
- **Rule 9 · each pack brings its own demo.** Its own 2–3 patients for its main path, with real-sounding, unique names and believable
  values; a demo login for each role it declares, on the sign-in page grouped by department, so every screen is checked as the person
  who uses it (never as Admin). Times are relative to the moment the demo loads ("arrived 40 min ago", "admitted 2 days ago"); one
  command reloads it. No pack writes on another pack's patients, except one shared journey patient (GP → ER → ward → ICU → ward →
  home, follow-up booked) whose steps the packs add in order. The demo passes the packs' fit tests (rule 2): no adult values on a
  baby.
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
- **Roles.** Each specialty has its own role, declared by its pack and **built on a base role**: an Obstetrician holds everything a
  Doctor holds plus ObGyn's actions, an Anaesthetist is Doctor plus anaesthesia, a Midwife is her own role built on Nurse plus births;
  whatever the base role gains later, the specialist gains too. A pack marks some actions *everyday* (`/anc`): in a department that
  ticks the pack, its ordinary Doctors and Nurses hold those, and only those. A pack's actions count only in departments that tick it
  (rule 1). Jobs that are neither doctor nor nurse have their own plain roles (radiographer, cashier, store keeper, social worker).
  Actions are added one at a time, never by replacing a whole list.
- **Export.** A pack's FHIR adds beside its base type's mapping, never replaces it; the result is valid R4 (one value per choice
  element); a mapping that fails fails the tests.
- **Off.** With a pack off for the clinic, its entries stay on every chart, read-only; only new entries of its types stop (corrections
  and cross-outs still land), its actions stop, and its tables are not rebuilt. Turned on again, it catches up in the background and
  shows its progress.
- **Setup and guards.** A starter setup ticks the department's packs and adds what is missing (places, services, presets, settings);
  on an existing department it never overwrites what staff changed and shows the difference instead. A pack declares only inside its
  prefix: types, settings, actions, roles, code systems, demo ids. A table that reads age or sex says so, and only those are
  refreshed when identity changes. Nothing fails silently: a pack's failed background work shows in Settings → Packs with Retry.
- **Reference data.** Licensed lists come in by import script (rule 7); the demo loads a small sample of each, labelled "demo sample,
  not the full list".
- **What the base adds for §5.1** (built 2026-10-06: a department's packs used here; the frame, toolbar and tab row with the action
  each tab needs; the fit test, chip words and Summary lines; banner words with their rank; the pregnant and breastfeeding facts;
  the rest not yet): a department's packs used here; the fit test; chip words and Summary lines;
  banner words with their rank; the board tile line and buttons; the frame, toolbar and tab row with the action each tab needs;
  setting shapes with labels and units, and the form drawn from them; score tables and a read that scores while typing; the demo loader
  with relative times, logins per role and ids per pack; the pregnant and breastfeeding facts. The core client stops naming pharmacy
  (eight places today); pharmacy goes behind the same registries every pack uses.

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
   `{item}-{key}`; a resource that is one per entry (MedicationRequest) uses the entry id. Any other derived id is uuid v5(item, key).
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
8. **Pack contract**: one suite for every pack (prefix, grants, refresh = rebuild, canary on its types, off and on).

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
- **Open**: erase and redact remove the storage rows of files, not their bytes, until a Storage API sweep is built.
