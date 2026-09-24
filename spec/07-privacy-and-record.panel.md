Status: **appendix** · the research and design panel behind spec 07 · 2026-09-24 · kept for its research (Epic and peers, law, sources). Where it differs from 07 — private notes, restricted patients, a review table — 07 wins: the owner chose private visits.

From a research and design panel (Epic and peers, openCare as built, law; three designs; clinical-safety and engineering critics). Not locked: decisions in §4 are open.

# Privacy and the record screen: recommendation

## 1. How Epic does it

- **Anyone can find anyone, and every read is logged.** The protection is the log, and the people who check it.
- **Restricted patients.** Staff, VIPs, psychiatry patients or anyone who asks can be flagged. Opening their record shows a warning, asks for a reason and the password, and tells the compliance office. Epic calls this "break the glass".
- **No warning when you are clearly caring for the patient.** At Northwestern the warning is skipped for the care team, the family doctor, or a patient with an appointment in your department.
- **Two kinds of hidden.** "Sensitive" notes are held back only from the patient portal and other hospitals. "Sequestered" psychiatry notes are hidden inside the hospital too.
- **The facts always cross.** US law walls off only the therapist's own analysis. Medicines, results, diagnosis and plan stay visible.
- **The weak point is volume.** Frequent prompts become reflex clicks that nobody reviews.
- **Nobody scrolls one flat list.** Epic has a fixed summary column, lists by kind with filters, and results as a table over time.

Sources: https://physicianforum.nm.org/uploads/1/1/9/4/119404942/break_the_glass_tip_sheet.pdf · https://epicsupport.sites.uiowa.edu/epic-resources/psychiatry · https://epicsupport.sites.uiowa.edu/epic-resources/chart-review

## 2. Recommended privacy for openCare

One rule: **hide the story, never the fact.** Two locks: private notes and restricted patients.

**Everyone treating the patient always sees:**
- allergies;
- medications from any department, whether active or stopped in the last 12 months;
- all problems, including pregnancy, infection and self-harm risk;
- every result, including ECGs and drug levels;
- vitals, requests with their replies, and prescriptions.

**Only notes can be private.** A note is private when:
- it was written in a private department (psychiatry, sexual health); or
- its author ticked "Private", for example for domestic violence or termination counselling, in any department.

Later, the data protection officer can make a note private when the patient asks.

**Who reads a private note without asking:** staff with a role in that department, the note's author, and a records role that holds a separate permission. A role that covers every department does not count. The owner does not get through by default.

**Hidden never means missing.** In place of the note you see one line: *Private note · Psychiatry · Dr Salma Adel · 12 Mar · Open anyway*. The name tells you whom to call.

**Restricted patient** (the whole record): staff and their families, VIPs, or anyone who asks. The record opens without a prompt if your department has an open visit or an open request with the patient. Otherwise you get the sheet below.

**Open anyway.** You pick a reason: Direct care, Emergency, Admin, or Other (a few words). Nothing is ticked for you. Emergency is one tap, with no password and no typing. Your choice opens that department's private notes, or the restricted record, for 12 hours. The read goes on the review list.

**Normal patients get no prompt.** openCare quietly records why you opened the record: a visit, a request, or neither. The reviewer checks a sample of the reads that had neither.

**Audit:**
- Every read is logged, including reads by packs. Reloading the same record adds at most one row per 10 minutes.
- "Who opened this record" on the patient page, which can be printed for the patient.
- A daily "Opened anyway" list. The data protection officer marks each row Fine or Ask.

**Nothing leaks outward.** Printouts, SMS, queue screens and family summaries carry no private note and no private department name.

**Packs plug in with rows:**
- **Psychiatry, sexual health, addiction:** the department type is private. Safety facts go in as coded problems, such as "Risk of self-harm", which always show.
- **Maternity:** shared, because pregnancy is a safety fact. Single notes can be ticked private.
- **Admission:** shared. Ward visits and consult requests open restricted patients without a prompt. Each entry keeps its own department, so transfers change nothing. Pack reads must be logged before this pack ships.

**Changes apply forward only.** A note's privacy is fixed when it is written, like its department name. A correction keeps the original's department and privacy.

**Day one:**
- every department shared;
- the audit fixes;
- "Who opened this record";
- restricted patients;
- the "Private" tick;
- Open anyway and the review list;
- closing today's leaks.

**Later:**
- private packs;
- notes made private by the data protection officer;
- review flags (the patient is staff, or the reader shares the family name);
- portal flags;
- notes kept from a minor's guardian, after legal advice.

## 3. Fixing the one big timeline

Keep the same record and give it better views. One switch at the top: **By visit · Results over time · All entries**. One row of filters under it, and no tabs inside tabs.

