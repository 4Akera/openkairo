# 03 · Patients and visits

Status: **locked** · 2026-09-22 · builds on 01 and 02 and amends each ([03-patients-visits.amendments.md](03-patients-visits.amendments.md), applied)
Full reasoning, invariants and break-test decisions: [03-patients-visits.appendix.md](03-patients-visits.appendix.md)

## In one sentence

A patient is a row the desk finds in one box; a visit is an arrival at a department, moved only
by steps; the queue is a query over the visits that are present; and nothing in the record ever
depends on any of it.

- A **visit** spans days. **Present** is the only day-bound thing: available to be seen now (in
  the building, on the line, at the door of a home visit), asserted by staff, never by a status.
- **BACK** is derived, never stored: present, seen before, nothing still out.
- A visit holds no clinical fact: dropping any of its columns changes no reading of the record.

## Seven rules

1. **A visit row is an arrival.** A return joins the open visit; nothing is ever booked into `visits`.
2. **Status has one writer and `visit_steps` is its history.** Every move is compare-and-set;
   `change_visit` updates the row first, and its row lock orders the steps.
3. **BACK is a derivation, not a flip.** A request closing signals the visit's department and
   writes no visit; there is no stored transition to miss on a cancel, a merge or a race.
4. **Presence is a fact a person asserts,** never touched by `in_consult` or by a request step.
5. **Registration never blocks.** Duplicates warn; identifiers are not unique; the desk decides.
6. **Search is not a record read.** It returns the row, identifiers, open visits and open consults.
7. **The two sides never wait on each other.** No visit function takes the patient lock, no
   record function takes a visit row lock; `entries.visit_id` is checked by a key and nothing else.

## Tables

| Kind | Tables | Rule |
|---|---|---|
| Outside the record (spec 01) | `patients` · `patient_identifiers` · `visits` | Mutable; reachable only through functions; composite tenant keys on every link |
| History | `visit_steps` · `patient_changes` | Insert-only under the trigger of `request_steps`; erased with the patient |
| Counter | `core.record_numbers` | One row per organization: the last card number issued; written by `register_patient` under its row lock |

```
patients            id (client-minted, retry key) · organization_id · record_number (the card; one series per organization; never typed)
                    given_name · middle_name null · family_name · sex (female | male | other) · born_on · died_on null (partial dates)
                    phone_text null (searched by its digits) · contact_text null · merged_into_id null (depth 1) · created_at
patient_identifiers organization_id · patient_id · system ('national_id', 'insurer:<name>', 'record_number:<old>') · value   pk (patient_id, system, value)
patient_changes     id (client-minted, retry key) · organization_id · patient_id · user_id · changes {column: [old, new]} · recorded_at
visits              id (client-minted) · organization_id · patient_id (literal) · department_id (responsible) · request_id null (the consult it answers)
                    assignee_id null (routing, never a gate) · status · priority (request_priority) · is_first · arrived_at
                    present_at null (NULL = away) · seen_at null (the first in_consult, once) · ended_at null (open ⇔ NULL)
visit_steps         organization_id · visit_id · position · status · actor_id null (NULL = the sweep) · reason null · changes null · recorded_at   pk (visit_id, position)
```

- Names as typed, trimmed; blank given or family refused; an age typed at the desk is stored as
  its year. An identifier is compared exactly; a second patient with the same one is the strongest
  warning, never a block. `patient_changes` is `settings_changes`' shape, kept apart so patient
  names never sit in the settings history.
- `status`: waiting · in_consult · pending · done · left · lapsed · cancelled. `is_first` = no prior
  seen visit in this department, stored at open. A step row is the visit after the change; row 1
  is `waiting` with `{request_id, assignee_id, priority, is_first}` and its `recorded_at` is
  `arrived_at`; a presence row carries `{present_at}`, `in_consult` `{assignee_id}`, routing what
  moved; `reason` required on cancelled; no `occurred_at`: the click is the act. CI refolds.

## Functions

```
register_patient(id, given_name, middle_name, family_name, sex, born_on, died_on, phone_text, contact_text, identifiers[], seen_change_id, change_id)   write:patient
read_patients(organization_id, query, born_on null, phone_text null) · read_patient(patient_id)                    read:patient
open_visit(id, patient_id, department_id, priority, assignee_id null, request_id null)                              write:visit
mark_present(visit_id, is_present) · mark_visit_routing(visit_id, assignee_id, priority, is_first)                 write:visit
mark_visit(visit_id, from_status, status, reason null)                                                              write:visit · mark:in_consult
read_visit_queue(department_id) · read_sent_outside(organization_id, department_id null)                           read:queue
private   core.change_visit · core.holds(visit_id) · core.sweep_visits() (pg_cron, hourly; no public form)
```

- **register_patient** upserts on `id`. A `patient_changes` row with `change_id` exists → the
  row, nothing changes; a row newer than `seen_change_id` → `changed_since_read`. Mints
  `record_number` on insert only; never a duplicate, never MFA — so not a `save_…` (spec 02).
