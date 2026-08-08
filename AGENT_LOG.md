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

## 2026-08-08 — Iteration 17: dictation across text-heavy blocks

**Item:** Extend voice typing beyond the Note pilot.

**What changed:** the inline pill from NoteBlock became a shared
`DictateButton` component (feature-detected, error display included);
NoteBlock was refactored onto it, and it now sits on Nurse Note's entry
composer, Consultation's clinical summary + consultant response, and
Discharge Note's hospital course. Net: four blocks dictate through one
component and one hook.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
the Dictate pill in the Nurse Note composer (identical component in the
other blocks). Test block removed.

## 2026-08-08 — Iteration 18: carried-over visits (BACKLOG EMPTY, loop stops)

**Item:** The last backlog item — stranded visits stop vanishing at
midnight.

**What changed:** `fetchCarriedOverVisits` finds visits that arrived on a
previous day and were never checked out or cancelled; the today view of the
Front Desk shows them in a quiet amber "Carried over" section (with the
usual row actions — assign, stage, start encounter, check out). Off-today
views and clinic tabs are untouched; the dept filter applies.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
with REAL stranded data — three visits from yesterday (7h+ old) appeared
under "Carried over" with full actions.

**Loop state:** backlog fully ticked again — stopping the autonomous loop.
This run shipped 7 commits: the clinic-tabs bug fix, the five One Journey
items, dictation across blocks, and carried-over visits. Restart with
/loop after curating new backlog items.

## 2026-08-08 — Iteration 19: "Mine" on the Front Desk (new tier: one
place for patients)

**Item:** User complaint — patients appear in too many places (Recent /
Assigned / Front Desk / departments / patient list). New top tier collapses
to TWO surfaces + search. First slice: the clinician's worklist becomes a
"Mine" chip on the Front Desk.

**What changed:** FrontDeskPage gains a Mine toggle filtering the day's
visits AND the carried-over section to `assigned_to = me`, composing with
the queue switcher and day navigation.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
— Mine dropped the carried-over list from 3 to 2, hiding the unassigned
visit. (Also fixed en route, prior commit: sidebar nav scrolls when
memberships overflow.)

## 2026-08-08 — Iteration 20: Patients = registry (TIER + BACKLOG DONE)

**Item:** Delete the Dashboard's triple sidebar — the second and final
slice of "one place for patients".

**What changed:** DashboardPage lost the desktop Encounters sidebar
(Waiting for me / Assigned / Recently opened), the mobile Patients/Recent
tab strip, and all the queue/recents state feeding them (~350 lines).
It is now purely the registry: search, filters, list. recentItems.ts
stays — patient recents feed GlobalSearch and the DeptPortal walk-in
picker, and encounter refs feed EncounterPage's access-revoked heuristic.

**The answer to the user's complaint:** patients now live in exactly two
surfaces plus search — Patients (registry), Front Desk (the day, with
Mine/queue/date filters; clinic tabs are the same view scoped), ⌘K.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
the registry renders single-pane with no tab strip or sidebar.

**Loop state:** backlog fully ticked — stopping the loop.

## 2026-08-08 — Iteration 21: one ending — "Finish visit"

**Item:** New "Simple power" tier (user: keep simplifying, add power).
First item: merge the two endings.

**What changed:** the encounter's Close button becomes **Finish visit**
when an active visit is linked (VisitJourneyStrip reports its visit up via
a new onVisitChange prop): confirming close now chains straight into the
shared CheckoutDialog — encounter closed and patient checked out in one
flow. Encounters without visits keep the plain "Close Encounter" ending.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
end-to-end on a carried-over visit — Start encounter → header shows
"Finish" → dialog "Finish visit? … Checkout follows right after" → billing
review → checkout auto-opened → confirmed; DB shows encounter closed AND
visit finished. Test data removed.

## 2026-08-08 — Iteration 22: one-tap New Encounter

**Item:** The patient-page dialog catches up with the queue's one-tap path.

**What changed:** the New Encounter dialog opens as one sentence + one
button (physicians/admins: "Starts a private encounter assigned to you"),
with title/template/visibility/physician behind an Options expander.
Nurses/receptionists still see the physician picker upfront (RLS requires
an assignee); everything else stays collapsed. Confirm button renamed
Start Encounter; no state or logic changed — pure progressive disclosure.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
— dialog opened collapsed, one tap on Start Encounter created and
navigated into a fresh open encounter (header correctly read "Close",
not "Finish", since no visit was linked). Test encounter removed.

