# 04 · The core entry types

Status: **locked** · 2026-09-22 · builds on 01–03; adds no table to the record · amended 2026-09-22 (core audit): the entry header and `department_id` on every write, `repeat`, bulk review, five errata

## In one sentence

Nine entry types are enough to run a clinic: a request and its result, a prescription, a note,
vitals, a problem, an allergy, a list review, and the strike; each is one write function that
shapes `data`, writes one `display_line`, and hands the rest to `write_entry`.

- Every type is a row in `entry_types` with `pack` NULL (core), and one function `write_<type>`.
- `data` is validated by the type's JSON schema (shipped in code, versioned by `schema_version`);
  the client's TypeScript types are generated from the same schemas.
- What a type *does* is its behaviours (spec 01): request · reply · values · current · files.

## Seven rules

1. **One function, one type, one shape.** No type has a mode that changes its columns; a
   prescription's `action` changes what the updater does, not what the entry is.
2. **The display line is written once, by the function, from `data` only,** ≤ 120 characters,
   deterministic: the same `data` always gives the same line (golden fixtures prove it).
3. **Codes are strings of the form `system:code`.** Values' codes must exist in `codes` (they
   trend); problem and drug codes are validated by form only and copied with their name.
4. **Nothing clinical is refused for safety reasons.** An allergy match, a duplicate request, a
   dose out of range: the screen warns inline; the function writes. Refusals are structural only.
5. **A list row is born with its first entry and keeps that id for life.** Corrections replace
   entries; the row stays; the updater replays.
6. **Reviewed is a fact you write, per list, per Done** — one `list_review` entry, not one per drug.
7. **Free text lives in `text` / `*_text`; names in `*_name`; everything else is a code, a
   number, a date or a choice.** CI scans every fixture.

## The nine types

| type | behaviours | replies to | updater | display line |
|---|---|---|---|---|
| `request` | request | — | — | `CBC` · `Cardiology consult — palpitations?` |
| `result` | reply · values · files | request | — | `CBC · Hb 9.2 ↓ · WBC 14.1 ↑ · Plt 210` · `CXR · No acute change` |
| `prescription` | current · request (when a dispensing service exists) | — | `patient_medications` | `Metformin 1 g BD` · `Metformin 500 mg → 1 g BD` · `Stopped metformin — GI upset` |
| `note` | reply (kind `consult_reply`) · values (from form fields) · files | consult request | — | `Progress · Feels well, polyuria settled…` |
| `vitals` | values | — | — | `BP 148/92 · P 78 · Wt 84.0` |
| `problem` | current | — | `patient_problems` | `Type 2 diabetes — added` · `Hypertension — resolved` |
| `allergy` | current | — | `patient_allergies` | `Penicillin — rash, moderate` · `Penicillin — refuted` |
| `list_review` | current | — | `patient_list_reviews` | `Medications reviewed · 4 continued` · `No known allergies` |
| `entered_in_error` | — (replaces) | — | replays the replaced entry's list | `Struck: wrong patient` |

### The header every write takes

```
write_<type>(id, patient_id, visit_id, department_id,          -- where it is written; the client holds the choice
             replaces_id, occurred_at, responsible_id,         -- nullable; occurred_at NULL = now (live writes send the
             source, source_key, stated_author_name,           --   age of the act, an absolute time only when picked by hand)
             stated_recorded_at,                               -- source: staff | outside; outside carries the stated author and time
             …the type's own parameters…)
```

- `department_id` is required (the CHECK on `entries`). The gate department is this parameter
  for standalone entries and requests, and the request's `to_department_id` for replies.
- `replaces_id` makes the write a correction: same type (`entered_in_error` excepted), inherits the
  replaced entry's patient and request, display line prefixed `Corrected:`, re-sets review.
  Without it a mistyped value could only be struck as an error.
- `source = outside` is how a letter, a referral summary or a PDF result from elsewhere is filed:
  the caller is the filer (`author_id`), the stated author and time live in `data`.
- `write_set(department_id, items[])` passes the header through to every item.
- `patient_medications.prescriber_id` and `requests.requester_id` are `coalesce(responsible_id, author_id)`.

### request

```
write_request(…header…, service_id, priority, due_at, question_text, problems[], to_department_id)
data     service {id, code, name, reply_type, department_name} · priority · due_at · question_text · problems[]
```
- `to_department_id` comes from the service; it is a parameter only for a service with
  `department_id NULL` (outside), where the requester names the destination.
- Refuses: service retired or not offered to the caller's department (spec 02 `served`),
  `patient_merged`, `patient_died`. `question_text` is allowed on any request (an indication on
  an X-ray sent outside).
