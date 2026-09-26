> **Note (2026-09-22):** this appendix is the design panel's output and predates the spec 02 amendments: after-write reactions run through `pack_calls` and a runner after the commit; packs live in their own schema owned by a `security definer`-only role; `require_access` takes a department; composite tenant keys cover `author_id`, `responsible_id`, `department_id`, `assignee_id`, `actor_id`; `held` is a core step; the record carries no money. The exact list is in [02-organization.spec01-changes.md](02-organization.spec01-changes.md). Where the two differ, [01-record.md](01-record.md) wins.

# openCare: record spine (final)

## a. The spine in one sentence

**The record is a list of entries, each written once and never changed; the only thing that can ever happen to an entry is that a newer entry replaces it.**

What follows from it:
- A **request** is an entry with a destination. It also has a row in `requests`, which holds where the request stands now.
- A **reply** is an entry that answers a request, marked by `reply_to_id`. Replies cannot be replied to.
- Every other table is one of four kinds: request state, a list rebuilt from the entries, settings, or state outside the record.

Seven rules keep it simple. The first five are new, and rules 1–4 came from the break-tests.
1. **The columns are closed.**
   - A new fact is an optional `data` key.
   - A new question is a derived table.
   - New mutable state is an outside table.
   - No "nullable column later" is planned.
2. **The record is a closed unit per patient.**
   - No pointer in a record table crosses patients.
   - Export, erase, split, merge, research extract and any future hash chain are one operation: everything where `patient_id` is in the record.
3. **One pattern for "newer replaces older", always depth 1.** The pointers are `entries.replaced_by_id`, `patients.merged_into_id` and `codes.replaced_by_code`. Nothing is rewritten, and reads follow the pointer.
4. **Updaters only apply.** There is no un-apply. A correction replays that one list for that one patient, through the same code as rebuild.
5. **Anything that needs someone's eyes is a request.** One review loop serves results, declines, withdrawn results, co-signatures, unsolicited outside results, patient messages and home readings.
6. **A repeated act is a non-final reply.** One rule covers ward doses, partial dispenses, refills, preliminary cultures and home monitoring.
7. **A wrong clock, a wrong unit or a switched-off pack never blocks a clinical write.**

## b. Listing

### Table kinds

| Kind | Tables | Rule |
|---|---|---|
| **The record** | `entries`, `entry_files`, `request_steps` | Insert-only. Rows leave only through `erase_patient`, a whole patient at once. |
| **Request state** | `requests` | The row is inserted with its entry and never deleted. Only `change_request` updates it, and every change is a `request_steps` row. Rebuild folds the steps and never deletes the row. |
| **Derived** | `entry_values`, `patient_medications`, `patient_problems`, `patient_allergies`, `patient_list_reviews`, pack tables `<pack>_*` | Can be deleted and rebuilt. Written only by `write_entry` and `rebuild_record`. Every row carries `patient_id`, the surviving patient. |
| **Settings** | `entry_types`, `organization_packs`, `departments`, `services`, `service_fields`, `codes`, `flowsheets`, `templates` | Every table has `retired_at`. Rows are never deleted, and rebuild never reads them. |
| **Outside the record** | `patients`, `visits`, `drafts`, `users`, money, read-audit, `erasures`, portal releases, raw machine streams | Ordinary mutable tables. They hold entry ids with no cascading foreign key. |

### entries (21 columns, closed)

```
-- who / where
id                 uuid pk        UUIDv7 minted by the client when the form opens; also the idempotency key
organization_id    uuid           copied from the patient row; permanent; never a parameter
patient_id         uuid           exactly one patient; never rewritten, even on merge
visit_id           uuid null      set only when the visit belongs to this patient_id
author_id          uuid           who wrote it; every author is a users row (staff, patient, proxy, machine, importer)
responsible_id     uuid null      on whose authority it was written; NULL = the author   (new)
department_id      uuid null      the department it was written in; NULL only for source patient | import   (was from_department_id)
source             entry_source   staff | patient | machine | outside | import   (device → machine; covers algorithms)
source_key         text null      '<machine>:<message>:<position in message>' or '<batch>:<row>'   (was source_ref)

-- when
occurred_at        timestamptz    clinical time; write_entry sets it to recorded_at − age; absolute only when picked by hand
recorded_at        timestamptz    greatest(clock_timestamp(), this record's last recorded_at + 1 µs); never a parameter

-- what
type               text fk        entry_types.key
service_id         uuid null      the service requested or performed
data               jsonb          the content; self-contained
display_line       text           the one line this entry prints; written once; 'Corrected: …' when it replaces a final entry
flag               value_flag null  the entry's own worst value; immutable

-- links to other entries (same patient, always)
reply_to_id        uuid null fk → requests.entry_id
is_final           bool not null default true    false = preliminary: not yet confirmed by the person responsible (any entry, not only replies)
replaces_id        uuid null fk → entries.id
written_with_id    uuid null fk → entries.id     first entry of the set written by one write_set call; every member carries it   (was signed_with_id)

-- the only column ever updated (NULL → value, once)
replaced_by_id     uuid null fk → entries.id
```

