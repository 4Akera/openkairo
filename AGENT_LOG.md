# Autonomous loop log

## 2026-08-07 — Iteration 1: name-first check-in

**Item:** Simplify patient-flow check-in (top simplify item).

**What changed:**
- Check-in dialog reduced from 5 fields to search-only (+ queue select when
  patient-facing departments exist). Tapping a search result checks the
  patient in immediately; the dialog closes. Booking keeps only the "when"
  field.
- Physician assignment moved inline onto the queue row (compact "Assign"
  select, disappears once assigned) and reason became inline click-to-edit
  ("+ reason") — both in the shared VisitQueue, so Front Desk and clinic
  Patients tabs got the change together.
- Files: `src/pages/FrontDeskPage.tsx`, `src/components/visits/VisitQueue.tsx`.

**Why highest value:** first unchecked simplify item; directly reduces
check-in from 5 decisions to 1 tap.

**Verification:** tsc clean, eslint clean, 106/106 tests, browser-verified:
one-tap check-in created the visit (row appeared via realtime), inline assign
set "Dr. James Harrison" on the row, inline reason affordance renders.

**Note on this commit:** the branch's first commit is a baseline that also
contains the pre-existing uncommitted work in this tree (the visits/patient
flow feature, the unified department shell, and a concurrent session's
Settings refactor) — those changes predate the loop and were never committed
anywhere else. From iteration 2 onward, commits are one-item-sized.

## 2026-08-07 — Iteration 2: one meaning per word — "template"

**Item:** Unify "template" naming (second simplify item).

**What changed:** user content templates are now called **defaults** in every
user-facing string; "Templates" refers only to encounter templates.
- Settings → My Blocks: "Content Templates" → "My Defaults", body copy,
  "Add a default for", "Save Default" (`BlockTemplatesSection.tsx`).
- Add Block menu: picker tooltip "Choose template" → "Choose default"
  (`AddBlockMenu.tsx`).
- Encounter creation: "pre-filled from your templates" → "…your defaults"
  (`PatientPage.tsx`).
No schema or variable renames — UI vocabulary only, per the item's scope.

**Why highest value:** top unchecked simplify item; "template" meaning three
things was called out as a core confusion in the product review.

**Verification:** tsc clean, eslint clean, 106/106 tests; browser-verified
Settings → My Blocks shows "My Defaults" / "Add a default for", and the
encounter Templates section is unchanged.

## 2026-08-07 — Iteration 3: one phrase for "who sees this block"

**Item:** Collapse block-visibility booleans in the Settings UI (third
simplify item).

**What changed:** new pure helper `blockVisibilitySummary(def, roles)` in
`src/lib/blockVisibility.ts` derives a single status phrase from the gate
fields — "Off — hidden everywhere" / "Department portal only" /
"All clinical staff" / role names. Block Library rows now show that phrase
as a subtitle and the ambiguous "Disabled" and "N roles" badges are gone
(`blocksSections.tsx`). Six unit tests added.

**Why highest value:** top unchecked simplify item; six overlapping
boolean-ish notions of "does this block show up" was a named pain point.

**Verification:** tsc clean, eslint clean, 112/112 tests (6 new);
browser-verified Block Library shows "Physician, System Admin",
"All clinical staff" (Vitals), "Department portal only" (Lab/Radiology
Result) as row subtitles.

## 2026-08-07 — Iteration 4: Simple/Advanced block-definition modal

**Item:** Progressive disclosure in BlockDefinitionModal (last simplify
item).

**What changed:** the full (non-built-in) form now shows only Basic Info
(name, slug, description, icon, color) and Fields; the Capabilities,
Department-only, Billing, and Role-access sections sit behind a single
"Advanced options" expander, collapsed by default
(`BlockDefinitionModal.tsx` — one `showAdvanced` state wrapping the four
sections; no logic changes).

**Why highest value:** the 1,400-line single-scroll modal was the "eight to
ten concepts to configure one block" problem in physical form; a new simple
block now fits on one screen.

**Verification:** tsc clean, eslint clean, 112/112 tests; browser-verified —
New Block Type opens as Basic Info → collapsed Advanced → Static Fields on
one screen; expanding reveals Capabilities et al.

## 2026-08-07 — Iteration 5: clinic walk-in check-in (shared CheckInDialog)

**Item:** Walk-in check-in on a clinic's own Patients tab (first UX item).

**What changed:** the name-first check-in dialog moved out of FrontDeskPage
into `src/components/visits/CheckInDialog.tsx` with a `fixedDepartmentId`
prop. The Front Desk uses it unchanged (queue selector, book mode); a
clinic's Patients tab (DepartmentPage) gets a "Check in" header button and
an empty-state action, both opening the dialog locked to that clinic's
queue — no queue selector shown. FrontDeskPage shrank ~140 lines.

