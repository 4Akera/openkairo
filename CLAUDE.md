# OpenKairo — Agent Charter

OpenKairo is a block-based EHR. **North star: simple yet powerful.** The block
is the clinical primitive; the encounter is the event (clinical record +
journey); queues are the day's logistics. Departments exist only to fulfil
orders. Judge every change against this.

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

### Ground-up restructure (user-approved 2026-08-08): ENCOUNTER IS THE EVENT
The encounter absorbs the visit: one object carries the clinical record AND
the journey (scheduled/arrived/stage/finished, department queue, referral).
The visits table is frozen legacy after data migration. Then the app opens
on Today (Front Desk as home).

- [x] Phase A: schema — encounters gain department_id, scheduled_at,
      arrived_at, finished_at, cancelled_at, stage, reason,
      referred_from_encounter_id; migrate visits rows in; relax
      encounter_insert (no upfront assignee needed); freeze visits table.
      (2026-08-08 — applied to remote; 4 encounters carry journeys)
- [x] Phase B: port the journey code (lib/visits, queue, strip, checkout,
      check-in, patient page, toasts) to encounters; queue rows ARE
      encounters — "Start encounter" becomes plain Open. (2026-08-08)
- [x] Phase C: Today is home — index route = Front Desk; registry moves to
      /patients; sidebar order Today · Patients · … (Cashier queue later).
      (2026-08-08)

### Queues are the app (user-approved 2026-08-08 — HIGHEST priority)
A clinic is not a department — it is just a QUEUE on the Front Desk.
Departments remain only for order-fulfilling units (lab, radiology,
pharmacy). Money joins the same queue model. Sidebar target:
Today · Settings (+ order departments).

- [x] Queues/Departments split in Settings: patient-facing departments
      present as plain "Queues" (create with one name field); the
      Departments section lists only order-capable units. Capability
      checkboxes and the Clinic chip leave the UI. Storage stays the
      departments table (a queue = a row with no capabilities — NO schema
      change). (2026-08-08 — isQueueDept in lib/queues; dept form keeps one
      "also sees patients" toggle for hybrids; Settings nav label now
      "Queues & Departments")
- [x] Today absorbs clinic queues: pure-clinic /dept/:slug pages and their
      sidebar entries go away — their queue is a lane in Today's switcher.
      Hybrid departments (orders + patients) keep the work view; their
      patient queue moves to Today. (2026-08-08 — DepartmentPage is
      work-only, /dept/<queue> redirects home; sidebar + /portal and
      dept-only landing use non-queue depts)
- [x] "+ Patient" one-motion arrival on Today: search-first; no match →
      inline new-patient mini-form (name + phone) that creates AND queues
      in one motion. Retire "check in / check out" wording app-wide —
      arriving is "+ Patient", the ending action reads "Done", bookings
      keep "Book". (2026-08-08 — mini-form prefills from the search text;
      CheckoutDialog titled "Finish visit"; booked rows arrive via
      "Arrived"; CreatePatientDialog no longer used from the queue flow)
- [x] Drop the /patients nav entry: ⌘K + Today are the whole surface
      ("New patient" lives in + Patient; an "Open" chip on Today covers
      older open encounters). Sidebar: Today · Settings (+ departments).
      (2026-08-08 — /patients route kept for deep links; Open chip lists
      all open encounters newest-first, Mine filter applies)
- [x] Charging pass, money as a queue: Cashier queue on Today (finished
      visits with unpaid charges), running-bill chip on the encounter
      header (live total → line items), one-tap add charge from the
      encounter, price list in Settings feeding the charge picker.
      (2026-08-08 — EncounterBill chip + one-tap add; Cashier chip on
      Today lists patients with unpaid charges, tap →
      /billing?patient=<id> deep link; price list already existed as
      Service Items)

### Department worklist at volume (user-approved 2026-08-08)
The department work view must hold up for a high-volume lab (target range
5–20k orders/month by hand; beyond that the real answer is analyzer
import + verify-release, listed below as future work).

- [x] Worklist redesign: dense rows replace order cards (STAT pinned +
      tinted, waited-time label, one **Result** action — the separate
      Start step is gone, opening the form marks in-progress); lane chips
      by service with counts filter the queue; save-&-next chains through
      a lane from inside the entry modal (interstitial or billing-review
      footer). Query fixes folded in: queue load bounded (oldest 300 +
      exact count, realtime keeps count in step), history's walk-in dedupe
      no longer scans every result ever. Helpers in `lib/deptWorklist.ts`
      (tested). (2026-08-08)
- [x] History at volume (user-approved 2026-08-08 — "2k tests per day,
      history going massive"): History opens day-scoped (today's completed
      work only, ‹ day › nav like Today) + an MRN/name search box that
      queries the server for cross-day lookups; tab badge shows today's
      count, not the all-time total. Supporting index
      block_actions(action_type, completed_at) goes into staged schema
      section 20 (approval-gated). (2026-08-08 — historyLoaded flag also
      fixes a pre-existing infinite refetch on empty history; badge is a
      head-count query refreshed with the queue)
- [ ] Batch entry grid: pick a lane → one row per pending order, columns =
      result fields, save all (build only if lanes prove out at real
      volume).
- [x] Analyzer/import path for true 100k-scale labs: results arrive as
      data (CSV first, HL7 later), staff verify & release instead of
      typing. (2026-08-08 — user green-lit "100k a month is not
      practical"; CSV import shipped: "Import results" in the lab work
      view, MRN-matched to pending orders oldest-first, auto H/L flags
      from the catalogue ranges, review table, release loop writes normal
      lab_result blocks + completes orders + syncs charges;
      lib/resultImport tested. HL7/direct analyzer feed remains future
      work — ask user.)

### Post-restructure cleanup (pure simplification)
- [x] Single source in the encounter view: VisitJourneyStrip becomes
      props-driven (encounter + patient from the page); delete its own
      fetch/channel and EncounterPage's linkedVisit mirror — the page's
      encounter row already carries the journey. (2026-08-08)
- [x] DeptPortal.tsx renamed → DepartmentWork.tsx (DeptTab → DepartmentWork);
      every "portal" identifier and UI string retired ("department
      workspace" in Settings copy, blockVisibility, comments).
      (2026-08-08 — file split into components deferred: mechanical churn,
      no concept removed; TODO left in the file header)
- [ ] Drop the frozen legacy `visits` table and the /portal redirect
      (SCHEMA — ask user before dropping the table).
      (2026-08-08 — /portal redirect REMOVED (catch-all covers it); drop
      SQL + pg_trgm index STAGED as commented section 20 in schema.sql;
      ONLY the remote `drop table` still awaits user approval)
- [ ] pg_trgm index for patient name search at registry scale (SCHEMA —
      ask user first).

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
- [x] Wait-time trend: 7-day avg-visit sparkline beside the Front Desk stat.
      (2026-08-08 — hidden until ≥2 days have completed visits)

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
