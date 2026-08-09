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
   - `npx tsc --build --noEmit` clean (NOT plain `tsc --noEmit` — the root
     tsconfig is a solution file with `"files": []`, so the plain form
     checks NOTHING and passes vacuously), `npx eslint` clean on touched
     files
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

### Privacy pass (user-approved 2026-08-08 — "Ok go")
Target model: privacy lives in TWO places — the encounter carries the wall
(blocks inherit it); per-block mask hides within the team, share-to-record
surfaces. Sequence agreed with user:

- [x] One access predicate: `can_access_encounter()` in schema.sql replaces
      the five hand-copied visibility gates (encounter select/update
      policies, block_staff_access, audit_log_select, reassign_encounter —
      drift found: audit honored view_all, RPC dropped created_by, client
      copies disagreed on creator). Client mirror `lib/encounterAccess.ts`
      (tested) feeds EncounterPage canView + PatientPage cards; fixes the
      creator being locked out of the page for private encounters they
      registered. SCHEMA STAGED — remote apply awaits user approval.
      (2026-08-08)
- [x] Sub-table RLS hole: block_entries / block_attachments / block_acks /
      block-media storage were gated only by block.add — private-encounter
      payloads readable via direct API. Now they demand a VISIBLE parent
      block row (exists() reuses blocks RLS — the wall applies with zero
      restatement); block_actions keeps its dept arm parent-independent so
      private-encounter orders still reach the lab; block-media download
      needs a visible attachment row (owner arm covers upload-then-link) +
      storage_path index. (2026-08-08 — STAGED in schema.sql; remote apply
      awaits user approval)
- [ ] Remove per-block visible_to_roles (UI first: role picker leaves the
      block menu, default_visible_to_roles leaves Settings; columns stay
      dormant). Mask + encounter visibility cover the need; kills silent
      different-staff-see-different-charts defaults.
- [ ] Encounter visibility → two states (Everyone / Care team) replacing
      restricted + role picker; break-the-glass (sealed-but-visible, open
      with a logged reason) as the power follow-up. Ask user before
      building this one.

### Departments are the unit (user-approved 2026-08-08): capability flavors
One departments table is the whole org model — a department composes
capabilities: clinic queue (can_receive_patients → lane on Today), members
(department_members), order fulfilment scoped by its service catalogue
(department_block_types), consults (= an order whose entry block is
Consultation), and — schema-gated — a ward. The ENTITY unifies; the
SURFACES stay specialized: Today = patients, work view = orders, Wards
page = census. Department pages must never become patient surfaces again.

- [x] Settings merge: Queues/Departments split → one "Departments" section;
      create = name + kind choice (Clinic / Order department) presetting
      flags; raw capability toggles behind an Advanced disclosure; rows
      self-describe via a derived summary ("Clinic · receives consults",
      "Fulfils orders: 14 services"). Net concepts −1. (2026-08-08 —
      deptSummary in lib/queues, tested; collapsed self-describing cards;
      clinics gain the Members picker = the consult-routing prereq; nav
      label now "Departments")
- [x] Consults as orders (zero schema): "Receives consults" on a clinic =
      can_receive_orders on + a Consultation service (order block =
      question; entry block = existing Consultation block). Work-view
      consult rows OPEN THE ENCOUNTER (no entry-form modal); writing the
      Consultation block there completes the order (result_block_id
      linkage). Sidebar badge is the consult inbox; completion toast reads
      "consult answered". Prereq: specialty physicians are
      department_members of their own row. Refer stays the sibling verb
      (patient moves, new encounter) — present them as a pair.
      (2026-08-08 — one-tap toggle auto-creates the per-specialty request
      def ("Consult — <Dept>", is_universal REQUIRED — RLS hides
      non-universal defs) + Consultation service; ActionPanel goes
      consult-aware (label "Consult <Dept>", NO createReferralVisit — the
      patient never moves); ConsultAnswerBanner on the encounter =
      ?consult=<action id> deep link, explicit "Mark answered" links the
      latest own Consultation block as result_block_id; Timeline dedupes
      encounter-resident result blocks; full loop browser-verified. Gap
      to watch: a user's curated Block Preferences hides new consult
      defs until they re-save — same as any new org block.)