**Why highest value:** first unchecked UX item; clinics running their own
desk previously had no way to admit walk-ins from their workspace.

**Verification:** tsc clean, eslint clean, 112/112 tests; browser-verified
on the user-created Cardiology clinic — Patients tab shows its 2-patient
queue, Check in opens the search-only dialog (queue locked, no selector).

## 2026-08-07 — Iteration 6: referral chain on queue rows

**Item:** "← from <dept>" on referred visits (second UX item).

**What changed:** `fetchTodayVisits` self-joins the origin visit
(`referred_from:visits!referred_from_visit_id(department_id,
departments(name))`); new tested helper `referralSourceLabel` resolves it to
the origin queue's name ("General" for the default queue); VisitQueue
renders it in the row subtitle. Also: fetch errors are now console-logged
instead of silently returning an empty queue.

**Gotcha found & fixed:** embedding by constraint-name hint
(`visits!visits_referred_from_visit_id_fkey`) returns PGRST200 on this
PostgREST version for the self-join — the column-name hint
(`visits!referred_from_visit_id`) works. The silent error made the queue
render empty; hence the new error log.

**Verification:** tsc clean, eslint clean, 117/117 tests (5 new);
browser-verified — temporarily chained a live visit, row showed
"← from General", then reverted the test link.

## 2026-08-07 — Iteration 7: avg-visit stat on Front Desk header

**Item:** "Avg wait today" stat (third UX item).

**What changed:** tested helper `averageWaitMinutes` (arrival→checkout over
finished visits only; null until one completes, so in-progress waits don't
skew low) + a muted "avg visit today Xm" line in the Front Desk header next
to the queue count. Filter-aware: respects the selected queue.

**Verification:** tsc clean, eslint clean, 120/120 tests (3 new);
browser-verified header shows "avg visit today 9m" from the day's two
completed visits.

## 2026-08-07 — Iteration 8: "Clinic" labeling (UX tier complete)

**Item:** Label patient-facing departments as Clinic (last UX item).

**What changed:** a "Clinic" chip appears on Settings department cards and
the department page header for can_receive_patients departments; the editor
checkbox now reads "Clinic — receives patients (Front Desk queue)".
Vocabulary matches the mental model: department = fulfils orders, clinic =
sees patients — without splitting the table.

**Verification:** tsc clean, eslint clean, 120/120 tests; browser-verified
the Cardiology page header shows the Clinic chip.

## 2026-08-07 — Iteration 9: allergy cross-check at prescribing time

**Item:** Meds module ("mx"), slice A of the feature item: allergy
cross-check in MedsBlock. (Slice B — syncing block meds into
patient_medications — is next; item left unchecked with progress note.)

**What changed:** new tested matcher `findAllergyConflicts` in
`src/lib/allergyCheck.ts` (conservative token substring match, ≥4-char
tokens, both directions). MedsBlock edit loads the patient's allergy list
(via block.patient_id or the encounter) and renders a red inline warning
under any med row whose name matches a recorded allergen — name, severity,
reaction. Discontinued meds don't warn.

**Verification:** tsc clean, eslint clean, 125/125 tests (5 new);
browser-verified on a real chart — typing "Penicilina 500mg" for a patient
with a severe Penicilina allergy showed the warning with reaction text
live. Test block removed from the encounter afterwards.

## 2026-08-07 — Iteration 10: MedsBlock → patient medication list sync

**Item:** mx slice B — completes the meds-module backlog item.

**What changed:** `src/lib/medsSync.ts` — additive-only sync: saving a
MedsBlock inserts its ACTIVE meds into `patient_medications` when the
master list doesn't already have them (normalized-name match, any status);
it never updates or discontinues master rows — the record UI stays the
authority. Carries dose/route/freq, prescriber (current profile), start
date today, indication as a note. Pure decision logic `medsToAdd` unit
tested; MedsBlock calls the sync after save.

**Scope note:** PharmacyFulfillment-side sync deferred — dispensing already
writes result blocks; wiring it into the master list is a separate
decision worth making with real usage. Item ticked with that note.

**Verification:** tsc clean, eslint clean, 130/130 tests (5 new);
browser-verified — saved a "Paracetamol 1g" meds block for a patient whose
master list had only Metformine; patient_medications gained the Paracetamol
row (dose, prescriber, start date) and Metformine was not duplicated. Test
rows removed afterwards.

## 2026-08-07 — Iteration 11: voice typing in Note blocks (BACKLOG EMPTY)

**Item:** Voice typing via Web Speech API — the final backlog item.

