# openCare: patients and visits (final)

Companion to [03-patients-visits.md](03-patients-visits.md). Where the two differ, the spec wins.

## a. In one sentence

**A patient is a row the desk finds in one box; a visit is an arrival at a department, moved only by steps; the queue is a query over the visits that are present; and nothing in the record ever depends on any of it.**

What follows from it:
- The desk has one search box and one button. Search finds the row; Here (`open_visit`) opens or re-enters the visit. Neither call asks the desk to decide anything the database can decide.
- A visit is not a day. It opens on arrival and closes when the clinician is done, when the desk closes it, or when the sweep finds it abandoned. Between those it may span several days while results are out. Presence is the day-bound fact, and it is asserted by a person: the desk, the nurse, the phlebotomist. "Present" means available to be seen now: in the building, on the line, or at the door of a home visit.
- Where a visit stands is a fold of its steps, exactly as a request is (spec 01). The row is what the fold says; CI refolds and compares; nothing repairs it in production because nothing can drift.
- The queue's bands are computed at read time from committed rows. BACK ("came back from the lab, nothing still out") is not a state anyone writes; it is `seen ∧ present ∧ nothing holds`. A request closing therefore cannot fail to re-queue a patient, and a cancel, a merge, a rebuild or a race cannot leave a stale flag.
- The record never locks or writes a visit, and `write_entry` never reads one. The record reads read `visits` only to list a patient's visits in the record view (`read_visits`, spec 07), never to decide privacy: a note's privacy is its own, kept by the department it was written in (amended 2026-09-25). `entries.visit_id` is a pointer the client sets and a composite key checks. Every reading of the record is the same with `visits` empty.

**Why BACK is derived.** The owner's requirement was "when every request is closed and the patient is present, re-queue him". Stored, that is a transition that must fire on every path that closes a request: a final reply, a cancel, a strike, a rebuild, a pack switching off, a merge. Each path is a place to forget it, and the transition needs the patient's advisory lock (record side) and the visit's row (operational side) in one transaction, which is the lock-order rule spec 01 was written to avoid. Derived, the rule is one CASE in one query, and the only thing the record side does is send a signal so the screen refetches.