- A template expands to N `write_request` calls inside one `write_set`.
- `write_entry` takes the destination `{to_department_id, priority, due_at, needs_review}` from
  the type function and writes the request's initial `sent` row itself — never through the gated
  step path — so a pack-written request needs no `mark:sent`.

### result

```
write_result(…header…, request_id, values[], text, is_final, not_done, not_done_reason_text, needs_review, files[])
data     service {…copied from the request} · values[] · text · not_done · not_done_reason_text
values   [{code, name, value_number, value_text, unit, reference_low, reference_high, critical_low, critical_high, flag, occurred_at}]
```
- Values are pre-filled from `service_fields` at write time and frozen. `flag` is computed once:
  `LL`/`HH` outside critical, `L`/`H` outside reference, `A` for an abnormal choice/text, else NULL.
  `entries.flag` is the worst of them. A reply sets `review_needed_at` when `is_final` or any
  flag is abnormal, and on a correction, a strike or a decline (spec 01); `HH`/`LL` turns the
  count red. `needs_review = false` (a routine dose, a routine dispense) leaves it alone.
- A value whose unit differs from `codes.unit` stays in `data`, is shown, and does not trend.
- Caller must hold `write:result` in the request's `to_department_id`. A closed request never
  refuses a reply. `is_final = false` leaves the request `replied`; a later final closes it.
- **Outside result** (a PDF from elsewhere): `write_result` with `request_id NULL`, `source =
  outside`, the header's stated author, `files[]`; `patient_id` and `visit_id` come from the header;
  the caller's own ranges and flags are kept as given.
  The client writes it in a set with a `request` to the clinician's department (`Review result`).

### prescription

```
write_prescription(…header…, action, medication_id, drug {code, name, form, strength},
                   dose_number, dose_unit, route, frequency, prn, prn_reason_text, duration_days,
                   quantity, repeats, instructions_text, problems[], stop_reason_text)
action   start | repeat | change | stop
```
- **repeat**: the same script again, unchanged — the commonest act in a chronic clinic. The list
  row keeps everything and bumps `latest_entry_id`; a dispensing request is created as for `start`.
- **start**: a new `patient_medications` row whose `id` is this entry's id. **change**: the row
  named by `medication_id` gets the new dose, route, frequency; the entry records `from` and `to`.
  **stop**: the row gets `stopped_on`, `stop_reason_text`, `status = stopped`, and the row's open
  dispensing request, if any, is closed `done` with the reason.
- A prescription is a **request** exactly when the organization has a live `dispense` service
  the caller's department is served by; then `requests` gets a row to that department (Pharmacy
  pack replies with `dispense`). Without one it is a paper script: no request, no queue.
- Refuses: `repeat`/`change`/`stop` of a row that is not this patient's or is already stopped; `start` with
  neither code nor name; a `frequency` outside the core set (`OD BD TDS QDS q4h q6h q8h q12h
  weekly monthly PRN once stat`); `prn` without `prn_reason_text`.
- Never refuses an allergy match or an interaction: the screen underlines in red.

### note

```
write_note(…header…, kind, text, fields, problems[], reply_to_id, is_final, files[])
kind     progress | history_physical | plan | procedure | nurse | consult_reply | discharge | letter | other
data     kind · text · fields {…} · values[] (numeric fields that carry a code) · problems[]
```
- `fields` is the filled form of a structured template (spec 02 tier 2); numeric fields with a
  code become `values[]` and trend. A note with no template has only `text`.
- `kind = consult_reply` must carry `reply_to_id` to an open consult request addressed to the
  caller's department; `is_final = true` closes it. Any other kind refuses `reply_to_id`.
- Packs needing structured clinical content with its own screen add a **type**, not a kind.

### vitals

```
write_vitals(…header…, systolic, diastolic, pulse, respiratory_rate, temperature, spo2, weight, height)
```
- At least one field. Codes are fixed LOINC (`loinc:8480-6` systolic … `loinc:29463-7` weight);
  BMI (`loinc:39156-5`) is computed and added when both weight and height are present.
- No flags in core: adult and paediatric thresholds differ, and a wrong red is worse than none.
  The screen colours by its own thresholds; a paediatrics or emergency pack may write flags.

### problem

```
write_problem(…header…, action, problem_id, code, name, status, onset_on, resolved_on, text)
action   add | update | resolve
```
- `code` is `icd10:E11` or NULL (uncoded allowed, flagged in the list). `onset_on` is a partial date.
- Row id = the `add` entry's id. `resolve` sets `resolved_on` and `status = resolved`; the row stays
  so drugs bound to it can be shown for deprescribing.

### allergy