- [ ] Wards (SCHEMA — stage + ask): ward = department flavor with an
      explicit kind discriminator (never inferred from absent
      capabilities); encounters gain ward_id / admitted_at / bed text.
      Admission is a PHASE of the same encounter — no separate inpatient
      record. Wards census page (open admitted encounters grouped by ward,
      "day n" counts); Admit action on the encounter; "Finish visit" reads
      "Discharge" when admitted; Today queues and carried-over EXCLUDE
      admitted encounters. Beds stay free text — no beds table, no bed
      states. Creating the first ward IS the feature toggle — no settings
      flag. (2026-08-09 — SQL STAGED as a commented section-20 block in
      schema.sql: departments.kind check ('unit','ward') + capacity,
      encounters ward_id / admitted_at / bed, partial census index.
      REMOTE APPLY + the ward UI (census page, Admit/Discharge, Today
      exclusions, isQueueDept kind check) await user approval.)

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
- [x] Origin filter on the worklist (user-requested 2026-08-08): "From"
      select filters orders by the queue their encounter sits in
      (General / Cardiology / …); lane chips and save-&-next respect it.
      Designed as the extension point for inpatient locations — a
      building/floor becomes just another origin label (originOf in
      lib/deptWorklist, tested; encounter join added to the queue select).
- [ ] Inpatient locations (FUTURE — user note 2026-08-08): building/floor
      as origins for the worklist filter once inpatient care lands
      (needs a location concept on encounters — SCHEMA, ask user).
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

### Money pass (user-approved 2026-08-08 — "go")
The charging model is two concepts: charge and payment; everything else
is a view or an attribute. Phase 1 (UI, no schema) shipped; phase 2
shrinks the schema behind it (approval-gated).

- [x] Charge screen honesty: ONE ledger (lib/billing walkLedger mirrors
      patient_balance — due = counted charges − payments) drives the
      Billing landing queue ("Waiting to pay" + insurance-pending
      chips), the patient hero (Due now / credit / All settled with ONE
      Collect button, everything outstanding pre-selected; checkboxes
      only for partial settles), derived Due/Paid row chips, and Today's
      Cashier lane. Payments always allocate oldest-first and converge
      stale flags; the synthetic "Remaining balance" charge hack is
      deleted. Add Charge reuses the encounter bill's search-first
      one-tap picker (shared ServiceItemPicker, custom-amount escape
      hatch). Insurance-provider CRUD moved to Settings → Service Items;
      billing-only users land on /billing. (2026-08-08)
- [x] Billing collapses into Today (user: "isn't a duplicate?" +
      toolbar "rearrangement and scoped"): the standalone Billing landing
      is deleted — /billing is only the per-patient money view the
      Cashier lane opens (bare /billing goes home); the Billing sidebar
      entry is gone. Front Desk header rebuilt as ONE lane switcher
      (Queue · Cashier · Open segmented control) with controls scoped to
      their lane — day nav + queue filter + Mine on Queue, Mine on Open,
      walk-up patient search on Cashier (absorbed from the landing, with
      insurance-pending chips); Book/+ Patient stay constant top-right.
      Billing-only staff now live on Today: Cashier lane alone, titled
      "Cashier". (2026-08-08)
- [ ] Schema shrink (SCHEMA — ask user before any of it): drop the
      never-written invoices table (nothing inserts one; charges/
      payments invoice_id columns and the invoice settings knob go with
      it), collapse charge statuses to pending/paid/waived/void
      (+ pending_approval), fold deposits into payments-in-advance
      (credit = negative balance), reduce insurance to
      payer-on-the-payment (claim-splitting that rewrites unit_price
      goes). Stage SQL in schema.sql section 20 and stop.

### Front Desk polish (user-approved 2026-08-09 — "go")
- [x] Five rough edges in one pass: queue cancel is two-tap (X arms
      "Remove?", 4s auto-revert) and always visible — was a hover-only
      instant delete, invisible on touch; waited label escalates
      (waitSeverity: amber ≥30m, red ≥60m — the dept worklist pattern);
      Cashier lane stays fresh (30s poll + focus refetch; realtime
      publication for charges/payments STAGED in schema section 20,
      approval-gated) and shows "collected today" (payments since
      midnight); bookings arrive only on their own day
      (isArrivableBooking — past-day "Arrived" started a wait clock
      today against last week's visit); finished queue rows say the
      visit duration. Helpers in lib/visits, tested. (2026-08-09)

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
- [x] ~~Wait-time trend sparkline~~ REMOVED same day it shipped: user
      verdict "I don't think this is useful" — an unlabeled mini-chart is
      noise, not information. Lesson: no decorative data-viz; every element
      must explain itself. (2026-08-08)
- [x] Journey lines say something useful (user-directed 2026-08-08):
      formatDayTime day words ("Today · 10:21 PM"), visit duration on
      finished visits ("44m visit"), live "here 12m" on active ones —
      patient page, bookings, journey strip; last "checked out" strings
      retired.
- [x] Title + physician edited in place, one context bar (user-requested
      2026-08-08, refined same day): the subheader under the encounter
      header is the single context bar — click-to-edit title, "→ physician"
      chip + search picker, journey (arrived · in clinic Xm · stage / Done),
      and the ONE Finish ending (the strip's duplicate Done button and the
      Settings gear popover are both deleted; VisitJourneyStrip.tsx folded
      into EncounterPage).

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