- **read_patients**: the query is tried as an identifier value and, all digits, as a record number
  and a phone suffix; then over unaccented lower-cased name parts by trigram similarity or an
  equal `dmetaphone` of the family name (Mohammed / Muhammad). Exact hits first, 20 rows. A hit:
  the row, `identifiers[]`, the latest change id, `open_visits[]` and `open_requests[]` (open
  consults to an `is_visited` department) for departments the caller may `read:queue`; a
  merged-away hit is its survivor. The duplicate warning is this call from the form.
  **read_patient** adds every visit and the changes. Neither writes a `record_reads` row.
- **open_visit** is the Here button and needs no decision at the desk: this `id` → return it; an
  open visit for (patient, department) → mark present if away (compare-and-set on `ended_at IS
  NULL`; 0 rows → insert) and take a `request_id` it lacks as a routing step; else insert waiting,
  present, `is_first` computed; a `unique_violation` on `visits_open` re-reads. A `machine` caller
  writes routine, NULL, NULL. Refuses `patient_merged` (with the survivor), `patient_died`,
  `not_visited`, `not_yet` (ward), `department_retired`, `request_not_open`, `wrong_department`, `wrong_patient`.
- **mark_present** and **mark_visit_routing**: compare-and-set on `ended_at IS NULL`, one step,
  none when nothing changes; `visit_ended` otherwise. **mark_visit**: compare-and-set on
  `from_status`; `visit_moved` with the current row (the second doctor sees who took the
  patient), `illegal_move`, `reason_missing`. Terminal statuses set `ended_at`, clear `present_at`.
- **read_sent_outside**: open requests from that department (NULL = every) to an `is_outside`
  destination, by `due_at`; ends spec 02's "send-outs found per patient".

| From | To | Gate | Effect |
|---|---|---|---|
| — | waiting | `write:visit` (`open_visit`) | row 1, present |
| waiting · pending | in_consult | `mark:in_consult` | `seen_at` once; `assignee_id := caller` |
| in_consult | waiting | `mark:in_consult` | back to the queue |
| in_consult | done | `mark:in_consult` | the server decides: `holds > 0` → pending, else done |
| pending | done | `mark:in_consult` | closes it whatever is out; results still reach to-review |
| waiting | done | `write:visit` | nobody consults (results handed over at the desk) |
| waiting, unseen | left | `write:visit` or the sweep | arrived, never seen, gone |
| waiting · in_consult · pending | cancelled | `write:visit`; out of in_consult or pending `mark:in_consult`; reason | opened by mistake; counts for nothing |

**Actions:** `read:patient` every built-in role · `write:patient` receptionist, nurse, doctor ·
`write:visit` receptionist, nurse, technician, doctor; passes on a served department ·
`mark:in_consult` doctor, nurse (the gate says who may move; the screen says who does). Reception
is clerical by the gate: register, open, Here, away, urgent, left, close a visit nobody consults,
cancel its own mistake; never into or out of `in_consult`, never out of `pending`. A machine user
of a reception may open, Here and read the queue. The department is taken from the visit.

## The queue

`read_visit_queue` is one query over `visits WHERE department_id = $1 AND present_at IS NOT
NULL`: band = **consult** when `in_consult` · **waiting** when waiting ∧ unseen · **back** when
waiting ∨ `holds = 0` · else **pending**; ordered back, waiting, pending, consult, then priority,
then `present_at` (back, pending) or `arrived_at`.

- **Holds.** A request holds its visit while open (`held` included), addressed inside the
  organization, not a prescription, due within 14 days: `requests ⋈ entries` over `entries (visit_id)`.
- **Row:** name parts, `record_number`, status, band, priority, is_first, assignee and name, the
  times, request_id and whether it is open, `requests[] {request_id, service_name,
  to_department_name, step, is_holding}`. A board shows `record_number`, `band` and `assignee_name`
  only. A reception calls once per served department and merges. Order in a band is arrival.