```
write_allergy(…header…, action, allergy_id, substance {code, name, class_code},
              kind, reactions_text, severity, certainty, onset_on)
kind       allergy | intolerance        severity  mild | moderate | severe | unknown
certainty  confirmed | suspected        action    add | update | refute
```
- `refute` keeps the row with `status = refuted` (shown struck through, never hidden: the next
  clinician must see it was considered). `class_code` (`penicillin`, `sulfonamide`, `nsaid`…) is
  what the prescription screen matches against.

### list_review

```
write_list_review(…header…, list, outcome, items[])
list     medications | problems | allergies      outcome   reviewed | none_known
```
- `reviewed` with `items[]` = the row ids the clinician confirmed (the ✓ marks, sent once on
  Done). `none_known` is refused while the list has active rows. The updater writes one
  `patient_list_reviews` row per (patient, list): `reviewed_at`, `reviewed_by_id`, `entry_id`.
- "NKDA" is therefore a fact with an author and a date, never an empty list.

### entered_in_error

```
write_entered_in_error(id, replaces_id, department_id, reason_text)
```
- The one type whose `type` differs from what it replaces. Refuses a request that still has live
  replies, and an entry already replaced. If the struck entry kept a list, that list is replayed
  for that patient (spec 01 rule 4). Its `pack_calls` row lets Billing void what it made.

## The patient lists

```
patient_medications  id (= start entry id) · organization_id · patient_id · drug_code · drug_name · form · strength
                     dose_number · dose_unit · route · frequency · prn · prn_reason_text · instructions_text
                     problem_id · started_on · stopped_on · stop_reason_text · status (active | stopped)
                     latest_entry_id · prescriber_id
patient_problems     id · organization_id · patient_id · code · name · status (active | resolved | inactive)
                     onset_on · resolved_on · latest_entry_id
patient_allergies    id · organization_id · patient_id · substance_code · substance_name · class_code
                     kind · reactions_text · severity · certainty · status (active | refuted) · latest_entry_id
patient_list_reviews patient_id · list · reviewed_at · reviewed_by_id · entry_id     pk (patient_id, list)
```

Updaters are pure (spec 01): `update_patient_medications(entry)` etc. Replay order is `recorded_at`;
a replaced entry is skipped and its replacement applied at the original's position.

## `read_record` — the chart in one call

`read_record(patient_id, department_id)`; the department is the one the screen is showing.

```
{ patient        banner: names, record_number, sex, born_on, age, died_on, merged_into_id
  visit          the caller's department's open visit for this patient, or null
  allergies      active + refuted rows · allergy_review {reviewed_at, none_known}
  problems       active rows · problem_review
  medications    active rows · medication_review
  open_requests  requests rows with the entry's display_line, service name, step, is_holding
  entries        the last 30 timeline cards: request rows (with reply_line, reply_flag) and
                 standalone entries — {id, type, occurred_at, author_name, department_name,
                 display_line, flag, is_final, replaced_by_id}
  latest_vitals  the newest vitals entry's values
}
```
Trends are a second call, `read_values(patient_id, codes[])`, because which codes matter is the
screen's business (the IM pack asks for HbA1c and creatinine; obstetrics for fundal height).
`read_entries(patient_id, before_at, before_id, types[])` pages the rest. `read_entry(id)` opens
one entry's full `data`. `mark_reviewed(request_ids[])` clears review in bulk — a clinic doctor
sees a hundred results a day and must clear a screenful in one keystroke.

## `write_set`

`write_set(department_id, items[])`, each item `{function, params}` with its own client-minted id; one
transaction, all-or-nothing, `written_with_id` = the first item's id on every member. This is
what Done sends: the note, the list reviews, the prescriptions and the requests of one consult.

## Decisions taken

The entry header on every write, `department_id` chosen by the client and passed on every
call · `repeat` · bulk `mark_reviewed` · review on every final or abnormal reply, red on critical
· `question_text` on any request · Prescription as one type with `action` · no vitals flags in core · note kinds fixed, packs add
types · the core frequency set · display lines in English in v1.

## Decide-now items

Nine types, no more in core · `prescription` as one type with `action` · the core frequency set ·
vitals codes fixed to LOINC, BMI computed at write, no vitals flags in core · note kinds fixed,
packs add types · values' codes must exist in `codes`; drug and problem codes by form only ·
list rows keyed by their first entry · `read_record(patient_id, department_id)` shape above · display lines in English in
v1 (a `display_line` is data; translation is a client concern later).

## Written as rules now, built later

`hold`/`resume` on a medication (inpatient) · structured dose sigs for e-prescribing · sex- and
age-specific ranges (`service_field_ranges`, Laboratory pack) · interaction data (a pack) ·
`record_merged` type · patient-authored entries through `patient_access`.

## Known limits

One drug per prescription entry (a regimen is N entries in one set) · no unit conversion · a
note's form fields trend only when the field carries a code · uncoded problems do not match
protocols · `display_line` is not translated · vitals carry no flag.
