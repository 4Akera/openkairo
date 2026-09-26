# 07 · Privacy and the record views

Status: **locked** · 2026-09-24 · approved by the owner · amends 01 (a correction keeps its visit and department), 02 (the read log,
department rules, reading private notes), 03 (visits carry no privacy; search shows only what you may see), 05 (the record views) ·
amended 2026-09-25 (approved by the owner): core setup — place, person, pack · amended 2026-09-25 (approved by the owner): private
notes; packs bring their own screens; ordering follows works for. Research and the designs weighed:
[07-privacy-and-record.panel.md](07-privacy-and-record.panel.md).

## The rule: hide the story, never the fact

**A note can be private.** That is the only privacy in core: a visit is never private, and there are no restricted patients (they can
come later without touching this). A note is an entry of a type marked `is_note`, core's or a pack's. Nine rules say everything
(amended 2026-09-25):

1. **Private departments.** A department can be marked private (a department rule, e.g. Psychiatry; a starter setup may set it).
   Every note written there is private.
2. **One private note.** Any clinician can make a note private while writing it: start the line with `!`, or tick Private on its card
   (spec 05). Later, its author or anyone who works in its department can make it private or not private; not private needs a reason.
   Every change is logged.
3. **Who reads a private note.** The people who work in the department where it was written — holding a live role there that allows
   reading the record (`read:record`) — plus its author and responsible clinician. A role held everywhere does not count, so the owner
   does not; a role held there without `read:record` does not count either, whatever else the person holds everywhere. Everyone else
   sees *Private note*: no text, no author.
4. **Everything else shows.** Visits, dates, department names, clinicians, medicines, results, problems, allergies, vitals and requests
   show to everyone who may read the record. A doctor must see the lithium.
5. **Open anyway.** A staff member who may read the record gives a reason (Direct care · Emergency · Admin · Other with a few words), and
   that patient's private notes from that department open to them for 12 hours. The read is logged in the one read log. Pack, machine
   and importer users cannot.
6. **Consult replies.** A private note that answers a request is readable by whoever asked and by the people who work in the asking
   department; to anyone else it shows as *Private reply*. (Added 2026-09-24 after the leak review: otherwise a psychiatry consult could
   never reach the doctor who asked. Today: `core.reply_for_me`, `20260923000024_core_private_visit_leaks.sql:22-30`.)
7. **A note never moves.** It keeps its department for ever, so a transfer, a note written between visits, or a reply written in
   another department's visit changes nothing. (Today a note with no visit is never hidden and a note is judged by its visit:
   `20260923000024_core_private_visit_leaks.sql:33-36`.)
8. **Where it is kept.** In a small list beside the record, written when the note is signed; the note itself never changes (the spine
   is untouched). A correction of a private note is private. Privacy belongs to the note with all its versions: an earlier version
   never shows what the note hides.
9. **Packs.** Each pack entry kind says whether it is a note. A pack's note written in a private department is private. Psychiatry's
   risk is two entries: the level (not a note) and the text (a note), written by one command in one Done. A note type keeps no list.
   No special cases.

The test is made per note, never per visit: a visit can hold notes of several departments, private and not, and each note is hidden or
shown on its own.

*Removed 2026-09-25:* private visits (`visits.is_private`, `20260923000022_core_privacy_views.sql:8`; `mark_visit_private`,
`20260923000024_core_private_visit_leaks.sql:391-405`), the visit's "make private" toggle (`src/core/screens/visit/VisitScreen.tsx:121`),
"Private visit" in place of the department's name (for example `entry_card`, `20260923000024_core_private_visit_leaks.sql:42,46`), open
anyway per visit (`record_reads.opened_visit_id`, `20260923000022_core_privacy_views.sql:18-19`; `src/core/screens/visit/Record.tsx:173-190`),
and every rule that existed only because privacy lived on the visit (`visit_needed`, `wrong_visit` for privacy's sake, the
judging-department rule for replies carried into another visit, `private_department_ids` on transfer). With the name masks go the desk
exception (`core.sees_department`, `20260923000024_core_private_visit_leaks.sql:11-19`), reception's separate list of private visits
(`read_private_visits`, `20260924000012_core_reception_private.sql:30-44`) with its fold and its Gone line
(`src/core/screens/reception/Lists.tsx:35-45`, `:78-97`), and the private filters on queue rows
(`20260924000016_core_calling.sql:65-69`). The department rule "visits private from the start" becomes "private department". Drafts stay
stamped with the department they are written in, because a note's department decides its privacy.

## Everything answers the same way

- Queues, lists, review lists, search, files, values, trends, prints and the live channels apply the same test as the record, one
  function (`core.note_hidden`), asked per note. Tested in `supabase/tests/privacy.sql`, a case per rule and an assertion per place a
  note is masked.
- A hidden note is masked in: entry cards and entry data, one entry read in full, files and values, the results table and the review
  comparison, the recent reply on the request queue, the first line on visit cards (the first note the reader may read), a pack's rows
  made from it (by entry, never by visit), and the reply line and flag copied onto a request (`requests.reply_line`, `reply_flag`),
  wherever a request is returned. The reply line is read only through `core.entry_card`; K1's static scan fails any other function body
  that reads `requests.reply_line`.
- A retry of a write returns the stored entry only to its author.
- The live channels need the same access as the reads they hint at; a `record:` channel also needs that record opened in the last 12
  hours.
