# OpenKairo — Agent Charter

OpenKairo is a block-based EHR. **North star: simple yet powerful.** The block
is the clinical primitive; visits are the logistics primitive; departments own
queues (orders and/or patients). Judge every change against this.

## Autonomous iteration rules

When working autonomously (e.g. via /loop), follow this contract:

1. **One item per iteration.** Pick the single highest-value item from the
   backlog below, in priority order: simplify existing code → fix UX rough
   edges → backlog features. Never invent new features not on the backlog.
2. **Complexity budget.** A change may not increase the number of concepts a
   user must understand. When adding a config option, remove or merge one.
   Prefer opinionated defaults over new settings.
3. **Definition of done** — all of, before an item counts as finished:
   - `npx tsc --noEmit` clean, `npx eslint` clean on touched files
   - `npm test` fully green (add tests for new logic in `src/lib`)
   - verified working in the browser preview when the change is visible
   - committed as ONE small commit on the `agent/autonomy` branch — never
     commit to `main`
4. **Hard limits.** Never apply schema changes or SQL to the remote Supabase
   without explicit user approval — write the SQL into `supabase/schema.sql`
   and stop with a note instead. Never delete user data. Never push.
5. **Log every iteration** in `AGENT_LOG.md`: date, what was done, why it was
   the highest-value item, anything blocked.
6. **Blocked?** Leave a note in `AGENT_LOG.md` and pick a different item.
   Never mark an item done with failing checks.

## Backlog (edit freely — user curates this list)

### Simple power pass (highest priority)
Simplify the endings and beginnings; add power through AI and closing the
result loop. Judged against: one journey, no new concepts.

- [x] One ending: "Finish visit" merges Close Encounter + checkout. Closing
      the encounter flows straight into the visit checkout (charge/order
      heads-up) in one chain; button reads "Finish visit" when an active
      visit is linked, "Close Encounter" otherwise. (2026-08-08 — journey
      strip reports the linked visit up via onVisitChange)
- [x] One-tap New Encounter on the patient page: create immediately
      (physician auto/carried, private), with an Options disclosure for
      title/template/visibility — matching the queue's one-tap path.
      (2026-08-08 — nurses/receptionists still see the physician picker
      upfront; everything else collapsed)
- [x] Result-ready notifications: realtime toast for the ordering physician
      when their lab/radiology order completes, linking to the encounter.
      (2026-08-08 — ResultToasts in the app shell; self-contained toaster)
- [ ] AI-filled blocks pilot: dictate/paste free text → Claude fills the
      structured fields of the Vitals block. HARD STOP before deploying the
      Edge Function or wiring an API key — ask the user first.
- [x] One Blocks place in Settings: merge My Blocks / Templates / Block
      Library into a single "Blocks" section with tabs (three nav items
      become one). (2026-08-08 — Settings nav 10 → 8 entries)
- [ ] AI visit summary: one click drafts a visit-summary note block from
      the encounter's blocks (after the AI pilot lands).
- [ ] Wait-time trend: 7-day avg-visit sparkline beside the Front Desk stat.

### One place for patients (done)
User complaint 2026-08-08: patients appear in too many places (Recent tab,
Assigned, Front Desk, department tabs, patient list). Collapse to TWO
surfaces + search: Patients = the registry; Front Desk = the day.

