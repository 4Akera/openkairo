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