**Why `holds` has four words.** A request holds its visit while it is *open* (`held` included: a request stopped for payment is still work in flight), *addressed inside the organization* (an outside letter would hold a visit for weeks), *not a prescription* (every dispense would flip a gone-home patient into BACK), and *due within 14 days* (a three-month HbA1c would keep the visit pending until it lapsed; tomorrow's fasting bloods must hold so the morning Here lands in PENDING and the result turns the same visit BACK). `due_at <= now()` was the draft; it closes today's visit before tomorrow's bloods and hands the doctor the hunt the owner forbade.

**Why the sweep counts request steps.** Two 14-day constants raced: a test due in 13 days holds the visit, the visit goes away on night 1, the result lands on day 14, and the lapse clock, measured from the away step, has already written `lapsed`. A pending visit is therefore idle only when neither it nor any request written in it has moved. A result, a collection or a release restarts the 14 days; an abandoned request with no steps still lets the visit lapse.

## b. Listing

### Table kinds

| Kind | Tables | Rule |
|---|---|---|
| **Outside the record** | `patients`, `patient_identifiers`, `visits` | Mutable. Reachable only through functions (no grant to `authenticated`). Composite tenant keys on every link. Never read by `write_entry`, `rebuild_record` or any record read. |
| **History** | `visit_steps`, `patient_changes` | Insert-only under the same trigger as `request_steps`; the only DELETE path is `erase_patient`. |
| **Counter** | `core.record_numbers` | One row per organization: the last card number issued. Written by `register_patient` under its row lock. |

### patients

```
patients             id uuid pk (UUIDv7, client-minted; the retry key) · organization_id (permanent)
                     record_number bigint not null · given_name text · middle_name text null · family_name text
                     sex sex (female | male | other) · born_on text · died_on text null
                     phone_text text null · contact_text text null · merged_into_id uuid null · created_at
                     UNIQUE (organization_id, record_number) · UNIQUE (organization_id, id)
                     (organization_id, merged_into_id) → patients (organization_id, id)
                     CHECK (btrim(given_name) <> '' AND btrim(family_name) <> '')
                     CHECK (born_on ~ '^\d{4}(-\d{2}(-\d{2})?)?$') · the same on died_on
patient_identifiers  organization_id · patient_id · system text · value text                         pk (patient_id, system, value)
                     (organization_id, patient_id) → patients
patient_changes      id uuid pk (client-minted) · organization_id · patient_id · user_id · changes jsonb · recorded_at   insert-only
                     (organization_id, patient_id) → patients · (organization_id, user_id) → users
core.record_numbers  organization_id pk · last_number bigint
```

- **`record_number`** is the number on the card. `register_patient` takes it from `UPDATE core.record_numbers SET last_number = last_number + 1 WHERE organization_id = $1 RETURNING last_number` on insert only. The row lock serialises registrations per organization (trivial at 500 a day), the number is transactional (a rolled-back registration leaves no gap), and a legacy import restarts one organization's series with one UPDATE by migration. Old numbers land in `patient_identifiers` as `record_number:<old system>`. It is never typed, changed or reused, and `UNIQUE (organization_id, record_number)` says so.
- **Names.** `given_name`, `middle_name` (everything between: second names, a patronymic chain) and `family_name` (the whole surname with particles). Trimmed and whitespace-collapsed at save, case kept. The client formats; the row never carries a formatted name. A mononym needs both names (known limit).
- **`sex`** is the enum shared with `service_field_ranges.sex`, which now carries `other`; ranges rows use `female`, `male` or NULL, so `other` gets the unisex rows (spec 02, amended). Gender identity, if ever wanted, is an additive `gender_name`.
- **`born_on` and `died_on`** are text in spec 01's partial-date form. An age typed at the desk is stored as the year `extract(year from current_date) - age`. `age_on(born_on, on date)` is one IMMUTABLE function used by `field_range` (spec 02) and the client; missing parts are taken as the middle of the period, so a year-only date is right to within six months. `died_on` is set by `register_patient`; `open_visit` refuses `patient_died`; search hits carry it. It is the one fact the desk must know before a record is opened, and search is not a record read, so it cannot live in the record.
- **`phone_text`** and **`contact_text`** are typed text (spec 01's `_text` rule); the phone is searched by its digits. A structured next of kin, address or e-mail is an additive column or a pack table; the only contact anyone queries is the phone.
- **`patient_identifiers.system`** is a key the organization chooses (`national_id`, `passport`, `insurer:<name>`, `record_number:<old system>`); `value` is trimmed and compared exactly. Not unique across patients: a second patient with the same identifier is the strongest duplicate warning, never a block (rule 5).
- **`patient_changes`** is one row per `register_patient` (the first row is the registration, with `[null, value]` pairs) and one per merge or unmerge on both patients. `changes` is `{column: [old, new]}` with `identifiers: [old[], new[]]` as one key. `user_id` is `current_user_id()`, never a parameter. It has the shape and trigger of `settings_changes` and is a separate table so that patient names never sit in the settings history and `erase_patient` can delete them.

### visits and visit_steps

```
visits       id uuid pk (UUIDv7, client-minted; the retry key) · organization_id · patient_id (literal, never rewritten)
             department_id (the department responsible) · request_id uuid null · assignee_id uuid null
             status visit_status · priority request_priority default 'routine' · is_first bool
             arrived_at · present_at null · seen_at null · ended_at null
             UNIQUE (patient_id, id) · UNIQUE (organization_id, id)
             (organization_id, patient_id) → patients · (organization_id, department_id) → departments
             (organization_id, assignee_id) → users · (organization_id, request_id) → requests (organization_id, entry_id) DEFERRABLE INITIALLY DEFERRED
             CHECK ((ended_at IS NULL) = (status NOT IN ('done','left','lapsed','cancelled')))
             CHECK (ended_at IS NULL OR present_at IS NULL)
             CHECK (status NOT IN ('in_consult','pending') OR seen_at IS NOT NULL) · CHECK (status <> 'left' OR seen_at IS NULL)
visit_steps  organization_id · visit_id · position smallint · status visit_status · actor_id null · reason text null · changes jsonb null · recorded_at
             pk (visit_id, position) · (organization_id, visit_id) → visits · (organization_id, actor_id) → users
             CHECK (status <> 'cancelled' OR reason IS NOT NULL) · insert-only
```

- **`visit_status`** is `waiting · in_consult · pending · done · left · lapsed · cancelled`, declared in that order. `admitted` is one `ADD VALUE` when admissions ship (spec 01's convention: one file per value).
- **`department_id`** is the department responsible for the visit, not where the patient is standing. The lab is a place the patient goes during an Internal Medicine visit; it never has a visit of its own. A ward transfer, when admissions ship, is a routing step `{department_id: [old, new]}` on the same visit: responsibility moved, the arrival did not.
- **`request_id`** is the consult request this visit answers (`open_visit(request_id)`), NULL for a walk-in. The key is `(organization_id, request_id)`, not `(patient_id, request_id)`, because `requests.patient_id` is re-keyed to the survivor on merge while `visits.patient_id` stays literal; `open_visit` checks the patient itself (`wrong_patient`, with `patient_id = ANY(ids)`). The key is deferrable so `erase_patient` can delete the circle entries → visits → requests → entries in one transaction.
- **`assignee_id`** is routing, never a gate: `mark_visit` checks it nowhere. It is who should see the patient (set by the desk or by `open_visit`) and, once a consult starts, who is seeing her: every `in_consult` step sets `assignee_id := caller`. A retired doctor's name therefore leaves the row on the next consult and never blocks one. `assignee_name` in the queue comes from a join at read time.
- **`is_first`** = `NOT EXISTS (SELECT 1 FROM visits WHERE patient_id = ANY(ids) AND department_id = $1 AND seen_at IS NOT NULL AND status <> 'cancelled')`, `ids` = the patient and every patient merged into it, computed at open and stored; `mark_visit_routing` may flip it (an import that knows better). "Seen", not "done": a visit that lapsed after the consult is still a prior consult. Never from entries: imported histories, outside letters and phone notes exist without a consult.
- **Times.** `arrived_at` is when the row was opened (a visit row is an arrival). `present_at` is "here since"; NULL is away. `seen_at` is the first `in_consult`, set once, and is "seen before" everywhere. `ended_at` is set with a terminal status; open ⇔ `ended_at IS NULL`. The CHECKs above make the terminal/presence and seen/status agreements a property of the table, not of the code.
- **The fold.** `visits` is a fold of `visit_steps`: `status` = the latest row's; `arrived_at` and the first `present_at` = row 1's `recorded_at`; `present_at` = the latest `{present_at}` change (NULL after a terminal row); `seen_at` = the first `in_consult` row's `recorded_at`; `ended_at` = the terminal row's; `assignee_id`, `priority`, `is_first`, `request_id` = the latest `changes` carrying that key, row 1 carrying all four. The `in_consult` row carries `{assignee_id}` so the fold never has to guess it from `actor_id`. CI refolds every fixture visit and compares (V1); no `rebuild_visit` ships, because a fold that can only be reproduced from steps written by one private function under a row lock cannot drift.
- **Steps have no `occurred_at`.** A step is the click; there is no clinical time to backdate. `recorded_at` is the wait clock. Reports (door-to-doctor = `seen_at − arrived_at`, left-without-being-seen = `left`, lapse rate) come from `visits` and `visit_steps` alone.

### Indexes

- `visits_open UNIQUE (patient_id, department_id) WHERE ended_at IS NULL` — one open visit per patient per department; the sweep scans it; two desks clicking Here at once collapse into one row.
- `visits_present (department_id) WHERE present_at IS NOT NULL` — the queue's set; the read costs the same at 50 and 5,000 arrivals a day.
- `visits_history (patient_id, arrived_at DESC)` — `read_patient`, erase, export.
- `visits_request (request_id) WHERE request_id IS NOT NULL` — "is the consult still open" and the merge check.
- `entries (visit_id) WHERE visit_id IS NOT NULL` (spec 01, amended) — `holds`, the queue's `requests[]`, the sweep's request steps.
- `requests UNIQUE (organization_id, entry_id)` (spec 01, amended) — the target of `visits (organization_id, request_id)`.
- `patients`: `UNIQUE (organization_id, record_number)` · `(organization_id, reverse(digits(phone_text)) text_pattern_ops) WHERE phone_text IS NOT NULL` — a suffix match becomes a prefix match on the reversed digits · one GIN `gin_trgm_ops` index over `plain_name(given_name || ' ' || coalesce(middle_name, '') || ' ' || family_name)` alone (a GIN over the uuid column would need `btree_gin`; `organization_id` is filtered after) · `(organization_id, dmetaphone(plain_name(family_name)))` · `(merged_into_id) WHERE merged_into_id IS NOT NULL`.
- `patient_identifiers (organization_id, value)` · `patient_changes (patient_id, recorded_at DESC)`.
- Helpers, all IMMUTABLE: `plain_name(text)` = lower, unaccented (`unaccent('unaccent', …)`, the two-argument form, wrapped IMMUTABLE), whitespace collapsed; `digits(text)` = every non-digit removed; `age_on(born_on, date)`. Extensions: `pg_trgm`, `unaccent`, `fuzzystrmatch`.

### Functions

Every public function begins with `require_access(organization_id, action, patient_id, department_id)` (spec 02 rule 2); the department is the visit's, the patient is the visit's or the parameter's; the organization is the row's. The nine public functions are in B17's golden signatures file from the migration that creates them.

**`register_patient(id, given_name, middle_name, family_name, sex, born_on, died_on, phone_text, contact_text, identifiers[], seen_change_id, change_id)`** — `write:patient`, in the caller's department (any). In order: a `patient_changes` row with `id = change_id` exists → return the stored patient and change nothing (the retry, spec 01's rule); the patient row exists with `merged_into_id` set → `patient_merged` with the survivor id; a `patient_changes` row newer than `seen_change_id` exists (NULL for a new patient; a newer row always exists after the first save) → `changed_since_read` with that row; validate (`name_missing`, `born_on_invalid`: form, real date, not future; `died_on_invalid`: form, real date, not future, not before `born_on`); upsert the row (trim, collapse whitespace, keep case; `record_number` from `core.record_numbers` on insert only, never on update, never from a parameter); replace the identifiers with `identifiers[]` (each `{system, value}`, trimmed); insert the `patient_changes` row with `id = change_id`. Returns the row as `read_patient` would. It never refuses a duplicate and never requires MFA, which is why it is not a `save_…`: spec 02 locks that prefix to `manage:` + `aal2` + `settings_changes`, and a receptionist registering fifty patients under MFA is wrong.

**`read_patients(organization_id, query, born_on null, phone_text null)`** — `read:patient`. `q` = the query trimmed and whitespace-collapsed. Candidates, in rank order: (1) `patient_identifiers.value = q`; (2) when `q` is all digits: `record_number = q::bigint`, then `reverse(digits(phone_text)) LIKE reverse(q) || '%'`; (3) otherwise `plain_name(full name) = plain_name(q)`, then `plain_name(full name) % plain_name(q)` (trigram, threshold 0.3) or `dmetaphone(plain_name(family_name)) = dmetaphone(plain_name(last word of q))`, by similarity descending. `born_on` narrows by year (`left(born_on, 4)`), `phone_text` by its digits as a suffix. Exact hits (1, 2 and the equality in 3) first, at most 20 rows, no paging: the desk refines. A merged-away hit is replaced by its survivor and de-duplicated. Each hit: the row (with `died_on`), `identifiers[]`, `change_id` (the latest `patient_changes.id`, sent back as `seen_change_id`), `open_visits[] {visit_id, department_id, status, present_at, seen_at, arrived_at}` for departments the caller may `read:queue`, and `open_requests[] {request_id, service_name, to_department_id, requester_name}` — open requests of type `request` addressed to an `is_visited` department the caller may `read:queue`, over `requests_by_patient` (spec 01) — so the desk's Here on a consult row passes `request_id` without opening another screen. The duplicate warning at registration is this function called from the form with the typed family name, birth year and phone: an equal identifier, an equal family sound with the same year, or equal phone digits. Not a record read: no `record_reads` row. Why dmetaphone: `pg_trgm` scores `muhammad` against `mohammed` at 0.20, below the threshold, while `dmetaphone` gives `MHMT` for both; `mohamed` / `mohammed` is 0.70 and trigram alone finds it.

**`read_patient(patient_id)`** — `read:patient`. The row, identifiers, visits (open first, then by `arrived_at` descending, `patient_id = ANY(ids)` through the merge pointer), `open_requests[]` as above, and the `patient_changes` rows. Not a record read; `read_record` is the audited open, called for the picked patient only.

**`open_visit(id, patient_id, department_id, priority, assignee_id null, request_id null)`** — `write:visit` in `department_id`, or for a desk's staff in a clinic that desk checks in for (spec 02, the desk's reach). The Here button; it decides everything: (1) a visit with this `id` exists → return it (retry); (2) the patient is merged away → `patient_merged` with the survivor id; `died_on` set → `patient_died`; the department's work is bench or outside → `not_visited`; stays → `admission_only`; `retired_at` set → `department_retired`; (3) `request_id` given: the request must be open (`request_not_open`), addressed to this department (`wrong_department`), for this patient or one merged into it (`wrong_patient`); (4) an open visit for `(patient, department)` exists → when `present_at IS NULL`, a presence step by `change_visit`, compare-and-set on `ended_at IS NULL` (0 rows — the doctor's `done` landed in between — fall through to insert); when the open visit's `request_id` is NULL and the call carries one, a routing step `{request_id}`; when both are set and differ, the row unchanged (the client shows the second consult as open work); return the row; (5) else insert `waiting`, `present_at = now()`, `arrived_at = now()`, `is_first` computed, and row 1 of `visit_steps`; a `unique_violation` on `visits_open` (two desks at once) re-reads and returns the open visit. When the caller is of kind `machine` (a kiosk), `priority = 'routine'`, `assignee_id = NULL`, `request_id = NULL` whatever was passed. One signal.

