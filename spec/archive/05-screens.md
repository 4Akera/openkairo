# 05 · The core screens

Status: **locked** · 2026-09-22 · builds on 01–04; the client half of the core · amended 2026-09-22 (core audit): the department is a client-held choice; two queue calls; prefetch scope · amended 2026-09-25 (approved by the owner): core setup — place, person, pack · amended 2026-09-25 (approved by the owner): private notes; packs bring their own screens; ordering follows works for

## In one sentence

One shell, five core screens and the screens packs bring, three levels deep: my department → a patient → one
thing; every screen is a filter over the record or a form over one function, and a routine follow-up needs no mouse.

## Seven rules

1. **Every department has a default screen,** decided by what it does: Front desk (desk) · Queue (visits) · Bed board
   (stays) · Bench (bench); outside has none. Each specialty pack brings its own screens, and one of them may replace
   the default (amended 2026-09-25, *Default screens and pack screens* below). No dashboard. You open your department
   and see the work.
2. **Three levels, never four.** Department → patient (the visit) → one thing (a request
   surface, a full entry). No nested tabs (a department's pack screens are one row of tabs at the first level); a
   chart is one scrolling timeline with filters.
3. **Today is a draft until Done.** Everything typed in a consult is a `drafts` row (autosaved,
   survives a reload) and reaches the record as one `write_set`. Nothing half-written is ever
   in the record; a failed Done writes nothing and says which item was refused.
4. **Every screen renders every type.** The core renderer draws any entry from `display_line`,
   `data.values[]` and `text`; a pack may register a richer renderer for its own types, drawn whether the pack is on or
   off, used here or not.
5. **Realtime is a hint; reads are the truth.** Any channel message refetches; the payload is
   never trusted; every read is stale-while-revalidate.
6. **Writes never wait for the network to feel done.** Client-minted ids make every write
   idempotent, so the client queues writes in an outbox and replays them; the screen shows the
   entry at once and marks it confirmed when the row comes back.
7. **Keyboard-complete.** Tab between regions, single keys for ✓ ✎ ✕, `⌘K` for anything,
   `⌘⏎` for Done. Mouse is optional on a stable follow-up.

## The shell

```
[ department ▾ ]   ⌘K search or act…                         name · sign out
─────────────────────────────────────────────────────────────────────────────
                        the active department's screen
```

- **`⌘K`** is one input for everything, context-aware: a name, phone or record number finds a
  patient; inside a visit, "cbc" offers the service, "metformin" a prescription, "dm" a problem;
  "switch lab" changes department. It never navigates deeper than level three. A hit opens the record only for
  someone who holds `read:record` (amended 2026-09-25).
- The department switcher is one keystroke; the choice is held by the client and passed as
  `department_id` on every call (spec 04); the server keeps no "where am I". It lists the departments where you hold
  a role, grouped by site when there is more than one; a desk's clinics are reached from the desk, not picked. When
  everything you do here belongs to a pack that is off, the screen says "Your work here is switched off".
- A patient stays pinned in the bar while you look elsewhere (level-two context survives a
  level-three detour); `Esc` drops it.
- In a visits or stays department the bar also carries **my results** and, for the department's reviewers, **Waiting
  in this department**, above whatever screen is open, so a critical result is never hidden by a pack screen
  (amended 2026-09-25; *Default screens and pack screens*, item 7).

## The five screens

### 1 · The front desk (work: desk)

The search box is the screen. The chosen hit is one card: banner, identifiers, where he is now in
the clinics this desk checks in for, and what the desk can do from there (`open_visit` opens or marks
present, the desk never decides which; see *The three lists* below). Urgent is ⇧↵ or the card's U. **New patient** is
four fields under the box; `read_patients` runs as the family name and phone are typed and shows
possible duplicates beneath the form as a warning with a **Use this** button, never a block.
Beside it: a line per clinic the desk checks in for, what needs the desk, and the last few sent.
A machine user of a desk gets the board view: record numbers and bands only.

- **Checks in for** (amended 2026-09-25) is the desk's one reach beyond itself: chosen clinics (visits departments),
  or Every. No rows means none, and the desk lists exactly those clinics, with no fallback. In them its staff read the
  visit queue and move visits (open, Here, Urgent, Move, Left, Gone), and nothing more: not the request queue, not the
  review lists. To a reader without `read:record` a row says "2 results in", never the test names.
- **Paper request (P)** on the card: a walk-in brings a paper request from a doctor outside. The desk orders from a
  service that works for it, with source `outside` and the doctor's name as written. It is gated by its own
  department-scope action, `write:paper_request`, which the built-in Receptionist role holds: `write_request` accepts it
  in place of `write:request` only at a desk, with source `outside`, a stated doctor and a `service_id`, never for a
  consult (amended 2026-09-25).
- **Pack screens at a desk** (amended 2026-09-25). A pack adds nothing to the desk's card or lists. A pack the desk
  uses brings its own screen (billing's open charges and today's totals, bookings' diary), a tab or in place of the
  default screen (*Default screens and pack screens* below). The cashier is a desk that uses billing.

### 2 · The department queue (work: visits or bench)

One list, two halves, two calls (`read_visit_queue`, `read_queue`; any queue signal refetches both):
- **Patients** in bands — back · waiting · pending · in consult — urgent first, then arrival;
  a wait timer on every row, amber past 30 min, red past 60 (client defaults, per-department
  later); assignee initials; `⚠` for allergies; "consult not answered" while a consult visit's
  request is open.
- **Requests** for what the department offers — the consult band on a clinic (a consult goes only to a visits or
  stays department); buckets by step for a service department (core shows open · done; a pack names its bench steps
  and words per request type, and a bench that uses more than one pack gets neutral words).
Click a patient → the visit. Click a request → the request surface. `mine / all` toggle.
Footer: done today · away (open, not present). **My results** (`read_to_review`, each result beside the patient's
previous value — 0032, count in red when a critical is waiting) sits in the shell's bar above the Queue (*Default
screens and pack screens*, item 7).
- **Waiting in this department** (amended 2026-09-25): a folded list, shown to the department's reviewers, of the
  results waiting here that are not the reader's own (`read_to_review(department)`). It opens by itself when a
  critical result is waiting. It sits in the shell's bar of a visits or stays department, above the Queue, the Bed
  board or a pack screen that replaced them (item 7 below); a bench does not show it.

### 3 · The visit (work: visits and stays; a bench patient page carries the composer for people with commands there)

Opening it calls `mark_visit(in_consult)` when the caller holds `mark:in_consult`; a
`visit_moved` reply means someone else took the patient — the screen says who and returns to
the queue. A patient in consult with someone else offers **Take over** to anyone here who holds `mark:in_consult`
(amended 2026-09-25): in consult → waiting (reason `taken_over`), then a call. Three regions, no tabs:

```
┌ banner: name · age/sex · record number · ⚠ allergies (always) · died · open requests ┐
├─ RECORD ────────────────┬─ TODAY ──────────────────────────────────────────────────────┤
│ problems  (✓ ✎ ✕ + add) │ the composer: one line, the card under it (amended 09-24)    │
│ medications (✓ ↻ ✎ ✕ +) │ this visit's drafts — the set Done will send                 │
│ allergies (+ · refute · │                                                              │
│   no known allergies)   │                                                              │
│ reviewed 12 Mar / not   │                                                              │
│ asked                   │                                                              │
├─ TIMELINE ──────────────┴──────────────────────────────────────────────────────────────┤
│ one card per thread, newest first, evolving (request + its replies); filters by type; │
│ expand → the full entry; scroll → read_entries pages in                                │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                                        [ Back to queue ]  [ Done → Next ⌘⏎ ]
```

- **The clinic's line above the banner** (amended 2026-09-25): `Next #12 › · 23 waiting · longest 31m · 2 back`, and a
  **Who's in?** box (⌥J). Numbers, not names: the patient in the room can see the screen. The desk's order is a
  suggestion, not a lock: when someone else walks in, the doctor types his number or name and ↵ opens him, with no
  trip back to the list and nothing for the desk to fix. What is typed is kept as a draft first. The patient who was
  only called, with nothing written, goes back to waiting in his place and is not counted as a missed call. One with
  something written stays with this doctor to finish, or a colleague takes over.

- **Where it writes** (amended 2026-09-25). The screen writes in the first of these that applies:
  1. the department you picked, when the patient has an open visit or stay there;
  2. the department of the patient's live stay, if you may write there;
  3. the patient's only open visit in a department where you may write, never a private department's;
  4. the department you picked, with no visit.

  When the department you picked is private, 2 and 3 never apply: you write in it (1 or 4), so a note is never moved
  out of a private department.

  The composer's first line says so: "Writing in Ward C", or in a private department "Writing in Psychiatry · private
  department · only notes are hidden". Drafts are kept per patient and department and stamped with that department and
  its visit when made; switching department never moves a draft, and a draft is signed only into the department
  stamped on it, because a note's department decides its privacy (spec 07). Sign attaches the department's open visit,
  whoever's patient it is. A note written between visits keeps its department too, so it is private in a private
  department like any other.

- **One composer** (amended 2026-09-24). Everything is typed in one line, by one rule: **`/` starts a command, `#` a
  preset, anything else is today's note; `!` first makes that note private** — a note is never read as an order. Six
  commands, one per building block:
  `/v 148/92 84 37 86` (vitals by position), `/rx metformin 500 bd 30d for dm` (`… prn pain` says what it is for; `… send` sends it to the pharmacy — a prescription reaches the pharmacy only when sent, from the line, the card's Send to pharmacy, or Send on a medicine in the list),
  `/dx hypertension since 3y` (`/dx ? pneumonia` is suspected), `/al penicillin: rash severe` (`/al none` = no known
  allergies), `/order hba1c, cxr` (any service of a department that works for this one, its own included, whatever
  packs this department uses; one a pack creates by itself, like dispensing, is not offered) or `/order cardiology:
  chest pain on effort` (a department and its question is a consult, to a clinic or a ward), and `/note`
  (the long note beside the record). A note needs no command: a label at the start of a line picks its heading —
  `hx: …`, `ex: …`, `plan: …`, `proc: …` — and an unlabelled line is progress (a nurse's is a nurse note).
  **`!` at the start of a line makes that note private** (amended 2026-09-25, spec 07): `!hx: hears voices since
  June`, `!plan: …`, or `!` before plain progress. The card shows **Private** ticked, and ticking Private on any note's
  card (the long note's too) does the same. A private line and a plain line under one heading are two notes, never
  one. Only a note can be private: `!` before a command marks private only the notes it writes (psychiatry's `/mhrisk`:
  the risk note, never the level), and on a line that writes no note it is refused in the card.
  In a private department every note is private, and the card says so. Typing `/`
  lists the commands this department uses and you may use here; `#` lists the presets. A command alone opens its empty card (`/rx`, `/v`,
  `/dx`) or the note (`/note`). A command word typed without its slash stays note text, and the card offers the command
  one Tab away. The card appended under the line shows the fields of what the line says and edits any
  of them: Tab moves into it, Enter adds (Enter on a chip adds too), Esc clears. While a name is
  being typed the card offers suggestion cards (Tab takes the first, ↓ chooses), with the
  warnings of what Enter would add as typed. No dropdown, no modal, no second form. ⌘↵ adds what
  is in the line and signs; if it cannot be added (a field missing, a warning to confirm) Done
  waits and the card says why. A card never lets through what the server would refuse at Done:
  a drug needs how often, a unit for its dose and a route; `/nka` is refused while allergies are
  recorded.
- The lists open the same card: + starts `/dx `/`/rx `/`/al ` (Alt+P/M/A); ✎ on a medication is a
  `prescription change`, ✕ a stop with reason chips, ↻ a repeat; ✎ on a problem is a
  `problem update`, ✓ a resolve. A draft clicked in "This visit" reopens in the card and is
  saved in place. ✓ in a list's heading marks it for the `list_review` Done will send; an empty
  allergy list says **Not asked yet** until **No known allergies** (`list_review none_known`).
  Nothing is written until Done.
- **Commands are registered, not built in.** Core registers its commands through
  `registerCommand` (`src/core/screens/visit/commands.ts`) exactly as a pack registers its own:
  a name, a label, an example, the actions all its drafts need, the works it serves, and a parser from the typed text to
  drafts (and an empty card or note for the command alone). A pack's command for its own entries writes the pack's
  own type through its own write function and shows only where the department uses the pack. **Ordering follows
  "works for"** (amended 2026-09-25): a pack's order (an `is_request` type) shows wherever a department that answers it
  works for this one, whatever packs this department uses. **The bedside part goes with the order:** the department
  that placed an order may record the follow-up that belongs to it, like the transfusion of the blood it ordered,
  checked against that order (spec 06). Roles decide what you may do, never which commands a department lists. The
  composer shows when at least one command is yours here.
- **Presets on `#`.** `#dm` runs a preset: its services as requests and its lines as drafts (a preset's `shortcut` and
  `lines`, set in Settings, 0029). A preset of headings only (`S:` `O:` `A:` `P:`) opens a note to fill — SOAP and
  History & examination are presets, not commands. Presets never clash with commands: they live on another key. A preset
  line is a command with or without its slash; a line this patient's record cannot take is left out, the rest goes in.
- **Suggestion lists, not a code system.** The client carries lists of common drugs (ATC,
  strengths, usual frequency, allergy class), problems (ICD-10) and allergens (class, reactions):
  a known name is written with its code (`atc:…`, `icd10:…`, `substance.class_code`); anything
  else stays free text, and a drug the lists do not know says it was not checked against the
  allergies (unless a word of it is known: "amoxicillin susp" is checked as amoxicillin).
- **Warnings in the card, never a modal.** An allergy to the drug or its class, or a
  cross-reacting class the lists mark *warn*, is red and needs Enter twice; a low cross-reaction,
  an allergy recorded against a drug being taken, the same drug already active or already drafted,
  or a problem already on the list is amber — with **Repeat as it is**, **Change its dose
  instead** or **Update it** one click away. A PRN prescription says what it is for. A dose 10×
  away from the drug's usual strengths is red ("125 mg digoxin — did you mean 125 mcg?").
  Recording an allergy checks the medicines taken and drafted by the same rules, and a drafted
  prescription that a later allergy clashes with is marked in "This visit".
- **Key results** (amended 2026-09-24), under the allergies: HbA1c, creatinine, Hb, LDL, BP and
  weight when the patient has them, then up to three other tests now flagged, each with its arrow
  and where it was before ("HbA1c 7.4 ↓ · was 8.1 · 12 Jun"). A value opens its entry; **All
  results** opens the full table in place of the record. The timeline stays as it is: a result
  still lands under the visit that ordered it.
- A change restates the order: it can turn PRN off and clear instructions; a problem update can
  clear its note and onset (0031). A key left out keeps what the list holds.
- **Done** sends one `write_set`, then `mark_visit(done)`; the server decides done or pending.
  The next patient opens: back first, then waiting. **Return to waiting** (the patient steps out) signs what is written so far and keeps the visit open (amended 2026-09-24: drafts live in one browser, so they are not left behind).
- A nurse (no `mark:in_consult`) sees the same visit with TODAY only (vitals, a nurse note) and
  **Save & back**, which is the same `write_set`; the visit stays waiting.
- **A stay** (amended 2026-09-25) opens on the bed board (below), by admission only. Its visit screen is the same with
  the timeline first and no Done; a Stay card tops the side column (department, bed, day N, expected discharge).
  **Discharge** writes the discharge note and marks the stay Going home; **Left** ends it (it needs `write:visit` and a
  live discharge note) and turns the bed to cleaning. `/admit ward a · pneumonia on oxygen` writes a bed request; its
  card offers every stays department with its free beds and how many wait (spec 08 K15–K19).
- **Private on a signed note** (amended 2026-09-25, spec 07). A note opened in full offers **Make private** or **Make
  not private** to its author and to the people who work in its department (`me.departments[note.department_id].works_in`),
  in any visit status; not private asks for a reason, and every change is logged. A visit is never private, so the visit
  menu has no privacy item (today's goes: `src/core/screens/visit/VisitScreen.tsx:121`). A *Private note* offers **Open
  anyway** (spec 07, rule 5).

### 4 · The request surface (any department that received it)

Banner, the request's question, `from` department and requester, then the reply form built
from the service: a value grid from `service_fields` (units and ranges shown, flags computed
on release), or a text box for a report, or **Answer** for a consult (a `note`,
`kind = consult_reply`). **Not done** with a reason. Steps the department may take
(`mark_step`) as buttons: these write immediately — a step is not an entry. **Release → next**
writes the reply and opens the next request in the same bucket. A pack adds a reply form and bench steps for its
own kinds (the lab bench, the pharmacy counter), shown where the department uses the pack; core's works for
anything. **Answer** has a Private tick, as the composer's card does, and a reply written in a private department is
private. A private reply is read by whoever asked and by the people who work in the asking department, and shows as
*Private reply* to anyone else (spec 07). A reply to a request sent outside is typed in by the department that sent it
(source `outside`) and carries that department; every other reply carries the request's to-department (spec 03).

### 5 · Settings (`manage:` actions, held everywhere)

Plain forms over `save_…` / `retire_…`, each showing the settings history for its rows (amended 2026-09-25):
**Organization** (name, time zone, record view) · **Departments** · **Services** (fields, ranges; the services column a
pack fills) · **Staff** · **Roles** · **Presets** (the `#` shortcuts) · **Packs** (on or off, parked pack calls with
Retry); under **Advanced**, **Record reads** (`read:record_reads`) and **Settings history** (`read:settings_changes`).
Each page is shown to the people whose actions its saves need; a settings right counts only from a role held
everywhere (spec 02), and while the session has no second factor those pages sit behind the step-up
(`needs_second_factor`). A starter setup, New or Add, is offered only to someone who holds every action its saves
need: `manage:departments`, plus `manage:services` when it carries services, plus `manage:organization` when it turns
a pack on. A pack card's "give its actions" chips show only with `manage:roles`.
- **Departments, by work.** "What happens there" cards in place words (Front desk · Clinic · Ward · Lab, X-ray or
  pharmacy · Outside), each with core's and the enabled packs' starter setups under it. **New department** makes one
  from a setup with the name typed; **Add to this department** adds only what is missing and says what it kept. The
  work is fixed once made. Each department shows **Packs used here** as chips (each with its own settings panel),
  the **Screens** line (☑ Default screen, ☑ each pack screen, Opens on; *Default screens and pack screens* below), its
  rules as one summary line edited in place (only the rules its work has, spec 02; *private department* among them),
  **Checks in for** or **Works for** chips (Only here · Every · chosen), and its beds or places. A new
  department's card offers to add it to the desks and benches that keep chosen lists, one key each.
- **Staff** (in place of Users): no kind to pick; *where* is Everywhere or a department where people work; a role that
  holds a settings or audit right is offered only Everywhere; roles read as chips, "Doctor · Cardiology".
- **Roles.** Built-in roles are read-only; a clinic copies one to make its own. The editor hides actions nothing
  checks and steps that have no button.
- **Packs.** Turning a pack on opens its card: "Use it in" chips pre-ticked by work, its starter setups, its screens
  with what each does, and the clinic's own roles to give its actions to. One Save saves each department once. A
  department shows one line when no role held there has any of a used pack's actions.

First run is a wizard over the same forms: name → MFA → starter setups → invite. A stale save shows "changed since
you opened this" with a reload.

### The three lists, one row (amended 2026-09-24)

The clinic's list, the front desk and a bench show patients in **one row**: number · name · age and sex · what is
happening, in words · who or where · waiting time (`screens/lists/ListRow.tsx`). Typing filters, ↑↓ move, ↵ opens.
Each list answers one question:
- **A clinic: who is next, and who needs me.** One line of counts; "N to review" only when something waits. Sections:
  Next (one highlighted row: my Back patient first, else the first waiting — urgent, then arrival), Back ("back · HbA1c,
  creatinine in"), Waiting ("1st visit", "vitals taken", "not here ×2"), With a doctor, then folded Waiting for results
  and Done today; for the department's reviewers, Waiting in this department sits in the shell's bar above the list
  (*Default screens and pack screens*, item 7). ↵ with nothing typed calls the next
  patient; every letter goes to the filter, so a name may start with N.
  While a name is typed nobody is pinned as Next: the matches read plainly, and the one ↵ opens has a small ↵ beside
  the name. ↑↓ show a bar. While the keys are in use rows do not shade under the mouse; moving it brings hover back
  (the same in ⌘K search, the desk's search and the bench). A Back patient belongs to the doctor who saw him until he
  has been Back 30 minutes, or that doctor holds no live role here; then he is anyone's. The Back row offers
  **Anyone** (A) (amended 2026-09-25).
- **The front desk: find, then act on one patient card.** Two columns. Left: the search box, its hits as chips (↑↓
  choose), and the chosen patient's card, whose actions follow where he is. Already here → where, in words ("Waiting in
  General Practice · 3rd in line · 12m") with Move to… (M), Urgent (U, `mark_visit_priority`), Left (L, while unseen),
  Gone (G, waiting for results) and Edit details (E). Away → Back to his clinic (↵). Not here → Send to the clinic this
  desk used last (↵), another clinic by its letter, ⇧↵ urgent. Nobody found → the new patient form in place, Register
  and send (or Register only). ↵ in the box is the card's first action; Tab puts the keys on the card, Esc back to the box.
  Right: the day at a glance, a line per clinic it checks in for (waiting · with a doctor · longest wait, unfolding to
  its rows, Gone on a row waiting for results), Needs you only when something does (called but not here → Left), and the
  last five sent with Undo while unseen. With nothing typed, the left shows **Today**: waiting · with a doctor · for
  results · done today · longest wait. Every visit shows in its clinic's line, department and all (spec 07: only notes
  are private). Rows show counts ("2 results in"), not test names, to people without `read:record`.
- **A bench: whose sample is next, and what is waiting on us.** Scan first. To collect (or the pack's first step) · In
  progress · Done today, with today's work only; older uncollected requests fold away at the bottom. Urgent first, then
  oldest today; "here" or "gone" on each patient, and for an inpatient where he lies ("Ward C · bed 12").

### The bed board (work: stays; amended 2026-09-25)

The default screen of every stays department: a medical ward, a labour ward, an ICU. A pack screen may replace it
(obgyn's labour board, critical's ICU hourly chart); no pack adds anything to it. One read (`read_bed_board`). Bands,
top to bottom:
- **Bed requests** — open bed requests addressed here (from `/admit`), urgent first, then oldest, with the sending
  department, the question (to readers with `read:record`) and the minutes waited.
- **Calls** — open requests addressed here with no service that are not bed requests (a consult to the ward, a pack's
  call), with the sending department, the question (to readers with `read:record`) and the minutes waited.
- **Going home** — stays marked Going home, and stays that left today.
- **No bed** — stays with no bed (a direct admission, a transfer that came without one).
- **Elsewhere** — this ward's patients lying in a bed of another ward at the same site (outliers).
- **Beds, by bay** — each bed: its name (side room marked), patient, age and sex, day N, expected discharge (amber
  today, red when past), the responsible doctor, away, and results to review (critical in red). An empty bed shows
  its state. A bed lent to another ward's outlier shows as taken ("Medicine · outlier").

Every stay shows by name (spec 07: only notes are private). Typing filters by bed or name, ↑↓ move, ↵ opens
the stay. Keys on the chosen row: **a** admits (a bed request into an empty bed, or a patient found by name; only for
someone who holds both `write:visit` and `write:note` here) · **m** moves to another bed · **e** sets the expected
discharge · **s** turns an empty bed through open, cleaning, blocked and closed (a reason for the last two) · **t**
transfers to another stays department, listing only those where you hold `write:visit` (`canAt`) · **d** opens the
stay with Discharge. Each opens a card under the row; nothing opens over the board. The
board listens on `queue:<department>`.

### Default screens and pack screens (amended 2026-09-25)

1. **The default screen.** Every department has one, decided by what it does: Front desk, Queue, Bed board or Bench. Its
   actions are the department's basic work: check in, call, see, Done, admit, move, transfer, discharge, collect,
   release.
2. **Each specialty pack brings its own screens** — full screens designed for that work, with their own layout. They
   act only through core's actions and the pack's own, so every rule still holds. Examples: chronic care (IM): today's
   diabetic and hypertensive patients with last HbA1c, blood pressure and trend, reviews due or overdue, one-key review;
   emergency: the track board by triage level with fast buttons; obgyn: the labour board; critical: the ICU hourly
   chart; inpatient: the drug round; dental: the tooth chart.
3. **A pack screen can replace the default screen**, with whatever actions it has. Turning the pack on for the
   department means agreeing to what its screen does. The basic actions are never truly lost: they also live on the
   patient's own visit screen, the default screen can be ticked back on at any time, and it comes back by itself when
   the pack is turned off.
4. **The Screens line** in the department's settings: ☑ **Default screen** (can be unticked only when a pack screen is
   ticked), ☑ each pack screen, and **Opens on** (which screen opens first).
5. **Never without a screen.** If the pack is turned off or its screen unticked, the default screen comes back by
   itself, and it shows to a person who may not use the screen that replaced it (who does not hold the actions that
   screen names there). A desk's machine user always gets the board view.
6. **Only one pack screen can replace the default** in a department; other pack screens are tabs.
7. **Results waiting are not the default screen's.** My results and Waiting in this department sit in the shell's bar
   of a visits or stays department, above whatever screen is open, and open by themselves on any screen when a
   critical result is waiting.

**No slots on the default screen.** A pack adds no row badges, extra columns, bands, row keys, filter chips or sort
options to the Front desk, Queue, Bed board or Bench. A pack's marks on a patient (Isolation, Pregnant 28+3, NEWS 7)
show in the patient's banner and record, and on that pack's own screen — not on the default lists and not on another
pack's screen (packs never read each other). A pack's commands, reply forms and bench steps are its own work where
the department uses it (spec 06), not slots on a screen. A pack screen reads through core's reads and the pack's
own; chronic care's list comes from core's read of a clinic's patients by problem (spec 08).

## Cross-cutting

- **Shown means allowed** (amended 2026-09-25). `read_organization` gives each person `me.departments[]`: every
  department where they may do anything, with the actions allowed there, worked out by the server's one permission
  function (spec 02). `can(a)` asks the current department, `canAt(d, a)` another, `canAnywhere(a)` any. A tool (a
  command, card, reply form, bench step, pack screen or page, visit action) shows when the department's work is one it
  serves, the department uses its pack, and every action it needs is allowed here. Two things follow the order, not
  the packs used here (amended 2026-09-25): an order shows wherever the department that answers it works for this one;
  the bedside part of an order (the transfusion of the blood it ordered) shows at the department that placed it,
  checked against that order. What displays the record (banner items, side sections, record views, warnings) shows
  wherever the record is read while its pack is on; entries always render. Spec 06's slot table is the one statement
  of this. The server checks every call again.
- **Prefetch the next.** Opening a queue calls `read_record` for the pinned patient and the
  next in line only (each open is a `record_reads` row, spec 02); a patient opens with no round trip. `record:<patient>`
  and `queue:<department>` signals refetch what they name; a `record:` channel opens only to someone who opened that
  record in the last 12 hours (spec 07).
- **Outbox.** Writes go into an IndexedDB outbox with their client ids and replay in order on
  reconnect; the screen shows each item as pending until its row returns. Reads are cached
  stale-while-revalidate. This is the whole offline story in v1: keep working through a dropped
  connection, never a full offline mode.
- **Errors at the item.** A refused item in a `write_set` is highlighted where it was typed with
  the server's reason (`already_replaced`, `request_not_open`…); the rest of the set is untouched.
- **Renderer registry.** `renderers[type] = { Card, Full, Print }`; core ships one per core
  type plus a fallback; a pack registers its own, drawn whether the pack is on, off or not used here (Correct opens the
  pack's own card the same way). The fallback draws `display_line`, `values[]`
  as a small table, `text`, and files as links.
- **Print.** Any visit or entry prints from the same renderer: a paper prescription (when no
  pharmacy works for this department), a visit summary, a result. The header is the organization's name, then the writing department's
  site, never the department's name (amended 2026-09-25). A print shows only what the reader's reads
  returned; exports carry no note text. Print is the client; nothing is stored.
- **Phone.** The front desk, Here, vitals and the queue work on a phone; the visit screen is desktop
  and tablet. The desk marks Here from a phone; a phlebotomist marks collected.
- **Budgets.** Chart open < 300 ms (from prefetch), click → response < 100 ms, search as you
  type < 150 ms, Done perceived instant, a stable follow-up < 90 s without a mouse.

## Client layout

`src/core` (shell, the five screens and the default screens, the renderers, the outbox, generated types, core's
starter setups in `src/core/setups.ts`) · `src/packs/<pack>` (screens, tools, displays, renderers, starter setups) · one
`src/packs/index.ts` that registers them · ESLint forbids core → pack and pack → pack imports ·
TypeScript types and the `Action` union generated from the database; the client never names a
table.

## Decisions taken

Today as drafts, one atomic Done · the general visit screen is record + today + timeline; the
problem-column layout is the Internal medicine pack · one card per thread · `⌘K` as the one
input · outbox with client ids as the v1 offline story · print from the renderer, nothing stored
· wait-timer defaults 30/60 min in the client · (2026-09-25) a default screen per kind of work · each specialty pack
brings its own full screens, and one may replace the default with whatever actions it has · no slots on the default
screen · ordering follows works for · private notes (`!`, or the Private tick), never private visits · what shows is
what the server allows (`me.departments`) · drafts kept per patient and department · the bed board is core's, for
every stays department.

## Written as rules now, built later

Per-department wait thresholds (a settings column) · dictation (Web Speech, behind a flag) ·
a "since last visit" strip in core (the IM pack ships its own) · translation of display lines ·
a full offline mode · the waiting-room board as its own screen · a list of my stays across wards · a named nurse on
the bed board.

## Known limits

The visit screen needs a tablet or larger · drafts are per user and per department (two users editing one visit
each see their own Today) · the outbox replays in order per patient; a refused set parks for the
user to resolve while other patients' sets continue · no per-user layout preferences in v1 · (2026-09-25) a pack
screen that replaces the default may leave out some basic actions; they stay on the patient's own visit screen, and
the default screen can be ticked back on.
