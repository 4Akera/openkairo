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

## 2026-08-08 — Iteration: department worklist at volume

**Item:** Department worklist at volume (user-approved 2026-08-08 in chat:
"Dept need simplifying and to be powerful… say lab 100k test per month").

**What changed:**
- `DepartmentWork.tsx` queue: dense rows replace the big order cards
  (~14 visible per screen vs ~8) — name · MRN · service chip · waited-time
  ("12m/3h 05m/2d", ticks every 60s) · one **Result** button. STAT orders
  pinned on top with a red tint. Row click expands to the original request,
  encounter link, and reject/cancel with reason.
- The separate Start step is gone (one concept removed): opening the entry
  form marks the order in-progress for other staff. Rows someone else
  started show "In progress" and stay openable.
- Lane chips above the list (All + one per service, busiest first, STAT
  flame on lanes that have one) filter the queue; hidden when there's only
  one lane.
- Save-&-next: after saving an order's result, an interstitial (or the
  billing-review footer) offers **Next** — chains straight into the next
  open order of the same lane, modal remounts per order via key.
- Scale fixes: queue load bounded to oldest 300 with an exact total count
  (badge shows the true count; realtime events adjust it, over-cap notice
  under the list); history's walk-in dedupe now checks only the fetched
  page of direct blocks instead of every `result_block_id` the department
  ever produced (was an unbounded query — a genuine 100k/month bug);
  `startOrder`'s redundant full-queue refetch removed.
- New `src/lib/deptWorklist.ts` (laneOf with payload block_type_id
  resolution, laneCounts, sortWorklist, nextInLane, waitedLabel,
  isStatOrder) + 15 tests.

**Why highest value:** user picked it this session; the unbounded history
query alone was a scale correctness bug, and the card-modal-one-at-a-time
flow was the biggest throughput bottleneck in the app.

**Verification:** tsc clean, eslint clean on touched files, 153/153 tests,
browser-verified as demo Lab user on Radiology (20 open orders): dense rows
+ STAT pinning rendered, one-click Result opened the entry form, saving
showed "Result saved — Next in Diagnostic imaging: …", Next chained into
the next patient's form, queue badge dropped 20→19 via realtime, History
showed the new entry, row expansion + Cancel order render. No console
errors. (Lane chips not visible in demo — single-lane dept, correct.)

**Deferred:** batch entry grid and analyzer/CSV import path added to the
backlog as future items; Enter-to-advance relies on button autofocus, which
held focus in testing but the synthetic-key event in the browser tool didn't
activate it — clicking Next works; worth a quick manual keyboard check.

## 2026-08-08 — Iteration 44: CSV result import — verify & release (user-driven)

**Item:** Department worklist at volume — analyzer/import path (user
green-lit: "receiving 100k test a month is not practical for this").

**What:** "Import results" button in the lab work view → dialog: choose or
paste a CSV (one row per sample, `mrn` column + test columns named by test
id or display name). Rows are matched to the department's pending orders
by MRN, oldest order first; values land in the panels the order actually
contains (extras reported, unknown columns ignored); H/L flags computed
from the catalogue reference ranges. Review table shows matched/unmatched,
then one release pass writes a normal `lab_result` block per row
(status 'resulted'), completes the order (result toasts fire as usual),
and runs the same charge sync as manual entry. 500-row cap per import.
Parsing/mapping/matching in `lib/resultImport.ts` (12 tests).

**Verification:** tsc clean, eslint clean, 165/165 tests, browser
end-to-end on /dept/lab: pasted a 2-row CSV → preview matched Hung Nguyen
(4 values, analyzer_id ignored, bogus MRN flagged "no pending order") →
released → DB shows order completed + lab_result with cbc.wbc {12.5, H},
metabolic.na/k values. Test release fully reverted (block deleted, order
back to in_progress, charges removed).

**Note:** parallel session actively editing (EncounterPage export,
FrontDesk date picker, CheckoutDialog, HistoricalArchive…) — those files
left uncommitted; DepartmentWork diff verified mine-only before staging.