**`mark_present(visit_id, is_present)`** — `write:visit`. `present_at := now()` or NULL by `change_visit`, compare-and-set on `ended_at IS NULL` (`visit_ended` on 0 rows); no change → the row, no step.

**`mark_visit(visit_id, from_status, status, reason null)`** — `write:visit`; additionally `mark:in_consult` for every move into or out of `in_consult` and every move out of `pending`. The pair `(from_status, status)` must be a row of the moves table (`illegal_move`); `cancelled` needs `reason` (`reason_missing`). `change_visit` runs `UPDATE visits SET … WHERE id = $1 AND status = from_status`; 0 rows → `visit_moved` with the current row (the second doctor sees who took the patient and refetches). Into `in_consult`: `seen_at = coalesce(seen_at, now())`, `assignee_id = caller`, step `{assignee_id}`. `in_consult → done`: the server computes `holds`; `> 0` → `pending`, else `done`; the returned row says which. Terminal: `ended_at = now()`, `present_at = NULL`.

**`mark_visit_routing(visit_id, assignee_id, priority, is_first)`** — `write:visit`. NULL = unchanged; one step carrying only what changed; nothing changed → the row, no step; `visit_ended` on a closed visit. The nurse's re-triage: write the `triage` entry, then `mark_visit_routing(visit_id, NULL, 'stat', NULL)`.

