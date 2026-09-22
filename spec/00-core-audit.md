I've verified the cited lines against the specs and appendices. Writing the report now.

# openCare — core completeness audit

Read: `spec/README.md`, `01-record.md`, `02-organization.md`, `03-patients-visits.md`, `04-entry-types.md`, `05-screens.md`, `06-pack-contract.md`, plus the appendix lines the readers cite. Every quote below was checked against the file.

---

## 1 · Verdict

**Is the core complete?** The *spine* (01, 02, 03, 06) is complete for the internal-medicine clinic and for a multi-department hospital: I could not find a clinical setting or workflow the system claims to serve that the 21 `entries` columns, `requests` as a fold, replies at depth 1, `replaces_id`, `entry_values`, the visit/queue side or the two pack reactions cannot carry. The *surface* (04, and 05 on top of it) is not yet complete as written: the nine `write_<type>` signatures omit four things the spine promises and Phase 0 needs on day one. No function says which **department** an entry is written in (the CHECK `department_id IS NOT NULL OR source IN ('patient','import')` makes it mandatory, and the only mechanism 05 names for it is on 02's rejected list). No function except `write_entered_in_error` takes **`replaces_id`**, so the same-type correction the appendix, fixture 23 and 06 test 7 depend on has no public door. `write_result` with `request_id NULL` (the outside-PDF path) has **no `patient_id`**, so it cannot say whose result it is. `responsible_id` and `occurred_at` (or age), both "from day one" in 01, are on no signature except `write_vitals`. Beside these are five one-line contradictions a builder reading 04 literally would build wrong (the HH/LL review predicate, the `question_text` refusal, `pack = 'core'`, `flowsheets`, `service.kind`). All of it is signature and wording; no table changes; a day of editing. After that, seven additive items should land before the first clinic goes live (outside-prescribed medicines, the frequency set, closing a send-out, unsent-work visibility, prefetch scope, outbox order, request text); everything else is a pack or a later release. What is *missing* for a hospital and cannot be added by any pack under 06 is exactly two things: an outbound door (nothing can leave the database from a pack) and a cross-patient read (registers, recalls, KPIs). Both are additive core functions, both already planned in words, neither gates Phase 0.

**Is this what Epic does?** No, and it should not try to be. What maps: Chronicles contacts → `entries` (but insert-only and self-contained instead of mutable with an audit trail); ORD order + result → request/reply, generalised to consults, declines, co-signature and outside results; the In Basket Results folder → `read_to_review`; Grand Central arrival → `visits`; Storyboard → the banner; SmartSets → `templates`; Foundation System → presets as idempotent rows; Bridges inbound → the after-write runner. What Epic has that this lacks: Cadence, Willow MAR, Resolute charge capture, BPAs, MyChart, Care Everywhere, Bridges outbound, Clarity — all deliberately packs or later. Three of those absences matter before go-live and are not Epic-envy: chart-completion (unsigned work is invisible to everyone but its author), an outbound door (Pharmacy and Billing cannot send an e-Rx or a claim from anywhere a pack can reach), and a cohort read (the IM clinic will want a diabetes recall list inside a year). What this does that Epic cannot: a ten-year-old result renders exactly as released with no settings join; one review loop instead of a folder per message class; a pack boundary Postgres proves rather than a code review promises; a module switched off per organization with its history still rendering; presence derived, never a stored status to go stale; no money anywhere in the record; one atomic idempotent Done.

**Is the spine abstract and powerful?** Yes, by the numbers. Thirty stress scenarios (dose given late, transfusion with unit tracking, vaccine lot, growth chart, partogram, consent with signature, handover, research enrolment, device stream, 1998 scanned record, standing order, infusion, DNACPR, translated document, appointment, bed, transfer, early-warning score, pathway, cohort query, GP letter, patient message, mother–baby link, twins, AI-drafted note, shared care…): **12 fit** with data keys, types, steps, lists and packs only; **17 strain**, each expressible by a convention or an additive change; **1 breaks** (a shared-care plan across organizations), by design. Not one needs a change to the 21 columns, to `requests`, to reply depth 1, to replace, to `entry_values` or to the two pack reactions. Every strain sits at one of four edges, never inside: (a) the nine core write functions take no extension beyond `note.fields`; (b) the client shell has one slot (`servicesColumns`); (c) packs are blind to time and to visits and may not ship global codes; (d) the outside-department gate widens only `read:queue`. All four are additive, three of them client or gate code. The power is that single rules generate whole modules: rule 6 gives MAR, PRN, partial dispenses, refills, preliminary cultures and home monitoring with no task table; one nullable column is the whole inbox; one column update is the whole mutation story; derived lists cannot rot. The cost of the abstraction is that the surfaces are thinner than the spine, and that is where every real gap in this report sits.

---

## 2 · Before Phase 0

Only items that change a locked signature or a rule Phase 0 builds and freezes. Everything here is zero build delay; most are a sentence.

### A · Every write must say where it was written

- **Spec 04**, all nine signatures, e.g. `write_note(id, patient_id, visit_id, kind, text, fields, problems[], reply_to_id, is_final, files[])` — no `department_id`. **Spec 05**: "the choice is `staff_active_department` (spec 02)". **Spec 02 appendix k**: "Names rejected at final: … `staff_active_department`" and "server-side 'where am I'". **Spec 03 boundary 1**: "`write_entry` never reads `visits`".
- **Smallest amendment:** every `write_<type>` and `write_set` take `department_id` after `patient_id, visit_id` (one value per set); `read_record(patient_id, department_id)` the same; the client passes the department it is showing, held in `localStorage`, never on the server; `require_access` uses it; `write_entry` copies it; `drafts` gains the column ("committing a draft is a column-for-column copy"). Fix 05's sentence to say "a client-held choice".
- **Why now:** Phase 0 cannot insert one staff fixture entry without it (the CHECK). Adding a parameter to nine public functions after B17's golden file exists is a `removed` line per function (a defaulted overload makes the old call ambiguous in Postgres) plus an outbox shim for open tabs.

### B · The entry header the spine promises and the signatures omit

- **Spec 04**: only `write_entered_in_error(id, replaces_id, reason_text)` takes `replaces_id`; only `write_vitals` takes `occurred_at`; nothing takes `responsible_id` or `source_key`; `write_result(id, request_id, values[], text, is_final, not_done, not_done_reason_text, files[])` beside "**Outside result**: `write_result` with `request_id NULL`, `source = outside`, `data.source_name`" names no patient. **Spec 01**: "closed columns incl. `responsible_id`"; **01 appendix**: "A retired type, or a type whose pack is off, accepts only entries carrying `replaces_id`"; "'Corrected: …' when it replaces a final entry"; fixture 23 "a final replacing a preliminary"; **06 test 7**: "accepts a correction with the pack disabled".
- **Smallest amendment:** one sentence in 04: every `write_<type>` takes the entry header after `id, patient_id, visit_id, department_id` — `replaces_id`, `occurred_at` (NULL = `recorded_at`; the "age" sentence is a gloss on live writes), `responsible_id`, `source_key`, all nullable; `write_set` items pass them through. `write_result` gains `patient_id`, `visit_id`, `source` (staff | outside) and `source_name`, the first two required when `request_id` is NULL. Rules: a replacement keeps the replaced entry's type (`entered_in_error` excepted) and inherits its `request_id`; `source` otherwise follows `users.kind`.
- **Why now:** fixture 23 and test 7 cannot be written without `replaces_id`; strike-plus-retype cannot satisfy the retired-type rule (the new entry is refused) and turns every amended CBC into a "wrong patient" event; the outside-result path is unreachable. Same B17 argument as A.

### C · How `write_entry` takes a destination

- **Spec 01** Functions: "`write_…` one public function per entry type → all end in the private `write_entry`" with no signature; **01 appendix d**: "be a request | it has a `requests` row, because it had a destination"; **04** `prescription`: "request (when a dispensing service exists)". So request-ness is per entry, on any type, but nothing says how the funnel learns `{to_department_id, priority, due_at}`.
- **Smallest amendment:** one sentence in 01's Functions block: `write_entry` takes an optional destination `{to_department_id, priority, due_at}`; a non-NULL destination on any type inserts the `requests` row through `change_request`'s `sent` step.
- **Why now:** `core.write_entry` is EXECUTE-granted to every pack role and "signatures only grow"; Imaging's `imaging_request`, Admissions' bed request and Blood bank's crossmatch all need a queued pack type, and getting the funnel right at creation avoids a second overload forever.

### D · Five errata a builder would build wrong (one line each, zero cost)

| Spec · line | Change to |
|---|---|
| 04 result: "`HH`/`LL` sets `review_needed_at` (spec 01)" | 01 appendix's rule: "`is_final OR flag > 'normal'`, a corrected or struck reply, a decline set it; HH/LL is what turns the count red." Add one golden fixture: a normal final CBC appears in the requester's `read_to_review`. Built into `change_request`'s fold in Phase 0. |
| 04 request: "Refuses: … a `question_text` on a non-consult service" | Strike. Contradicts 04 rule 4 "Refusals are structural only" and 05's request surface, which draws "the request's question" for every request. A chest X-ray sent outside on day one needs its indication printed. |
| 04: "Every type is a row in `entry_types` with `pack = 'core'`" | `pack` NULL for core, per 02's `coalesce(entry_types.pack, 'core')` and the `actions.pack null → packs.key` pattern (no `packs` row for core). |
| 01 Tables and 02 Tables: `flowsheets`; 01 appendix: "as in v3"; 02 appendix: `read_organization` returns "flowsheets" | Strike from all four places. No column, function or screen in 01–06 touches it; v3 is not in the repo; a 24-hour grid is a screen over `read_values(patient_id, codes[])`. |
| 04 request data: "service {id, code, name, **kind**, department_name}"; 03 boundary 3: "vitals, note and **triage** entries" | `kind` → `reply_type` (`services` has no `kind`); "triage entries" → "a `triage` type a pack ships" (03 appendix Y6 already says so; 04 says "Nine types, no more in core"). |

**Rejected as Phase-0 blockers** (readers claimed them; they are not rewrites): the send-out reply gate (a clause in `require_access`, which is not in the golden file; the owner's everywhere-held roles pass today); the frequency set (a JSON-schema enum widens as a superset; Phase 0's only obligation is that `patient_medications.frequency` is `text`); the pack migration template (needed with the hostile fixture packs during Phase 0's test work, not before its migrations); the error convention (a comment in migration one's header, not a spec change).

---

## 3 · Core, later

Additive: a nullable column, a new function, a new type, a client rule. Trigger in italics.

**Spec 01**
- `write_entry` inserts no `pack_calls` row and sends no signal when `source = 'import'`; one clause in 02 appendix invariant 13 — *a re-import after go-live with packs on* (a first-time import runs before packs are enabled and queues nothing).
- `save_draft` / `read_drafts(patient_id)` (the author's own) / `delete_draft` named in the function list; `drafts` gains `organization_id`, `department_id` — *before the visit screen is built; 05 rule 3 cannot work without them and "the app never touches tables".*
- `read_cohort(organization_id, problem_codes[], value_code, since)` and `read_visit_counts` under a new `read:cohort` — *the IM pack's diabetes recall list, inside a year; first in this queue.*
- `replay_pack_calls(organization_id, pack, since)` under `manage:organization` (`after_write` is already idempotent) — *a pack switched on long after go-live that needs history.*
- `data.next_due_at` on a non-final reply, honoured by `change_request` — *inpatient dose charts* (until then `mark_routing(due_at)` rolls a standing order).
- `_number` suffix in the naming rule for identifier strings; rename `specimen_no` → `specimen_number` (breaks "No abbreviations except id, mime, url" in 06 and 01 appendix lines 163, 286) — *the Laboratory pack spec.*
- `entry_source` gains `pack`, `proxy` by `ADD VALUE`; `source` set by `write_entry` from `users.kind` — *a pack's own user writes an entry* (`machine` "covers algorithms" today).
- `write_entry_file(entry_id, position, …)` appending to a live entry — *only if a pack shows that "a document that arrives is an entry" is insufficient.*

**Spec 02**
- `require_access`: `write:<the service's reply_type>` and the requester's `mark:cancelled` pass on an `is_outside` destination for anyone holding them in the organization (the widening `read:queue` already has); the reply's `department_id` is the filer's own, `source = outside`, `data.stated_author_name`; `read_sent_outside` rows gain Answer — *first release after Phase 0: the IM clinic sends HbA1c out in month one and today only an everywhere-holder can close it.*
- `save_user`'s machine rule: a machine in a laboratory / imaging / pharmacy / ancillary department may also hold `read:queue` and its pack's `read:` there; one line in S13 — *the first host-query analyser* ("machine logins with the first analyser" is already built-later).
- `read_record_reads(patient_id, since_at)` under `manage:organization` — *first GDPR/HIPAA accounting request; ship with the settings-history page.*
- `patients.is_restricted` + `record_reads.reason_text` + the silent-pass rule (a care relationship derived from `requests` and the caller's open visit that `read_record` already returns; never a visit join in other reads) — *first hospital with a staff member as patient.*
- `read_health(organization_id)` → `{pending, oldest_pending_age, parked_by_pack, runner_last_tick_at, sweep_last_run_at}`; one `cron.job` per pack only when a pack is measurably slow — *ops alerting.* Write "a slow pack under 5 s delays other packs' reactions" into 02 known limits now.
- `core.escalate_reviews()` cron signalling `queue:<from_department_id>` for old HH/LL — *only if a timed nudge is wanted; never a third pack reaction.*
- `actions.is_mfa` so `require_access` keys MFA on the action, not the verb — *only if core enforcement of controlled-drug signing is ever wanted (EPCS is the e-Rx pack's own step-up otherwise).*

**Spec 03**
- `read_visit_queue` include-away parameter, or `has_drafts` per row, and an "unsent" count in the queue footer (counts only; draft text stays the author's) — *the first forgotten consult, within weeks at 50/day.*
- `merge_patients` shipped before go-live rather than after — *the first duplicate arrives within weeks.* A schedule decision, not a spec change.
- `mark_visit_transfer(visit_id, department_id, reason)` (or `department_id` on routing) and `admitted` as one `ADD VALUE` — *the Admissions pack, as a dated core amendment beside it.*
- One known-limits sentence: "an import renumbers; old numbers are identifiers" — *the first legacy import.*
- One sentence on `unmerge_patient`'s residue (entries written for the survivor in the window are struck and re-entered as `source = import`) — *when `unmerge_patient` is written.*

**Spec 04**
- `write_prescription` gains `source (staff | outside | patient)` and `stated_prescriber_name`; `source ≠ staff` writes no request row and sets `prescriber_id` NULL beside a `prescriber_name`; the list prints "(reported)" — *before go-live: a new patient's atorvastatin from a cardiologist; mandatory before Pharmacy, where a home drug would otherwise become a dispensing request.*
- Frequency: widen the JSON-schema enum (`q1h q2h q3h alternate_days three_times_weekly every_3_months every_6_months continuous other`) and add `frequency_text`, required with `other`; drop `PRN` as a frequency value (the `prn` boolean is the fact); `patient_medications.frequency` is `text` — *before go-live: B12 three-monthly, denosumab six-monthly, alternate-day prednisolone are weekly IM prescriptions, and `OD` with the truth in `instructions_text` makes `display_line` lie.*
- `write_prescription` refuses `patient_died` (structural, as `write_request` and `open_visit` already do) — *when the function is written.*
- `stop` closes every open request whose `data.medication_id` names the row; convention line in 06 — *the Admissions pack (the ward administration request).*
- `starts_on` (partial date, default today) and `ends_on` at read time from `duration_days` — *the Pharmacy pack; courses stop showing as active.*
- `hold`/`resume` on a medication — *the IM pack, not admissions: contrast, colonoscopy and AKI are outpatient holds.*
- `warnings[] {kind, text, override_text}` on `write_prescription` and `write_request` — *with interaction data (a pack); until then the override reason is a `note` in the same set.*
- `write_vitals(…, values[] of {code, value_number, unit})` overload — *when the nurse note-form path (coded numeric fields already trend) proves clumsy for glucose and pain scores.*
- `write_request` gains `source` and `stated_author_name`; `from_department_id` may name an `is_outside` row so `read_to_review(organization_id, department_id)` becomes the lab's outside-requesters list — *the Laboratory pack (GP paper requests).*
- `write_note` gains `service_id`; a note with a destination is a request (the Co-signature convention, appendix d) — *a training hospital.* Meanwhile state the set convention in 04: [note, request to a `Co-signature` service] in one `write_set`, the attending's final `consult_reply` closes it.
- `mark_routing` gains `requester_id` recorded as a routing step — *low priority; department-level cover already exists.*
- `read_record.latest_vitals` = the newest entry carrying the vitals codes (not the newest `vitals` entry) — *a ward pack writing its own observations type.*
- One clarifying line: "`LL/HH/L/H/A` are display glyphs; the stored `value_flag` is severity, `entries.flag` its max." — *any time.*

**Spec 05**
- **Prefetch** only the pinned patient and the next in band order; everything else opens on selection; budget line becomes "from one call" — *before the queue screen is written and before the first `record_reads` row exists* (the audit is otherwise noise and the 12-hour window opens on 30 charts).
- "One list, two halves, one `read_queue` call" → two calls (`read_queue` + `read_visit_queue`), as 03 locks.
- `staff_active_department` → "a client `localStorage` key".
- Outbox: "replays in order **per patient**; a refused set parks with its reason and the rest replay" — *before the outbox is written; one refusal must not strand five other patients' notes.*
- The banner also draws active problems whose code is in a client alert-code set a pack's index may extend; later `renderers[type].Banner` / `bannerItems` and `recordPanels` slots — *Obstetrics (pregnancy) and Admissions (code status).*
- `queueColumns` stable in-band re-sort fed by `bookings_read_today`; a `receptionPanels` slot — *the Bookings pack.*
- Queue rows whose `plain_name` matches another present row are marked — *client rule, any time.*

**Spec 06**
- One line in built-later: "outbound is a core door, never a pack's own"; design `core.send_out(pack, kind, payload)` + a core-owned outbox drained by one Edge Function — *the first pack with a real endpoint (Pharmacy e-Rx or Billing claims). Do not shape it now.*
- Strike "`rebuild_record` replays existing entries through its updater" from Enable (a no-op: a pack's list comes only from its own types and corrections replay while it is off); `save_organization_pack` stays a plain save under 8 s.
- Migration template: the role is created and registry rows inserted as the migration user (`core.create_pack_role('<key>')` or listed grants checked by B4); only `<key>` schema objects go under `SET ROLE`; B14 becomes "creates every `<key>` object under `SET ROLE`"; B11's allowed diff gains "a role named `pack_<key>`" — *with the hostile fixture packs (Phase 0 test work).* As written, `insert into entry_types` fails B7 and `ALTER TYPE` needs the owner.
- `codes` joins the registry list with a nullable `codes.pack`, or `_core_` ships the LOINC rows a pack needs — *Cardiology's QTc, Obstetrics' fundal height.*
- Known limit: "a pack has no reporting access to core data; reports are core's derived reads" — *any time, so no pack author asks for SELECT.*
- Worked example: Admissions frees a bed from its own ward screen and from the discharge note's `after_write`, never by reading `read_visit_queue` as the pack user (the pack role holds no `read:queue`) — *the Admissions pack spec.*
- `core.` prefix on `entry_types` in the template — *with the template fix.*

---

## 4 · Packs

| Pack | Gaps it must cover | What 06 must allow that it does not today |
|---|---|---|
| **Laboratory** | Specimen steps (`collected`, `received`, `verified`) with `changes {specimen_number}`; `service_field_ranges`; the critical-call closed loop as a `notified` step *before* release or a row in `laboratory.critical_calls` (a step after the final reply reopens the request); GP paper requests (needs 04's `write_request` source, core-later); host-query analysers (02's machine widening, core-later); the bench screen's standing-order bucket | `_number` in the naming rule; the migration template fix. Nothing else. |
| **Pharmacy** | `dispense` reply type and the counter screen; partial dispenses as non-final replies; lot numbers; stock in its own schema; e-Rx transmission with its own step-up (reads the JWT's `aal`, refuses in its own function); must not receive dispensing requests for reported medicines (04 core-later, mandatory before this pack) | The outbound door (core's, not the pack's). |
| **Billing** | Holds via `after_write` (`sent → held`), `billing_mark_paid`, prices in `servicesColumns`, voids on `entered_in_error`; claims and eligibility | The outbound door; nothing on reporting (never SELECT on core). |
| **Imaging** | An `imaging_request` pack type with laterality, contrast, pregnancy, indication, carrying a destination (needs 01 sentence C); report as a reply; PACS/worklist outbound | 01 sentence C (any type may carry a destination); the outbound door. |
| **Internal medicine** | The problem-column visit layout; trend sets (the former `flowsheets`, as a pack setting over `read_values`); the "since last visit" strip; recall lists (needs core `read_cohort`); `hold`/`resume`; nurse note forms with coded glucose and pain score | Nothing. |
| **Cardiology** | ECG renderer, three write functions, QTc and other codes | Global codes: `codes.pack` or a `_core_` LOINC data migration. |
| **Obstetrics** | `pregnancies` list with a pure updater; fundal height and per-fetus codes; mother–baby link in `obstetrics.births` (no core pointer crosses patients); pregnancy visible where prescribing happens | A banner slot (client-only, `renderers[type].Banner`); global codes as above. |
| **Admissions** | `admitted` `ADD VALUE` and transfer routing (a dated core amendment beside the pack); beds by `visit_id`; ward observations type with NEWS2/GCS codes; a `Medication administration` service and the MAR as non-final replies; stopping a drug closing the administration request (04 core-later); code status as a coded problem raised to the banner; a downtime viewer | The banner slot; an explicit line that a core amendment may ship beside a pack. |
| **Bookings** | Its own `bookings` table pointing at the visit it became; a diary department type whose Here calls `open_visit`; no-show = a booking that never became a visit | Later: a `queueColumns` in-band re-sort and `receptionPanels` slot (client-only). |
| **Emergency** | A `triage` type; five-level acuity as its screen (`priority` is the three-level shadow); vitals flags; unknown patients via `given_name = 'Unknown'` + estimated year | Nothing. |
| **Psychiatry / Sexual health** (unnamed) | Per-entry restriction: `departments.is_sealed` and a filter in the five record reads, lists never sealed | Nothing in 06; a core-later rule when a department asks. |

---

## 5 · Never

- **No cross-organization record.** Shared care is export/import as `source = outside` with `stated_author_name`; a network that wants one record is one organization with sites. This is what makes the closed record, the tenant matrix and database-per-organization possible.
- **No booking in `visits`, no `scheduled_at`, ever.** A visit is an arrival; slot order is the Bookings pack's screen.
- **No money in the record.** Billing can never block care; that is a guarantee, not a policy.
- **No hard safety stops in a function.** Warnings live in the screen; refusals are structural. Alert fatigue is the incumbents' best-documented harm.
- **No mutable rows and no bolted-on audit table.** The audit trail is the record.
- **No stored patient status that can go stale.** BACK is derived; presence is asserted.
- **No server-side "where am I".** The department is a parameter (item A).
- **No machine streams, no unit conversion, no formulas engine.** Monitor data lives outside until someone charts it; a foreign unit is shown and does not trend.
- **No generic `links[]` or extension key on the nine core writes, and no pack annotation of a core type.** A companion entry in the same set, `problems[]`, or the pack's own type keyed by entry id. Revisit only if three packs ship the same companion.
- **No pack SELECT on core tables, ever, including for reports.** Reports are core's derived reads; a Reports pack sits on `read_cohort`.
- **No `sha256` on files** until someone needs it; the client cannot prove bytes, and only the off-site copy protects against the named threat.
- **No tenth `alert` type now.** DNACPR, MRSA, pacemaker, pregnancy are coded problems; banner placement is a client rule. Safeguarding is the honest case for a type later.
- **No third pack reaction on a schedule.** Overdue, expiring and due are boards someone opens.
- **Not Epic.** No Cadence, MAR, charge capture, BPAs, MyChart, Care Everywhere in core — packs or never.

---

## 6 · Epic, side by side

| Epic | openCare | |
|---|---|---|
| Chronicles contact / item (mutable, audit trail) | `entries`, insert-only, self-contained, `replaced_by_id` the only update | **strength** |
| ORD order + result | request entry + reply entries, depth 1, generalised to consults, declines, outside results | **strength** |
| Order modes: verbal, per protocol, cosign required | `responsible_id`, `requester_id = coalesce(responsible_id, author_id)`, Co-signature convention | same (once item B lands) |
| In Basket: Results, Cosign, CC'd Charts, Outside Results | one predicate: `review_needed_at` + `read_to_review` | **strength** |
| In Basket: Chart Completion / deficiency tracking | nothing lists unsent drafts | **gap** (core-later, before go-live) |
| Results routing on provider leave | department-level `read_to_review`; `save_user` returns `{open_assigned, to_review}` | same |
| Storyboard (allergies, code status, pregnancy, care team, FYI) | banner: allergies only; problems in the RECORD column | gap in placement only (client rule) |
| Problem list, med rec, allergies, "No Known Allergies" | lists born with their first entry; `list_review` makes NKDA a fact with an author | **strength** |
| Amendment / addendum | `replaces_id` chain, "Corrected:" prefix, re-sets review | **strength** (once item B lands) |
| Flowsheets (row-configurable) | `entry_values` by code across every type; `read_values` | same; wider (a note field trends beside a lab) |
| Cadence scheduling | none; Bookings pack | gap, by design |
| Grand Central ADT: arrival, statuses, transfer, beds | `visits` + `visit_steps`; presence asserted, BACK derived; transfer and beds with Admissions | **strength** (no stored flips); gap for wards until Admissions |
| Willow MAR | rule 6: doses as non-final replies; dose charts built later | same shape, less built |
| Resolute charge capture in the encounter | Billing pack `after_write`, holds trail the send | **strength** (billing cannot block care) |
| BPAs / hard stops | client warnings, never a refusal; override not recorded structurally | **strength** (fatigue) / small gap (override trace) |
| SmartSets / SmartPhrases | `templates` → N `write_request` in one `write_set`; note forms | same |
| Foundation System build, Data Courier MST→PRD | presets as idempotent rows; settings are rows with attributed history | **strength** |
| Module build (LRR/EAP for a new test) | department + service + `service_fields`, no deploy | **strength** |
| Bridges / Interconnect inbound | bounded machine user, replies only | **strength** (security), gap (host-query) |
| Bridges outbound (e-Rx, claims, HL7 out) | none; packs cannot reach `net` | **gap** (core door, later) |
| Interface users as superusers | machine holds `write:` in one department | **strength** |
| Care Everywhere | none; export/import with stated author | gap, by design |
| MyChart | `patient_access`, built later | gap, planned |
| Clarity / Caboodle | derived tables; `read_cohort` later | gap (planned); no warehouse needed at clinic scale |
| Break-the-glass | `is_restricted`, `reason_text`, built later | gap, planned |
| Patient merge | `merged_into_id` pointer, literal `patient_id` never rewritten | **strength** (pre-merge history separable) |
| Downtime (BCA reports) | outbox through a dropped connection; no full offline | gap, by design in v1 |
| Sign encounter (pieces) | one atomic idempotent `write_set` | **strength** |
| Module enable/disable | per-organization switch; off still renders | **strength** |

---

## 7 · Strengths

1. **History that cannot be rewritten or drift.** 01 rules 1–3: 21 closed columns, insert-only trigger before the first row, `replaced_by_id` the only update; "at write time an entry copies into `data` everything it used from settings … Flags are computed once. History renders with no settings joins." A 2026 result reads in 2036 exactly as flagged.
2. **One review loop.** 01 rule 5 and one nullable column: `review_needed_at` set by `is_final OR flag > 'normal'`, a correction, a strike, a decline; cleared by `mark_reviewed`; the department owns it after a doctor leaves. Epic needs a subsystem.
3. **Rule 6 as a generator.** "A repeated act is a non-final reply" gives MAR, PRN (`due_at = infinity`), partial dispenses, refills, preliminary cultures and home monitoring with no task table; `requests_queue` doubles as the ward's due-next list.
4. **A pack boundary Postgres proves.** 02 rule 6, 06 tests 2–5 and 9, B7/B9: "no privilege on any core table (not even a row lock)"; a hostile `after_write` "delays no `write_entry` by more than 0 ms". No incumbent's module system is verifiable from `pg_catalog`.
5. **Off means quiet, never broken.** 06 rule 6: a pack switched off per organization still renders, trends and accepts corrections. Epic cannot switch Willow off for one hospital without a build project.
6. **No money in the record.** 01: "No price, no charge, no billing key lives in `entries`, `requests` or any core table"; holds trail the send and "a request already started stays started and the charge stays unpaid."
7. **Presence asserted, BACK derived.** 03 rules 3–4: no stored status to forget on a cancel, a merge or a race; the sweep is idempotent and needs no time zone; the reception never decides.
8. **Atomic, idempotent, replayable Done.** 04 `write_set` all-or-nothing; client-minted UUIDv7 as the retry key; 05 rule 3 "a failed Done writes nothing and says which item was refused"; the outbox. No half-signed note, no duplicate order on retry.
9. **Derived lists that cannot rot and the fold that cannot disagree.** 01 rule 4 and "Deletable and rebuildable"; `requests.status` GENERATED from `step`; CI 17/18 (rebuild equals live rows; scramble settings, rebuild, zero differences). Merge is a pointer plus rebuild; a list redesign is never a data migration.
10. **Attributable absence and refuted allergies.** 04 rule 6: "NKDA is a fact with an author and a date, never an empty list"; `refute` keeps the row "shown struck through, never hidden". Plus verbal orders routing to the responsible doctor from day one, and a schema that refuses a wrong-patient visit link by key (03 boundary 1).

---

## 8 · Developer readiness

Undefined items Phase 0 needs decided. Proposed default after each.

- [ ] **`department_id` parameter** on every `write_<type>`, `write_set`, `read_record`; client-held in `localStorage`; `drafts.department_id`. (Item A.)
- [ ] **Entry header** on every `write_<type>`: `replaces_id, occurred_at, responsible_id, source_key` nullable; `write_result` + `patient_id, visit_id, source, source_name`. (Item B.)
- [ ] **`write_entry` destination**: optional `{to_department_id, priority, due_at}`; non-NULL → `requests` row via `change_request` `sent`. (Item C.)
- [ ] **Error transport**: `RAISE EXCEPTION USING MESSAGE = '<snake_code>', ERRCODE = 'P0001', DETAIL = <json>`; `write_set` merges `{"item": n}` into DETAIL; the gate's plain refusal is `not_allowed` with `{action, department_id}`. One comment block in migration one; no golden errors file.
- [ ] **`write_set` dispatch**: a static `CASE` over the nine core writers (no `EXECUTE`, no allowlist table); every item resolves to one `patient_id`; `written_with_id` on every member including the first. A pack needing atomicity with its own type makes two calls; the outbox replays both.
- [ ] **`services.reply_type`** enum: `result | consult | dispense`; `administration` added by core with dose charts. Consult ⇔ `consult`; the dispensing rule keys on `dispense`.
- [ ] **`service_fields.kind`** and **`codes.kind`**: one enum `number | text | choice`; `choices text[] null`; an abnormal choice flags `A`.
- [ ] **`templates.items`**: `jsonb`, the `write_set` item array shape; two item kinds (request set, note form) are a client/JSON-schema matter.
- [ ] **`flowsheets`**: struck.
- [ ] **`entry_types.pack`**: NULL for core; no `packs` row for core.
- [ ] **`request_step`** declared `sent, held, started, replied, done, cancelled, reopened`; pack values by `ADD VALUE` (order is not load-bearing). Transitions: `sent→held` (`mark:held`), `held→sent` (`mark:sent`), `sent|held→started` (destination), `sent|held|started|replied→cancelled` (requester, reason), `replied|done|reopened` by the fold, `done` also as an early stop with a reason; pack steps never from `held`, never closing. Write this paragraph into 01 when `mark_step` is coded.
- [ ] **`value_flag`** stored as `normal, low, high, abnormal, critical` (severity order); `entries.flag` = max; `LL/HH/L/H/A` are renderer glyphs (direction recovers from each value's own ranges in `data`).
- [ ] **`patient_medications.frequency`** is `text`, no enum, no CHECK; the JSON-schema enum is the validator.
- [ ] **`occurred_at`** parameters are `timestamptz null` (NULL = `recorded_at`); the "age" sentence is a gloss on live writes; CHECK `<= recorded_at + 5 minutes` stays.
- [ ] **`entry_source`** set by `write_entry` from `users.kind`; `outside` and `import` stated by the wrapper; `pack`/`proxy` by `ADD VALUE` later.
- [ ] **`drafts`** columns: the appendix's (`responsible_id`, `updated_at`, pk `entry_id`) + `organization_id` + `department_id`; index `(author_id, patient_id)`; `write_set` deletes its items' drafts in the same transaction; functions named after Phase 0, before the client.
- [ ] **Core `actions` seed** = 02 appendix line 51 plus 03's four; keep `mark:done` (an early stop) and `mark:reopened` (held by nobody); `read:record` gates all five record reads. **Five-role matrix** as one table in 02, seeded in migration one; B19 diffs what is seeded.
- [ ] **Pack migration template**: role creation and registry inserts as the migration user; `SET ROLE` for `<key>` objects only; B14/B11 wording. Needed for the hostile fixture packs.
- [ ] **`read_queue(department_id, is_upcoming)`**: default window `due_at <= now() + interval '24 hours' OR due_at = 'infinity'` (no midnight, no time zone); row shape written beside `read_record`'s: `{request_id, patient_id, names, record_number, visit_id, service_name, section_name, from_department_name, requester_name, priority, due_at, step, status, assignee_id, assignee_name, display_line, reply_line, reply_flag, replied_at, recorded_at}`.
- [ ] **Schema placement**: every table and private function in `core`; `public` holds only callable functions; gates in `core` (02 spec01-changes item 16). Fix the bare `entry_types` in 06's template.
- [ ] **RLS**: ENABLE on every `core` table with one membership policy for `authenticated`, behind zero grants; never FORCE (it would subject the definer owner). Add "every core table has RLS enabled" to B9.
- [ ] **`read_patient`** returns visits only for departments the caller may `read:queue` (the hit's rule). Decide while writing it; narrowing a shipped read is worse.
- [ ] **`write_prescription` refuses `patient_died`**, like `write_request`.
- [ ] **`write_entered_in_error(id, replaces_id, reason_text)`** per 04 (01 appendix's `(entry_id, reason)` is superseded).
- [ ] **`record_number` on import**: position `core.record_numbers.last_number` before each insert in ascending legacy order; old numbers as identifiers; one known-limits sentence in 03.
- [ ] **JSON schemas**: live in the repo beside the migrations; `schema_version` in `data`; two generators (`supabase gen types` for signatures, schema-to-TS for `data`). Repo layout, not spec.
- [ ] **Test harness**: pgTAP for the twelve tests and B1–B19; fixtures under `supabase/tests/fixtures/`; seeds set `request.jwt.claims` with `aal` so the MFA gate is exercised. README when the first test is written.
- [ ] **Golden fixtures to add**: a normal final CBC in the requester's to-review; a correction with the pack disabled (needs `replaces_id`); an outside result with `request_id NULL`; a staff entry in each of two departments by one user.

---

## 9 · Contradictions between specs

| # | Spec A | Spec B | Wins |
|---|---|---|---|
| 1 | 05: "Opening a queue calls `read_record` for everyone present" | 03 appendix k rejects "prefetching every present record"; 02: "`read_record` inserts a `record_reads` row" | 03/02. Prefetch pinned + next only. |
| 2 | 05: "One list, two halves, one `read_queue` call" | 03: "refetches both `read_queue` and `read_visit_queue`"; 03 appendix k rejects "`read_queue` returning both halves" | 03. Two calls. |
| 3 | 05: "the choice is `staff_active_department` (spec 02)" | 02 appendix k: "Names rejected at final: … `staff_active_department`" | 02. A client key; the server takes a parameter (item A). |
| 4 | 04: "`HH`/`LL` sets `review_needed_at` (spec 01)" | 01 appendix: "`is_final OR flag > 'normal'`; a corrected or struck reply; a department decline"; 05 "count in red when a critical is waiting" | 01. 04 cites a rule 01 does not state. |
| 5 | 04 request: "Refuses … a `question_text` on a non-consult service" | 04 rule 4: "Refusals are structural only"; 05 request surface draws "the request's question" for every request | Rule 4. Strike the refusal. |
| 6 | 04: "`entry_types` with `pack = 'core'`" | 02: "`coalesce(entry_types.pack, 'core')`" | 02. NULL. |
| 7 | 01 appendix: "A trainee note is itself a request to the `Co-signature` service" | 04 note: no request behaviour, no `service_id`; "Any other kind refuses `reply_to_id`" | 04 today; read the appendix as the set convention; `write_note(service_id)` later per appendix d. |
| 8 | 01: "closed columns incl. `responsible_id`"; 01 appendix: "The client sends the age of the act" | 04: no signature carries `responsible_id`; only `write_vitals` carries a time | 01. Signatures gain the header (item B). |
| 9 | 01 appendix: `request_step` "Core values are `sent, started, replied, done, cancelled, reopened`" | 01 main and 02: "`held` is a core step" | 01 main ("Where the two differ, 01-record.md wins"). |
| 10 | 03 boundary 3: "vitals, note and triage entries" | 04: "Nine types, no more in core"; 03 appendix Y6: a `triage` entry is the emergency pack's | 04. "A `triage` type a pack ships." |
| 11 | 01/02 Tables: `flowsheets`; 01 appendix: "as in v3" | Nothing in 01–06 defines, reads or draws it | Strike. |
| 12 | 04: `write_entered_in_error(id, replaces_id, reason_text)` | 01 appendix: `write_entered_in_error(entry_id, reason)` | 04 (later, suffix-correct). |
| 13 | 03 hit: `open_visits[]` "for departments the caller may `read:queue`" | 03: "**read_patient** adds every visit … Neither writes a `record_reads` row" | The hit's rule; `read_patient` filters the same way. |
| 14 | 05 known limit: "the outbox replays in order and stops at the first refusal" | 04: `write_set` is "one transaction, all-or-nothing" per patient; sets of different patients are independent | 04. Order per patient; a refused set parks. |
| 15 | 06 template: "`SET ROLE pack_<key>; -- first line; the role exists from core's migration`" then `insert into entry_types` | 06 rule 2 / 02: "No core migration depends on a pack migration"; B7: no `pack_%` role holds INSERT on any core table; `ALTER TYPE` needs the owner | B7/rule 2. Fix the template. |
| 16 | 06 Enable: "`rebuild_record` replays existing entries through its updater" | 01: with a pack off "its entries still render, trend and accept corrections"; rule 4 replays on every write | 01. The clause is a no-op; strike it. |
| 17 | 04 request `data`: "service {id, code, name, kind, department_name}" | 02 `services … reply_type`; no `kind` column | 02. `reply_type`. |
| 18 | 01 `drafts`: eight columns | 01 appendix `drafts`: + `responsible_id`, `updated_at`, pk | Appendix (the main line is an abbreviation); add `organization_id`, `department_id`. |
| 19 | 04 result: "Caller must hold `write:result` in the request's `to_department_id`" | 02: outside departments — "nobody holds a role there"; 03 `read_sent_outside` exists to close send-outs | Neither contradicts the other in text; the gap is in what is unsaid. Everywhere-holders pass today; add the widening (02 core-later, first release). |

---

## What the report missed

1. **"Complete for a multi-department hospital" is flattering.** 03 line 87: `open_visit` refuses `not_yet` for `ward`; 03 line 126: the sweep skips wards; 05 lines 99–100: the ward screen is "(admissions pack)"; 03 line 207: `admitted`, transfer and beds are built later. Core has no admitted state, so the §1 verdict should read "complete for outpatient care: clinic, polyclinic, hospital OPD plus its service departments"; inpatient is a pack plus dated core amendments. The 30-scenario tally counts bed, transfer, infusion, handover and early-warning score as "strain" when nothing in core can hold an inpatient at all.

2. **Item C is deferrable as a spec blocker, and its "why now" is wrong.** 02 appendix line 214: B17's golden file covers `public` function signatures only; `core.write_entry` is private and no pack exists in Phase 0. Replace C's justification with the real Phase 0 hole it sits beside: 02 lines 129–131 gate every pack-caller step through `require_access('mark:' || step, …, to_department_id)`, so the `sent` row of a pack-written request (Imaging's `imaging_request`) needs `mark:sent`, which is the cashier's release action (02 line 194) and outside what `pack:<key>` may hold (02 appendix line 52). Add to §2: the initial `sent` row is written by `write_entry`, never through the gated step path.

3. **`needs_review` is on no signature and missing from C's funnel contract.** 01 appendix line 143: `write_dispense`/`write_administration` "pass `needs_review = false`". Without it in `core.write_entry`'s reply parameters, rule 6's MAR puts every ward dose in the requester's to-review. Add it to item C and to the §8 checklist.

4. **`source` belongs in the entry header on all nine writes, not only `write_result`.** 04 lines 78–80 (`write_prescription`, which §3 defers "before go-live" at exactly the B17 cost §2 calls a blocker), 04 line 99 (`note` kind `letter`: an outside letter), outside problems and allergies from a referral summary; 01 appendix line 116 already names `stated_author_name` and `stated_recorded_at`. Move the prescription `source` item from §3 into item B; header = `replaces_id, occurred_at, responsible_id, source_key, source (staff | outside), stated_author_name, stated_recorded_at`. Also state that `patient_medications.prescriber_id` (04 line 167) is `coalesce(responsible_id, author_id)`, as `requester_id` is.

5. **Item A's gate rule is wrong for replies.** 04 line 69: the gate for a result is the request's `to_department_id`; 02 lines 153–154 (O4): the covering ER-lab technician's reply carries the ER lab as `department_id` while the gate is the main lab. A must say: the parameter is always the entry's `department_id`; the gate department is that parameter for standalone entries and requests, and `requests.to_department_id` for replies.

6. **§8 silently overrides a locked decide-now item.** 04 line 111 `write_vitals(…, occurred_at, …)` versus 01 line 174 "the client sends the age of an act, never its clock" and 01 appendix line 56 / h.13 (T13). List it in §9 and resolve it as the appendix does (absolute time only when picked by hand; live writes send age), instead of calling the decide-now sentence "a gloss".

7. **Fixture 23, not test 7, is the reason for `replaces_id`.** 06 test 7 (line 126) concerns pack types, which reach `core.write_entry` with `replaces_id` already; only 01 appendix line 370 ("a final replacing a preliminary") needs a core signature. Correct B's "why now".

8. **Strength #4 is a write and tenant boundary, not a read boundary; §3's "a pack has no reporting access" is false.** 02 lines 165–167: a pack role executes every public `read_…`; 02 lines 138–139: packs "read without opening and without a row". A pack reads any patient's whole record as its own user, unaudited, and sees every entry through `after_write`. Strike the proposed known-limit line; add instead "pack reads leave no `record_reads` row" as the real limit, and drop "including for reports" from the Never list.

9. **Strength #2 and the "In Basket → one predicate" row are overstated.** 01 appendix line 140 sends every final result to to-review; `mark_reviewed(request_id)` (01 appendix line 284) is one request per call; 01 appendix line 608 already concedes "40 patients … 40 sets". A clinic doctor gets 150–200 items a day with no bulk action and no class triage, which is the In Basket problem reproduced. Downgrade the row to "same, with a gap" and add `mark_reviewed(request_ids[])` to §3 before go-live.

10. **The commonest internal-medicine act has no `action`.** 04 line 81: `start | change | stop`. Re-issuing an unchanged chronic script is neither (`start` duplicates the list row, `change` with nothing changed lies). Add `action = repeat` (schema-version bump; the updater bumps `latest_entry_id` only) to §3 04, before go-live.

11. **Emergency needs more than "Nothing".** 03 line 122: the queue row carries `priority` only; 03 appendix line 319: "why is he here" is reachable only through the record; 05 has no `queueColumns` slot. A track board needs complaint and acuity on the row: the same `queueColumns` slot §3 gives Bookings, fed by an `emergency.board` table keyed by `visit_id` that the pack's `after_write` writes from the triage entry. Move the slot up and fix the §4 row.

12. **Pharmacy cannot "read the JWT's `aal`".** 02 line 168 and 06 lines 59–60: pack roles hold no USAGE on `auth`. `actions.is_mfa` (§3 02) is the only step-up path a pack can have; change its trigger from "only if…" to "with the Pharmacy pack".

13. **Six Epic rows are off.** (a) "Results routing on provider leave — same": Epic delegates per person and date; 02 line 244 "no schedules: cover is membership" is a gap. (b) "Flowsheets — wider": 01 line 187 and 01 appendix line 533 reject computed rows; no intake/output or fluid balance; "same for trends, narrower for computed rows". (c) "Grand Central — strength": a strength for OPD flow, a gap for ADT until item 1 is fixed. (d) "Foundation System / Data Courier — strength": 02 decisions line 5 says a later preset "must not change a running practice"; nothing pushes a catalogue update to running organizations, which is what Data Courier does — gap. (e) "Patient merge — strength": 01 line 180, 03 line 204: built later; say "planned". (f) "Order modes — same": 01 appendix lines 394–397 make co-signature a convention nobody enforces; "weaker". Drop the unverifiable "Epic cannot switch Willow off" claim.

14. **No lens covered the solo GP.** 02 decisions line 13 names the one-person practice; 02 lines 14–15 "a department has one type, which picks its screen"; 05 §1 puts search and Here on the `reception` screen, §2 the queue on the clinic's. One person must switch department to register, then switch back to write. Add a client rule to §3 05: a clinic screen shows search and Here when the caller holds `write:patient`/`write:visit` there.

15. **Contradictions missing from §9.** (a) 06 line 36 "every row carries `pack = '<key>'`" including `roles`/`role_actions`, versus 02 line 48 where `roles` has no `pack` column (B11 must key roles by the `<key>:` prefix). (b) 02 lines 82–84 "writes only replies" versus 02 appendix line 49 "unless it is a draft" and the known limit at line 379 (a point-of-care device drafts); the spec wins, so machine drafts are gone unless restored when `save_draft` is named. (c) 01 line 79 `entry_values` versus 01 appendix line 168 (`organization_id`, `source`). (d) 01 appendix line 293 `read_queue` "due by the end of today" needs a time zone 03 forbids; §8 fixes it, §9 should list it.

16. **Strength #1 has a cost the report does not price.** 04 line 215 "display lines in English in v1"; 01 lines 53–55 freeze them. Since 04 rule 2 makes `display_line` a pure function of `data`, say explicitly that the stored line is a cache and the fallback renderer (05 lines 133–134) must rebuild from `data`, or a non-English first clinic keeps English lines forever. Also, 01 appendix lines 63 and 141 turn a clerical typo fix into a "Corrected:" event that re-sets review: over-signalling, worth one known-limit line.

17. **"Why now" honesty.** 02 appendix line 214 gives B17 a `removed` mechanism, and Phase 0 has no callers. A and B are cheap now, not blocked later; say so, and keep them in §2 on that basis.

18. **D's `question_text` reasoning cites the wrong rule.** 04 lines 24–25 (rule 4) concern safety refusals; a shape refusal is structural. The reason to strike is 05 line 103 (every request surface draws the question) and that a lab or X-ray request needs its indication. Same conclusion, right citation.

**Verdict.** The spine is what the owner says it is: abstract, and powerful in the specific sense that four ideas (insert-only entries, a request as an entry with a destination folded from steps, depth-1 replies, derived lists) generate the lab, pharmacy, consult, MAR and review workflows without a table each, and the pack boundary is one `pg_catalog` can check. It is complete for outpatient care in a clinic or a hospital's outpatient and service departments, and honestly not for inpatients, which the report's "hospital" hides. The surface is where every real gap is, and the report's own list is right but short by the items above: the entry header must carry `source` everywhere, the funnel must carry `needs_review` and write the `sent` row outside the pack step gate, and a chronic clinic needs repeat scripts, bulk review and a one-screen solo practice before the first patient. It is not Epic and should not be: it wins on record integrity, atomic Done, a provable boundary and no money in the record; it loses on inbox ergonomics, delegation, ADT, and pushing catalogue changes to running organizations, and the comparison table flatters it in about six rows. The two things no pack can ever add, an outbound door and a cohort read, are core work and the report is right to say so; add to that list a step-up gate packs can call, since they cannot see `auth`.