## 2026-08-08 — Iteration 45: date picker on Today's day nav (user-driven)

**Item:** User asked for a date picker on Today ("make today and picker so
u can pick up a date").

**What:** The day label between the ‹ › arrows is now a native date picker
(`input type="date"` overlay + `showPicker()`, same pattern as Billing's
date inputs) — tap "Today ▾" to jump to any date; a "Today" reset chip
appears when viewing another day. Far dates outside the current year get
the year in the label. `offsetForDateKey` converts the picked date to the
existing dayOffset state (no new state concept).

**Verification:** tsc clean, eslint clean, 165/165 tests, browser: picked
Aug 12 → view switched ("No visits booked for wed, aug 12", label tinted,
walk-in hidden), Today chip reset back to the live queue.

## 2026-08-08 — Iteration 46: one noun on the encounter page (user-driven)

**Item:** User: "still the encounters page have visit label making
confusion" — the page mixed "visit" and "encounter" for the same event.

**What:** One vocabulary on the encounter page. Header/confirm button
"Finish visit"/"Close Encounter" → one word, "Finish"; confirm dialog
titled "Finish encounter?" ("Checkout follows" → "A charges & orders
check follows"). CheckoutDialog (shared with queue Done) titled "Finish",
body de-visited. Right-rail "Visit History" section → "Encounters"
(redundant per-row "Encounter" chip dropped; manual archive entries read
"Past Encounter" in the add/edit form). H&P chief-complaint placeholder
"reason for visit" → "reason for the encounter". DB category and internal
identifiers untouched.

**Verification:** tsc clean, eslint clean, 165/165 tests, browser as
demo Physician + Admin: journey strip Done → "Finish" dialog; Admin
header shows single "Finish" → "Finish encounter?" dialog (cancelled, not
closed); right rail reads "Encounters".

## 2026-08-08 — Iteration 45: visits retirement prepared (code half)

**Item:** Post-restructure cleanup — the non-schema half of "drop visits
table + /portal redirect".

**What:** PortalRedirect deleted from App.tsx — the existing `*` catch-all
already lands unknown URLs on home, so /portal needs no dedicated route.
The schema half is STAGED, not applied: new commented section 20 in
supabase/schema.sql holds `drop table visits cascade` and the pg_trgm
name-search index, with the approval note. No code reads the visits table
(verified by grep). Remote untouched, per charter hard limit.

**Verification:** tsc clean, eslint clean, 165/165 tests, browser (own
preview on :54967 — the :5173 server belongs to the parallel session):
/portal falls through to home → login. Preview server stopped after.

**Blocked remainder:** applying section 20 needs the user's "approve
schema". AI items still await the Edge Function key. Batch entry grid
gated on lanes proving out. Loop will stop after this iteration — nothing
unblocked remains.

## 2026-08-08 — Iteration 46: department History at volume (user-driven)

**Item:** "2k tests per day — history going massive." History stops being
an unbounded list.

**What:** History opens day-scoped — today's completed work only, with the
same ‹ day › nav Today uses (future days disabled). A search box crosses
all days by patient (search_patients RPC → patient_id filter on both the
fulfilled-orders and direct-entries queries), debounced. The tab badge now
shows TODAY's completed count (head count query refreshed with the queue)
instead of the loaded-list length. Empty states name their scope
("Nothing on this day" / "Nothing for X"); pagination stays within scope.
Also fixed in passing: the history effect refetched forever when the
result set was empty (gated by history.length===0) — a historyLoaded flag
now gates it. Supporting partial index staged in schema section 20
(approval-gated): block_actions(action_type, completed_at desc) where
completed.

**Verification:** tsc clean, eslint clean, 170/170 tests, browser on own
preview (:55202): History opened on Today with "Nothing on this day"
settling (no refetch loop); search "Mitchell" surfaced his two April
results across days; "Hung" correctly empty (no completed results); badge
hidden at 0 today. Caught & fixed a missing ChevronLeft import that
white-screened the tab mid-verification.

**Note:** parallel session actively editing (VisitQueue, utils, visits,
FrontDeskPage, PatientPage + tests — count now 170); their files left
uncommitted, DepartmentWork diff verified mine-only.

## 2026-08-08 — Iteration 47: journey-line feedback pass + inline header edit (user-driven)

**Items (3, all direct user feedback this session):**
1. Sparkline removed. User: "I don't think this is useful" — the 7-day
   avg-visit sparkline (shipped earlier today) read as an unlabeled blip.
   WaitTrend, its encounters fetch, dailyAverageWaits + tests all deleted.
2. "Make this more useful but simple" (patient-page visit line):
   formatDayTime day words (Today/Yesterday/Tomorrow, same-year dates drop
   the year), duration on finished visits ("44m visit"), live "here 12m"
   on today's active ones. Applied to patient page, bookings, and the
   journey strip; VisitQueue's leftover "checked out" strings → "finished";
   Front Desk avg stat now shares formatMinutes.
3. "Add the ability to add title and physician from there" (encounter
   header): title is click-to-edit in place ("Add title" affordance),
   physician is an always-visible "→ name / Assign physician" chip opening
   a search picker (get_physicians_list + reassign_encounter, error shown
   in the picker, admin-only unassign row). The Settings gear popover is
   DELETED — both abilities moved inline, one menu fewer. Mobile keeps
   both (tap title; UserCircle icon button).

**Verification:** tsc clean, eslint clean on touched files, 170/170 tests
(new formatDayTime/minutesBetween/formatMinutes suites). Browser on own
preview (:55339, physician demo): Front Desk shows "3 in queue" with no
sparkline; title typed inline → header + audit log updated; physician
reassigned to Clinician (chip, audit entry, Finish button appeared for
new assignee) then restored to Dr. James Harrison; strip reads "Arrived
Today · 10:21 PM · in clinic 14m"; patient page line reads "Arrived
Today · 10:21 PM · With doctor · here 19m" with the new title on the card.

**Commits:** c728c47 (line pass), fcad84a (inline header edit).

**Note:** harness Enter keypress didn't reach the title input's onKeyDown
during browser testing (blur path proven instead; Tab saved fine) —
believed a driver quirk, not app code; re-test Enter by hand if it recurs.

## 2026-08-08 — Iteration 48: subheader consolidation + one ending (user-driven)

**Items (2, direct user feedback on iteration 47):**
1. "Title and physician in subheader would be better" — moved both from
   the top header into the subheader, which is now the encounter's single
   context bar: title (click-to-edit) · → physician (picker) · journey
   (Footprints · Arrived Today · in clinic Xm ticking via isolated
   InClinicLabel/useNow · stage select · Done ✓) · Finish pinned right.
   Top header slims to patient identity + Open/Closed badge + Export/
   Privacy. Mobile drops last iteration's cramped title cluster + icon
   button — the one subheader serves all widths (journey scrolls).
2. "There is finish and done buttons" — real duplication since the
   encounter absorbed the visit. The strip's ungated Done (checkout) is
   removed; Finish (canClose-gated, chains close → checkout) is the one
   ending, per the charter's "One ending" item. Non-owners still end
   visits from the Front Desk queue rows. VisitJourneyStrip.tsx deleted
   (folded into EncounterPage — net −87 lines).

**Verification:** tsc/eslint clean, 170/170 tests, browser: subheader
renders title → physician | journey; picker anchors under the chip;
Finish correctly hidden for non-assignee (appeared earlier when assigned);
mobile 375px shows title+physician tappable, journey scrolls.

**Commit:** eb9853a.

**Incident:** first commit attempt used `git add -A` and swept in a
parallel session's uncommitted files (deptWorklist, DepartmentWork) —
caught immediately, soft-reset, recommitted mine only, theirs restored to
working tree untouched. Rule for future iterations: ALWAYS stage explicit
file lists, never `git add -A`, while parallel sessions share this tree.

## 2026-08-08 — Iteration 47: origin filter on the worklist (user-driven)

**Item:** user request — "filter per queue per dept, and per building/floor
for inpatients in future".

**What:** The department worklist gains a "From" select: filter orders by
the queue their encounter sits in (General, Cardiology, …), with counts,
shown only when more than one origin is present. Lane chips recount within
the origin, and save-&-next chains inside it. `originOf`/`originCounts`
in lib/deptWorklist (+5 tests, 172 total); the work-queue select gains an
`encounter:encounters!encounter_id(department_id, departments(name))`
join (column-name hint — realtime row hydration inherits it). Future
inpatient building/floor = more origin labels, noted as a schema-gated
backlog item.

**Charter fix along the way:** `npx tsc --noEmit` was checking NOTHING —
the root tsconfig is a solution file with `"files": []`. The DoD command
is now `npx tsc --build --noEmit` (this is how the ChevronLeft crash
slipped past iteration 46's checks). The real check surfaced two latent
embed-typing errors in FrontDeskPage's Open list — fixed via
visitPatient().

**Verification:** tsc --build clean, eslint clean, 172/172 tests, browser
(own preview :55699): filter hidden with one origin; after temporarily
moving 2 encounters into Cardiology → "From: All queues · 39 / General ·
37 / Cardiology · 2", picking Cardiology showed exactly those 2 orders.
Test data reverted.

## 2026-08-08 — Iteration 49: privacy pass opens — ONE access predicate

**Item:** Privacy pass step 1 (user approved the pass with "Ok go" after
the privacy-model review this session): consolidate the encounter
visibility predicate, stated five times in SQL and twice in the client.

**What:** `can_access_encounter(e encounters)` in schema.sql — the single
statement of staff/assigned/admin/restricted-roles — now backs
encounter_select (+ its creator grant), encounter_update,
block_staff_access, audit_log_select, and reassign_encounter (v_enc record
→ encounters). Client mirror `lib/encounterAccess.ts` (+8 tests, 180
total) replaces EncounterPage's canView IIFE and PatientPage's
canNavigateEncounter. Semantics preserved except one real drift FIXED:
EncounterPage denied the creator on private encounters (PatientPage and
RLS both granted it), so a receptionist who registered a private encounter
got a clickable card that dead-ended in "Access Restricted". Documented
drift kept as-is: creator grant is SELECT-only (no update/block access);
audit additionally honors encounter.view_all.

**Charter gate:** schema.sql is STAGED only — `can_access_encounter` +
rewritten policies take effect on the next user-approved apply. Behavior
is identical by construction, so there is no urgency; the remote keeps
running on the expanded copies until then.

**Verification:** tsc --build clean, eslint clean, 180/180 tests. Browser
(own preview :56008, physician demo): Front Desk → Open → encounter
renders through the new predicate; patient page Visits cards render/route.
Privacy popover flip to Private not exercised (popover clicks wouldn't
land in the driver; save handler untouched by this change) — private/
restricted/creator branches are pinned by the unit tests instead. Two
console 403s traced to pre-existing noise, no Supabase mutation fired.

**Next in the pass:** sub-table RLS hole (block_entries/attachments/acks +
block-media storage ignore the encounter wall) — SCHEMA, stage + ask.

## 2026-08-08 — Iteration 50: department-as-unit direction agreed (docs)

**Why:** Live design session with the user on wards + intra-visit
consults. User's call: don't bolt on new entities — the department IS the
unit, composing capabilities (clinic queue, members, order fulfilment
scoped by catalogue, consults, ward). Verdict written into the backlog as
"Departments are the unit": Settings merge → consults-as-orders (zero
schema) → wards (schema-gated), in that order. Guardrail recorded: unify
the entity, not the surfaces.

**Found in tree:** uncommitted, unlogged billing extraction WIP
(lib/billing.ts + tests, ServiceItemPicker.tsx, slimmed EncounterBill/
billingStore) — presumably an interrupted parallel iteration. Whole tree
is green with it (tsc clean, 193/193 tests, up from 180). Leaving it in
the working tree, excluding it from my commits; whoever owns it should
finish + log it.

**Docs only** — no code this iteration.

## 2026-08-08 — Iteration 51: money pass phase 1 — the charge screen tells the truth

**Why:** User audited the charging model ("what do u think… simplify and
empowering", then "charge screen … not practical", then "go"). Live demo
data proved the screen incoherent: one patient showed 379 owed on the
landing, 347 charged / −353 balance on his detail, and every charge still
"Pending Payment" after 700 recorded — the old flow let payments in
without allocating them to charges.

**What:** ONE ledger in lib/billing (walkLedger / allocatePayment, 13
tests): due = counted charges − payments, mirroring the patient_balance
view. Billing landing = "Waiting to pay" queue off that view (+
insurance-pending chips). Patient detail = Due now hero with ONE Collect
button — everything outstanding pre-selected, checkboxes only for
partial settles. Payments always allocate oldest-first and lazily
converge stale paid flags; the synthetic "Remaining balance" charge in
addPayment is deleted. Add Charge now uses the same search-first one-tap
picker as the encounter bill chip (new shared ServiceItemPicker with a
custom-amount escape hatch; the native-select + quantity dialog is
gone). Charge chips are derived from the ledger (Due/Paid) instead of
raw status; the pending-approval show/hide toggle is dropped (rows
always visible, greyed, one Approve action). Insurance-provider CRUD
moved off the cashier landing into Settings → Service Items. The Cashier
lane on Today reads patient_balance too, so it shows the same number
Collect will ask for. Billing-only users land on /billing instead of the
Front Desk dead end. Net −255 lines.

**Verification:** tsc --build clean, eslint clean on touched files,
193/193 tests (13 new in lib/__tests__/billing.test.ts). Browser (billing
demo user): Robert's phantom 379 gone — landing shows only his insurance
chip, detail shows credit 353 with rows reading Paid; Fabian: Collect
7.50 → receipt → All settled → drops from the queue; one-tap add CBC →
hero live-updates to Due 18.00 → void → settled again; provider
directory renders under Settings → Service Items.

**Shared tree:** a parallel session's Settings-merge WIP (queues.ts,
SettingsPage.tsx, DepartmentsSection.tsx + tests) sits uncommitted in
the tree — untouched, excluded from this commit. (That session's it. 50
note flagged my then-uncommitted billing files; this iteration finishes
and logs them.)

**Phase 2 (staged in backlog, NOT started):** schema shrink — drop the
never-written invoices table, collapse charge statuses, deposits as
payments-in-advance, payer-on-payment insurance. SCHEMA — ask user.

## 2026-08-08 — Iteration 51: Settings merge — one Departments section

**Why:** First item of the user-approved "Departments are the unit" pass.
Consults make every specialty patients+orders, so the Queues/Departments
split stops being the simpler read — one list of self-describing
capability flavors is.

**What:** DepartmentsSection rewritten: one-motion create (name + kind
select presetting flags — Clinic / Order department), ONE list of
collapsed cards (icon chip · name · derived summary via new
`deptSummary` in lib/queues, tested), expand → Services (only where
order machinery exists) + Members (now for EVERY flavor — clinics get
staff, which consult routing needs). Edit form: Simple (name,
description, icon, color) + "Advanced — capabilities & routing"
disclosure (slug + the three raw capability checkboxes + active).
Queue-specific CRUD paths deleted; Settings nav label "Queues &
Departments" → "Departments". isQueueDept semantics untouched.

**Watch out:** `src/lib/__tests__/queues.test.ts` already existed; my
first write clobbered its 3 isQueueDept tests (momentarily absent from
disk — parallel session suspected). Restored from HEAD and merged, now
9 tests in file. Also adopted the corrected gate: `npx tsc --build`
(plain --noEmit is vacuous here).

**Verification:** tsc --build clean, eslint clean on touched files,
199/199 tests. Browser (own preview :56425, admin demo): nav label,
one-motion create (Dermatology → correct summary + rotated color →
deleted again), Cardiology expand = Members only, Laboratory expand =
Services + Members, Advanced disclosure shows slug `card` + capability
states. No console errors. Parallel session's billing WIP untouched and
excluded from the commit.

## 2026-08-08 — Iteration 50: sub-table RLS derives from the parent block (staged)

**Item:** Privacy pass step 2 — the wall stopped at the blocks table:
block_entries / block_attachments / block_acknowledgments / block_actions
and the block-media bucket were gated only by block.add, so any clinical
staff could read a private encounter's time-series values, attachment
metadata, and files via the API directly.

**What:** Each sub-table policy now also requires
`exists (select 1 from blocks b where b.id = block_id)` — the subquery
runs under blocks RLS for the querying user, so the entire wall (encounter
visibility, instance visible_to_roles, dept arm, admin) is inherited with
zero restatement. block_actions keeps its department arm
parent-INDEPENDENT by design: the fulfilling department's queue reads
block_actions directly and a private encounter's order must still reach
the lab (dept staff hold no block.add; verified the work queue renders
from the denormalized action row). block-media select now requires a
visible block_attachments row pointing at the object (subquery inherits
the derivation chain); the owner arm preserves the upload-then-link gap;
insert/update/delete unchanged. New index block_attachments(storage_path)
backs the object-name lookup. Pure narrowing: no legitimate reader loses
access (dept flows never touched these tables; verified entries/
attachments writes already demanded block.add).

**Charter gate:** STAGED in schema.sql only (commit 6e37c79); nothing
applied to the remote. This one is semantics-changing (narrowing), so it
explicitly awaits user approval before any apply.

**Checks:** npm test 204/204 (co-session's new tests included), tsc
--build reports 3 transient TS6133 unused-var errors in
src/pages/settings/DepartmentsSection.tsx — that file is the PARALLEL
session's uncommitted consults WIP, not part of this changeset (this
iteration touches supabase/schema.sql only; my commit is scoped to it).
No browser verification: nothing is applied remotely, so there is nothing
observable.

**Next in the pass:** step 3 (remove per-block visible_to_roles, UI
first) touches Timeline.tsx/BlockWrapper.tsx — both currently dirty from
the co-session's consult work; re-check the tree before starting it.

## 2026-08-08 — Iteration 52: Billing collapses into Today — lanes, scoped controls

**Why:** User, after phase 1: "what is billing screen used for then? isn't
a duplicate?" — correct: the Billing landing and Today's Cashier lane had
become the same queue behind two doors. Plus the Front Desk toolbar
("this need rearrangement and scoped and fxn better"): Mine, Cashier,
Open, All-queues, Book and + Patient sat in one undifferentiated row —
filters, mutually-exclusive views and actions interleaved, secretly
untoggling each other.

**What:** Front Desk header rebuilt around ONE lane switcher — a real
segmented control (Queue · Cashier · Open) instead of three independent-
looking toggles — with every control scoped to the lane it affects: day
nav, queue Select and Mine on Queue; Mine on Open; a walk-up patient
search on Cashier. Book / + Patient are the day's constant actions,
top-right. Lane-scoped count badge (in queue / waiting / open). The
Cashier lane absorbs everything the Billing landing had: the
patient_balance queue, insurance-pending chips, and the search box
(search_patients RPC). BillingPage's landing is deleted — the page IS
the per-patient money view; bare /billing (or a dead deep link)
redirects home; the back arrow goes to Today. Sidebar loses the Billing
entry (desktop + mobile); Today's nav gate admits billing staff, and
billing-only users get the Cashier lane alone, titled "Cashier" (the
iteration-51 /billing redirect is gone). Net: sidebar −1 entry, one
money queue, one door.

**Verification:** tsc --build clean, eslint clean, 204/204 tests.
Browser: Billing demo → lands on "Cashier" (3 waiting, search, no
Book/day-nav/lanes, no Billing sidebar icon); row tap → money view; back
→ Cashier lane; search "fryc" finds a non-owing patient (walk-up path).
Reception demo → segmented lanes switch: Queue (day nav + All queues +
Mine + stage groups), Cashier (search + chips), Open (Mine + 100 open).
No console errors. Side-finding: search_patients is diacritic-sensitive
("pawel" ≠ "Paweł") — flagged as a spawned task, ties into the pg_trgm
backlog item.

**Shared tree:** parallel session's consult WIP (ActionPanel, Timeline,
EncounterPage, DepartmentWork, deptWorklist, queues, ConsultAnswerBanner,
ResultToasts) left untouched and uncommitted; committing only
FrontDeskPage, BillingPage, Sidebar + docs. (AGENT_LOG iteration numbers
collided across parallel sessions — 50/51 each appear twice; this entry
takes 52 by append order.)

## 2026-08-08 — Iteration 53: sidebar redesign — labels when there's room (user-directed)

**What:** User asked to "rearrange and redesign sidebar to look very good."
One Sidebar.tsx rewrite, no new concepts, no new state: at xl+ the rail
expands to a labeled 224px sidebar (brand wordmark, search styled as a
field with a ⌘K chip, a DEPARTMENTS section header, names with
right-aligned count pills, avatar + name + role at the bottom); below xl
it stays the 64px icon rail — same DOM, breakpoint classes only, so
zoomed-in laptops (the app targets 150% zoom) keep the space-efficient
rail and big monitors get legible names. Rearranged: Settings moved out
of the top nav down next to the user cluster (day work — Today +
departments — owns the top), sign-out demoted from a permanent red box
to a ghost icon that only turns red on hover, mobile nav reordered so
departments come before Settings. Both duplicated desktop NavLink blocks
collapsed into one NavItem component.

**Bug found & fixed:** desktop nav active states never actually worked —
TooltipTrigger's asChild Slot joins className props with .join(' '),
stringifying NavLink's function className into the DOM class attribute;
only accidental bare tokens mid-string (flex, h-10 …) applied, and
`relative` (quote-mangled) never did, so count badges anchored to the
viewport (a stray "19" floated at the screen's top-right corner).
NavItem now computes active via useMatch and passes a plain string.

**Verification:** tsc --build clean, eslint clean, 204/204 tests.
Browser: expanded mode (1280) — active pill + blue icon on Today, muted
idle labels, pills 39/19, no tooltips at xl; rail mode (1100) — corner
badges hug the icons, tooltip "Laboratory · 39 open"; light theme seam
clean; mobile order Today · Search · depts · Settings. No console errors.

**Shared tree:** parallel session's WIP (consults et al.) left untouched;
committing only Sidebar.tsx + this log.

## 2026-08-09 — Iteration 54: search bar on every long picker (user-directed)

**What:** User rule: "There must be a list and search bar wherever a
physician or service items are there as it may go so long." Audited every
physician and service-item picker. Already searchable: ServiceItemPicker,
EncounterPage + PatientPage physician pickers, DepartmentMembersPicker.
Seven gaps fixed via ONE new primitive `ui/SearchSelect` (search input +
filtered scrolling list, ≤50 rows rendered with a "keep typing" tail,
Enter picks first match, Escape closes without closing a parent dialog):
- VisitQueue "Assign" — was a bare Select of every physician
- BlockDefinitionModal Service Item linkage — bare <select>
- BillingRulesEditors — three bare service <select>s (lab panels,
  radiology studies, custom rules)
- BlockManualFeesPanel "Quick pick (catalogue)" — bare <select>
- DepartmentWork + PatientPage Quick Charge — showed only the FIRST 10
  items as chips, rest unreachable; now search the whole price list
- Settings → Service Items — management list gained a name/code/category
  search above the grouped view

**Bug found & fixed while verifying:** position:fixed panels inside the
Radix dialog anchored to the wrong corner — DialogContent's
translate(-50%,-50%) makes it the containing block for fixed descendants.
SearchSelect now walks up for transformed ancestors and subtracts their
rect (panel + click-away backdrop); stays inline in the DOM because a
portal would fight the dialog focus trap.

**Verification:** tsc --build clean, eslint clean, 204/204 tests.
Browser: queue Assign → searched "james" → assigned, row shows the name,
persisted after reload; Settings price list filtered "blood" → Lab · 2;
Quick Charge dialog picker anchored under its trigger, "x-ray" → 2 hits,
pick filled description + 45.00. No console errors.

**Shared tree:** parallel session's consult WIP untouched — staged only
my two DepartmentWork hunks (git apply --cached) + seven wholly-mine
files.