**`read_visit_queue(department_id)`** — `read:queue` in the department, or through the desk's reach in a clinic the caller's desk checks in for. The query in *The queue* below. A desk calls it once per clinic it checks in for and merges on the client; there is no `department_id = NULL` form and no cross-department order to define.

**`read_sent_outside(organization_id, department_id null)`** — `read:queue` held anywhere in the organization (spec 02's outside rule). Open requests whose destination `is_outside`, from `department_id` (NULL = every department), by `due_at`, over spec 01's queue index per outside department. It ends spec 02's known limit "send-outs are found per patient".

**`core.change_visit(visit_id, status, present_at, changes, reason)`** — private; the only writer of `visits.status`, `present_at`, `seen_at`, `ended_at`, `assignee_id`, `priority`, `is_first`, `request_id` after row 1, and the only inserter of `visit_steps` after row 1. In order: `UPDATE visits … WHERE id = $1 AND <the caller's predicate: status = from_status, or ended_at IS NULL> RETURNING *` — the row lock taken here orders every concurrent step; 0 rows → `visit_moved` or `visit_ended`; then `INSERT INTO visit_steps … position = (SELECT coalesce(max(position), 0) + 1 …)`, safe because the row lock is held; then the Realtime broadcast `queue:<department_id> {visit_id}` inside the transaction, so a rolled-back mark sends nothing.

**`core.holds(visit_id)`** — private, STABLE, read-only: `SELECT count(*) FROM requests r JOIN entries e ON e.id = r.entry_id JOIN departments d ON d.id = r.to_department_id WHERE e.visit_id = $1 AND r.status = 'open' AND NOT d.is_outside AND e.type <> 'prescription' AND r.due_at < now() + interval '14 days'`. It is the one query the operational side runs on the record.

**`core.sweep_visits()`** — private, no public form (a public no-gate function would be a door by spec 02's B9), `CALL`ed by pg_cron hourly, listed in B11's `cron.job` set. Step by step: for every open visit whose department's work is not stays (a WHERE that matches nothing today and cannot be forgotten when admissions ship): `idle = now() − greatest(the latest visit_steps.recorded_at, and for status = 'pending' the latest request_steps.recorded_at of every request whose entry carries this visit_id)`; then one of: `waiting ∧ seen_at IS NULL ∧ idle ≥ 12 h → left`; `seen_at IS NOT NULL ∧ (present_at IS NOT NULL ∨ status <> 'pending') ∧ idle ≥ 12 h → pending with present_at = NULL` (one step carrying both); `pending ∧ present_at IS NULL ∧ idle ≥ 14 d → lapsed`. Each through `change_visit` with `actor_id` NULL; one signal per department touched; a rerun changes nothing. No time zone: nobody has touched the visit for twelve hours under any clock, and a doctor mid-consult at 00:00 is not evicted. The constants live in the function; changing them is a release, not a migration.

### The queue

```sql
SELECT v.*, p.record_number, p.given_name, p.middle_name, p.family_name, p.sex, p.born_on,
       u.name AS assignee_name, core.holds(v.id) AS holds,
       CASE WHEN v.status = 'in_consult'                     THEN 'consult'
            WHEN v.status = 'waiting' AND v.seen_at IS NULL   THEN 'waiting'
            WHEN v.status = 'waiting' OR core.holds(v.id) = 0 THEN 'back'
            ELSE 'pending' END                                AS band,
       (v.request_id IS NOT NULL AND rq.status = 'open')      AS is_request_open,
       requests[] {request_id, service_name, to_department_name, step, is_holding}   -- over entries (visit_id)
FROM   visits v JOIN patients p ON p.id = v.patient_id
       LEFT JOIN users u ON u.id = v.assignee_id LEFT JOIN requests rq ON rq.entry_id = v.request_id
WHERE  v.department_id = $1 AND v.present_at IS NOT NULL
ORDER  BY CASE band WHEN 'back' THEN 0 WHEN 'waiting' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
       v.priority, CASE WHEN band IN ('back', 'pending') THEN v.present_at ELSE v.arrived_at END
```

- **Bands.** BACK = seen ∧ (waiting ∨ (pending ∧ holds = 0)); WAITING = waiting ∧ unseen; PENDING = pending ∧ holds > 0; CONSULT = in_consult, last, with the assignee's name. A "HERE·" band from an earlier draft is gone: everything in the queue is present. Inside a band the order is priority (`stat` first, spec 01's enum order) then `present_at` for the bands a patient returns into and `arrived_at` for first arrivals, so a waiting patient who steps out keeps his place.
- **The row** carries name parts, not a formatted name (the format is the organization's), the three times, whether the consult request is still open ("consult not answered"), and `requests[]` so a three-day visit reads "2 of 3 in · culture at Laboratory" for doctor and desk alike. `is_holding` is the four-word test per request.
- **A board** (a waiting-room screen) is a `machine` user of the reception holding `read:queue` and shows `record_number`, `band` and `assignee_name`, nothing else — the row also carries names and "culture at Laboratory", which are not for a wall. This is a client rule; the read's shape is one.
- **Realtime.** `change_visit` broadcasts `{visit_id}` on `queue:<department_id>` inside the transaction. `change_request` (spec 01, amended) broadcasts `{entry_id}` on `queue:<visits.department_id>` of the request entry's visit as well as on its existing channels. **Any signal on a queue channel refetches both `read_queue` and `read_visit_queue`**, debounced with spec 01's jitter; the id in the payload is a hint, not a router. The draft's "refetch `read_visit_queue` on `{visit_id}` and `read_queue` on `{entry_id}`" broke: the result that flips PENDING → BACK arrives as `{entry_id}` and the visit queue never refetched. A reception joins one channel per served department. No new channel, no payload but an id.

### Consult by visit, the lab-only walk-in, merge, erase and export

- **Consult by visit.** Dr A at Internal Medicine writes a consult request to Cardiology (entry `visit_id` = V1). Her Done finds `holds(V1) = 1` → V1 pending, PENDING band, "consult at Cardiology · sent". The patient walks to Cardiology's desk; search shows `open_requests[]` with the consult; Here passes `request_id` → `open_visit` checks it (open, addressed here, this patient) and inserts V2 with `request_id`. The cardiologist's consult screen pre-fills `reply_to_id := V2.request_id` (never inferred by `write_entry`, spec 01); the final reply entry (`visit_id` = V2) closes the request by the fold; `change_request` signals `queue:IM` (V1's department); IM refetches: V1 is pending ∧ holds 0 ∧ seen → BACK, "consult · Cardiology · done". Cardiology's Done: `holds(V2) = 0` (the request entry carries V1) → done. `mark_visit(done)` never closes the request — a consult may still be answered by message — and the queue prints "consult not answered" while it is open. When the patient already has an open Cardiology visit, `open_visit` adds the `request_id` to it as a routing step instead of dropping it.
- **A lab-only walk-in** (an outside doctor's paper request) is a visit at the reception department (`is_visited`). A nurse or doctor with `write:request` writes the request with `visit_id` = that visit; the receptionist gains no record action. The visit is never `in_consult`, so it never turns BACK (BACK needs `seen_at`); it stays WAITING and its `requests[]` says when the result is in. The desk ends it waiting → done when the result is handed over, or the sweep ends it left at 12 h idle. Who reviews an outside doctor's result is spec 01's and the laboratory pack's question.
- **Merge** (rules now, built later, spec 01). `visits`, `visit_steps`, `patient_identifiers` and `patient_changes` keep their literal `patient_id` (the composite key `entries (patient_id, visit_id)` forbids rewriting a visit's patient). Every read uses `patient_id = ANY(ids)`. `open_visit` and `register_patient` refuse a merged-away patient with `patient_merged` and the survivor id. `merge_patients` refuses `visit_open` and returns the open visit ids while the merged-away patient has an open visit (the doctor cancels or closes it first). Both write a `patient_changes` row on both patients. `unmerge_patient` undoes nothing else because nothing moved. `manage:patients` (MFA) when built. `requests.patient_id` is re-keyed to the survivor (spec 01) while `holds` joins by `entries.visit_id` only, so holds survive a merge.
- **Erase and export** are one list over `patient_id = ANY(ids)` — the survivor and every patient merged into it, as spec 01's closed-record rule requires: `patient_changes`, `visit_steps`, `visits`, `patient_identifiers`, `patients`. `erase_patient` deletes `drafts` (they carry `visit_id`) and the record tables first, then this list in that order, then writes the `erasures` row; `visits.request_id`'s deferrable key lets the circle entries → visits → requests → entries clear in one transaction; pack tables hold `visit_id` with no key, so nothing blocks. An open, present visit vanishes from the queue on the next refetch; erase sends no signal. Export writes the same five tables in reverse order with `department_name`, `assignee_name`, `actor_name` and `user_name` beside the bare ids (entries are self-contained; visits are not, and this is fixed now so `visits` never needs a name column). An import into another organization (spec 01's split) maps departments by name and sets `assignee_id`, `actor_id` and `user_id` to the importer user.

## c. Invariants

### Enforced by the database

1. **One writer.** `visits.status`, `present_at`, `seen_at`, `ended_at` and, after row 1, `assignee_id`, `priority`, `is_first`, `request_id` change only through `core.change_visit`; `visit_steps` after row 1 are inserted only there. No grant on either table to `authenticated` or any pack role.
2. **History.** `visit_steps` and `patient_changes` reject UPDATE, DELETE and TRUNCATE under `request_steps`' trigger; the only exception is inside `erase_patient`.
3. **Order.** `change_visit` updates the row before it inserts the step; `position = max + 1` under that row lock; `pk (visit_id, position)`.
4. **Compare-and-set.** Every status move carries `from_status`; every presence and routing change carries `ended_at IS NULL`; 0 rows raise `visit_moved` or `visit_ended` and never "return the row".
5. **One open visit** per `(patient_id, department_id)`: `visits_open`.
6. **Agreement CHECKs.** Terminal ⇔ `ended_at`; ended ⇒ away; `in_consult` or `pending` ⇒ seen; `left` ⇒ unseen; `cancelled` step ⇒ `reason`.
7. **Composite tenant keys** (spec 02's rule): `patients (organization_id, merged_into_id)`; `patient_identifiers`, `patient_changes`, `visits (organization_id, patient_id)`; `visits (organization_id, department_id)`, `(organization_id, assignee_id)`, `(organization_id, request_id)` deferrable; `visit_steps (organization_id, visit_id)`, `(organization_id, actor_id)`; `patient_changes (organization_id, user_id)`; carried by `UNIQUE (organization_id, id)` on `patients` and `visits`. `entries (patient_id, visit_id) → visits (patient_id, id)` (spec 01).
8. **Literal `patient_id`.** No function rewrites `visits.patient_id`; the key from `entries` makes it impossible.
9. **The record never locks or writes a visit.** `change_request`, `rebuild_record` and `write_entry` reference no spec 03 table, and the record reads read `visits` only to list a patient's visits (`read_visits`), never for privacy (B10's static scan allows exactly these reads; amended 2026-09-25: `wrong_visit`, `visit_needed` and hidden visits are gone, because privacy is per note); `holds` is the one function that crosses the other way, STABLE.
10. **No cross-boundary locks.** No spec 03 function calls `pg_advisory_xact_lock`; no spec 01 function selects a `visits` row `FOR UPDATE` (B10 scan).
11. **Registration.** `record_number` is minted from `core.record_numbers` on insert only and has no parameter; `UNIQUE (organization_id, record_number)`; names non-blank; partial-date CHECKs on `born_on` and `died_on`; a `patient_changes` row per save; `change_id` is the retry key; `seen_change_id` older than the latest raises `changed_since_read`.
12. **Search is not a record read.** `read_patients` and `read_patient` insert no `record_reads` row and are not in the set that `record_not_open` guards.
13. **Gates.** `read:patient`, `write:patient`, `write:visit`, `mark:in_consult` are `actions` rows; `write:visit` and `read:queue` reach beyond a role's department only through a desk's check-in rows; `mark:in_consult` guards every move into or out of `in_consult` and out of `pending`; a machine user opens visits with routine, NULL, NULL; `core.sweep_visits` has no EXECUTE for `authenticated`.
14. **Signals inside the transaction.** `change_visit` broadcasts after its insert, in the same transaction; `change_request` broadcasts to the visit's department.
15. **Retire.** `retire_department` refuses `department_has_open_visits` (spec 02, amended).
16. **Erase.** `erase_patient` deletes the five spec 03 tables for the survivor and every merged-in patient after drafts and the record tables; the deferrable key on `visits.request_id`.

### Enforced by CI tests

- **V1 Refold.** For every fixture visit, folding its `visit_steps` reproduces the `visits` row column for column; a fixture with every move in the table, a presence flip, a routing change and a sweep step is included.
- **V2 Double-send.** Every registration and visit fixture call sent twice yields zero differences: `register_patient` with the same `change_id` returns the row and writes no change row; `open_visit` with the same `id` returns the row and writes no step; `mark_present` with no change writes no step.
- **V3 Races.** Two concurrent `mark_visit(waiting → in_consult)`: one succeeds with `assignee_id` = its caller, the other raises `visit_moved` carrying that row. A concurrent `mark_present`, `mark_visit_routing` and `mark_visit` on one visit leave three steps with consecutive positions and no `unique_violation`. Two concurrent `open_visit` for one patient and department leave one row. `open_visit` racing a `done`: the desk's call inserts a new visit, never returns the ended one.
- **V4 Bands.** The clinic-flow scenarios as a golden fixture: after each step, `read_visit_queue` gives the expected band and order per visit. A final reply closing the last holding request changes the band from PENDING to BACK on the next read with no new `visit_steps` row and no write to `visits`.
- **V5 Sweep.** Visits at idle 11 h 59 min, 12 h 01 min, 13 d 23 h and 14 d 01 min move exactly as the three rules say; a rerun changes nothing; a stays department's visits are untouched; a `request_steps` row on a request written in a pending visit within the window postpones its lapse; the fasting-bloods fixture (due tomorrow) lands in PENDING on the morning Here and turns BACK on the result.
- **V6 Boundary.** A note into a done, left, lapsed and cancelled visit of the same patient succeeds; into another patient's visit fails on the key. Static scan: no spec 01 function body names `visits`, `visit_steps`, `patients` beyond `merged_into_id`, `patient_identifiers` or `patient_changes`; no spec 03 body names `pg_advisory`; `holds` is STABLE and its body names only `requests`, `entries`, `departments`. `rebuild_record` over a patient with visits changes no spec 03 row.
- **V7 Search.** A fixture of 100,000 synthetic patients: `read_patients` p95 under 50 ms for a name, a number and a phone suffix; `Muhammad` finds `Mohammed` with the same birth year; `Mohamed` finds `Mohammed`; `B-1042` finds the imported identifier; a merged-away hit appears once as its survivor; `read_patients` and `read_patient` insert no `record_reads` row and a following `read_entries` without `read_record` raises `record_not_open`.
- **V8 Gates.** The receptionist fixture cannot move a visit into or out of `in_consult` or out of `pending` and can do everything else in the table; the nurse can enter `in_consult`; a receptionist's `mark_present` in a clinic its desk checks in for passes and in any other clinic is refused; a technician's `mark_present` on a clinic's visit is refused (works-for widens nothing); a machine user of the reception opens a `routine` visit whatever it passes and cannot call `mark_visit`; `has_function_privilege('authenticated', 'core.sweep_visits()', 'EXECUTE')` is false.
- **V9 Tenant matrix.** B16 enumerates `pg_proc`, so the nine functions and every id parameter, `identifiers[]` elements included, are covered the day they exist; a member of B calling `open_visit` with A's request, department or patient raises each time.
- **V10 Erase and export.** Erasing a survivor with a merged-in patient leaves no row in the five tables, `drafts` or the record for either id, in one transaction; export then import into a fresh organization reproduces visits and steps with names mapped and the importer as actor.
- **V11 Signatures and jobs.** B17's golden file carries the nine public functions; B11's `cron.job` set is the runner, the watchdog, the purge and the hourly sweep.
- **V12 Retire.** `retire_department` with one open visit raises `department_has_open_visits`; after the desk ends it, the retire succeeds.
- **V13 Client.** With a mocked channel, any queue signal refetches both reads; a board fixture renders only `record_number`, `band` and `assignee_name`.

## d. Vocabulary

| Word | Meaning |
|---|---|
| patient · registration | A `patients` row; the act of creating one (`register_patient`), never blocked. |
| record number | The number on the card: `record_number`, one contiguous series per organization. |
| identifier | A `(system, value)` pair on a patient: national id, passport, insurer number, an old record number. |
| visit · arrival | A `visits` row. A visit row is an arrival; it spans days. |
| present · away | `present_at` set or NULL: available to be seen now, or not. Asserted by a person. |
| seen | `seen_at` set: the visit has had a consult. |
| band | The queue's grouping: back, waiting, pending, consult. Derived. |
| BACK | Present, seen before, nothing holding: the patient is back for the doctor. |
| hold · holds | A request that keeps its visit pending: open, in-house, not a prescription, due within 14 days. |
| consult | The clinician's time with the patient inside a visit (`in_consult`). Spec 01's thing is always the consult request or the consult reply. |
| sweep · idle | The hourly job; how long since the visit or its requests last moved. |
| left · lapsed | Arrived and never seen; pending and away for 14 days. |

Banned in the schema: encounter, check-in, appointment, mrn, doctor (as a column), no_show, awaiting, here, acuity, reason for visit, retired (on a patient), queue_number, done_at, opened_at.

## e. Renames

| Draft | Final | Why |
|---|---|---|
| `patient_change_id` (one parameter) | `seen_change_id` + `change_id` | Spec 02's CAS and spec 01's retry key are two different ids; one parameter conflated them and broke the retry. |
| `sweep_visits()` public, no gate | `core.sweep_visits()` | A public function without `require_access` is a door by B9; the runner is the precedent. |
| "present = in the building" | "present = available to be seen now, asserted by staff" | Telemedicine and home visits are visits; the desk must not assert a falsehood to list them. |
| `record_number` bigint identity | `record_number` from `core.record_numbers` per organization | One identity is one series for every organization in the database and a `setval` moves every neighbour. |
| "`assignee_id := caller` when NULL" | on every `in_consult` | Who should see her and who is seeing her are one person once a consult starts; a retired assignee leaves the row. |
| refetch by payload id | any queue signal refetches both reads | The BACK flip arrives as `{entry_id}`. |
| "BACK at the desk when the lab closes the request" (lab walk-in) | stays WAITING; `requests[]` says the result is in | BACK needs `seen_at`, which a reception visit never has. |
| `mark:in_consult` on `doctor` only | `doctor`, `nurse` | The gate is the action, not the title; a nurse-led clinic must set `seen_at`. |
| `no_show` in the additive list | struck | A visit row is an arrival; a no-show never arrived. It is a booking without a visit. |
| pack EXECUTE on `open_visit` when appointments ship | struck | Packs never see visits; the client opens the visit as the desk user and hands the id to the pack. |

## f. Removed

- **The stored `awaiting → waiting` flip, `requeue_visit`, the patient advisory lock in visit functions, FOR UPDATE choreography.** Section a says why; the derivation gives the owner's outcome with no write from the record into an outside table.
- **`HERE·` as a band.** Everything in the queue is present.
- **`scheduled_at`.** Swept to `left` the night it is made, blocking under `visits_open`, wrong for `is_first`.
- **`rebuild_visit`.** A repair path for a bug nobody has; the fold is CI's to check.
- **A `visit_priority` enum, a separate sex enum, `patient_contacts`, `retired_at` on patients, `mrn`, `save_patient`, `find_patients`.** Section k.
- **"A failed registration burns a number"** as a known limit: the counter row is transactional.
- **Private visits** (removed 2026-09-25, approved by the owner): `visits.is_private`, `mark_visit_private` and the visit's "make private" control; `write_entry`'s `wrong_visit` and `visit_needed`, which existed only because privacy lived on the visit; the record reads' hidden visits. Privacy is per note, kept by the department the note was written in (spec 07), so a visit is never private and a transfer changes nothing.

## g. Power for free

- **The return visit is two clicks.** Search → Here, and the band is right without a decision: WAITING for a new arrival, PENDING while results are out, BACK when they are in.
- **A day of results re-queues nobody by hand.** The lab's final reply flips PENDING → BACK on the next read; no visit is written, so nothing can be missed or double-fired.
- **Waits are free.** `seen_at − arrived_at`, `left` counts, lapse rates, first-versus-follow-up by `is_first`, all from two tables with no clinical join.
- **Telemedicine, home visits, group sessions and nurse-led clinics are the same rows.** No mode column, no group id, no role name in the schema.
- **A kiosk, a wall board, a bookings pack and admissions need no ALTER.** One machine user, one client rule, one pack table pointing at `visit_id`, one enum value and one routing key.
- **Merge and erase need no table change.** `patient_id` is literal everywhere, reads use `ANY(ids)`, and the five-table list is fixed now.
- **The hospital is the clinic with more rows.** More departments, more `served_departments`, the same functions, the same sweep.
- **Every new visit function is in the tenant matrix and the signatures file** the day it is added, because both enumerate `pg_proc`.

## h. Amendments to specs 01 and 02

Listed exactly in the amendment note delivered with this appendix. In short — **01**: `read_queue` and `read_to_review` rows carry the request entry's `visit_id`; `change_request` also signals `queue:<visits.department_id>` of that visit; any queue signal refetches both reads; two indexes (`entries (visit_id)`, `requests UNIQUE (organization_id, entry_id)`); `erase_patient`'s order gains the five tables and the deferrable key; words gain present, band, arrival, sweep, registration, identifier, record number. **02**: `write:visit` passes through `served_departments` like `read:queue`; the built-in roles gain the four actions, with `mark:in_consult` on `doctor` and `nurse`; the machine sentence gains the reception exception (kiosk, board); `retire_department` refuses `department_has_open_visits`; the enum `sex` carries `other`; B11's `cron.job` set gains the sweep; the clinic preset ships `served_departments (reception, NULL)` and, with the Laboratory pack, `(laboratory, NULL)`; `read_sent_outside` and "send-outs found per patient" leave the built-later and known-limits lists.

## i. Owner decisions

Listed separately with recommendations: `died_on` now; `nurse` holding `mark:in_consult`; whether the desk may cancel a pending visit; a return within 14 days joining the open visit; machine users at the reception (kiosk, board); one contiguous number series per organization; 12 hours and 14 days.

## j. What the break-tests changed

| Finding | Decision |
|---|---|
| CF2 · T11 registration retried after a lost response | Accept: `register_patient(…, seen_change_id, change_id)`; a change row with `change_id` returns the row before the CAS. |
| CF5 the two 14-day constants race | Accept, wider by one word: a pending visit's idle counts the steps of every request written in it, not only the ones that hold it (a result that just closed the request no longer holds). |
| CF6 the desk cannot learn `request_id` | Accept: `read_patients` and `read_patient` carry `open_requests[]`; Here on such a row passes it. |
| CF12 · T5 assignee left on the row; a retired assignee | Accept: `assignee_id := caller` on every `in_consult`; assignee is routing, never a gate. `save_user` counting open visits declined: nothing is stuck, the next consult overwrites the name. |
| CF14 lab-only walk-in promised a band it cannot have | Accept: it stays WAITING; `requests[]` says the result is in; ended by the desk or the sweep. |
| CF15 · T8 may the desk cancel a pending visit? (two testers, opposite fixes) | Decide: no. Cancel out of `pending` needs `mark:in_consult`; a pending visit has results out and ending it is the clinician's call; the doctor cancels a duplicate's visit. `merge_patients`' `visit_open` returns the open visit ids (accepted). Owner decision 3. |
| CF16 deceased patient invisible at the desk | Accept: `patients.died_on` now; `open_visit` refuses `patient_died`; the hit carries it. Owner decision 1. |
| CF20 return within 14 days with a new complaint | Accept as a known limit: the return joins the open visit; the queue prints `arrived_at`. Owner decision 4. |
| CF21 the phlebotomist's click needs a `visit_id` | Accept: `read_queue` rows carry the request entry's `visit_id` (spec 01 amendment). The 6 pm "still here" noise stays a convention. |
| CF23 · Y7 nurse-led clinic, group sessions | Accept: `nurse` holds `mark:in_consult`; Done loops `mark_visit` over the selected rows. Owner decision 2. |
| CF24 follow-up request from the to-review screen loses the visit | Accept: `read_to_review` rows carry `visit_id`; a request written from a request's screen carries that request's `visit_id`. |
| T1 concurrent steps collide on the pk | Accept: `change_visit` updates first, inserts second; the row lock orders the steps (invariant 3, V3). |
| T2 the refold cannot recover `assignee_id` | Accept: the `in_consult` step carries `{assignee_id}`; row 1's `recorded_at` is `arrived_at` and the first `present_at`. |
| T3 Muhammad / Mohammed below the trigram threshold; dead indexes | Accept: `dmetaphone` of the family name beside trigram; the GIN over the expression alone; the phone as `reverse(digits(…)) text_pattern_ops`. |
| T4 · Y12 retiring a department with open visits strands them | Accept: `retire_department` refuses `department_has_open_visits` (spec 02 amendment). |
| T6 the BACK flip arrives as `{entry_id}` and the visit queue never refetches | Accept (it broke): any queue signal refetches both reads; the id is a hint. |
| T7 `open_visit` marks present while `done` commits | Accept: the presence step is compare-and-set on `ended_at IS NULL`; 0 rows → insert a new visit, never return the old. |
| T9 the sweep as a public no-gate function | Accept: `core.sweep_visits()`, pg_cron only, in B11's job set. |
| T10 consult by visit when a walk-in visit is already open | Accept: `open_visit` adds a missing `request_id` as a routing step; two different ones → unchanged, shown as open work. |
| T12 · Y10 one identity sequence for every organization; a letter in the query skips identifiers | Accept, differently: a transactional counter row per organization (`core.record_numbers`) instead of a per-organization sequence, so a failed registration leaves no gap; identifier values are tried for every query. Owner decision 6. |
| Y1 appointments and no-show | Accept: `no_show` struck; no pack executes a visit function; order inside a band is arrival, slot order is the pack screen's. |
| Y2 inpatient admission; the sweep empties the ward board | Accept: the sweep skips `ward` departments now; a transfer is a routing step `{department_id}` on the same visit when admissions ship; beds in the admissions table. |
| Y3 · Y8 telemedicine and home visits under "in the building" | Accept: present = available to be seen now, asserted by staff. |
| Y4 self check-in; `priority` from a kiosk | Accept: a machine user of the reception may open visits, mark presence and read the queue (spec 02 amendment); `open_visit` writes routine, NULL, NULL for kind `machine`. Owner decision 5. |
| Y5 a waiting-room board sees names and "culture at Laboratory" | Accept as a rule: a board is a machine user with `read:queue` and shows `record_number`, `band`, `assignee_name` only. |
| Y6 ED acuity | Accept as a rule: a `triage` entry in the record; `priority` is its three-level shadow set by routing; a five-level order is the emergency pack's screen. |
| Y9 export without visits cannot be re-imported; bare ids | Accept: erase's list is export's list in reverse; names beside the ids; an import maps departments by name and sets the ids to the importer. |
| Y11 erase of a survivor with a merged-in patient | Accept: the five tables for the survivor and every merged-in patient, drafts first, then the `erasures` row. |

Net schema change against the draft: `patients` gains `died_on`; `record_number` becomes a plain bigint fed by `core.record_numbers`; `register_patient` takes `seen_change_id` and `change_id`; `visit_steps` routing rows may carry `{request_id}` and the `in_consult` row `{assignee_id}`; the sweep is private and skips wards; two indexes on spec 01 tables. No table gains a jsonb junk drawer.

## k. Rejected

The draft's rejections stand: `mrn`; max+1 under the organization lock with an `erasures` tombstone; `organizations.last_mrn`; an importer-typed number; `save_patient`; patient edits as `settings_changes` rows; `find_patients` / `find_duplicates`; the four-digit-word-is-a-year rule; `patient_contacts`; `retired_at`, `reason_text`, `is_identified`, `address_text` now; UNIQUE identifiers across patients; refusing a non-E.164 phone; the mononym trick; `doctor_id`, `seen_by_id`, `done_at`, `last_present_at`, `opened_at`, `changed_at`, `is_present` beside a timestamp; `from_status`, `to_status`, `is_present`, `occurred_at` and `patient_id` on steps; a shipped `rebuild_visit`; `reason` as an enum; the stored flip, `requeue_visit`, the advisory lock and FOR UPDATE choreography; `holds` with `due_at <= now()`; `is_open` generated, `step` + generated status, `open_count`, a band column; `scheduled_at`, `no_show`, `organizations.time_zone`, a nightly job at site midnight, one cron job per organization, a 4 h consult constant; `read_queue` returning both halves, `read_visits`, `queue_number`, `open_consults[]` on search rows, prefetching every present record; `mark:visit`, `mark:present`, `write:queue`, `mark:<step>` per visit step, `read:patients`, `manage:patients` now, `write:request` on receptionist; a `visit_priority` enum, a separate sex enum; `mark_present` as the open call.

Rejected at final:
- **`died_on` deferred.** The desk cannot refuse what no column holds, and search is not a record read; one nullable column now.
- **The desk cancelling a pending visit** (CF15's fix). Pending means results are out; the desk's "own mistake" ends at the consult. The doctor cancels a duplicate's visit in one click, and merge waits.
- **A per-organization sequence** (Y10's fix) and **an identity column** (the draft). The first burns a number on every failed save; the second is one series for every organization in the database. A transactional counter row per organization is one UPDATE with neither problem.
- **`save_user` counting open visits in `open_assigned`.** Assignee is a hint; nothing is stuck; the name leaves the row on the next consult.
- **A fresh visit row on a return within 14 days** (widening `pending → done` to `write:visit`). The desk would be closing visits whose results are out.
- **A `group_id` on visits, a `mode` column (video, phone, home), a five-level `priority`, a ward exemption column.** The session is n rows; the mode is a fact about the consult (an entry `data` key); acuity is a triage entry; the ward exemption is a WHERE in the sweep.
- **`sweep_visits` public "because it is harmless".** Bounded effect is still a door by B9's definition.
- **Refetching by payload id.** Two channels' worth of routing logic on the client for a 1–3 ms read.
- **Names rejected at final:** `patient_change_id`, `find_patient`, `check_in`, `arrive`, `mark_arrived`, `visit_events`, `is_here`, `booked_at`.

## l. Known limits

- **A mononym needs both names.** The desk repeats or invents one; a family-first format is a later organization row.
- **No structured next of kin, address or e-mail.** `contact_text` as typed. Additive columns or a pack table when a screen needs them structured.
- **A forgotten consult with nothing out** (the doctor never pressed Done, nothing holds) is swept to pending, away at 12 h, then lapses at 14 d, invisible in between. A patient returning within those days lands BACK, which is right.
- **A return within 14 days joins the open visit, whatever the reason.** Knee pain on day 10 lands in the culture's visit; the queue prints `arrived_at` so the doctor sees the visit is ten days old. The desk cannot start a fresh row without a doctor closing the old one.
- **A second attendance on one consult is a second visit.** A consult request answered over two visits carries `request_id` on the first; the second is a walk-in with the request still open.
- **Merge waits for open visits to close.** `visit_open` names them; a pending duplicate is closed or cancelled by a clinician first.
- **A lab-only walk-in never turns BACK.** Reception visits have no `seen_at`; the desk reads `requests[]`.
- **A patient who says "staying" and leaves** sits in PENDING or BACK until the sweep, 12 h later. The phlebotomist's question is the only guard.
- **Idle is 12–13 h and 14 d–14 d 1 h,** the sweep being hourly.
- **`dmetaphone` is English phonetics.** It catches the transliteration case the spec names; the warning is a hint and never a block.
- **No deceased marker beyond `died_on`.** A patient known to have died only in the record (a note, a problem) still searches as live until the desk sets `died_on`.
- **Presence is trusted.** A kiosk's Here is a machine's assertion; a patient who leaves after checking in is WAITING until swept or marked away.
- **The queue is per department.** A reception serving four clinics makes four reads and merges; there is no cross-department order.
- **A visit carries no clinical fact,** so "why is he here" is on the screen only through the record's entries, which the desk does not read.
