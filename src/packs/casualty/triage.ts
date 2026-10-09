// Arrived and the triage as entries (spec/openCare.md §5.6). Arrived is the base's admitted with no place: the patient sits in the
// chairs, the board's no-bed list; how they came only picks the admit source (referred by a doctor gp, another hospital hosp-trans,
// else other; never emd, which is a stay that comes from the ER) and is kept by the triage that follows. One Done of the triage card
// writes the base's vitals (when typed), the pack's triage (the level's words and its coding on the scale, what brings them, the
// pack's own fields), the base's urgent to match the level (1–2 urgent, 3–5 not) and the base's moved to the place chosen; the moves
// are chained, urgent on the stay's latest entry and moved on the urgent. Pure: npm run test:casualty.
import { draftEntries, move, newId, oneSet } from '@core/db/entries'
import type { EntryIn, SetIn } from '@core/db/rpc'
import type { EntryData } from '@core/db/shapes.generated'
import type { Place, PresenceRow } from '@core/db/types'
import { parseVitals } from '@core/screens/visit/vitals'
import { LEVEL_WORDS, SCALES, type Level, type Scale } from './scale'
import { needsWhy, type Danger, type Suggestion } from './suggest'

export type Arrival = 'walked_in' | 'ambulance' | 'family' | 'police' | 'referred' | 'other_hospital'
export const ARRIVALS: [Arrival, string][] = [['walked_in', 'Walked in'], ['ambulance', 'Ambulance'], ['family', 'Family or friends'], ['police', 'Police'],
  ['referred', 'Referred by a doctor'], ['other_hospital', 'Another hospital']]
export type Complaint = 'chest_pain' | 'breath' | 'injury_road' | 'fall' | 'abdominal_pain' | 'fever' | 'poisoning' | 'sting_bite' | 'burn' | 'fits'
  | 'weakness_one_side' | 'bleeding_pregnancy' | 'wound'
export const COMPLAINTS: [Complaint, string][] = [['chest_pain', 'Chest pain'], ['breath', 'Short of breath'], ['injury_road', 'Injury · road accident'], ['fall', 'Fall'],
  ['abdominal_pain', 'Abdominal pain'], ['fever', 'Fever'], ['poisoning', 'Poisoning'], ['sting_bite', 'Scorpion or snake'], ['burn', 'Burn'], ['fits', 'Fits'],
  ['weakness_one_side', 'Weakness one side'], ['bleeding_pregnancy', 'Bleeding in pregnancy'], ['wound', 'Cut or wound']]
/** the most words a less urgent level's reason may take */
export const WHY_MAX = 200

/** how they came → the base's admit source */
export const admitSourceOf = (a?: Arrival | null): 'gp' | 'hosp-trans' | 'other' => a === 'referred' ? 'gp' : a === 'other_hospital' ? 'hosp-trans' : 'other'
/** the admit source back to how they came, where it says it */
export const arrivalOf = (source?: string | null): Arrival | undefined => source === 'gp' ? 'referred' : source === 'hosp-trans' ? 'other_hospital' : undefined

export interface TriageDraft {
  scale: Scale; level: Level; arrival?: Arrival | null; arrival_ref?: string; complaint?: Complaint | null; words?: string; danger: Danger[]
  vitals?: Record<string, unknown> | null   // the parsed /v params
  suggested?: Suggestion | null; why?: string
  place?: string | null                     // a place id, or null for the chairs
}
// the empties go: undefined, null, '' and []
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))) as T
const trimmed = (s: string | null | undefined) => s?.trim() || undefined

/** the triage's data: the level in words with its coding on the scale, what brings them, and the pack's fields — only what was said */
export function triageData(d: TriageDraft): EntryData['casualty.triage'] {
  const word = LEVEL_WORDS[d.level]
  return clean<EntryData['casualty.triage']>({
    code: { text: `Triage level (${SCALES[d.scale].name} scale)` },
    value: { concept: { text: `${d.level} · ${word}`, codings: [{ system: `casualty.${d.scale}`, code: String(d.level), display: word }] } },
    note: trimmed(d.words),
    casualty: clean<EntryData['casualty.triage']['casualty']>({ scale: d.scale, scale_version: SCALES[d.scale].version, level: d.level, arrival: d.arrival ?? undefined,
      arrival_ref: d.arrival === 'ambulance' ? trimmed(d.arrival_ref) : undefined, complaint: d.complaint ?? undefined, danger: d.danger.length ? [...d.danger] : undefined,
      suggested: d.suggested ? { level: d.suggested.level, signs: [...d.suggested.signs] } : undefined,
      why: needsWhy(d.suggested, d.level) ? trimmed(d.why)?.slice(0, WHY_MAX) : undefined }),
  })
}

