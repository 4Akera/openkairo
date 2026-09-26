# Amendments · 2026-09-23

Status: **locked** · approved by the owner 2026-09-23 · amends 02, 03, 04, 06 · migration 0021 · tests `supabase/tests/amendments.sql`

Six decisions from the first run of the clinic at volume. None adds a table to the record; the spine is unchanged.

## 1. The patient waits for results (03)

- Done waits by default: anything still out keeps the visit open (`pending`); when it is all back the patient is **BACK**.
- The clinician may say *not waiting* (`mark_visit(…, wait => false)`): the visit closes now; what comes back later goes to review.
- **Results back, patient gone.** When nobody will see a result with the patient — reception marks them gone (`mark_present false`),
  the sweep finds them gone at the day's end, the visit closes, or the request had no visit — every result that came back since the
  clinician last saw them goes to the review list with the reason **not seen**, whatever the clinic's review rule.
- Back within 14 days, Here reopens the same visit (unchanged, 03) and the patient is BACK again.

## 2. Which results need review is the clinic's rule (02, 04)

`organizations.review_results`: `critical` (default) · `abnormal` · `all`. A reply's review reason (`requests.review_reason`):

| reason | when |
|---|---|
| critical | any value critical — always |
| corrected | the reply replaces an earlier one — always |
| abnormal | the rule is `abnormal` or `all` and a value is out of range |
| result | the rule is `all` and the reply is final |
| not seen | final, and the patient is not there to be seen (1) — always |

The clinician's Done in a consult clears what came back before it (they had it on screen), except criticals, which need an explicit
review. `read_to_review` carries the reason.

## 3. Ranges by sex and age (02)

A field's range can be replaced for some patients: rows of `service_field_ranges` by sex, by age (`age_low` ≤ age < `age_high`), or
both; the most specific row that fits wins, then the field's own. Saved with the service (`save_service(…, ranges)`), read with
`read_ranges`. A range sent with the value (an analyzer's) still wins over both (spec 01, `fill_values`).

## 4. Request steps belong to packs (06)

Core has no working steps on the bench: a request goes from *new* to *released*. A pack adds its steps (`ALTER TYPE request_step ADD
VALUE`, unchanged) and registers the bench buttons for its department type (`registerBenchSteps(type, [{ step, label, from }])` in its
client module) — the laboratory pack: collect → receive → verify; the pharmacy pack: prepare → dispense. A step never closes a request.

## 5. Reply types come from the registry (02, 04, 06)

`services.reply_type` names the entry type that answers the service: core's `result` or `note`, an entry type of a pack enabled for
the organization, or `none` (closed by a step). `save_service` refuses anything else (`bad_reply_type`); `read_reply_types` lists the
choices. A reply is checked against its service: `write_result` answers only `result` services and `write_note` only `note` ones
(`wrong_reply_type`); a pack's writer checks its own. Dispensing is the pharmacy pack's type `pharmacy_dispense`: a prescription
becomes a request only when a live service of that type exists, so without the pack a prescription is a paper script.

## 6. Correcting a released result (04)

`read_queue` carries the department's results released in the last 24 hours (`recent`). Correcting one writes a new result with
`replaces_id` (spec 01): the display line reads `Corrected:`, the record keeps both, and the request goes back to review (2).
