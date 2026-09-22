Line numbers refer to spec/01-record.md and spec/02-organization.md as of today. Nothing else in either spec changes; the seven rules of each, the 21 columns, the fold, the gate and the pack boundary all stand.

## Spec 01 · The record

**1. Status line (line 3).** Add at the end: "· amended 2026-09-22 (spec 03): `read_queue` and `read_to_review` rows carry the request entry's `visit_id`; `change_request` also signals the department of that visit and any queue signal refetches both queues; two indexes; `erase_patient`'s order". Why: the reader must know spec 03 touched two return shapes, the signal list and the delete path.

**2. Reads (line 98).** Remove: "read_to_review(organization_id, department_id) · read_entry_file(entry_id, position) (60 s signed URL)". Add: "read_to_review(organization_id, department_id) · read_entry_file(entry_id, position) (60 s signed URL); every `read_queue` and `read_to_review` row carries the request entry's `visit_id`". Why: the phlebotomist's Here on a served department's visit (CF21) and a follow-up request written from the to-review screen (CF24) both need the visit the request was written in; B17 lets return shapes grow.

**3. Realtime (lines 112–113).** Remove: "Realtime is signals only (`record:<patient>`, `queue:<department>`, payload `{entry_id}`); the client refetches." Add: "Realtime is signals only (`record:<patient>`, `queue:<department>`, payload `{entry_id}`); `change_request` also signals `queue:<visits.department_id>` of the request entry's visit; any signal on a queue channel refetches both `read_queue` and `read_visit_queue` (spec 03)." Why: T6 broke — the result that flips a visit from PENDING to BACK arrives as `{entry_id}`, and a client that routes by payload never refetches the visit queue. Appendix "Realtime" (lines 303–307) the same.

**4. Upkeep (line 101).** Remove: "erase_patient (the only delete path)". Add: "erase_patient (the only delete path; deletes drafts and the record tables, then `patient_changes`, `visit_steps`, `visits`, `patient_identifiers`, `patients`, for the survivor and every patient merged into it, then writes the `erasures` row — spec 03)". Why: Y11 — erasing a survivor with a merged-in patient must clear both or the merge pointer dangles; the visits circle needs the deferrable key below.

**5. Indexes (appendix, after line 82 for `entries` and after line 149 for `requests`).** Add: "`entries_visit (visit_id) WHERE visit_id IS NOT NULL`" and "`requests UNIQUE (organization_id, entry_id)`". Why: `holds(visit_id)`, the queue's `requests[]` and the sweep join by visit; `visits (organization_id, request_id)` needs a composite target.

**6. Invariant 6, composite tenant foreign keys (appendix lines 323–327).** Add: "`visits (organization_id, request_id) → requests (organization_id, entry_id)`, DEFERRABLE INITIALLY DEFERRED; `visits (organization_id, patient_id) → patients`; `entries (patient_id, visit_id) → visits (patient_id, id)` stands." Why: the one key from an outside table into the record; deferrable so erase clears entries → visits → requests → entries in one transaction.

**7. Outside the record (appendix lines 241–244).** Keep "`visits.request_id` points at the request a visit came from"; add: "set only by `open_visit`, read by the queue, closes nothing; `reply_to_id` is never inferred from it (spec 03 boundary rule 2)". Why: says which side writes it.

**8. Words (lines 156–158).** Add: "present · band · arrival · sweep · registration · identifier · record number". Why: spec 03's words used in spec 01 sentences (the signal rule, the erase order).

## Spec 02 · The organization

**1. Status line (line 3).** Add at the end: "· amended 2026-09-22 (spec 03): `write:visit` passes on served departments; four actions on the built-in roles; the reception machine exception; `retire_department` refuses open visits; `sex` carries `other`; the sweep in `cron.job`". Why: same reason as 01.

**2. The gate (lines 116–117).** Remove: "`read:queue` also passes on a department the caller's department serves, and on an outside department for anyone holding it in the organization." Add: "`read:queue` and `write:visit` also pass on a department the caller's department serves; `read:queue` also passes on an outside department for anyone holding it in the organization." Why: the reception's Here for the clinics it serves and the technician's presence click on an Internal Medicine visit from the lab are `write:visit` on a served department; nothing else widens. Appendix "Gates" paragraph (line 118–120 region) and invariant 6 the same.

