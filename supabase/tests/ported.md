# The acceptance record: every check of the suites before the rebuild, and its counterpart

The core v3 rebuild (spec/openCare.md §8) is accepted when every check of the twelve suites of 2026-09-25 (kept in
`supabase/archive/tests-2026-09-25/`) has a green counterpart below, or is **retired** with its reason, and the eight permanent tests pass.
The owner signs off the retired list. New suite names are in `supabase/tests/`; a check is quoted by its label.

## smoke_spine → `spine.sql`
| old check | now |
|---|---|
| 1. request with a destination (step, status, routed, requester) | spine · "the order is open, to the lab, by its requester" |
| 2. retry same id: no new row | spine · "the retry returns the stored outcome", "one entry stored"; plus "the same set id with other entries" (set_changed) |
| 3. lab starts, then a result reply with a low Hb (reply line, flag, review, values, steps) | spine · "the lab accepts", "the order is completed by its final answer", "base.values holds the Hb, low", "the result's line" |
| 4. same analyser message again → ignored | spine · "a resent message returns the stored entry" |
| 5. permanence (three refusals) | spine · §5: `entries are permanent` ×2, `sets are permanent` (requests are no longer a table: an order's state is derived) |
| 6. correction replaces the old result; values follow | spine · "the correction continues the item as version 2", "one value, the corrected one" |
| 7. second correction of the same entry → refused (`already_replaced`) | spine · "a stale correction" → `changed_since_opened` (the version rule replaces the replaced-by column) |
| 8. strike a request with live replies → refused (`request_has_replies`) | spine · "an answered order stays" → `has_answers` |
| 9. clock: monotonic, sane | spine · "occurred_at ≤ recorded_at", "(recorded_at, id) is the order the sets landed". **Retired**: "every entry has its own recorded_at" — a set shares one recorded_at; (recorded_at, id) orders it |

## smoke_visits and calling → `presence.sql`
| old check | now |
|---|---|
| reception registers Ahmed and a lookalike; searches (name, phone) | presence · "found by name", "found by phone", "found by record number", "an Arabic search runs" |
| opens a visit in IM, urgent, present | presence · "checked in", "waiting, urgent, here, in IM" |
| Here again → the same visit | presence · "Here again uses the open visit" (`already_here`); review · "Here: back in her open visit" |
| reception cannot take into consult (`not_allowed`) | presence · "reception cannot call" |
| doctor queue: waiting urgent; opens → in consult; orders; Done → pending | presence · "called", "called is not seen", "the order and Done in one set", "pending: seen, one order out" |
| lab results it → BACK without any visit write | presence · "back: every order answered" |
| doctor finishes: done; queue empty; done_today 1 | presence · "done, ended", "nobody waits in IM", "done today 1" |
| second visit next week is a follow-up (`is_first`) | **Retired**: `is_first` is not stored; the client computes it from the patient's earlier `base.presence` rows in that department |
| visit history (visit_steps) | presence · "history: checked_in > called > done > called > done" (the visit's item) |
| calling: called, not here: not seen, a missed call, still waiting; can be marked left | presence · "not here", "waiting with a missed call, not seen", "an unseen patient can be marked left", "left, never seen" |
| calling: called, vitals, sent out: seen; Back when he returns | presence · "Back means he was seen and came back" |
| calling: called and Done: seen | presence · "pending: seen, one order out"; review · "Done" paths |
| (new) desk sends on, urgent, gone out; the bed board | presence · "waiting in Psychiatry, from IM", "urgent", "not here", "bed 1 is taken", "already_admitted", "moved to bed 2", "the bed board" |

## smoke_api → `clinic.sql`
| old check | now |
|---|---|
| nurse cannot prescribe (`not_allowed`) | clinic · "the nurse prescribes" |
| nurse writes vitals | clinic · "vitals" |
| one Done = problem + prescription + request + note + list review, all or nothing | clinic · "five entries, five items, one set" |
| the lists (medications, problems, reviews) | clinic · "the lists: medications:active problems:active reviews:allergies", "the medication line" |
| two requests: CBC → Lab, prescription → Pharmacy | clinic · "the CBC to the lab, urgent"; pharmacy · "sent: the medication and its order in one set" (a prescription is an order only when sent) |
| a set with a bad item writes nothing (`problem_not_found`) | clinic · "a correction of nothing" (`not_found`), "the note of the refused set was not written" |
| lab: queue, start, critical Hb | clinic · "the bench shows the CBC", "started", "in progress", "a critical Hb", "the order is completed" |
| doctor: my results (critical first), bulk reviewed; read_record | clinic · "the critical result waits for its requester", "reviewed", "nothing left to review", "the record: newest first" |
| the CBC card carries its reply | clinic · "the CBC order carries its answer" |
| trend | clinic · "Hb in the trend", "BP systolic and diastolic in the trend" |
| lab tech cannot read the record without opening it (`not_allowed`) | clinic · refuses `not_allowed` (read:record); "the doctor's reads are logged". **Retired**: "opening first" — every read is logged by the reader, so there is no separate open step |

## amendments → `review.sql`
| old check | now |
|---|---|
| ranges by sex saved; a reply type no pack provides refused (`bad_reply_type`) | review · "ranges by sex saved", refuses `bad_answer` |
| default: critical only, patients wait | review · "Done waits for results" (defaults are the absence of a setting) |
| her: high for her range, no review while she waits | review · "high for her, no review while she waits" |
| she leaves → not seen | review · "not seen → review" |
| him: not waiting → done; normal later → not seen | review · "not waiting → done", "normal for him; not seen → review" |
| critical survives Done | review · "critical survives Done" |
| corrected → review | review · "corrected → review" |
| the day's released results are in the queue | review/clinic · `base.orders` rows by status and day (the bench reads them); **retired** as a separate list |
| a note cannot answer a CBC; a result cannot answer an X-ray (`wrong_reply_type` ×2); a note answers the X-ray | review · "a note for a CBC", "a result for an X-ray" (`wrong_answer`), "a note answers the X-ray", "the lab answers from the lab" |
| IM switches to abnormal; Here reuses the open visit; abnormal → review | review · "her open visit", "Here: back in her open visit", "abnormal → review under the new setting", "judged by the rule of its own time" |

## composer → `lists.sql`
| old check | now |
|---|---|
| a change turns PRN off and clears instructions | lists · "the list holds the change: PRN and instructions cleared", "version 2" |
| a change without instructions keeps them | lists · "instructions carried"; **changed**: a change is the whole medicine again (the next version carries what it says) — the composer's change card starts from the current version, so nothing is lost by leaving a field untouched |
| an update keeps what it leaves out; the line says nothing of what was cleared; an update cleared onset and note | lists · "an update keeps what it sends", "cleared" |
| the lists rebuild to the same rows | lists · "rebuild = live" |
| (new) stopped stays listed; crossed out leaves; wrong resource | lists · "on the list as stopped", "off the list", "crossing out twice", "a problem cannot continue a medicine" |

## deletes and roles → `admin.sql`
| old check | now |
|---|---|
| the typo service is deleted; the change log keeps its name | admin · "the retired service is gone from the lists", "the change log keeps its name" (services are settings: retired, never deleted) |
| refused: the CBC is in the record | admin · "the order in the record still reads its name", "a retired service cannot be ordered" (`unknown_service`) |
| a preset holding a service keeps it; the preset can go; then the service can go | **Retired**: presets and services are insert-only settings rows; retiring either never breaks the other (a preset names services by id; a retired one is skipped) |
| typo department deleted, its serving link with it; refused with services, with people | admin · "the typo department is deleted", refuses `in_use` ×2 (works-for is a setting of the department and goes with it) |
| typo user deleted, roles with them; refused signed in; refused yourself | admin · "a user added by mistake who never signed in goes", refuses `in_use`, `self_change` |
| role nobody holds deleted; built-in refused; held refused | admin · "the unheld role is deleted", refuses `builtin_role`, `in_use` |
| role made; the actions a role can carry are listed; builtin_role; unknown_action; not_allowed | admin · "a role made", "the actions a role can carry are listed", refuses ×3 |
| retired, taken from its holder; a key is never reused | admin · "retired, taken from its holder", "a key is never reused" |
| manage actions granted by one who holds them; self_change | admin · "a Boss role", refuses `self_change` ×2 |
| last administrator | admin · refuses `last_administrator` |
| a role of another organization, a retired role (`not_found`) | admin · refuses `not_found` ×2 |
| an administrator may hold the two rights on two roles | admin · the fixture's owner and "HR" paths (`require_last_administrator` counts actions held everywhere across roles) |
| (new) may with a null department; the Owner holds every action; may_somewhere; a login with two users chooses | admin · "a department role is not held anywhere", "the owner holds every action", "may_somewhere", "chosen", "the session is Demo" |

## privacy → `privacy.sql` (and `canary.sql`)
The old suite's 139 checks, by section:
| old section | now |
|---|---|
| what privacy on the visit used to need is gone (4) | **Retired**: the functions and columns it checked never existed in this core |
| Psychiatry is a private department; checked in; search shows the department (3) | privacy · setting in the fixture, "checked in to Psychiatry", "the IM doctor's search shows Psychiatry" |
| the psychiatrist writes the story and the facts; a note the IM doctor is responsible for; a visitless note; every note private (9) | privacy · "the story and the facts, one set", "a Psychiatry note with no visit", "done, the level still out" (privacy is computed from the department's setting; there are no privacy rows to count) |
| the IM doctor reads: placeholder with the department; facts in full; lists; read_entry hides; files refused; visit card; responsible clinician; hidden counts (11) | privacy · "the note is a placeholder, its department named", "the lithium shows in full", "the problem shows", "the order shows", "lithium is on the medication list", "the record says where private items are", "nothing of the phone note anywhere in his record", "the assigned clinician reads the visit's note"; canary · file and storage calls |
| who reads it: author, doctor at Psychiatry; not the owner, a clerk, a machine user; mark not private refused; open with a non-clinical reason refused (8) | privacy · "a second psychiatrist reads it", "the owner does not", clerk refused `not_allowed`, "a machine user … does not", "the owner cannot even address it" |
| open anyway: reason required; opens; a correction refused; logged (6) | privacy · `reason_missing`, "opened anyway (emergency)" (flagged), "the note reads after open anyway", "opening is not writing: no correction", "the read log says BTG and why", "opened anyway waits for review" |
| private or not: author or department; not a note (`not_a_note`); reason; listed for review (9) | privacy · "a reader who opened anyway" (`not_allowed`), "the lithium" (`never_private`), `reason_missing`, flagged `made_not_private`, "now the owner reads it", "hidden again" |
| one private note anywhere (3) | privacy · "! at the start of a line", "the psychiatrist sees Private note from Internal Medicine" |
| a corrected note keeps its privacy; a struck note can be made private (7) | privacy · "the psychiatrist corrects her note", "both versions are hidden", "a crossed-out note can be made private", "its first version is hidden from Psychiatry" |
| a consult reply is for whoever asked (8) | privacy · "the requester reads the reply", "a doctor of the asking department reads it", "the owner does not", "the order shows answered; its answer is a placeholder" |
| the reply's value is not in the owner's trend or results table (3) | privacy · "not in the owner's trend", "nowhere in the owner's record", "the psychiatrist sees the value" |
| lists: department names real; Psychiatry's desk sees its queue; a cancelled visit left out; review list restricted (6) | privacy · "Psychiatry's clerk sees its queue", refuses `not_allowed` (review), "a crossed-out visit is gone" |
| the read log: a reason for every open (basis visit/none/pack) (3) | privacy · "reads are logged (TREAT)", "the machine user's read is logged", read log refused to a doctor, "the owner reads the read log". **Changed**: `basis` is now the registered purpose (TREAT, BTG…) |
| a request row returned by marking or routing masks a hidden reply; no function returns reply_line (3) | canary · "the marker never appears" over every door (the writer never returns rows) |
| search and the patient read carry no consult question and no visits; review comparison hides values (3) | canary · the `patients`, `patient` and `table` shapes; search returns identities only |
| the live record channel (3) | privacy · "he may listen", "not to a record he never read", "his organization's channel only" |
| a striker is not an author (4) | privacy · "the owner crosses it out", "its author makes it private", "the striker cannot" |
| a correction under the survivor after a merge stays private (7) | privacy · "merged into the second record", "she corrects the note from the survivor", "nothing of it shows from either record", "the merged record reads as its survivor" |
| another organization can neither turn privacy off nor change users (4) | privacy · refuses `not_found` ×3, "their search finds none of ours", "Psychiatry is unchanged"; tenancy suite |
| the backfill (4) | **Retired**: there is nothing to backfill — privacy is computed on every read from entries and the department's setting as of each item |
| erasing a patient with private notes and replies (2) | privacy · "erased", "nothing of him is left", "the log keeps only the fact" |

## pharmacy → `pharmacy.sql`
| old check | now |
|---|---|
| the pack role holds no core table; its functions its own, definer | pharmacy · same two checks |
| before the pack is on: refused; a prescription is a paper script | pharmacy · "not sent", "no order"; pack off/on below |
| not sent: no request; sent: a request to Pharmacy; the queue carries what to give | pharmacy · "sent: the medication and its order in one set", "the pack hears of it after commit", "drained", "the queue carries what to give" |
| prepared; a result cannot answer (`wrong_reply_type`); dispensed: done, nothing to review; steps | pharmacy · "prepared", "the queue: prepared", "the base order: in progress, step prepared", `wrong_answer`, `nothing_dispensed`, "dispensed", "the order is done", "the queue: dispensed", "nothing to review for a dispense", "steps: Prepared > Dispensed · Lithium 400 mg × 60" |
| pack off: a new dispense refused (`pack_off` ×2); the record still reads | pharmacy · "a new dispense" (`pack_off`), "the record still reads, with the pack's line", "on again: its table caught up", "rebuild = live, the pack's table included" |

## boundary (B1–B10) → `pack_contract.sql`
| old check | now |
|---|---|
| B4 grants; B3 ownership and definer | pack_contract · B4, B3, "its functions are not callable from the API" |
| B1 a sleeping pack delays no write | pack_contract · "B1 the note landed in … ms although the pack would sleep 600", "B1 the call waits in the outbox, untried" |
| B2 the runner survives the sleeper | **Retired**: the drain is a pg_cron job with its own statement timeout (migration 10); a sleeper only delays other packs' calls, never a write |
| B5 raising: recorded, retried, parked after five | pack_contract · "B5 the error is recorded after one try", "B5 the pack is stale for the patient", "B5 the note stands", "B5 parked after five tries", "a parked call is not retried" |
| B6 writing a core table refused by Postgres | pack_contract · "B6 permission denied", "B6 nothing reached core.read_log" |
| B7 reacts once, the row gone | pack_contract · "B7 drained", "B7 nothing left", "B7 the pack reacted exactly once" |
| B8 the funnel gates a pack caller (`not_allowed`, `author_mismatch`) | pack_contract · "the nurse" (`not_allowed`). **Retired**: `author_mismatch` — identity comes only from the JWT; there is no author parameter to mismatch |
| B9 advisory locks: a host limit | boundary · network USAGE reported as a host limit; advisory locks remain granted to PUBLIC by the host (a pack refresh runs inside the writer's transaction and takes no locks of its own by review) |
| B10 rebuild with a hostile updater | pack_contract · "refresh = rebuild for every pack table"; rebuild suite |
| (new) its own type refreshes inline; its rule hides only its own type; off keeps rules; on again catches up | pack_contract · "a ping lands although its refresh raises", "stale, with the error", "the pack's rule hides its own ping from others and never the base's note", `pack_off`, "a cross-out of its entry still lands", "its rule still applies while off", "on again: caught up, no longer stale" |

## pack_contract (K1: tests 3–5 and the control) → `registry.sql`, `boundary.sql`
| old check | now |
|---|---|
| control: not definer, unpinned search_path, search_path other than empty | registry · refuses `not_definer`, `search_path_not_pinned`; registry integrity over every registered function |
| control: PUBLIC EXECUTE; a door that runs as another role | boundary · "no base or pack function is callable from the API", "the public doors", "core functions the API may call" |
| control: an object the pack does not own; a pack table granted outside | registry · `wrong_owner`; boundary · "no one but its layer writes a derived table" |
| control: a grant or a column grant on a core table; USAGE on another schema; role membership | boundary · "packs hold no core table", "authenticated and anon hold no table", network USAGE |
| control: quoted/spaced core table name; SQL-standard bodies; advisory lock; dynamic execute | boundary · the entries and derived-table scans over `prosrc`. **Retired**: forbidding dynamic SQL and advisory locks in pack bodies — what a pack reaches is bounded by grants, which are tested |
| control: an untagged type or action; a missing after_write; a pack with no role | registry · `outside_prefix` ×2, `never_private`, `own_type`, `requires_loop`, `wrong_volatility`, `derived_table_needs`, "a pack cannot write the registry itself" (declarations replace tags; there is no after_write) |
| control: the known list hides nothing; rolled back | boundary/registry use `t.report`; the runner fails any unexpected FAIL |

## The eight permanent tests (new)
| test | suite |
|---|---|
| 1 rebuild = live | `rebuild.sql` (the demo day), and in lists, pharmacy, pack_contract, concurrency |
| 2 boundary scan | `boundary.sql` |
| 3 privacy canary | `canary.sql` |
| 4 concurrency | `concurrency.sql` (real second sessions) |
| 5 registry integrity | `registry.sql` |
| 6 FHIR | `fhir.sql` (structural checks; the HL7 Java validator is later) |
| 7 tenancy matrix | `tenancy.sql` |
| 8 pack contract | `pack_contract.sql` |

## The retired list, for the owner's sign-off
1. `is_first` stored on a visit — computed by the client from earlier presence rows.
2. "every entry its own recorded_at" — a set shares one; (recorded_at, id) orders it.
3. "open the record before reading entries" — every read is logged instead.
4. a separate list of the day's released results — the bench reads `base.orders` by status and day.
5. presets that hold a service block its deletion — settings are retired, never deleted.
6. the old privacy suite's checks that the removed visit-privacy functions are gone, and the privacy backfill — nothing stored to backfill.
7. `author_mismatch` — identity comes from the JWT only.
8. B2 (runner survives a sleeper) — the drain is a cron job with its own timeout.
9. forbidding dynamic SQL and advisory locks in pack bodies — grants bound what a pack reaches.
10. a change of a medicine that leaves a field out keeps the old value — a change is the whole medicine again; the composer starts it from the current version.