- **Always on top:** abnormal or unreviewed results and open requests, even when their visit is collapsed.
- **Left column:** problems, medications and allergies, plus each key test's last value with a trend arrow. A "Past" switch shows resolved problems and stopped medications.
- **By visit (the default):**
  - One card per visit with date, department, doctor, status and counts ("3 notes · 2 results · 1 private").
  - Today's visit and your department's last visit start open. The others show one line.
  - A request and its replies form one card.
  - Entries without a visit sit under "Between visits".
  - Admission: one card per stay, one line per day, with today open.
- **Filters:** My department, Notes, Results, Prescriptions, Requests, and a department picker. They are remembered for each user.
- **Paging:** all visit headers load at once. Entries load the newest 100 first, and "Earlier" adds 100 more. Opening an old visit fetches its entries.
- **Results over time:**
  - Tests are rows and dates are columns. Abnormal values are in colour and corrections are marked.
  - Click a row to see a graph.
  - Internal medicine starts with HbA1c, creatinine, eGFR, K, Hb, LDL, BP and weight.
  - It loads separately from the timeline, so last year's HbA1c always shows.
- **Opening an entry:** a click or Enter opens a side panel with the full text, values, files, replies and earlier versions. Arrow keys move, Esc closes, and each entry has its own link.
- History from merged patients is included. Search inside the record comes later.

## 4. Decisions for you

1. **"Private" or "sealed"?** I recommend *private*, and *restricted* for a whole patient.
2. **Prompt when a normal patient is opened without a visit or request?** I recommend **no**. Record it and check a sample. Keep prompts under about 2% of record opens.
3. **Can a coded problem such as HIV be hidden?** I recommend **no**. Make that patient restricted instead.
4. **Show stopped medications for 6 or 12 months?** I recommend **12**.
5. **Can the owner read private notes?** I recommend **no**. A records role holds that permission, and its reads are logged.
6. **Record written consent at registration?** I recommend **yes**, until an Egyptian lawyer settles whether PDPL Art. 12 requires it.

## 5. Risks

- The medication list gives diagnoses away (clozapine, antiretrovirals). We accept this for safety.
- The placeholder line shows colleagues in the clinic that the patient attends psychiatry.
- If nobody reads the daily list, "Open anyway" becomes a rubber stamp.
- Doctors will forget the "Private" tick or overuse it.
- Egyptian law on consent, minors and how long records are kept is not verified. The law's compliance date is about 31 Oct 2026.

---

ENGINEERING NOTES

Before any private note or the admission pack:
1. `read_entry.versions` (0010:91, 0015:15): replace the `core.root_of` scan over all entries with a walk along `replaces_id` within the patient.
2. `write_entry` (0006:283): a replacement keeps `old.department_id` and `data.is_private`; the write check runs against that department.
3. `record_reads` + `department_id`, `basis` (visit|request|none|reason|pack), `reason_key`, `reason_text`, `opened_department_id`. No new row within 10 minutes of the last, unless a reason is given.
4. Delete the pack exemption in `open_record`/`require_open` (0010:16-33); packs call `read_record`. `pack_calls` sends private notes only to the pack owning that department type.
5. Leaks: search and `read_patient.visits` list only departments where the caller holds `read:queue` (0011:56,96); `read_queue.recent` drops reply `data` without `read:record` (0021:223); `record:` realtime checks `read:record` (0014).

Privacy (built day one, inert until used):
6. Columns: `department_types.is_private` (default false), `departments.is_private` (null = inherit), `entry_types.is_note` (core `note` = true), `patients.is_restricted`.
7. `write_entry` stamps `data.is_private` = is_note AND (department private OR author tick).
8. `core.open_departments(user, org, patient) uuid[]`, once per call: departments where the user holds `read:record` with a non-null department, plus `opened_department_id` rows under 12 h; `read:private` = all. Mask inside `entry_card` (display_line, data, files, versions); private-note `entry_values` return as "Private" cells. Apply in the five record reads, `read_to_review`, `recent`.
9. `read_record(patient, department, reason_key, reason_text, open_department)`: drop and recreate (default-parameter overload). Stores basis; refuses `reason_needed` for a restricted patient without an open visit or request.
10. Actions `read:private`, `review:reads` (not seeded to owner); `read_record_reads(patient)`, `read_opened_anyway(since)`, table `read_reviews`. Later: `private_marks` (by entry only).

Timeline reads: `read_visits(patient)` (department names, merged patients); `read_entries` + `after_at`, `department_ids[]`, `visit_ids[]`; `read_values(codes null)`; list reads + `include_past`.

Client: view switch and chips in `VisitScreen`; visit card; attention strip; results grid on `useValues`; clickable `CardLine` with department; entry side panel on `read_entry` with a route; Open anyway sheet; left column "Past" and trends.