**3. Core roles (lines 77–81).** Add after the first sentence: "Besides spec 01's actions, the built-in roles hold `read:patient` (all five), `write:patient` (receptionist, nurse, doctor), `write:visit` (receptionist, nurse, technician, doctor) and `mark:in_consult` (doctor, nurse)." Why: spec 03's four actions; `nurse` on `mark:in_consult` because a nurse-led clinic otherwise never sets `seen_at` (CF23, Y7) — owner decision 2.

**4. Machine users (lines 80–81).** Remove: "A machine user holds `write:` actions in one department and writes only replies to requests sent there." Add: "A machine user holds `write:` actions in one department and writes only replies to requests sent there — or, in a `reception` department, holds `read:patient`, `read:queue` and `write:visit` there and on the departments it serves, and only opens visits, marks presence and reads the queue (a kiosk, a waiting-room board; spec 03)." Appendix invariant 5 and `save_user`'s machine rule the same; B15 gains "a reception machine fixture calling `mark_visit` or `write_note` raises, and its `open_visit` writes `routine`, NULL, NULL". Why: Y4, Y5 — a patient can never be the caller (`patient_access`, never `user_roles`), so self check-in and a board are machine users, and the locked sentence forbade exactly that. Owner decision 5.

**5. `retire_department` (lines 104–105).** Remove: "`retire_department` is refused while the department has open requests or unreviewed results it requested, and deletes its `user_roles` and `served_departments` rows." Add: "`retire_department` is refused while the department has open requests, unreviewed results it requested, or open visits (`department_has_open_visits`), and deletes its `user_roles` and `served_departments` rows." Appendix `retire_department` bullet and invariant c.10 the same. Why: T4, Y12 — a clinic retired with twelve waiting patients leaves visits no working screen can read; the desk ends them first.

**6. `service_field_ranges` (line 56; appendix line 64 and the ranges bullet).** Remove: "sex (female | male | null)". Add: "sex (the enum `sex`, shared with `patients.sex`: female | male | other; ranges rows use female, male or NULL, so `other` gets the unisex rows)". Why: one enum, three values, no second sex type in spec 03.

**7. CI list (line 197) and B11 (appendix).** Remove: "`cron.job` (exactly the runner, the watchdog and the purge)". Add: "`cron.job` (exactly the runner, the watchdog, the purge and `core.sweep_visits`, hourly)". Why: T9 — the sweep is pg_cron's job, never a public function.

**8. B10 static scan (appendix).** Add: "no core function of spec 01's set (`write_entry`, `change_request`, `rebuild_record`, the record `read_…`) names `visits`, `visit_steps`, `patient_identifiers` or `patient_changes`; no spec 03 function body contains `pg_advisory`; `core.holds` is STABLE and names only `requests`, `entries`, `departments`." Why: spec 03's boundary invariants 9–10 belong where the other scans live.

**9. B17 golden signatures (appendix).** Note: the file gains `register_patient`, `read_patients`, `read_patient`, `open_visit`, `mark_present`, `mark_visit`, `mark_visit_routing`, `read_visit_queue`, `read_sent_outside` in the migration that creates them. Why: automatic under "signatures only grow"; recorded so a reviewer expects nine new lines.

**10. First run and presets (lines 143–146).** Add: "The clinic preset ships `served_departments (reception, NULL)` and, with the Laboratory pack, `(laboratory, NULL)`." Why: the served widening in amendment 2 needs the rows in a one-reception, one-lab clinic, or the desk cannot open a clinic visit.

**11. Written as rules now, built later (line 229).** Remove: "`read_sent_outside` and visit queues (spec 03)". **Known limits (line 236).** Remove: "send-outs are found per patient until spec 03". Appendix section l, the send-outs bullet, the same. Why: both landed in spec 03.

**12. `save_user`'s return `{open_assigned, to_review}` (line 103).** No change: `open_assigned` counts requests only. A retired doctor's name on a waiting visit is routing, not a gate, and leaves the row on the next consult. Recorded so nobody adds it later by accident.