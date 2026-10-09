// Where an ER patient goes (spec/openCare.md §5.6, piece E3): the choices of the Where to card, the departments of beds an admission
// may go to (never this one, never one whose encounters are EMER or AMB: another ER, a dialysis unit; an ICU or a CCU told by the starter
// setup it was made from), the decision (the pack's casualty.disposition: Decided starts boarding) and the leaving (one Done: the
// decision when it differs, the base's discharged with FHIR's discharge-disposition codes, never hosp, which is hospice; for an
// admission the next department's admitted about this stay, with the ER's note in it, through the base's pass), the ER's times worked
// out from what is written (never stored) and the police case's notice (never a stop). Chosen by Claude at the owner's request,
// awaiting the owner. Pure: npm run test:casualty.
import { move, newId } from '@core/db/entries'
import type { EntryIn } from '@core/db/rpc'
import type { EntryData } from '@core/db/shapes.generated'
import type { Department, PresenceRow } from '@core/db/types'

export type To = EntryData['casualty.disposition']['to']
export const TOS: readonly To[] = ['home', 'ward', 'icu', 'ccu', 'operating_room', 'other_facility', 'left_unseen', 'against_advice', 'died']
export const isTo = (x: unknown): x is To => TOS.includes(x as To)
/** the choices that send the patient to another department of beds here */
export const ADMITS = ['ward', 'icu', 'ccu', 'operating_room'] as const
export const isAdmit = (to: To | null | undefined): to is typeof ADMITS[number] => (ADMITS as readonly string[]).includes(to ?? '')
/** these are signed as the patient leaves, with no Decided */
export const SIGN_ONLY: readonly To[] = ['left_unseen', 'against_advice', 'died']

/** the card's choices, in the picture's order (the operating room's own list is a later pack's) */
export const CHOICES: { to: To; label: string; hint: string }[] = [
  { to: 'home', label: 'Home', hint: 'a letter and medicines come later' }, { to: 'ward', label: 'Admit to a ward', hint: '' },
  { to: 'icu', label: 'ICU', hint: '' }, { to: 'ccu', label: 'CCU', hint: '' }, { to: 'operating_room', label: 'Operating room', hint: 'then a ward' },
  { to: 'other_facility', label: 'Another facility', hint: 'why, and where' }, { to: 'left_unseen', label: 'Left before being seen', hint: '' },
  { to: 'against_advice', label: 'Left against advice', hint: 'signed by' }, { to: 'died', label: 'Died', hint: 'in the ER or brought in dead · the time and the cause' },
]
/** the base's discharge disposition for each choice (FHIR R4's codes): a move inside the hospital and "left before being seen" have no
 *  code of their own, so oth; never hosp */
export const DISPOSITION_OF: Record<To, 'home' | 'other-hcf' | 'aadvice' | 'exp' | 'oth'> = {
  home: 'home', ward: 'oth', icu: 'oth', ccu: 'oth', operating_room: 'oth', other_facility: 'other-hcf', left_unseen: 'oth', against_advice: 'aadvice', died: 'exp',
}