Indexes are all btree:
- `entries_timeline (patient_id, occurred_at desc, id desc) WHERE reply_to_id IS NULL AND replaced_by_id IS NULL AND type <> 'entered_in_error'`
- `entries_by_patient (patient_id, recorded_at, id)`
- `entries_replies (reply_to_id) WHERE reply_to_id IS NOT NULL`
- `entries_replaces UNIQUE (replaces_id) WHERE replaces_id IS NOT NULL`
- `entries_written_with (written_with_id) WHERE written_with_id IS NOT NULL`
- `entries_source_key UNIQUE (organization_id, source, source_key) WHERE source_key IS NOT NULL`

CHECKs:
- `department_id IS NOT NULL OR source IN ('patient','import')`
- `occurred_at <= recorded_at + interval '5 minutes'`
  - This is a backstop that honest input never reaches.
  - Integrations clamp a future machine time to `recorded_at` and keep the stated time in `data`.

**Self-contained rule.** `write_entry` copies into `data` everything the entry used from settings:
- the service name and code;
- `author_name`, `responsible_name`, `department_name` and `to_department_name`;
- per value, `{code, name, value_number, value_text, unit, reference_low/high, critical_low/high, flag}`;
- on prescriptions, the drug name, strength and form.

Two further rules belong to it:
- Flags are computed once and never recomputed.
- When `source` is `outside`, `import` or `machine`, the caller's unit, ranges and flag are kept as given. A missing flag stays NULL.

Conventions inside `data`:
- **Free text and names.** These are enforced on golden fixtures.
  - Human-typed text lives only in keys named `text` or ending `_text`.
  - People's names live only in keys ending `_name`.
  - Every other string is a code, a choice or a date.
- **Values.**
  - They live at `data.values[]`.
  - A value may carry its own `occurred_at`, which defaults to the entry's.
  - `"<0.01"` is stored as `value_number 0.01` plus `value_text '<0.01'`.
- **Units.**
  - There is one unit per code, and a different unit is a different code.
  - A value whose unit does not match its code stays in `data` and is shown.
  - Such a value is not extracted into `entry_values`, and the write is never refused.
- **Not done.** An act not done is a reply with `data.not_done` and a reason.
- **Vague dates.** They go in `data.occurred_on` as a partial ISO date such as `'1998'` or `'2019-03'`. The renderer prefers it.
- **Problems.** Links to problems go in `data.problems[] = [{id, code, name}]`, where `id` is the problem-list row id.
- **Outside and import.** These also carry `data.stated_author_name` and `data.stated_recorded_at`.
- **Machine-drafted content** carries `data.drafted_with`.

### requests: where a request stands now

```
entry_id            uuid pk fk → entries
organization_id · from_department_id     immutable copies
patient_id          the surviving patient (rebuild re-keys it on merge)
requester_id        coalesce(responsible_id, author_id): who the reply goes back to   (was author_id)
to_department_id    services.department_id; when that is NULL the requester chooses
assignee_id         uuid null
priority            request_priority   stat | urgent | routine
due_at              timestamptz not null   default = request time; 'infinity' = as needed (PRN); rolled forward by repeated acts
step                request_step     the latest step
status              request_status   GENERATED from step: done → done, cancelled → cancelled, anything else → open
status_reason       text null        'sample haemolysed', 'result withdrawn: wrong patient', 'stopped: rash'
reply_line · reply_flag · replied_at     from live replies: latest display_line, worst flag, latest occurred_at   (replied_at replaces updated_at)
review_needed_at    timestamptz null   NULL = nothing for the requester to look at; otherwise since when   (replaces reviewed_at)
```

- **Partial** is derived as `status = 'open' AND reply_line IS NOT NULL`.
- The priority and due date as originally asked stay in `entries.data`.
- **What sets `review_needed_at`:**
  - a reply that needs review, which by default means `is_final OR flag > 'normal'`;
  - a corrected or struck reply;
  - a department decline.
- **What does not set it.** `write_dispense` and `write_administration` pass `needs_review = false`, unless the dose is substituted, refused or held. So a routine dispense or ward dose never sets it.
- **Clearing it.** `mark_reviewed` clears it. The time of the review lives in `request_steps`.

Indexes:
- `requests_queue (to_department_id, priority, due_at) WHERE status = 'open'`
- `requests_by_patient (patient_id) WHERE status = 'open' OR review_needed_at IS NOT NULL`
- `requests_replied (patient_id, replied_at desc) WHERE replied_at IS NOT NULL`
- `requests_to_review (requester_id, review_needed_at) WHERE review_needed_at IS NOT NULL`

### request_steps

```
request_id fk → entries(id) · position smallint · step · actor_id · reason · changes jsonb · occurred_at · recorded_at      pk (request_id, position)
```