**What changed:** `src/hooks/useDictation.ts` — feature-detected wrapper
around (webkit)SpeechRecognition: final results only, auto-restart through
the browser's silence timeouts, mic-permission errors surfaced inline,
clean stop on unmount. `appendDictation` (tested) handles spacing when
inserting fragments. NoteBlock's editor gains a "Dictate" pill that pulses
red while listening; it renders only where the API exists, so unsupported
browsers see nothing new.

**Verification:** tsc clean, eslint clean, 133/133 tests (3 new);
browser-verified the Dictate button renders in the Note editor (Chromium).
Actual speech input cannot be simulated headlessly; the permission-denied
path is handled. Test note block removed afterwards.

**Loop state:** the backlog in CLAUDE.md is now fully ticked. Stopping the
autonomous loop; restart with /loop after curating new backlog items.

## 2026-08-07 — Iteration 12: department tabs follow capabilities (user bug)

**Item:** User-reported: their Cardiology clinic (orders and direct entries
disabled) still opened on the Work tab with an empty order queue.

**What changed:** DepartmentPage derives its tabs from capabilities — the
Work tab exists only when `can_receive_orders || can_create_direct`; pure
clinics open directly on their patient queue with no toggle; hybrids keep
the toggle and default to Work.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
/dept/card now opens straight on the Waiting queue, no Work tab.

**Backlog refilled:** new "One Journey" tier added by user direction —
scheduling, visits, patients, and encounters must feel like one thing.

## 2026-08-08 — Iteration 13: one-tap Start encounter from the queue

**Item:** One Journey — queue rows grow a "Start encounter" button.

**What changed:** VisitQueue's active rows without a linked encounter show
"Start encounter": one tap creates the encounter (physician carried from
the visit; physicians self-assign when unassigned; disabled with a hint
when neither), links visit.encounter_id, advances the stage to the second
configured stage (Waiting → With doctor), and navigates straight in.
Shared component, so Front Desk and clinic Patients tabs both gained it.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
end-to-end — checked Jane Smith in, pressed Start encounter, landed in a
fresh open encounter assigned to Dr. James Harrison; DB confirmed the visit
linked and stage moved to "With doctor". Test visit+encounter removed.

**Observation for the journey:** day rollover made yesterday's unfinished
visits vanish from the Front Desk — the "carried over" backlog item is
real; it stays queued in the features tier.

## 2026-08-08 — Iteration 14: visit journey strip in the encounter

**Item:** One Journey — the visit's logistics visible and controllable
inside the encounter.

**What changed:** new `VisitJourneyStrip` renders as a slim bar under the
encounter header when a visit is linked: arrived time, live in-clinic
duration, the stage as an inline select, and Check out — flipping to
"Checked out <time>" when done, updated via realtime. The checkout dialog
(charges + open-orders heads-up) was extracted from VisitQueue into a
shared `CheckoutDialog`, so queue rows and the strip use one
implementation. Encounters without visits render nothing new.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
the full journey without leaving the encounter — checked Jane Smith in,
one-tap Start encounter, strip showed "Arrived 12:20 AM · in clinic 0m ·
With doctor · Check out", checkout flipped it to "Checked out 12:21 AM"
in realtime. Test visit and encounter removed afterwards.

## 2026-08-08 — Iteration 15: one Visits list on the patient page

**Item:** One Journey — merge visits and encounters into a single history.

**What changed:** PatientPage now fetches the patient's visits alongside
encounters and renders ONE journey: an "Upcoming" section (booked visits,
soonest first) and a "Visits" section (newest first) where each entry shows
its logistics line — arrived / checked out / stage / reason — above the
linked encounter card. Encounters without visits stand alone; visits
without clinical documentation show a quiet placeholder. The Open/Closed
encounter sections and the "Encounters" tab label are gone (tab now says
"Visits").

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
on a patient with a completed visit — "Arrived 5:19 PM · checked out
5:37 PM" renders above the linked Follow up encounter card in one list.

## 2026-08-08 — Iteration 16: day navigation (ONE JOURNEY TIER COMPLETE)

**Item:** Scheduling beyond today — the last One Journey item.

**What changed:** the Front Desk header gains ‹ Today › day navigation
(no calendar module): `useVisitQueue(dateKey)` parameterizes the day,
"Tomorrow"/"Yesterday"/weekday labels, one-tap return to today. Off-today
views hide walk-in check-in and the today-only stats and offer Book
instead; queue rows refuse to check a booking in before its day arrives.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
— seeded a booking for tomorrow 10:00, navigated ›, saw it under Upcoming
with Assign but no Check in; header showed Book only. Seed removed.

**Tier complete:** all five One Journey items are shipped. The journey now
reads: book → (day nav) → check in → queue → one-tap Start encounter →
journey strip in the encounter → checkout → one merged Visits history on
the patient page. Remaining backlog: features (dictation extension,
carried-over visits).
