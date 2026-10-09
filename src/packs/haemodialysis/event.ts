// A dialysis event (spec/openCare.md §5.6, D2c): what happened on the machine (low BP, cramps, …) and what was done about it, in one
// set as the base's entries — the base's note of kind dialysis_event (its heading the events, its text what was done and the nurse's
// words), the base's given for the saline when it was given, and a reading when a BP or a pulse was taken with it (the machine's numbers
// carried from the last reading; none to carry: the base's vitals). The tile shows the event of the last hour, in red when it has Low
// BP. Pure: npm run test:haemodialysis.
import { draftEntries, newId } from '@core/db/entries'
import type { EntryIn } from '@core/db/rpc'
import type { EntryData } from '@core/db/shapes.generated'
import type { ServerEntry } from '@core/db/types'
import { bpOf, readingData, readingEntry, type Reading } from './reading'

export const EVENT_KIND = 'dialysis_event'
/** the events (several), in the card's order */
export const EVENTS: [string, string][] = [['low_bp', 'Low BP'], ['cramps', 'Cramps'], ['nausea', 'Nausea or vomiting'], ['chest_pain', 'Chest pain'],
  ['headache', 'Headache'], ['clotting', 'Clotting in the circuit'], ['bleeding', 'Bleeding at the needles'], ['fever', 'Fever or rigors'], ['other', 'Other']]
/** what was done (several; one saline at a time) */
export const DONE: [string, string][] = [['saline_200', 'Saline 200 mL'], ['saline_100', 'Saline 100 mL'], ['paused', 'Taking off paused'],
  ['flow_down', 'Blood flow lowered'], ['doctor', 'Doctor called']]
const SALINE: Record<string, string> = { saline_200: '200', saline_100: '100' }
const label = (list: [string, string][], k: string) => list.find(([x]) => x === k)?.[1]

export interface EventIn {
  patientId: string; departmentId: string; stay: { item: string; patient_id: string }
  events: string[]; done: string[]; words?: string
  /** a BP ("88/54") or a pulse taken with it: a reading */
  bp?: string; pulse?: number | null
  /** the last reading's data (its machine numbers are carried) */
  last?: Partial<Reading> | null
}
/** the heading: the chosen events in the list's order, joined by ' · ' ("Low BP · Cramps") */
export const headingOf = (events: readonly string[]) => EVENTS.filter(([k]) => events.includes(k)).map(([, w]) => w).join(' · ')
/** the note's text: what was done and the nurse's words, joined by ', ' (nothing: the heading) */
export function eventText(x: Pick<EventIn, 'events' | 'done' | 'words'>): string {
  const parts = [...DONE.filter(([k]) => x.done.includes(k)).map(([, w]) => w), ...(x.words?.trim() ? [x.words.trim()] : [])]
  return parts.length ? parts.join(', ') : headingOf(x.events)
}
/** what is missing before the event can be signed */
export function eventProblems(x: Pick<EventIn, 'events' | 'bp' | 'words'>): string[] {
  return [...(!x.events.some((k) => label(EVENTS, k)) ? ['Choose what happened'] : []),
    ...(x.events.includes('other') && !x.words?.trim() ? ['Say what happened'] : []), ...(x.bp?.trim() && !bpOf(x.bp) ? ['BP as 88/54'] : [])]
}
/** the event in one set: the note, the saline given, and a reading (or the base's vitals) when a BP or a pulse was typed */
export function eventSet(x: EventIn): EntryIn[] {
  if (eventProblems(x).length) return []
  const where = { patient_id: x.patientId, department_id: x.departmentId, visit_id: x.stay.item }
  const note: EntryData['note'] = { kind: EVENT_KIND, heading: headingOf(x.events), text: eventText(x) }
  const out: EntryIn[] = [{ id: newId(), type: 'note', ...where, data: note }]
  const saline = x.done.map((k) => SALINE[k]).find(Boolean)
  if (saline) out.push({ id: newId(), type: 'given', ...where,
    data: { drug: { text: 'Sodium chloride 0.9 %' }, dose: { value: saline, unit: 'mL', ucum: 'mL' }, route: 'IV', status: 'completed' } })
  const bp = bpOf(x.bp); const hr = x.pulse != null && Number.isFinite(x.pulse) ? x.pulse : null
  if (bp || hr !== null) {
    const r = readingData({ ...(x.bp?.trim() ? { bp: x.bp } : {}), ...(hr !== null ? { hr: String(hr) } : {}) }, x.last)
    if (r) out.push(readingEntry(r, x.stay, x.departmentId))
    else out.push(...draftEntries({ id: newId(), function: 'vitals', params: { systolic: bp?.sys, diastolic: bp?.dia, pulse: hr ?? undefined } },
      { patientId: x.patientId, departmentId: x.departmentId, visitId: x.stay.item }))
  }
  return out
}
/** the tile's words: the heading's parts joined by ', ', each with its first letter in lower case ("low BP, cramps"); red when it has
 *  Low BP, else amber */
export function eventWords(heading: string): { text: string; tone: 'danger' | 'warn' } | null {
  const parts = heading.split(' · ').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  return { text: parts.map((p) => p[0].toLowerCase() + p.slice(1)).join(', '), tone: parts.includes('Low BP') ? 'danger' : 'warn' }
}
/** the tile shows an event of the last 60 minutes */
export const EVENT_MINUTES = 60
export const eventIsRecent = (at: string, now: number) => { const t = Date.parse(at); return Number.isFinite(t) && now - t <= EVENT_MINUTES * 60_000 }

export interface StayEvent { id: string; at: string; heading: string; text: string }
/** the stay's events, the newest first (a hidden or crossed-out one left out) */
export function eventsOf(entries: readonly ServerEntry[], stay: string): StayEvent[] {
  const crossed = new Set(entries.filter((e) => e.type === 'crossed_out').map((e) => e.item))
  const latest = new Map<string, ServerEntry>()
  for (const e of entries) {
    if (e.type !== 'note' || e.visit_id !== stay || e.hidden || !e.data || crossed.has(e.item)) continue
    const was = latest.get(e.item); if (!was || was.item_version < e.item_version) latest.set(e.item, e)
  }
  return [...latest.values()].filter((e) => e.data?.kind === EVENT_KIND)
    .map((e) => ({ id: e.id, at: e.occurred_at, heading: String(e.data?.heading ?? ''), text: String(e.data?.text ?? '') }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}
