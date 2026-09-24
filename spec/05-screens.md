# 05 · The core screens

Status: **locked** · 2026-09-22 · builds on 01–04; the client half of the core · amended 2026-09-22 (core audit): the department is a client-held choice; two queue calls; prefetch scope

## In one sentence

One shell, five screens, three levels deep: my department → a patient → one thing; every
screen is a filter over the record or a form over one function, and a routine follow-up needs
no mouse.

## Seven rules

1. **The queue is the home screen.** No dashboard. You open your department and see the work.
2. **Three levels, never four.** Department → patient (the visit) → one thing (a request
   surface, a full entry). No nested tabs; a chart is one scrolling timeline with filters.
3. **Today is a draft until Done.** Everything typed in a consult is a `drafts` row (autosaved,
   survives a reload) and reaches the record as one `write_set`. Nothing half-written is ever
   in the record; a failed Done writes nothing and says which item was refused.
4. **Every screen renders every type.** The core renderer draws any entry from `display_line`,
   `data.values[]` and `text`; a pack may register a richer renderer for its own types.
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
  "switch lab" changes department. It never navigates deeper than level three.
- The department switcher is one keystroke; the choice is held by the client and passed as
  `department_id` on every call (spec 04); the server keeps no "where am I".
- A patient stays pinned in the bar while you look elsewhere (level-two context survives a
  level-three detour); `Esc` drops it.

## The five screens

### 1 · Reception (department type `reception`)

The search box is the screen. A hit shows the banner, identifiers, open visits and open consults
for the clinics this reception serves, and one **Here** per served clinic (`open_visit`: opens or
marks present, the desk never decides which). Urgent is a checkbox on the hit. **New patient** is
four fields under the box; `read_patients` runs as the family name and phone are typed and shows
possible duplicates beneath the form as a warning with a **Use this** button, never a block.
Below the box: the merged queue of every served clinic, read-only, with **Away** and **Left**.
A machine user of the reception gets the board view: record numbers and bands only.

### 2 · The department queue (every visited department)

One list, two halves, two calls (`read_visit_queue`, `read_queue`; any queue signal refetches both):
- **Patients** in bands — back · waiting · pending · in consult — urgent first, then arrival;
  a wait timer on every row, amber past 30 min, red past 60 (client defaults, per-department
  later); assignee initials; `⚠` for allergies; "consult not answered" while a consult visit's
  request is open.