/** "12 min" under 90 minutes, else "1 h 43" */
export const dur = (min: number) => { const m = Math.max(0, Math.floor(min)); return m < 90 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` }
const minutes = (from: string, to: number) => Math.max(0, Math.floor((to - Date.parse(from)) / 60_000))

export type Kind = 'ward' | 'icu' | 'ccu'
/** a department's kind from the starter setup it was made from: a key ending in icu is an ICU, in ccu a CCU, every other a ward */
export const kindOf = (setup: string | null | undefined): Kind => /(^|\.)icu$/.test(setup ?? '') ? 'icu' : /(^|\.)ccu$/.test(setup ?? '') ? 'ccu' : 'ward'

export interface Bed { id: string; name: string }
export interface Beds { departments: { id: string; free: Bed[] }[] }
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const str = (x: unknown): x is string => typeof x === 'string' && x !== ''
/** casualty.beds' answer, read defensively */
export function bedsOf(data: unknown): Beds | null {
  if (!obj(data) || !Array.isArray(data.departments)) return null
  return { departments: data.departments.flatMap((d) => obj(d) && str(d.id) ? [{ id: d.id, free: (Array.isArray(d.free) ? d.free : [])
    .flatMap((b) => obj(b) && str(b.id) && str(b.name) ? [{ id: b.id, name: b.name }] : []) }] : []) }
}

export interface Dest { id: string; name: string; kind: Kind; free: Bed[] }
/** where an admission may go: the departments of stays here but this one, by name, less those whose encounters are EMER or AMB (none
 *  set counts as a ward); each with its free beds ([] while not read) */
export function destinations(departments: readonly Pick<Department, 'id' | 'name' | 'work' | 'setup'>[], here: string, beds: Beds | null,
  classOf: (id: string) => string | null | undefined): Dest[] {
  return departments.filter((d) => d.work === 'stays' && d.id !== here && !['EMER', 'AMB'].includes(classOf(d.id) ?? ''))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ id: d.id, name: d.name, kind: kindOf(d.setup), free: beds?.departments.find((b) => b.id === d.id)?.free ?? [] }))
}
/** the choices: ICU and CCU only when the clinic has one */
export const choicesFor = (dests: readonly Dest[]) => CHOICES.filter((c) => (c.to !== 'icu' && c.to !== 'ccu') || dests.some((d) => d.kind === c.to))
/** the departments a choice offers: the wards, the ICUs, the CCUs; after the operating room, any */
export const destsFor = (to: To | null, dests: readonly Dest[]): Dest[] =>
  to === 'operating_room' ? [...dests] : to === 'ward' || to === 'icu' || to === 'ccu' ? dests.filter((d) => d.kind === to) : []
/** a choice's hint: for a ward, ICU or CCU its departments' free beds, "Medical Ward 3 free · …" */
export function hintOf(to: To, dests: readonly Dest[]): string {
  const c = CHOICES.find((x) => x.to === to)
  if (to !== 'ward' && to !== 'icu' && to !== 'ccu') return c?.hint ?? ''
  const ds = destsFor(to, dests)
  return ds.length ? ds.map((d) => `${d.name} ${d.free.length ? `${d.free.length} free` : 'no free bed'}`).join(' · ') : 'none here'
}

/** what the card says: the choice and its fields */
export interface Leave {
  to: To; department_id?: string; place_id?: string | null; reason?: string; note?: string; facility?: string; why?: string; signed_by?: string
  brought_in_dead?: boolean; died_at?: string; cause?: string; police_report?: string
}
/** the standing decision, as the board reads it (at: when where to last changed; entry: its latest version) */
export interface Decided { to: To; department_id?: string; facility?: string; why?: string; police_report?: string; at: string; entry: string }

const trimmed = (s: string | null | undefined) => s?.trim() || undefined
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T
/** the decision's data: each field only for its choice */
export const dispositionData = (l: Leave): EntryData['casualty.disposition'] => clean<EntryData['casualty.disposition']>({
  to: l.to, department_id: isAdmit(l.to) ? l.department_id : undefined,
  facility: l.to === 'other_facility' ? trimmed(l.facility) : undefined,
  why: l.to === 'other_facility' || l.to === 'against_advice' ? trimmed(l.why) : undefined,
  signed_by: l.to === 'against_advice' ? trimmed(l.signed_by) : undefined,
  brought_in_dead: l.to === 'died' ? !!l.brought_in_dead : undefined,
  police_report: trimmed(l.police_report),
})
/** the decision standing says the same: where to, the department, the facility and why, the report number */
export function sameDecision(l: Leave, d?: Decided): boolean {
  if (!d) return false
  const x = dispositionData(l)
  return d.to === x.to && (d.department_id ?? '') === (x.department_id ?? '') && (d.facility ?? '') === (x.facility ?? '') && (d.why ?? '') === (x.why ?? '')
    && (d.police_report ?? '') === (x.police_report ?? '')
}

type Stay = Pick<PresenceRow, 'item' | 'patient_id' | 'latest_entry'> & { reason?: string | null }
const decision = (l: Leave, stay: Stay, er: string, d?: Decided): EntryIn => ({ id: newId(), type: 'casualty.disposition', patient_id: stay.patient_id,
  department_id: er, visit_id: stay.item, data: dispositionData(l), ...(d ? { refers_to: d.entry, relation: 'changes' as const } : {}) })
/** Decided: the decision alone (a new one changes the standing one); boarding counts from it */
export const decideSet = (l: Leave, stay: Stay, er: string, d?: Decided): EntryIn[] => [decision(l, stay, er, d)]

/** the discharged's words: where the patient went */
function leftWords(l: Leave, name: (id: string) => string): string | undefined {
  const dep = l.department_id ? name(l.department_id) : 'a ward'
  switch (l.to) {
    case 'ward': case 'icu': case 'ccu': return `to ${dep}`
    case 'operating_room': return `to the operating room, then ${dep}`
    case 'other_facility': return trimmed(l.facility) && `to ${trimmed(l.facility)}`
    case 'left_unseen': return 'left before being seen'
    case 'against_advice': return 'left against advice'
    default: return undefined
  }
}
/** Sign: one Done. The decision when none stands or it differs; died first the base's died at its time; the base's discharged on the
 *  stay's latest version; for an admission the next department's admitted about this stay (its own visit, admit source emd, the bed
 *  chosen or none: the ward chooses) and the ER's note in that new stay */
export function leaveSet(l: Leave, stay: Stay, er: string, name: (id: string) => string, d?: Decided): EntryIn[] {
  const out: EntryIn[] = sameDecision(l, d) ? [] : [decision(l, stay, er, d)]
  const v = { id: stay.item, patient_id: stay.patient_id, latest_entry: stay.latest_entry }
  if (l.to === 'died') out.push({ id: newId(), type: 'died', patient_id: stay.patient_id, department_id: er, visit_id: stay.item,
    ...(l.died_at ? { occurred_at: l.died_at } : {}), data: clean<EntryData['died']>({ cause: trimmed(l.cause) ? { text: trimmed(l.cause)! } : undefined }) })
  out.push(move('discharged', v, er, clean<EntryData['discharged']>({ disposition: DISPOSITION_OF[l.to], note: leftWords(l, name) })))
  if (isAdmit(l.to) && l.department_id) {
    const n = newId()
    out.push({ id: n, type: 'admitted', patient_id: stay.patient_id, department_id: er, visit_id: n, refers_to: stay.item, relation: 'about',
      data: clean<EntryData['admitted']>({ department_id: l.department_id, place_id: l.place_id ?? undefined, admit_source: 'emd', reason: trimmed(l.reason) ?? trimmed(stay.reason) }) })
    const text = trimmed(l.note)
    if (text) out.push({ id: newId(), type: 'note', patient_id: stay.patient_id, department_id: er, visit_id: n, data: { kind: 'emergency', text } })
  }
  return out
}

/** the ER's times, in whole minutes: door to doctor (null: no doctor yet), in the ER, boarding (an admission decided, not yet gone) */
export interface Times { doorToDoctor: number | null; inEr: number; boarding: number | null }
export function timesOf(row: Pick<PresenceRow, 'checked_in_at'>, facts: { seen_at?: string; decided?: Decided } | undefined, now: number): Times {
  return { doorToDoctor: facts?.seen_at ? minutes(row.checked_in_at, Date.parse(facts.seen_at)) : null, inEr: minutes(row.checked_in_at, now),
    boarding: facts?.decided && isAdmit(facts.decided.to) ? minutes(facts.decided.at, now) : null }
}
/** "door to doctor 22 min · in the ER 2 h 05 · boarding 40 min", or "no doctor yet · in the ER 42 min" */
export const timesLine = (t: Times) => [t.doorToDoctor === null ? 'no doctor yet' : `door to doctor ${dur(t.doorToDoctor)}`, `in the ER ${dur(t.inEr)}`,
  t.boarding === null ? '' : `boarding ${dur(t.boarding)}`].filter(Boolean).join(' · ')

/** a police case with no report number written yet: a notice, never a stop */
export const policeNotice = (police?: boolean, report?: string): string | null =>
  police && !report?.trim() ? 'Police case · no report number yet — add it here, or later, before they leave' : null