## 2026-08-08 — Iteration 23: result-ready notifications

**Item:** Close the ordering loop in realtime.

**What changed:** new `ResultToasts` mounted once in the app shell:
subscribes to block_actions updates; when an order the current user placed
transitions to completed, a toast appears bottom-right ("<Department>
result ready — <patient> · tap to open") linking to the encounter.
Self-contained mini-toaster (no library), auto-dismisses, dedupes by
action id.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
— flipped a live in-progress lab order (placed by the logged-in admin) to
completed via SQL and the toast appeared with patient name; reverted the
order's status afterwards.

## 2026-08-08 — Iteration 24: one Blocks place in Settings

**Item:** Merge My Blocks / Templates / Block Library into one section.
(The AI pilot stays parked awaiting the user's Edge Function + API key
approval, per the charter's hard stop.)

**What changed:** Settings nav drops from 10 to 8 entries: a single
"Blocks" item shows a BlocksHub with My Blocks / Templates / Block Library
as tabs (permission-gated; single-tab users see no tab strip). The three
section components are unchanged — pure navigation consolidation.

**Verification:** tsc clean, eslint clean, 133/133 tests; browser-verified
the merged nav and tab switching between My Blocks and Block Library.

## 2026-08-08 — Iteration 25: 7-day wait-time trend

**Item:** First analytics — a sparkline, zero config.

**What changed:** `dailyAverageWaits` (tested) buckets the trailing week's
completed visits by finish day; the Front Desk header renders a tiny SVG
bar sparkline beside the avg stat (today's bar in primary), hidden until
at least two days have data, desktop only, today view only.

**Verification:** tsc clean, eslint clean, 135/135 tests (2 new);
browser-verified the sparkline in the header with real two-day data.

**Loop state:** every unblocked backlog item is done. The two remaining
items (AI-filled blocks pilot, AI visit summary) are gated on the user's
approval to deploy an Edge Function + set ANTHROPIC_API_KEY. Stopping the
loop per the charter's hard stop; restart after approval.

## 2026-08-08 — Ground-up restructure: THE ENCOUNTER IS THE EVENT

**User direction:** redesign the structure from the ground up; encounter
as the main event, absorbing the visit; app opens on Today.

**Phase A (schema, user-approved):** encounters gained department_id,
scheduled_at, arrived_at, finished_at, cancelled_at, stage, reason,
referred_from_encounter_id + partial indexes; legacy visits rows migrated
in (linked visits filled their encounters; standalone bookings/walk-ins
became encounters); encounter_insert relaxed (check-in needs no upfront
assignee — the queue's inline Assign covers it). The visits table is
FROZEN legacy, kept for archaeology.

**Phase B (code):** lib/visits now reads/writes encounters (one
JOURNEY_SELECT with patient + referral-origin joins); Visit is a type
alias extending Encounter; check-in/booking create encounters directly
(visibility staff); queue rows ARE encounters, so "Start encounter"
became a plain **Open** that self-assigns physicians and advances the
stage; the journey strip reads the encounter row itself; CheckoutDialog
queries by the row id; the patient page journey needs no merging at all;
linkEncounterToActiveVisit deleted — there is nothing to link.

**Phase C (home):** the app opens on Today (Front Desk at /); the registry
moved to /patients; sidebar order Today · Patients · Settings · depts;
/frontdesk redirects home. Cashier-as-queue deferred to backlog.

**Verification:** tsc clean, eslint clean, 135/135 tests; browser-verified
end-to-end — signed in lands on Today; Jacob's migrated row (user-authored
note + title) opened as ONE record showing clinical timeline + journey
strip + Finish; registry works at /patients. Migration counts checked in
SQL (4 encounters carry journeys).

## 2026-08-08 — Registry becomes search-first (user critique)

**User:** the patient list is pointless at scale — a hospital can register
500k patients a year; nobody browses page 1 of 10,000.

**What changed:** /patients no longer fetches anything until you type or
filter. The default view is a search hero ("Find a patient — N on record ·
search by name, MRN, phone, or birth year · New Patient"); the header badge
uses a cheap head-count instead of a list fetch. Results and pagination
appear only for queries; the browse-all default is gone.

**Verification:** tsc clean, eslint clean, 135/135 tests; browser-verified
— empty registry shows the hero with the live count and no list request;
typing "chopin" returned 1 of 1 instantly.

## 2026-08-08 — Iteration: single source in the encounter view

**Item:** Post-restructure cleanup — the strip and the page were fetching
the same encounter row twice, bridged by an onVisitChange callback.

**What changed:** VisitJourneyStrip is now pure presentation
({encounter, patient, onChanged}); its fetch, realtime channel, and the
page's linkedVisit mirror are deleted. EncounterPage derives one
`inClinic` flag from its own row for all Finish/Close labels and chains
checkout from the same object; a single row-level subscription keeps the
journey live when the desk moves the patient.

**Verification:** tsc clean, eslint clean, 135/135 tests; browser-verified
Jacob's encounter — strip renders identically from page-fed props with
Finish in the header.

## 2026-08-08 — Iteration 37: the "portal" is dead in name too

**Item:** Post-restructure cleanup — DeptPortal.tsx rename (highest-priority
tier; the last non-schema cleanup item).

**What:** `git mv DeptPortal.tsx → DepartmentWork.tsx`; exported component
`DeptTab` → `DepartmentWork` (DepartmentPage updated). Renamed every internal
"portal" identifier (`portalRegistryRenderKey` → `workRegistryRenderKey`,
`PortalChargeAct` → `WorkChargeAct`, `PORTAL_QUEUE_SELECT` →
`WORK_QUEUE_SELECT`, realtime channel `portal:` → `dept-work:`) and retired
"portal" from user-facing copy: Settings block editor/library now say
"department workspace", `blockVisibility` summary reads "Department workspace
only" (test updated), void reason string updated. The full component split
was deferred — it moves 2.5k lines without removing a concept; TODO noted in
the file header.

**Why highest value:** the portal shell was deleted in the restructure, but
the name survived in code and Settings copy — users were still being taught a
concept that no longer exists. Naming is the cheapest simplification.

**Verification:** tsc clean, eslint clean on all 8 touched files, 135/135
tests, browser: /dept/lab renders the Laboratory work queue (39 orders,
actions intact), zero console errors.

**Remaining in tier:** both schema-gated (visits table drop, pg_trgm) —
blocked on user approval per charter.

## 2026-08-08 — Iteration 38: Queues vs Departments (Settings split)

**Item:** "Queues are the app" tier, item 1 — the Queues/Departments split
in Settings (new user-approved top priority).

**What:** Settings → Departments became two sections. **Queues**: pure
patient lanes (capability-less department rows), created with ONE name
field, inline rename + color, delete. **Departments**: only order-capable
units keep the full card (services, members). The three capability
checkboxes collapsed to a single "Also sees patients — own queue on Today"
toggle for hybrids (orders/direct default true on create, preserved on
edit); the Clinic chip and capability bullet list left the UI. New
`lib/queues.ts` (`isQueueDept`) + 3 tests. Nav label: "Queues &
Departments". NO schema change — a queue is a departments row with
can_receive_patients only.

**Why highest value:** first item of the user's newly approved restructure;
removes three user-facing concepts (capability flags, Clinic label,
clinic-as-department) in one pass.

**Verification:** tsc clean, eslint clean (5 touched files), 138/138 tests
(3 new), browser: Cardiology listed under Queues; Lab/Radiology under
Departments; created "Dermatology" via the one-field flow → appeared in
Today's queue switcher instantly; test row deleted from remote after.

## 2026-08-08 — Iteration 39: Today absorbs clinic queues

**Item:** "Queues are the app" tier, item 2.

**What:** Pure patient queues no longer have pages or nav entries.
DepartmentPage is now the work view only — tab toggle, VisitQueue,
CheckInDialog, and the Clinic chip deleted from it; /dept/<queue> redirects
home (the lane lives in Today's switcher, which already lists every
patient-facing department). Sidebar (desktop + mobile) shows only
order-fulfilling departments; DeptAwareIndex and the /portal redirect
land dept-only users in their first non-queue department, else Today.
DepartmentPage.tsx: 175 → 93 lines.

**Why highest value:** next unchecked item in the user-approved restructure;
deletes a whole navigation surface (clinic pages) without losing any
function.

**Verification:** tsc clean, eslint clean (3 touched files), 138/138 tests,
browser: /dept/card redirected to Today; sidebar lists only Lab/Radiology;
/dept/lab work queue renders (39 orders). One stale HMR ReferenceError in
console from mid-edit state — did not recur across two fresh reloads.
Realtime websocket errors observed are environmental (supabase wss
unreachable at the moment), unrelated to this change.

## 2026-08-08 — Iteration 40: "+ Patient" one-motion arrival

**Item:** "Queues are the app" tier, item 3.

**What:** CheckInDialog is now the "+ Patient" flow: when the search finds
nobody, an inline mini-form (first/last prefilled from what was typed +
optional phone) creates the patient AND queues them in one motion — the
full CreatePatientDialog is no longer part of the queue flow (the search
itself is the duplicate check; everything else fills in later on the
patient page). Check-in/check-out wording retired app-wide: header button
"Patient", empty state "Add the first patient", dialog "Add a patient",
booked rows arrive via "Arrived", row/strip ending is "Done", finished
section "Done", CheckoutDialog titled "Finish visit".

**Why highest value:** next unchecked item in the approved restructure; the
front desk's most frequent action drops to one motion, and the last
hotel-vocabulary concept leaves the UI.

**Verification:** tsc clean, eslint clean (5 touched files), 138/138 tests,
browser end-to-end: typed "Zorro Testman" → no match → mini-form prefilled
→ Add to queue → row in WAITING with Assign/stage/Open/Done actions; Done
opens "Finish visit" with the charge/order heads-up. Test patient +
encounter deleted from remote after.

## 2026-08-08 — Iteration 41: Patients leaves the nav; "Open" chip on Today

**Item:** "Queues are the app" tier, item 4.

**What:** The Patients nav entry is gone from both sidebars — the sidebar is
now Today · Settings (+ order departments + Billing). The /patients route
stays for deep links and ⌘K. Today gains an "Open" chip beside Mine: every
open encounter regardless of day, newest first, Mine-filterable, one tap
into the encounter — covering what the registry's Open/Assigned filters
did.

**Verification:** tsc clean, eslint clean, 152/152 tests, browser: nav
shows no Patients; Open chip lists open encounters with titles/dates.

**NOTE — foreign changes on disk:** during this iteration
`src/pages/DepartmentWork.tsx` was modified and `src/lib/deptWorklist.ts`
(+ tests, 14 of the 152) appeared — NOT my work (another session/editor:
lane grouping, STAT ordering, save-&-next for the dept worklist). Left
UNCOMMITTED deliberately; committed only Sidebar.tsx, FrontDeskPage.tsx,
CLAUDE.md, AGENT_LOG.md. Flagged to the user.

## 2026-08-08 — Iteration 42: running bill on the encounter (charging pass 1/2)

**Item:** "Queues are the app" tier, item 5 (first half).

**What:** New `EncounterBill` chip in the encounter header: live total of
the encounter's charges (void/waived excluded), tap → line items with
statuses + total + a one-tap "add charge" picker fed by the Service Items
price list (insert at default price, status pending). Renders only when
billing is enabled AND the user has billing access (matches charges RLS).
The price-list half of the backlog item already existed as Settings →
Service Items — nothing new invented. REMAINING for next iteration: the
Cashier lane on Today (finished visits with unpaid charges).

**Verification:** tsc clean, eslint clean, 152/152 tests, browser on a
real encounter with 8 charges: chip showed PLN379.00 (matches SQL sum);
dialog listed all lines incl. Pending-Insurance ones; one-tap HbA1c add
updated the chip to PLN404.00 live. Test charge deleted after.

**Note:** foreign deptWorklist changes still uncommitted on disk (see
iteration 41 note) — again excluded from this commit.

## 2026-08-08 — Iteration 43: Cashier lane on Today (charging pass 2/2)

**Item:** "Queues are the app" tier, item 5 (second half) — item now DONE.

**What:** "Cashier" chip on Today (shown only when billing is enabled and
the user has billing access): patients grouped from unpaid charges
(pending / pending_approval / pending_insurance), sorted by amount owed,
tap → /billing?patient=<id>. BillingPage learned the ?patient= deep link
(selects the patient AND fetches their billing, then cleans the URL).
Mine/Open/Cashier chips are mutually exclusive views. Also fixed a header
overflow the third chip caused (flex-wrap on the Front Desk header rows).

**Verification:** tsc clean, eslint clean, 153/153 tests, browser: Cashier
lane listed Robert James Mitchell (PLN379.00, 8 items) + one more, tap
opened Billing with his full workspace (charges, totals, insurance)
loaded. First tap-through exposed the missing fetch on deep link — fixed
and re-verified.

**Note:** parallel session still active (test count 152→153, queue rows
changing live, deptWorklist files still uncommitted — again excluded).