- **Order.** Order and "latest" are by `position`.
- **Times.** `occurred_at` defaults to `recorded_at` and may be backdated, such as a 07:10 collection scanned at 07:40. It falls under the same CHECK as entries.
- **The `sent` row** records the whole starting state in `changes`: `{to_department_id, priority, due_at, assignee_id}`. `requests` is therefore a pure fold of its steps plus its live replies.
- **Routing and review rows** repeat the current step.
  - `changes` carries what moved, such as `{assignee_id}`, `{to_department_id}`, `{priority}`, `{due_at}` or `{reviewed: true}`.
  - Pack data such as `{specimen_no}` also goes in `changes`.

### entry_values

```
entry_id · position · organization_id · patient_id · code · value_number · value_text · unit · flag · source · occurred_at      pk (entry_id, position)
```

- There is one index: `entry_values_trend (patient_id, code, occurred_at desc)`.
- Rows exist only while their entry is live.

### entry_files

```
entry_id · position · path · url · mime null · name      CHECK exactly one of path / url
```

- **Path.** `path = <organization_id>/<entry_id>/<position>`.
- **Bucket.**
  - No client role may update or delete objects in it.
  - A job sweeps objects with no `entry_files` row after 7 days.
  - The bucket is copied off-site on the database backup schedule.
- **Signed payloads.** Anything signed is stored as a file and never re-serialised from `data`.

### Patient lists

- **Tables.** The lists are `patient_medications`, `patient_problems` and `patient_allergies`.
- **Row ids.**
  - A list row's id is the root of the first-stating entry's replacement chain.
  - A correction keeps the row id, and its replay position is that of the first version.
- **Updaters.**
  - `entry_types.list` names the derived table a type keeps, and its updater is `update_<list>(entry)`.
  - An updater is a pure function of the entry and the existing rows. It does not call `now()`, read settings or raise.
  - Anything time-dependent, such as "expired", is computed by the read function.
- **Replay on replacement.** Replacing an entry that keeps a list replays that list for that patient. This is tens of rows and already runs under the lock.
- **Superseding prescriptions.** A prescription that supersedes or stops another does both of these in one transaction:
  - it closes the old list row;
  - it closes the old entry's open requests, with step `done` and a reason.
- **`patient_list_reviews (patient_id, list, reviewed_at, reviewed_by_id)`** has no `state` column. The state is derived:
  - No row means "not asked".
  - A row with no active list rows means "none known, reviewed 12 Mar".
  - A row with active rows means the list plus the date.
- `write_list_review` refuses "none known" while active rows exist.

### drafts

```
entry_id pk · author_id · responsible_id null · patient_id · visit_id null · type · service_id · reply_to_id · data · updated_at
```

- Committing a draft is a column-for-column copy.
- Machine output meant for one clinician stays here until that clinician commits it.

### Settings

- **`entry_types (key, name, pack, list null, retired_at)`**
  - Keys are lower_snake nouns and are never renamed or reused.
  - A retired type, or a type whose pack is off, accepts only entries carrying `replaces_id`.
- **`organization_packs (organization_id, pack, retired_at)`**
- **`departments (…, site text null, is_outside, contact, retired_at)`**
  - Sites are labels, never organizations.
  - Outside rows are created on first use and hidden from internal pickers.
  - Retiring a department is refused while it has open requests.
  - Retiring a department retires its services in the same call.
- **`services (id, organization_id, department_id null, section, code, name, result_type, retired_at)`**
  - A NULL `department_id` means the requester chooses the destination. Pharmacies, referrals and multi-site labs use this.
  - `write_request` refuses a retired service.
  - Applying a template skips retired services and says so.
- **`service_fields (service_id, position, code, name, kind, unit, choices, reference_low/high, critical_low/high, retired_at)`**
- **`codes (code pk, name, kind, unit, replaced_by_code null, organization_id null, retired_at)`**
  - Local codes are minted as `local:<short uuid>` and never typed by hand.
  - `unit` and `kind` are set once.
  - `replaced_by_code` is depth 1 and requires the same unit.
  - `read_values` and flowsheets expand a code to itself plus the codes that point at it.
- **`flowsheets`** and **`templates`** are as in v3.

### Outside the record

- **`patients.merged_into_id`** is depth 1.
- **`visits.request_id`** points at the request a visit came from.
  - The client offers "this note answers the consult".
  - `reply_to_id` is never inferred from the visit.
- **`erasures (patient_id, reason, actor_id, erased_at)`** records each erase.

### Enums

- `entry_source`
- `request_status`
- `request_priority`
- `request_step`
  - Core values are `sent, started, replied, done, cancelled, reopened`.
  - Packs add values by migration, one `ADD VALUE` per file.
- `value_flag`: `normal, low, high, abnormal, critical`. NULL means not assessed.

### Core entry types

