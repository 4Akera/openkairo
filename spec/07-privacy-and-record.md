# 07 · Privacy and the record views

Status: **locked** · 2026-09-24 · approved by the owner · amends 01 (a correction keeps its visit and department), 02 (the read log,
department rules, reading private visits), 03 (private visits; search shows only what you may see), 05 (the record views). Research and
the designs weighed: [07-privacy-and-record.panel.md](07-privacy-and-record.panel.md).

## The rule: hide the story, never the fact

**A visit can be private.** That is the only privacy in core. There are no private notes and no restricted patients (both can come later
without touching this).

- A department can start every visit private (a department rule; a psychiatry or sexual-health pack sets it for its department type).
  A clinician can make any single visit private, or not private; the visit's history records who and when.
- Privacy lives on the visit, outside the record. Entries are unchanged: no flag, no column, nothing written into them.
- **Inside a private visit only the notes are hidden.** Prescriptions, results, requests, problems, allergies and vitals written in it
  stay visible to everyone who may read the record — a doctor must see the lithium to avoid the interaction.
- **Who sees a private visit in full:** staff whose role is in that visit's department (a role held in every department does not count,
  so the owner does not), and anyone who opened it anyway in the last 12 hours.
- **Everyone else** sees the visit as **Private visit** and its date: never the department's name, never the notes (each shows as
  *Private note*). The facts from it show with their author, and "Private visit" in place of the department. This holds in the record,
  search, reception's lists and the bench.
- **Open anyway:** a reason (Direct care · Emergency · Admin · Other with a few words) opens that visit for 12 hours. The read is logged.
- **A reply is written for whoever asked.** A note that answers a request (a consult reply) is readable by the requester and by staff of the
  requesting department, even when it was written in a private visit; to anyone else it shows as *Private reply* on the request. (Added
  2026-09-24 after the leak review: otherwise a psychiatry consult could never reach the doctor who asked.)
- **Everything answers the same way.** Queues, review lists, search, files, values and trends apply the same test as the record; a retry of a
  write returns the stored entry only to its author; the live channels need the same access as the reads they hint at. Tested in
  `supabase/tests/privacy.sql`.

## One read log

Every open of a record is one row: who, when, from which department, why (an open visit here · a request with here · none · a pack ·
*opened anyway* with the reason and the visit). Reloading within 10 minutes adds no row unless a visit is opened anyway. Packs log their
reads like people. From the same table: **Who opened this record** (per patient, printable for the patient) and **Opened anyway** (every
open-anyway in a period) — both under the existing action `read:record_reads`, held by the owner. No second table: the list is the review.

## A correction stays where it was written (01)

A correction keeps the visit and department of the entry it replaces, and the corrector must be allowed to write there. Before this, a
correction took the corrector's department: correcting a note from a private visit would have moved it out.

## Department rules (02)

The rules move from the organization to each department, with defaults for a new department: **patients wait for results** (yes),
**results to review** (critical · abnormal · all; critical), **visits private** (no). Done follows the department's waiting rule; the
visit menu offers the opposite once, and *Return to waiting*.

## The record views (05)

One record, no filters, no view switch. One organization setting (Settings → Organization) decides how everyone sees it: **by visit**
(the default) or **all entries**; *Results over time* is one button away. (Amended 2026-09-24 by the owner: filters and the switch
removed; the choice is the organization's, not each department's.)

- **Always on top:** open requests, and results waiting for review.
- **By visit:** one card per visit — date, department (or Private visit), clinician, status, counts, and when it last changed. Cards come
  newest activity first: when two visits run the same day, the one written in last is on top, live. Today's visit and this department's
  last visit start open; the others are one line and load their entries when opened. Entries without a visit sit under *Between visits*.
- **All entries:** newest first, 100 at a time, *Earlier* for more.
- **Results over time:** tests as rows, dates as columns, abnormal in colour, corrections marked; a row opens its graph.
- **Opening an entry:** click or Enter opens it in full beside the record: text, values, replies, steps, earlier versions.
- Times show in the clinic's time zone (Settings → Organization); "today" on the server is the clinic's day.
- The left column (problems, medications, allergies) stays in view while the record scrolls.

## Decisions (2026-09-24)

1. Private visits, not private notes or restricted patients. 2. No prompt when opening an ordinary record; the log records why.
3. A problem such as HIV is never hidden (it is a fact); the visit where it was discussed can be private. 4. The owner does not read private
visits by role; the owner reviews the log. 5. Consent at registration: record it until an Egyptian lawyer confirms what PDPL 151/2020
requires (compliance date about 31 Oct 2026).

## Known limits

The medication list can reveal a diagnosis (clozapine, antiretrovirals) — accepted for safety. Staff and VIP records are protected only by
the log until restricted patients are added. A sensitive remark inside an ordinary visit needs the whole visit made private.