- **Requests** for what the department offers — the consult band on a plain clinic; buckets by
  step for a service department (awaiting · received · to verify · abnormal · rejected are the
  Laboratory pack's; core shows open · done).
Click a patient → the visit. Click a request → the request surface. `mine / all` toggle.
Footer: done today · away (open, not present) · **my results** (`read_to_review`, each result beside the patient's previous value — 0032, count in red
when a critical is waiting).

### 3 · The visit (department type `clinic`, `ancillary`, `ward`)

Opening it calls `mark_visit(in_consult)` when the caller holds `mark:in_consult`; a
`visit_moved` reply means someone else took the patient — the screen says who and returns to
the queue. Three regions, no tabs:

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

- **One composer** (amended 2026-09-24). Everything is typed in one line, by one rule: **a line
  that starts with `/` is a command; anything else is today's progress note** — a note is never
  read as an order. `/v 148/92 84 37 86` (vitals by position), `/rx metformin 500 bd 30d for dm`,
  `/rx paracetamol 1g qds prn pain`, `/dx …` (`/ddx` suspected), `/al …: rash severe`, `/nka`,
  `/order hba1c, cxr` (any service another department offers; one a pack creates by itself, like
  dispensing, is not offered), `/ref cardiology …`, `/hx /ex /plan /proc /nurse /letter …`,
  `/soap`. Typing `/` lists the commands this role may use here, and this organization's presets.
  A command alone opens its empty card (`/rx`, `/v`, `/dx`) or its note beside the record (`/hx`,
  `/note`, `/soap`). A command word typed without its slash stays note text, and the card offers
  "/rx …" one Tab away. The card appended under the line shows the fields of what the line says and edits any
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
  a name, a label, an example, the action a role needs, and a parser from the typed text to
  drafts (and an empty card or note for the command alone). A pack's command writes the pack's
  own type through its own write function and shows only while the pack is on (spec 06).
- **Presets as commands.** `/dm` runs a preset: its services as requests and its lines as drafts
  (a preset's `shortcut` and `lines`, set in Settings, 0029). A preset line is a command with
  or without its slash; a line this patient's record cannot take is left out, the rest goes in.
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
- A ward visit is the same screen with the timeline first and no Done: the stay ends with a
  discharge note and `mark_visit(done)` from the ward screen (admissions pack).

### 4 · The request surface (any department that received it)

Banner, the request's question, `from` department and requester, then the reply form built
from the service: a value grid from `service_fields` (units and ranges shown, flags computed
on release), or a text box for a report, or **Answer** for a consult (a `note`,
`kind = consult_reply`). **Not done** with a reason. Steps the department may take
(`mark_step`) as buttons: these write immediately — a step is not an entry. **Release → next**
writes the reply and opens the next request in the same bucket. Packs replace this surface for
their own kinds (the lab bench, the pharmacy counter); core's works for anything.

### 5 · Settings (`manage:` actions)

Six pages of plain forms over `save_…` / `retire_…`, each showing the settings history for its
rows: **Organization** (packs, parked pack calls with Retry, history) · **Departments** (type,
site, whom it serves, staff) · **Services** (fields, ranges; the `servicesColumns` slot a pack
fills) · **Staff** (people, machines, roles per department, invitations) · **Roles** (read-only in
v1) · **Templates** (request sets, note forms). First run is a wizard over the same forms:
name → MFA → preset → invite. A stale save shows "changed since you opened this" with a reload.

## Cross-cutting

- **Prefetch the next.** Opening a queue calls `read_record` for the pinned patient and the
  next in line only (each open is a `record_reads` row, spec 02); a patient opens with no round trip. `record:<patient>`
  and `queue:<department>` signals refetch what they name.
- **Outbox.** Writes go into an IndexedDB outbox with their client ids and replay in order on
  reconnect; the screen shows each item as pending until its row returns. Reads are cached
  stale-while-revalidate. This is the whole offline story in v1: keep working through a dropped
  connection, never a full offline mode.
- **Errors at the item.** A refused item in a `write_set` is highlighted where it was typed with
  the server's reason (`already_replaced`, `request_not_open`…); the rest of the set is untouched.
- **Renderer registry.** `renderers[type] = { Card, Full, Editor }`; core ships one per core
  type plus a fallback; a pack registers its own. The fallback draws `display_line`, `values[]`
  as a small table, `text`, and files as links.
- **Print.** Any visit or entry prints from the same renderer with the organization header:
  a paper prescription (when no pharmacy pack), a visit summary, a result. Print is the client;
  nothing is stored.
- **Phone.** Reception, Here, vitals and the queue work on a phone; the visit screen is desktop
  and tablet. A phlebotomist marks Here from a phone.
- **Budgets.** Chart open < 300 ms (from prefetch), click → response < 100 ms, search as you
  type < 150 ms, Done perceived instant, a stable follow-up < 90 s without a mouse.

## Client layout

`src/core` (shell, the five screens, the renderers, the outbox, generated types) ·
`src/packs/<pack>` (screens, renderers, `servicesColumns`, preset fragments) · one
`src/packs/index.ts` that registers them · ESLint forbids core → pack and pack → pack imports ·
TypeScript types and the `Action` union generated from the database; the client never names a
table.

## Decisions taken

Today as drafts, one atomic Done · the general visit screen is record + today + timeline; the
problem-column layout is the Internal medicine pack · one card per thread · `⌘K` as the one
input · outbox with client ids as the v1 offline story · print from the renderer, nothing stored
· wait-timer defaults 30/60 min in the client.

## Written as rules now, built later

Per-department wait thresholds (a settings column) · dictation (Web Speech, behind a flag) ·
a "since last visit" strip in core (the IM pack ships its own) · translation of display lines ·
a full offline mode · the waiting-room board as its own screen.

## Known limits

The visit screen needs a tablet or larger · drafts are per user (two users editing one visit
each see their own Today) · the outbox replays in order per patient; a refused set parks for the
user to resolve while other patients' sets continue · no per-user layout preferences in v1.