- The core types are `request`, `result`, `prescription`, `note`, `vitals`, `problem`, `allergy`, `list_review` and `entered_in_error`.
- `record_merged` is added later, when merge is built.

### Functions

- **write_**
  - A public `write_<type key>` function exists per type. It only validates and shapes `data`, after `require_access` and `require_pack`.
  - Every one ends in the private `write_entry`, which runs these steps in order:
    1. Resolve the surviving patient.
    2. Take the lock.
    3. Insert the entry.
    4. Set `replaced_by_id` on the entry it replaces.
    5. Extract the values.
    6. Apply the updater, or replay the list.
    7. Call `change_request`, at most once per request, and last.
    8. Send the signal.
  - If the insert made no row, `write_entry` returns at once. It looks the stored row up in this order:
    1. By id. It returns the stored row, or raises `id_in_use`.
    2. By `source_key`. It returns the stored row.
    3. By `replaces_id`. It raises `already_replaced`.
  - `write_set(items)` writes one patient's signed set in one transaction.
  - `write_entered_in_error(entry_id, reason)` is a strike.
- **mark_**
  - `mark_step(request_id, from_step, step, reason, occurred_at)` is compare-and-set on `from_step`.
  - `mark_routing(request_id, assignee_id, to_department_id, priority, due_at, reason)` changes who, where, how urgent or when.
  - `mark_reviewed(request_id)` clears `review_needed_at`.
  - All three end in the private `change_request`.
  - Packs ship their own mark functions, for example `lab_mark_collected(request_ids[], specimen_no, occurred_at)`.
- **read_**
  - Every read function is `STABLE`.
  - `read_record(patient_id)`.
  - `read_entries(patient_id, before_at, before_id, types[])`.
  - `read_entry(entry_id)`.
  - `read_queue(department_id, is_upcoming)`.
    - By default it returns requests due by the end of today, plus `infinity` items, which sort last.
  - `read_values(patient_id, codes[])`.
  - `read_to_review()`.
- **Gates**
  - `require_access(organization_id, action, patient_id)` has no defaults. The organization is resolved from the row being touched.
  - `require_pack(organization_id, pack)`.
- **Maintenance**
  - `rebuild_record(patient_id)` returns the rows changed per table.
  - The rebuild loop logs patients with a non-zero count, for clinical review.
  - The private `erase_patient(patient_id, reason)` is the only delete path.
- **Realtime**
  - Signals go to `record:<surviving patient>`, `queue:<to_department>` and `queue:<from_department>`. A reroute also signals the old department.
  - The payload is `{entry_id}` only.
  - The client debounces with 0–300 ms of jitter, and refetches on reconnect and on window focus.
  - Imports send no signal.

## c. Invariants

### Enforced by the database

1. **Permanence.** `entries`, `request_steps` and `entry_files` reject UPDATE, DELETE and TRUNCATE.
   - The only exception for UPDATE is `entries.replaced_by_id` going from NULL to a value.
   - The only exception for DELETE is inside `erase_patient`, which sets a transaction-local setting that the trigger checks.
2. **Versions are a line.** `UNIQUE (replaces_id)` means two concurrent corrections cannot both succeed.
3. **What a replacement inherits.**
   - It inherits `patient_id` and `reply_to_id` from the entry it replaces.
   - It keeps the same `type`, unless its type is `entered_in_error`.
   - `is_final` may differ: a final report replaces a preliminary one.
4. **Replies.** `reply_to_id` references `requests`, so reply depth is 1. A reply inherits its `patient_id` from the request.
5. **The closed record.** `reply_to_id`, `replaces_id` and `written_with_id` always point inside the same patient, and `write_entry` checks this.
6. **Composite tenant foreign keys:**
   - entries `(organization_id, patient_id)` → patients
   - entries `(organization_id, service_id)` → services
   - entries `(patient_id, visit_id)` → visits
   - requests `(organization_id, to_department_id)` → departments
7. **Permanent organization.** `organization_id` is permanent on every record row, and a patient never changes organization.
8. **Idempotency.** The idempotency keys are the id and `(organization_id, source, source_key)`. A retry or a re-sent message returns the stored row and touches nothing else.
9. **Lock and clock.**
   - `write_entry` and `change_request` first take `pg_advisory_xact_lock` on `coalesce(merged_into_id, patient_id)`.
   - `recorded_at` is forced strictly increasing per record, so it survives a clock that steps back.
10. **Clinical time.** `occurred_at <= recorded_at + 5 minutes`. Future clinical time belongs in `due_at`.
11. **Status.** `requests.status` is a generated column of `step`, so it cannot disagree. Pack steps never close a request.
12. **One `change_request` per write.** It runs once per request per write, computed from the end state:
    - If the latest live final reply is an ordinary reply, the step is `done`. If that reply is `not_done`, the step is `cancelled`.
    - If only preliminary replies remain, the step is `replied`. A closed request stays closed in this case.
    - If no live reply is left, the step is `reopened`, with `status_reason`.

    Three further rules apply:
    - A reply to a closed request is never refused.
    - A request that still has live replies cannot be struck.
    - A request entry that is itself replaced is cancelled.