- A private note can be corrected or struck only by its author or someone who works in its department (`private_note`, the refusal
  `read_entry_file` gives for a hidden note's file; today it is named `private_visit`, `20260923000024_core_private_visit_leaks.sql:241`):
  open anyway opens it to read, never to write, so a 12-hour read never makes the reader its author.
- Search shows open visits with their department, and no consult questions; the patient's details (`read_patient`) list no past visits.
  A visit cancelled with no entries is left out of the visit list and search, for everyone.
- A pack's after-write call never receives a private note unless the pack is used in the note's department.

## One read log

Every open of a record is one row: who, when, from which department, why (an open visit here · a request with here · none · a pack ·
a machine · *opened anyway* with the reason and the department whose private notes it opens). Reloading within 10 minutes adds no row
unless private notes are opened anyway. Packs log their reads like people. From the same table: **Who opened this record** (per patient,
printable for the patient) and **Opened anyway** (every open-anyway in a period, and every note made not private, with its reason) —
both under the existing action `read:record_reads`, which counts only from a role held everywhere, with a second factor (spec 02). No
second table: the list is the review.

The reason is honest (amended 2026-09-25):
- A record is read from a department where the reader holds a role, or from their role held everywhere (`not_allowed` otherwise).
- *An open visit here* or *a request with here* is recorded only when the reader holds a role scoped to that department, or is the
  visit's assignee or the request's requester. Otherwise the reason is *none*.
- Machine and importer users get their own reason, *a machine*, and are listed on the review. Today they are logged as *a pack*
  (`20260923000022_core_privacy_views.sql:90`).

## A correction stays where it was written (01)

A correction keeps the visit and department of the entry it replaces, and the corrector must be allowed to write there. Before this, a
correction took the corrector's department: correcting a private note would have moved it out of its department. A correction of a
private note is private (rule 8).

Added 2026-09-25: a private note can be corrected or struck only by its author or someone who works in its department
(`private_note`): open anyway opens it to read, never to write, so a 12-hour read never makes the reader its author. A correction keeps
the reply it belongs to (`reply_mismatch` otherwise). Allowed to write there means `write:<type>` at the original department, whether or
not the type's pack is on or used there; the pack's own card opens for Correct either way.

## Department rules (02)

The rules move from the organization to each department, with defaults for a new department: **patients wait for results** (yes),
**results to review** (critical · abnormal · all; critical), **private department** (no). Done follows the department's waiting rule;
the visit menu offers the opposite once, and *Return to waiting*. Which rules a department has follows its work (spec 02): private
department is offered to visits and stays departments only, and a starter setup may set it (Psychiatry clinic). Turning it on or off
changes only the notes signed afterwards (rule 8).

## The record views (05)

One record, no filters, no view switch. One organization setting (Settings → Organization) decides how everyone sees it: **by visit**
(the default) or **all entries**; *Results over time* is one button away. (Amended 2026-09-24 by the owner: filters and the switch
removed; the choice is the organization's, not each department's.)

- **Always on top:** open requests, and results waiting for review.
- **By visit:** one card per visit — date, department, clinician, status, counts, and when it last changed. Cards come
  newest activity first: when two visits run the same day, the one written in last is on top, live. Today's visit and this department's
  last visit start open; the others are one line and load their entries when opened. Entries without a visit sit under *Between visits*.
  Every visit's card looks the same to everyone; a private note the reader may not read shows as *Private note*, with no author, and the
  card's first line never comes from it (it stays empty when every note is hidden).
- **Open anyway:** a *Private note* offers **Open anyway**, a card under it with the reason chips (rule 5), never a modal. It opens that
  patient's private notes from that note's department for 12 hours.
- **All entries:** newest first, 100 at a time, *Earlier* for more.
- **Results over time:** tests as rows, dates as columns, abnormal in colour, corrections marked; a row opens its graph.
- **Opening an entry:** click or Enter opens it in full beside the record: text, values, replies, steps, earlier versions.
- Times show in the clinic's time zone (Settings → Organization); "today" on the server is the clinic's day.
- The left column (problems, medications, allergies) stays in view while the record scrolls.

## Decisions (2026-09-24, 2026-09-25)

1. Private notes, not private visits or restricted patients (amended 2026-09-25 by the owner: private visits are replaced). 2. No prompt
when opening an ordinary record; the log records why. 3. A problem such as HIV is never hidden (it is a fact); the note where it was
discussed can be private. 4. The owner does not read private notes by role; the owner reviews the log. 5. Consent at registration:
record it until an Egyptian lawyer confirms what PDPL 151/2020 requires (compliance date about 31 Oct 2026).

Added 2026-09-25: 6. The department's name shows; only notes are hidden. 7. "Works in" means a live role held in that department that
reads the record. 8. A note never moves: it is judged by the department it was written in, for ever. 9. A note is private because its
department is private, or because a clinician made it so (`!` or the Private tick); its author or the people who work in its department
change that later, and not private needs a reason. 10. Open anyway is for staff, per patient and department; pack, machine and importer
users cannot. 11. The test is per note, never per visit. 12. Privacy is kept in a small list beside the record, written at signing; the
spine is untouched.

## Known limits

The medication list can reveal a diagnosis (clozapine, antiretrovirals) — accepted for safety. Staff and VIP records are protected only by
the log until restricted patients are added. A sensitive remark in an ordinary department is private only when its writer or a
colleague there makes it so (`!`, or Make private later).

Added 2026-09-25:
- A department's name (Psychiatry, Sexual health) shows wherever the record is read. Starter setups for sensitive specialties suggest
  neutral names, and paper that leaves the building carries only the organization and the site. To confirm with the Egyptian lawyer
  under PDPL 151/2020 and Penal Code Art. 310.
- Words inside everything that is not a note stay visible, even in a private department: orders, prescriptions, problems (their
  note), allergies (their reaction), vitals, and any pack type that is not a note. The composer says "only notes are hidden".
- Retiring a department leaves its private notes hidden; open anyway still reads them.
- A department marked private later does not make its earlier notes private, and unmarking it does not open them; each is changed by
  hand.