- [x] "Mine" filter chip on the Front Desk (visits assigned to me) — the
      doctor's worklist lives in the day view, not a separate list.
      (2026-08-08 — applies to the day's queue and carried-over alike)
- [x] Delete the Dashboard sidebar (Waiting for me / Assigned / Recently
      opened, incl. the sessionStorage recents and the mobile Recent tab) —
      the Patients page becomes purely the registry; its existing
      Open/Assigned filters cover older open encounters; ⌘K covers
      re-finding. (2026-08-08 — recentItems.ts kept: patient recents feed
      GlobalSearch/DeptPortal, encounter refs feed EncounterPage's
      access-revoked heuristic)

### One Journey pass (done)
Scheduling, visits, patients, and encounters must feel like ONE simple
thing — a single patient journey — not separate modules stitched together.

- [x] Department tabs follow capabilities: pure clinics (orders off) open
      directly on their patient queue; the Work tab exists only for
      departments that receive orders or direct entries. (2026-08-07 — bug
      reported by user)
- [x] One-tap "Start encounter" on queue rows: pressing it on a waiting
      visit creates the encounter (physician carried over from the visit),
      links it, and navigates straight into it — no patient-page detour.
      (2026-08-08 — also auto-advances the stage to the second configured
      stage, e.g. Waiting → With doctor)
- [x] Visit journey strip in the encounter header: show arrived → stage →
      checkout for the linked visit, with the stage advanceable right there,
      so clinicians never need the Front Desk to move a patient along.
      (2026-08-08 — VisitJourneyStrip under the encounter header, realtime;
      CheckoutDialog extracted and shared with queue rows)
- [x] Patient page: ONE chronological "Visits" list merging visits
      (logistics: booked, arrived, checked out) with their encounters
      (clinical) — upcoming bookings at top; kill the separate mental model.
      (2026-08-08 — Upcoming + Visits sections; logistics line above each
      linked encounter card; Open/Closed sections retired)
- [x] Scheduling beyond today: Front Desk gains simple day navigation so
      booked visits for future days are visible and manageable (today stays
      the default view; no calendar module). (2026-08-08 — ‹ Today › arrows;
      bookings can't check in before their day; off-today hides walk-in
      check-in and the today-only stats)

### Features (only after the above)
- [x] Extend dictation to other text-heavy blocks (Nurse Note,
      Consultation, Discharge Note) reusing useDictation. (2026-08-08 —
      shared DictateButton component; NoteBlock refactored onto it too)
- [x] Queue auto-refresh of stale visits: on Front Desk load, visits from
      previous days that were never checked out get a subtle "carried over"
      section instead of disappearing. (2026-08-08 — today view only,
      amber-tinted section with full row actions)

## Shipped backlog (2026-08-07, first autonomous run)

### Simplify (highest priority)
- [x] Patient-flow pass: reduce the check-in dialog to name-first (search →
      one tap → in queue); assign physician and reason inline in the queue row
      afterwards instead of upfront fields. (2026-08-07)
- [x] Unify "template" naming: encounter templates keep the name "Templates";
      rename user content templates to "My defaults" everywhere in the UI.
      (2026-08-07)
- [x] Collapse block-visibility booleans (`is_builtin`/`is_universal`/
      `is_dept_only`/`active`/preferred/pinned) into one clear status concept
      in the Settings UI (schema can stay; simplify presentation first).
      (2026-08-07 — Block Library rows now show one derived "who sees this"
      phrase via `blockVisibilitySummary`)
- [x] Split BlockDefinitionModal into Simple (name, icon, fields) and
      Advanced (capabilities, dept pairing, billing) with progressive
      disclosure. (2026-08-07)

### UX rough edges
- [x] Walk-in check-in button on a clinic's own Patients tab (departments with
      can_receive_patients). (2026-08-07 — shared CheckInDialog extracted;
      Front Desk and DepartmentPage both use it)
- [x] Show referral chain on queue rows ("← from <dept>") using
      referred_from_visit_id. (2026-08-07)
- [x] "Avg wait today" stat on the Front Desk header. (2026-08-07 — shown as
      "avg visit today", arrival→checkout over finished visits)
- [x] Label patient-facing departments as "Clinic" in Settings and pickers.
      (2026-08-07 — Clinic chip on Settings dept cards, dept page header, and
      clearer editor checkbox label)

### Features (only after the above)
- [x] Patient-level active-medication list wired to MedsBlock +
      PharmacyFulfillment (the "mx" module), with allergy cross-check.
      (2026-08-07 — allergy cross-check at prescribing time + additive-only
      MedsBlock → patient_medications sync. PharmacyFulfillment wiring
      deferred: fulfilment already writes result blocks; extend later if a
      dispensing-side sync proves needed.)
- [x] Voice typing into note-type blocks (Web Speech API first).
      (2026-08-07 — useDictation hook + Dictate button in NoteBlock;
      feature-detected, final-results-only, auto-restarts through silence.
      Extend to other text-heavy blocks when the pilot proves out.)

## Project conventions

- React + TypeScript + Vite + Tailwind + Supabase (RLS everywhere).
- DB schema lives in `supabase/schema.sql` as one idempotent file; there is no
  migrations folder.
- Hardcoded block renderers register in
  `src/components/timeline/BlockRegistry.tsx`; unknown slugs fall back to
  DynamicBlock.
- Run the dev server only via the preview tools (`.claude/launch.json`), not
  Bash.