13. **Replacement cleanup** runs in the same transaction:
    - The old `entry_values` rows are deleted.
    - The affected list is replayed.
    - The reply columns are recomputed.
    - `review_needed_at` is set.
14. **Access.**
    - Clinical tables have no grants to `authenticated`.
    - Every public function is `security definer set search_path = ''` and starts with `require_access(…)`.
    - The RLS backstop is one membership InitPlan.
15. **Small foreign keys and checks.**
    - `entries.type` → `entry_types` is `ON DELETE RESTRICT`, and closed vocabularies are enums.
    - `codes.unit` and `codes.kind` have no UPDATE grant.
    - `entry_files` has its `path` / `url` CHECK.
    - `merged_into_id` and `replaced_by_code` targets must themselves be unreplaced.

### Enforced by CI tests

16. Data shapes only grow. A breaking shape is a new type key, and golden fixtures are kept forever.
17. `rebuild_record` over fixture patients must equal the live derived rows and the live `requests` rows.
18. Scramble every settings row, rebuild, and expect zero differences.
19. Send every fixture write twice, and expect zero differences.
20. Every fixture entry renders with all packs off.
21. **Cross-organization test.**
    - A member of organization B calls every public function with organization A's fixture ids.
    - Every such call must raise.
22. Fixture `data` obeys the `text` / `*_text` / `*_name` key rule.
23. Correction fixtures: a prescription corrected after it was stopped, a reviewed result struck, and a final replacing a preliminary.

## d. Vocabulary

| An entry can… | How you can tell |
|---|---|
| be a **request** | it has a `requests` row, because it had a destination |
| be a **reply** | `reply_to_id` is set |
| be **preliminary** | `is_final = false` |
| carry **values** / **files** | it has `data.values[]` / `entry_files` rows |
| keep a **patient list** | `entry_types.list` |
| **replace** another entry | `replaces_id` (a correction, an update of a preliminary entry, or type `entered_in_error`) |
| belong to a **set** | `written_with_id` |

Conventions, none of which needs a column:
- **Report and act.** A newer report replaces the preliminary one. A repeated act, such as a dose, a partial dispense or a home reading, is a separate non-final reply and replaces nothing.
- **Prescriptions as requests.**
  - A prescription is a request exactly when it has a destination: an in-house `Dispensing` service, or a ward `Medication administration` service.
  - A second destination is a second `request` entry.
  - A paper script has no request.
- **Declines and cancels.**
  - A department declines with a final `not_done` reply, so the decline has an author and lands in the requester's to-review list.
  - `mark_step('cancelled')` belongs to the requester.
  - An early stop is `done` with a reason.
- **Co-signature.**
  - A trainee note is itself a request to the `Co-signature` service.
  - A trainee consult reply is a preliminary reply, and the attending writes the final.
  - Supervised orders carry `responsible_id`.
- **Unsolicited outside results** are filed as a set: the result, plus a `Review result` request to the clinician's department.
- **Home monitoring** is a standing request whose readings are non-final replies.
- **Permission.** A user may write type T with `responsible_id = X` only if X may write T.
- **Machine streams** are not the record. An entry is written when a person or a rule charts them.

| Word | Meaning |
|---|---|
| record | Everything about one patient, including patients merged into them. |
| entry | One clinical act. |
| request · reply · result | As defined above. |
| requester | Who the reply goes back to. |
| set | Entries written in one `write_set` call. |
| value · field · service | A value is one measurement. A field is one item a service records. A service is something a department does. |
| step · routing | A step is what the department did. Routing is who, where, how urgent and when. |
| queue · visit · department · patient list · pack | As in v3. |

- **Banned words:**
  - chart, order, thread, behaviour, projection, projector, observation, attachment, event, commit, snapshot
  - summary, label, org, tier, worklist
  - device, ref, n, un-apply, unreviewed, signed (as a column name)
- **Suffix rule:**
  - Pointers end in `_id`. Pointers to a code end in `_code`.
  - Timestamps end in `_at`, and partial dates in `_on`.
  - Booleans start with `is_`.
  - Typed text ends in `_text` and names end in `_name`.
  - A bare word is an enum or a key.
  - The only abbreviations are id, mime and url.

## e. Renames

The v2 → v3 renames all stand: `read_record`, `write_entry`, `display_line`, `reply_line`, `is_final`, `reply_to_id`, `replaces_id`, `replaced_by_id`, `assignee_id`, `request_steps`, `entry_values`, `entry_files`, `service_fields`, `organization_packs`, and `staff`.

Changed since the v3 draft:

| v3 draft | Final | Why |
|---|---|---|
| entries.from_department_id | `department_id` | "from" only means something on a request. `requests` keeps from/to. |
| source_ref | `source_key` | It is not a pointer. "key" means a stable text identifier, as in `entry_types.key`. |
| signed_with_id | `written_with_id` | It read as "signed with a credential". It now pairs with `write_set`. |
| n | `position` | The design's own no-abbreviations rule. |
| source = device | `machine` | Analysers, monitors and algorithms are all covered. |
| requests.author_id | `requester_id` | Who the reply goes back to, which differs from the author on a verbal order. |
| requests.reviewed_at | `review_needed_at` | One column is the whole to-review predicate, and nothing is falsely marked reviewed. |
| requests.updated_at | `replied_at` | The column finally gets a use: it places the request card in the timeline. |
| request_steps.occurred_at | `occurred_at` + `recorded_at` | The same two meanings as on entries. |
| mark_step (8 parameters) | `mark_step` + `mark_routing` | One function was hiding four acts. |
| read_unreviewed | `read_to_review` | Matches the index and the screen phrase. |
| rebuild_patient | `rebuild_record` | Pairs with `read_record`. |
| require_access() | `require_access(organization_id, action, patient_id)` | The check needs an object. |
| data.occurred_text | `data.occurred_on` | It is a date and not free text. |
| "Derived" (for requests) | "Request state" | Derived now means exactly "can be deleted and rebuilt". |
| same_as / replaced_by_code | `codes.replaced_by_code` | One word, "replace", for the one pattern. |

## f. Removed

Everything v3 removed stays removed. Also removed now:
- **`requests.reviewed_at`, `updated_at` and `author_id`.**
- **`patient_list_reviews.state`.** It was a second copy of a safety-critical fact.
- **Un-apply and inverse updaters.**
- **Updater calls from the public wrappers.** `write_entry` dispatches them.
- **`type` in the realtime payload.** A type key such as an HIV result is a clinical hint.
- **"Recoding is: change the field's code, then rebuild."** It contradicted the self-contained rule.
- **"No server coordination" for sets.** `write_set` is one transaction.
- **The department cancel path.** Departments decline by reply.
- **Deleting `organization_packs` rows.**
- **`requests` from the rebuild delete list.**

## g. Power for free

- **Trends without setup.** Results without a request need no setup either.
- **One review loop.**
  - "Results to review" is one partial index.
  - The age of `review_needed_at` gives escalation of unreviewed critical results, with no new schema.
- **One reply rule.** It gives MAR, PRN, partial dispenses, refills, preliminary cultures and home monitoring. `requests_queue` doubles as "what is due next on this ward".
- **Future orders.** "HbA1c in three months" sits in the upcoming view, and its card resurfaces at the reply.
- **Verbal and supervised orders** route the review to the right doctor from day one.
- **Safe retries, offline outbox, all-or-nothing sets.**
  - A re-sent analyser message is idempotent.
  - After a point-in-time restore, the client and middleware outboxes refill the record.
- **One WHERE serves six jobs.** Export, erase, split, research extract, FHIR export (stable ids) and database-per-organization all use it.
- **Merge is a pointer plus `rebuild_record`.** Unmerge clears the pointer and rebuilds both patients.
- **Recoding local → LOINC** is one settings pointer. It rewrites nothing and is reversible.
- **Read as of a past time.**
  - `read_record` as of time T is possible later with no schema: replay up to T.
  - It answers "what was on screen when the decision was made".
- **Settings never touch history.**
  - History renders and exports with no settings joins, because names and ranges are copied in.
  - A pack can be switched off and its entries still read, trend and accept corrections.
- **De-identification** is one generic function, because of the key rule.
- **Turnaround reports** use the true collection time.
- **Redesign without migration.**
  - Any derived table can be re-indexed or repartitioned by rebuild.
  - Clients know only function names.
- **Rebuild cannot rot,** because its code runs on every correction.

## h. Decisions to make now

1. **Ids and paging.**
   - The id is a UUIDv7 minted by the client. Importers derive ids from legacy keys.
   - The id is a tiebreaker only, never a clinical order.
   - The paging key is `(time shown desc, id desc)`, and a request card is shown at `coalesce(replied_at, occurred_at)`.
2. **The columns are closed.** `responsible_id` and a nullable `department_id` go in now, because past entries cannot be repaired.
3. **No partitioning of `entries`, ever.** Beyond that, the answer is one database per organization.
4. **Insert-only trigger and grants** go in before the first row. `erase_patient` is the single exception.
5. **The closed record.** No pointer crosses patients. `request_steps` references `entries(id)`. A hash chain, if ever built, is per record.
6. **Request state is a fold.** The `sent` row carries the starting state. Steps get `position`, `occurred_at` and `recorded_at` from the first migration.
7. **Every rename in section e,** before the first migration.
8. **Access and realtime.**
   - Clinical tables are reached only through functions.
   - `require_access` takes arguments from day one.
   - Realtime is broadcast signals only.
