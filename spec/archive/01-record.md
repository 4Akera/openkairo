# 01 · The record

Status: **locked** · 2026-09-22 · amended 2026-09-22 (spec 02): after-write reactions run through `pack_calls` after the commit, never inside `write_entry`; the record carries no money; access, users and settings are spec 02 · amended 2026-09-22 (spec 03): queue and to-review rows carry the request entry's `visit_id`; `change_request` also signals that visit's department and any queue signal refetches both queues; `erase_patient`'s order · amended 2026-09-22 (core audit): `write_entry`'s destination and `sent` row; `flowsheets` struck; pack reads leave no `record_reads` row
Full reasoning, invariants and break-test decisions: [01-record.appendix.md](01-record.appendix.md)

## In one sentence

The record is a list of entries, each written once and never changed; the only
thing that can ever happen to an entry is that a newer entry replaces it.

- A **request** is an entry with a destination. Where it stands lives in `requests`.
- A **reply** is an entry that answers a request (`reply_to_id`). Replies cannot be replied to.
- Every department reads and writes the same record. A department's queue is a
  filter over `requests`; nothing clinical lives outside the record.

## Seven rules

1. **The columns are closed.** A new fact is a key in `data`; a new question is a
   derived table; new mutable state is an outside table.
2. **The record is closed per patient.** No pointer in a record table crosses patients.
3. **One pattern for "newer replaces older", depth 1:** `entries.replaced_by_id`,
   `patients.merged_into_id`, `codes.replaced_by_code`. Nothing is rewritten.
4. **Updaters only apply.** A correction replays that one list for that one patient,
   through the same code as rebuild.
5. **Anything that needs someone's eyes is a request** — critical results,
   co-signature, declines, outside results: one review loop.
6. **A repeated act is a non-final reply** — doses, partial dispenses, refills,
   preliminary cultures, home readings.
7. **A wrong clock, a wrong unit or a switched-off pack never blocks a clinical write.**

## Tables

| Kind | Tables | Rule |
|---|---|---|
| The record | `entries` · `entry_files` · `request_steps` | Insert-only; a trigger refuses update and delete |
| Request state | `requests` | Changes as the request moves; always recomputable from its steps and replies |
| Derived | `entry_values` · `patient_medications` · `patient_problems` · `patient_allergies` · `patient_list_reviews` · pack lists (`<pack>.<list>`) | Deletable and rebuildable; nobody writes them directly |
| Settings | `entry_types` · `organization_packs` · `departments` · `services` · `service_fields` · `codes` · `templates` · `packs` · `department_types` · `served_departments` · `service_field_ranges` · `roles` · `actions` (spec 02) | Rows are retired, never deleted; history never depends on them |
| Outside the record | `patients` · `visits` · `drafts` · `users` · `record_reads` · `settings_changes` · `pack_calls` · each pack's own tables in schema `<pack>` (billing, stock) | Ordinary mutable tables |

### entries — 21 columns, closed

```
who/where   id (UUIDv7, minted by the client; also the retry key) · organization_id · patient_id
            visit_id · author_id · responsible_id · department_id
            source (staff | patient | machine | outside | import) · source_key
when        occurred_at (clinical time) · recorded_at (system time, strictly increasing per record)
what        type · service_id · data jsonb · display_line · flag
links       reply_to_id · is_final · replaces_id · written_with_id
            replaced_by_id          ← the only column ever updated: NULL → value, once
```

**Self-contained:** at write time an entry copies into `data` everything it used from
settings — service, author, department names; per value its code, name, unit, ranges
and flag. Flags are computed once. History renders with no settings joins.

Conventions in `data`: values at `data.values[]`; typed text only in keys `text`/`*_text`;
names only in `*_name`; vague dates in `data.occurred_on` (`'2019'`, `'2019-03'`);
problem links in `data.problems[]`; an act not done is a reply with `data.not_done`.


### requests

```
entry_id pk · organization_id · patient_id · from_department_id · requester_id
to_department_id · assignee_id · priority (stat | urgent | routine) · due_at
step · status (generated from step: open | done | cancelled) · status_reason
reply_line · reply_flag · replied_at · review_needed_at
```

`held` is a core step; `sent` is a legal target only from `held`.
Queue index: `(to_department_id, priority, due_at) WHERE status = 'open'`.
To-review index: `(requester_id, review_needed_at) WHERE review_needed_at IS NOT NULL`.

### The rest

```
request_steps   request_id · position · step · actor_id · reason · changes · occurred_at · recorded_at
entry_values    entry_id · position · patient_id · code · value_number · value_text · unit · flag · occurred_at
entry_files     entry_id · position · path | url · mime · name
drafts          entry_id · author_id · patient_id · visit_id · type · service_id · reply_to_id · data
entry_types     key · name · pack · list · retired_at
packs           key · name · is_called_after_write
pack_calls      pack · entry_id · organization_id · recorded_at · tries · tried_at · error_text    pk (pack, entry_id)
service_fields  service_id · position · code · name · kind · unit · reference/critical low/high
codes           code ('system:code') · name · kind · unit · replaced_by_code
```

Steps with no content (collected, received, performed) are `request_steps` rows, not entries.
A new lab (PFT, audiometry) is a department + service + service_fields — rows, no tables.

## Functions — the app never touches tables