- **The sweep** (`core.sweep_visits()`, hourly, wards skipped; idle = now − the latest of the
  visit's steps and, for a pending visit, the steps of the requests written in it): waiting ∧
  unseen ∧ idle 12 h → left · seen ∧ open ∧ (present ∨ status ≠ pending) ∧ idle 12 h → pending,
  away · pending ∧ away ∧ idle 14 d → lapsed. One step each, one signal per department; a rerun
  changes nothing. No time zone: idleness needs none and evicts nobody mid-consult.
- **Consult as visit.** `open_visit(request_id)` needs the request open, addressed here, for this
  patient; the consult screen pre-fills `reply_to_id := visits.request_id` (never inferred). The
  final reply closes the request by the fold; the requester's visit shows BACK by derivation and
  its department is signalled. `mark_visit(done)` never closes the request; the queue prints
  "consult not answered" while it is open. The consult request does not hold the consult visit.
- **A lab-only walk-in** is a visit at the reception (`is_visited`): never `in_consult`, WAITING
  until its `requests[]` says the result is in; ended waiting → done by the desk or left by the sweep.
- **Indexes:** `visits_open UNIQUE (patient_id, department_id) WHERE ended_at IS NULL` ·
  `visits_present (department_id) WHERE present_at IS NOT NULL` · `entries (visit_id) WHERE
  visit_id IS NOT NULL` · the search indexes (appendix, section b).
- **Realtime:** `queue:<department_id>` (spec 01). `change_visit` sends `{visit_id}` inside the
  transaction; `change_request` also signals the department of the request entry's visit. Any
  signal on a queue channel refetches both `read_queue` and `read_visit_queue`, debounced.

## The boundary with the record

1. `entries.visit_id → visits` is set by the client at write time and checked by the composite key
   `(patient_id, visit_id)` and nothing else; `write_entry` never reads `visits`; no record read
   takes or joins a visit. A request written from a request's screen carries that request's
   `visit_id`, which `read_queue` and `read_to_review` rows carry (spec 01, amended). Golden test:
   a note into an ended visit of the same patient succeeds; into another patient's visit is refused.
2. `visits.request_id` is set by `open_visit`, read by the queue, and closes nothing.
   `holds(visit_id)` is the one query the operational side runs on the record: STABLE, read-only.
   `change_request` signals and never writes a visit; `rebuild_record` never touches visits;
   `is_first` comes from `visits.seen_at`, never from entries.
3. Today's fields are vitals and note entries written with `visit_id` through `write_set`; acuity
   is a `triage` type an emergency pack ships, and `priority` its three-level shadow set by routing.
4. Packs never see visits: no `pack_calls` row on a visit change; a consultation charge follows
   the doctor's entry; no pack role holds anything on `visits` or `visit_steps`; no pack executes
   a visit function — the client calls `open_visit` as the desk user and hands the id to the pack.
5. Locks: none across the boundary. `visits_open`, compare-and-set and the row lock in
   `change_visit` are the whole concurrency story.
6. Erase and export share one list, for the survivor and every patient merged into it:
   `patient_changes` · `visit_steps` · `visits` · `patient_identifiers` · `patients`.
   `erase_patient` deletes drafts and the record tables, then this list, then writes the `erasures`
   row (`visits.request_id`'s key is deferrable, so the circle deletes in one transaction). Export
   writes the list in reverse with names beside every user and department id; an import elsewhere
   maps departments by name and sets those ids to the importer.

## Naming

Suffixes and abbreviations as spec 01. Words: patient · registration · record number ·
identifier · visit · arrival · present · away · band · consult (the clinician's time with the
patient inside a visit; spec 01's thing is always the consult request or reply) · sweep · idle.
Not used in the schema: encounter, check-in, appointment, mrn, doctor (as a column), no_show,
awaiting, here, acuity, reason for visit, retired (on a patient).

## Decisions taken

`died_on` now · nurses hold `mark:in_consult` · the desk may not cancel a `pending` visit · a
return within 14 days joins the open visit · kiosk and board as a bounded reception machine user
· one record-number series per organization · 12 h and 14 d as constants · **visits and requests
stay two tables and two words** (they share the step shape, the queue screen and the channel; a
visit is a whereabouts fact, a request is a clinical one).

## Decide-now items (already reflected above)

`record_number` from a transactional counter row per organization (a legacy restart is one
UPDATE; old numbers are identifiers) · partial-date text with one immutable `age_on(born_on,
date)` · three sex values · `patient_changes` from the first patient, `change_id` client-minted ·
`visits` as the fold of `visit_steps`, one private writer that updates before it inserts · seven
statuses · no `scheduled_at` ever · every signal refetches both queues · `visits_open` as an index
· 12 h and 14 d as constants, wards skipped, a request step restarts a pending visit's clock ·
four action rows, the served widening of `write:visit`, nurse holds `mark:in_consult` · no
contacts table.

**Meanings that never change** (an additive nullable column is a permitted migration; these are
not): a visit row is an arrival · `department_id` is the department responsible · presence is a
fact a person asserts, never touched by `in_consult` · `status` has one writer and `visit_steps`
is its history · BACK is derived · ids are client-minted · a visit carries no clinical fact.

## Written as rules now, built later

`merge_patients` (refuses `visit_open` with the open visit ids; reads use `patient_id = ANY(ids)`;
`manage:patients`, MFA) · `unmerge_patient` · `erase_patient` (spec 01) · a bookings pack whose
`bookings` point at the visit they became; a no-show is a booking that never became a visit ·
admissions: `admitted` as one `ADD VALUE`, a transfer as a routing step `{department_id}` on the
same visit, beds in the admissions table by `visit_id` · a kiosk or a board as a machine user of
the reception · additive nullable columns with no rule on them: `address_text`, `gender_name`,
`photo_path`, `email` (with `patient_access`), `is_restricted`, `language_name`.

## Known limits

A mononym needs both names · no structured next of kin · a forgotten consult with nothing out
stays open, invisible, for 14 days, then lapses · a return within 14 days joins the open visit,
whatever the reason; the queue prints `arrived_at` · a second attendance on one consult is a
second visit · merge waits for open visits to close · a lab-only walk-in never turns BACK · a
patient who says "staying" and leaves sits in the queue until the sweep · idle is 12–13 h ·
`dmetaphone` is English phonetics; the warning is a hint · no deceased marker beyond `died_on`.