9. **Self-contained entries.** This includes people and department names. Rebuild never reads settings.
10. **Codes.**
    - One `'system:code'` string form and one unit per code.
    - Local codes are minted.
    - Equivalence is `replaced_by_code`.
11. **Merge rules now, merge later.**
    - Lock and derived rows are keyed by the surviving patient.
    - Entries keep their literal `patient_id`, and entry reads use `patient_id = ANY(ids)`.
    - A new non-reply entry for a merged patient is refused, with the surviving id in the error.
12. **Organization is permanent.** A split is either clone plus erase, or export plus import. It is never an UPDATE.
13. **Time.** The client sends the age of the act and never its clock. `recorded_at` is monotonic per record.
14. **Enum declaration order.** `stat` comes first and `critical` comes last. Each `ADD VALUE` goes in its own file.
15. **Storage bucket.** The insert-only policy and the path rule go in before the first upload.
16. **Golden fixtures** from day one, together with the double-send and cross-organization tests.

## i. Rejected

The v3 rejections stand, with two exceptions.
- `responsible_id` is now in.
- `same_as` returns only as the read-side pointer `codes.replaced_by_code`.

Rejected at final:
- **`cosigned_at`, a `needs_review` column, a `reviewed_at` stamped on routine replies.** Conventions plus `review_needed_at` cover these needs without claiming a review that never happened.
- **Rejecting a value on unit mismatch.** It would block a clerk filing an outside result. The value is simply not extracted.
- **Unit conversions and a formulas engine.** These remain rejected.
- **Read-time `ANY(ids)` on derived tables.** Survivor-keyed rows keep every derived read a plain equality.
- **`patient_id` on `entry_files` and `request_steps`.** Both are reachable through the entry.
- **Server-side diff of retried `data`.** `write_entry` enriches `data`, so the client compares the returned row.
- **Inverse updaters and a drift table.** Replay removes the first, and the rebuild change count replaces the second.
- **Day-one export → import round-trip test.** It arrives with the importer. Its `data` conventions are fixed now.
- **Machine streams in `entries`, a nullable `due_at`, a department cancel path.**
- **A second `requests` row per entry.** One request has one destination.
- **Names rejected at final:**
  - `set_id` (implies a `sets` table)
  - `same_as_code`
  - `mark_assignment`
  - `source_ref`
  - `device`
  - `occurred_text`
  - `read_unreviewed`
  - `rebuild_patient`

## j. What the break-tests changed