```
write_…   one public function per entry type → all end in the private write_entry
          write_set (everything saved by one Done, all-or-nothing) · write_entered_in_error
mark_…    mark_step · mark_routing · mark_reviewed → all end in the private change_request
read_…    read_record · read_entries · read_entry · read_queue · read_values
          read_to_review(organization_id, department_id) · read_entry_file(entry_id, position) (60 s signed URL);
          every `read_queue` and `read_to_review` row carries the request entry's `visit_id`
gates     require_access(organization_id, action, patient_id, department_id) → the caller's users.id · require_pack
upkeep    rebuild_record(patient_id) · erase_patient (the only delete path: drafts and the record tables, then
          `patient_changes`, `visit_steps`, `visits`, `patient_identifiers`, `patients`, for the survivor and every
          patient merged into it, then the `erasures` row — spec 03)
```

`write_entry` takes the entry header (spec 04) and an optional destination
`{to_department_id, priority, due_at, needs_review}`; a destination on any type inserts the
`requests` row and its initial `sent` step directly, never through the gated step path.
`write_entry`: lock the patient → insert → set `replaced_by_id` → extract values → apply
updater or replay the list → `change_request` once → insert one `pack_calls` row per pack
that is on for the organization, is called after write, and did not itself write the entry →
signal. A retry with the same id returns the stored row and changes nothing; a rebuild and a
step insert no `pack_calls` row. No pack code runs in `write_entry` except the updater of the
entry's own type, called only after a catalog check that it is a `security definer` function
owned by its pack's role.

Realtime is signals only (`record:<patient>`, `queue:<department>`, payload `{entry_id}`);
`change_request` also signals `queue:<visits.department_id>` of the request entry's visit; any
signal on a queue channel refetches both `read_queue` and `read_visit_queue` (spec 03).

## Packs

A pack = entry-type rows + its `write_…` functions + a screen, and — only when it tracks
a current state — one derived table with a pure updater. Every pack's migration ships in
every database; an organization switches packs on in settings (`organization_packs`). With a
pack off, its entries still render, trend and accept corrections; new ones are refused.
A pack is a schema named by its key, owned by a NOLOGIN role `pack_<key>`; every function and
table it ships is owned by that role and every function is `security definer` with `search_path`
pinned; the role holds EXECUTE on the funnels and the public read and mark functions and nothing
on any core table (spec 02). A pack may never alter a core table, write a table directly, close
a request with its own step, or reuse a type key.

A pack reacts to the record in exactly two ways:

| | Updater | After-write function |
|---|---|---|
| Keeps | a rebuildable patient list (medications, pregnancies) | the pack's own data (charges, stock, notifications) |
| Named by | `entry_types.list` → `update_<list>(entry)` | `packs.is_called_after_write` → `<pack>.after_write(entry)` |
| Runs | on every write and on every rebuild | after the write has committed, in its own transaction, as the pack's own user (`users.kind = 'pack'`); at least once; **never on rebuild** |
| Is | a pure function: O(rows), no waits, no clock | idempotent on `entry_id`; makes the pack's data match the entry as it is at call time |
| May read settings or the clock | no — pure function of the entry and existing rows | yes — it runs at write time |
| May change the entry | no | no — it only observes a finished entry |
| If it fails | the write fails — a pack updater fails writes of that pack's own types only, and `rebuild_record` isolates it | the write is unaffected; the failure is the `pack_calls` row's `error_text`, retried with back-off, parked after five tries and shown on the Organization page |

After-write functions see replacements and strikes too (`replaces_id`, type `entered_in_error`),
so a pack can void and re-create what it made from the old entry. They may call `mark_step`
— that is how a billing pack holds a request (`sent` → `held`) a few seconds after it is sent;
`mark_step` is compare-and-set, so a request already started stays started and the charge stays
unpaid. A pack reacts to entries only, never to steps.

**The record carries no money.** No price, no charge, no billing key lives in `entries`,
`requests` or any core table. A billing pack keeps its own prices, charges, invoices and
payments, and learns about care only through its after-write function. Control and data flow
one way: packs read the record; the record never reads a pack and never runs one, except the
updater of a pack's own entry types inside that pack's own writes.

## Naming

Suffixes: `_id` pointers · `_code` code pointers · `_at` times · `_on` partial dates ·
`is_` booleans · `_text` typed text · `_name` names. No abbreviations except id, mime, url.

Words: record · entry · request · reply · result · requester · set · value · field ·
service · step · routing · queue · visit · department · patient list · pack · organization ·
site · section · role · action · user · hold · present · band · arrival · sweep · registration ·
identifier · record number.

Not used in the schema: chart, order, thread, behaviour, projection, observation,
attachment, event, snapshot, worklist, summary, label.

## Decide-now items (already reflected above)

Client-minted UUIDv7 ids · closed columns incl. `responsible_id` · insert-only trigger
before the first row · no partitioning (scale out = database per organization) ·
request state as a fold of steps · tables reachable only through functions ·
self-contained entries · one `'system:code'` form, one unit per code · organization is
permanent · the client sends the age of an act, never its clock · golden fixtures and
double-send tests from day one · the hostile fixture packs and the after-write queue tests
(B1–B6) from day one.

## Written as rules now, built later

Patient merge · `erase_patient` · organization split · code recoding · read-as-of-time ·
inpatient dose charts (rule 6) · cross-patient search (a derived table).

## Known limits

One entry, one patient · erase is the whole patient or nothing · a strike cannot be undone ·
no cross-organization record · no unit conversion · no machine streams in the record ·
one request, one destination · in-record search only · a pack's reads (its own user) leave no
`record_reads` row.
