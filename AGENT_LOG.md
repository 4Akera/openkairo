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
