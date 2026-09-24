# openCare · specification

| # | Spec | Status |
|---|---|---|
| 01 | [The record](01-record.md) — entries, requests, replies, lists, packs' contract | locked · amended by 02 |
| 02 | [The organization](02-organization.md) — users, roles, actions, departments, services, the pack boundary | locked · amended by 03 |
| 03 | [Patients and visits](03-patients-visits.md) — registration, arrivals, presence, the patient queue, the sweep | locked |
| 04 | [The core entry types](04-entry-types.md) — the nine types, their shapes, the patient lists, `read_record` | locked |
| 05 | [The core screens](05-screens.md) — the shell, reception, queue, visit, request surface, settings | locked |
| 06 | [The pack contract](06-pack-contract.md) — what a pack ships, its schema and role, the two reactions, the twelve tests | locked |

| 00 | [Core audit](00-core-audit.md) — the completeness review that produced the 2026-09-22 amendments | report |

The core is 01–06. Packs (Laboratory, Pharmacy, Billing, Internal medicine, …) are specced one file each under the same rules.

Each spec has an `.appendix.md` (invariants, CI tests, reasoning, what the break-tests changed) and a `.findings.json` (every scenario run). Locked means later specs build on it and do not reopen it; a change is an amendment with a date in the status line.

**Amendments** · [2026-09-23](amendments-2026-09-23.md) — the patient waits for results; which results need review is the clinic's rule (default critical); ranges by sex and age; request steps belong to packs; reply types from the registry; correcting a released result.

**07** · [Privacy and the record views](07-privacy-and-record.md) — hide the story, never the fact: a visit can be private (its notes hidden, its facts shown), open anyway with a reason, one read log; department rules; the record by visit, results over time, entries opened in full.