| Finding | Decision |
|---|---|
| C1 corrected result after review | Accept. `Corrected:` prefix. One `change_request` per write. Steps keyed by `position`. A correction sets `review_needed_at`. |
| C2 preliminary → final culture | Accept. A newer report replaces the preliminary one. Step map: preliminary → `replied`, final → `done`. |
| C3 pharmacy substitution, partial dispense | Accept, simpler. Routine dispenses never set `review_needed_at`. `Dispensing` service convention. A superseding prescription closes the list row and the request. |
| C4 verbal order | Accept: column `entries.responsible_id`, plus `requests.requester_id`. Also resolves C14 (student orders) and part of Y8. |
| C6 outside PDF result | Accept. Outside sources keep their own unit, range and flag. A unit mismatch is not extracted. An unsolicited result is a set with a `Review result` request. |
| C7 consult by message or by visit | Accept. `reply_to_id` is never inferred. `replied_at` replaces `updated_at` (net zero columns). Replies to closed requests are accepted. |
| C8 one draw, four orders | Accept. `write_set`. `source_key` per entry. A reply's `occurred_at` defaults to the collected step time. Pack mark functions. One user per machine. |
| C9 cancel after collection | Accept. A result is never refused. A department declines by a final `not_done` reply, which gives step `cancelled` and sets review needed. |
| C11, T18, Y14 merge | Accept. Surviving-patient rule for the lock, derived rows and signal. Updaters never raise. `visit_id` only for the entry's own patient. `requests` is never deleted. |
| C12 "none known", then a real allergy | Accept: drop `state`. |
| C13, Y1 ward medication | Accept. Non-final replies. `due_at` rolls forward. `infinity` for PRN. A stop is `done` with a reason and closes both the list row and the request. |
| C14 co-signature | Accept as two written conventions. No `cosigned_at`. |
| C15 result for two problems | Accept. `data.problems[]`. A list row id is the chain root. |
| C16 order for three months ahead | Accept. `replied_at`, plus the `read_queue` due window. |
| C18, T5 strike or correct a list entry | Accept. No un-apply. Replay the list. The position and id of the first version are kept. |
| T1 triple retry | Accept. Early return. Dispatch inside `write_entry` through `entry_types.list`. Client freeze rule. Double-send CI test. |
| T3 updater bug after six months | Accept. Pure updaters. `rebuild_record` returns change counts. |
| T4 rebuild versus the FK into requests | Accept. New kind "Request state". Fold of steps. The `sent` row holds the starting state. |
| T6 pack shape change | Accept. A retired type accepts only replacements. `codes.unit` is set once. |
| T7, Y6 recoding | Accept. `codes.replaced_by_code`, read-side only, and the claim is deleted. Many-to-many ICD maps are declined: a reporting map outside the spine. |
| T9 realtime fan-out | Accept. Signal both departments, plus the old one on reroute. Payload `{entry_id}`. Jitter. |
| T10 long `read_record` | Accept. Widened `requests_by_patient`. `STABLE` reads. `require_access` with arguments. Cross-organization CI test. |
| T11 backup of files | Accept. Insert-only bucket, path rule, sweep and off-site copy. sha256 is declined until someone needs it. |
| T12 legacy import | Accept: system users, one transaction per patient, derived ids, no signal, no requests, flags as given. Smaller: `data.occurred_on`. |
| T13 clock skew | Accept. Age and not clock. Monotonic `recorded_at`. The CHECK stays as a backstop. |
| T14 retired department | Accept. Retire is refused while requests are open. Retired services are refused. Names are copied into `data`. |
| T15 disabled pack | Accept. `require_pack`. `retired_at` on every settings table. Corrections are always allowed. |
| T16 double change, struck reviewed result | Accept, simpler. `review_needed_at` replaces the OR predicate. A withdrawal sets it, with `status_reason`. |
| T17 analyser re-send | Accept. `source_key` with position. Lookup order: id, then key, then `replaces_id`. |
| T20 naming | Accept all. `mark_assignment` became `mark_routing`, and `signed_with_id` became `written_with_id`. |
| Y2 patient portal | Accept. Nullable `department_id` with a CHECK. Every author is a users row. Release to the patient is an outside table. |
| Y3 multi-site | Accept: an organization is the sharing boundary, `site` label, nullable `services.department_id`, minted local codes. Cross-organization sharing declined. |
| Y4 FHIR | Accept, smaller. A unit mismatch is not extracted instead of rejected. `stated_author_name` and `stated_recorded_at`. |
| Y5 e-prescribing | Accept. The requester chooses the destination. Outside departments are created on first use. Signed bytes are a file. |
| Y7 machine feeds | Accept. Streams stay outside the record. Per-value `occurred_at`. Clamp future times. `types[]` filter. |
| Y8 AI drafts | Accept. `is_final` is widened. `machine`. `data.drafted_with`. |
| Y9 research export | Accept. Key-naming rule in CI. Exports remap every id through a salted hash. |
| Y10 hard deletion | Accept. `erase_patient`. Closed record. `request_steps` → `entries(id)`. |
| Y11 organization split | Accept the rule. The round-trip test is deferred to the importer. |
| Y13 backfilled step times | Accept. `position`, `recorded_at` and a backdatable `occurred_at` on `request_steps`. |
| Y summary | Accept "the columns are closed" and "the record is a closed unit". |

Net schema change against the draft:
- `entries` gains one column, `responsible_id`.
- `request_steps` gains two columns, `position` and `recorded_at`, and a new primary key.
- `requests` gains nothing: one column is swapped, one is renamed, and `status` becomes generated.
- `patient_list_reviews` loses one column, `state`.
- Settings gains `codes.replaced_by_code`, `entry_types.list`, `departments.site` and `retired_at` on every table.

## k. Known limits

- **One entry, one patient.**
  - A mother-and-baby delivery or a group session is one set per patient.
  - A lab authorising 40 patients in one action writes 40 sets.
- **Erase is the whole patient or nothing.**
  - A strike hides an entry and never deletes it.
  - A scan attached to the wrong patient stays in storage until that patient is erased.
- **A strike cannot be undone.** Re-enter from the struck entry's data, as a new draft.
- **No cross-organization record.**
  - An organization is the boundary of sharing, and a patient never changes organization.
  - A split is clone plus erase, or export plus import.
  - An import stamps a new `recorded_at` and keeps the original in `data`.
- **No unit conversion and no formulas engine.**
  - A value in a foreign unit is shown but does not trend.
  - Code equivalence is 1:1 with the same unit only.
  - ICD-10 → ICD-11 is a reporting map outside the spine.
- **No machine streams.** Minute-by-minute monitor data lives outside the record until someone charts it.
- **One request, one destination.** Supply plus administer is two requests.
- **No co-signature column, no department hierarchy, no release-to-patient state.** These are handled by conventions, labels and an outside table.
- **Search.** In-record search is ILIKE over one patient. Cross-patient search and cohort queries are later derived tables.
- **The server does not diff retried writes.** The client must freeze the form and compare the returned row.
- **A reply to a merged-away patient's request** written during the survivor's visit loses its `visit_id`.
- **Step times are only as true as what staff state.** `recorded_at` always tells when a step was entered.
- **Realtime is a hint.** Correctness comes from refetching.
- **Unknown-patient identity and `patient_links`** remain deferred.
  - Nothing here blocks them, and nothing here builds them.