/** Arrived: the base's admitted in the ER with no place (the chairs); the stay's id is the entry's */
export function arrivedSet(patientId: string, er: string, arrival?: Arrival | null, reason?: string): SetIn {
  const id = newId()
  return oneSet([{ id, type: 'admitted', patient_id: patientId, department_id: er, visit_id: id,
    data: clean<EntryData['admitted']>({ department_id: er, admit_source: admitSourceOf(arrival), reason: trimmed(reason) }) }])
}

/** the triage card's one Done: the vitals (when typed), the triage, urgent to match the level, the move to the place chosen */
export function triageSet(d: TriageDraft, stay: Pick<PresenceRow, 'item' | 'patient_id' | 'latest_entry' | 'urgent' | 'place_id'>, er: string): EntryIn[] {
  const out: EntryIn[] = []
  if (d.vitals && Object.keys(d.vitals).length)
    out.push(...draftEntries({ id: newId(), function: 'vitals', params: d.vitals }, { patientId: stay.patient_id, departmentId: er, visitId: stay.item }))
  out.push({ id: newId(), type: 'casualty.triage', patient_id: stay.patient_id, department_id: er, visit_id: stay.item, data: triageData(d) })
  const v = { id: stay.item, patient_id: stay.patient_id, latest_entry: stay.latest_entry }
  const urgent = d.level <= 2
  const u = urgent !== stay.urgent ? move('urgent', v, er, { urgent }) : null
  if (u) out.push(u)
  if (d.place && d.place !== stay.place_id) out.push(move('moved', v, er, { place_id: d.place }, u?.id))
  return out
}

/** the /v words typed on the card: a leading /v or /vitals goes (a bare v is Voice); a parse error blocks Done */
export function vitalsOf(line: string): { params: Record<string, unknown> | null; error: string | null } {
  const ws = line.trim().split(/\s+/).filter(Boolean)
  if (ws[0] && /^\/(v|vitals)$/i.test(ws[0])) ws.shift()
  const r = parseVitals(ws)
  if (!r) return { params: null, error: null }
  if ('error' in r) return { params: null, error: r.error }
  return { params: r.ok[0]?.params ?? null, error: null }
}

/** the card's places: the free ones here (not closed, not taken, not the stay's own), a resus bay (labelled bed) first for a level 1
 *  or 2 and a cubicle first for 3–5, each by position; the stay's own place; and the place to sign: the one chosen while it is still
 *  free, else the preset — the stay's own place, else for a level 1 or 2 the first free bed (a cubicle when no bed is free), else none
 *  (the chairs). `chosen` undefined: not chosen yet */
export function placeChoices(places: readonly Place[], taken: ReadonlySet<string>, row: Pick<PresenceRow, 'place_id'>, er: string, level: Level | null,
  chosen: string | null | undefined): { free: Place[]; own: Place | null; place: string | null } {
  const bedFirst = level !== null && level <= 2
  const free = places.filter((p) => p.department_id === er && !p.closed && !taken.has(p.id) && p.id !== row.place_id)
    .sort((a, b) => Number((b.label === 'bed') === bedFirst) - Number((a.label === 'bed') === bedFirst) || a.position - b.position)
  const own = row.place_id ? places.find((p) => p.id === row.place_id) ?? null : null
  const preset = row.place_id ?? (bedFirst ? (free.find((p) => p.label === 'bed') ?? free[0])?.id ?? null : null)
  const stale = !!chosen && chosen !== row.place_id && !free.some((p) => p.id === chosen)
  return { free, own, place: chosen === undefined || stale ? preset : chosen }
}
