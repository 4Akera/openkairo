// The drug round's reads and their words (spec/openCare.md §5.6, piece 3): what the pack's ops answer (bedside.round, bedside.sheet,
// and the board's doses), a medicine and its dose in words, the dose the round writes (the base's given as Ward nursing's dose, naming
// the time it is for; not given, one of six coded reasons with the base's reason in words), and the tile's words from the board's read
// (C7): "1 dose late" in red, "times not set" in amber, after the NEWS2 word. A dose is never stopped for a clinical reason. Pure.
import type { Concept, EntryData, Quantity } from '@core/db/shapes.generated'
import type { PresenceRow } from '@core/db/types'
import type { TileCtx, TileWord, TileWords } from '@core/screens/ward/tiles'
import { FREQUENCY } from '@core/screens/chart/model/labels'
import { tileWords, type News2Board } from './news2'
import type { SlotState } from './schedule'
export type { SlotState }

export const DOSE = 'bedside.dose'
export type Reason = 'refused' | 'fasting' | 'vomiting' | 'not_in_stock' | 'held' | 'away'
/** the round's six reasons for a dose not given, and their words (the base's reason) */
export const REASONS: Record<Reason, string> = { refused: 'Refused', fasting: 'Fasting', vomiting: 'Vomiting', not_in_stock: 'Not in stock', held: 'Held by the doctor',
  away: 'Away from the ward' }
/** in their order: keys 1–6 on the round */
export const REASON_KEYS: Reason[] = ['refused', 'fasting', 'vomiting', 'not_in_stock', 'held', 'away']

/** one of a medicine's times: when it is for, its state at now, and its dose when it has one */
export interface SlotRead { due: string; first?: boolean; state: SlotState; dose?: string; at?: string; by?: string; not_given?: Reason; site?: string }
/** a dose that took no time (as needed, a second dose, a refusal another dose outranked) */
export interface DoseRead { dose: string; at: string; by?: string; status?: string; not_given?: Reason; site?: string }
export interface MedicineRead { medication: string; version: string; since: string; started?: string; new?: boolean; drug?: Concept
  dose?: Quantity; route?: string; text?: string; timing?: string; night?: boolean; prn?: boolean; prn_for?: string; instructions?: string
  status: string; course?: number; unset?: boolean; elsewhere?: boolean; slots: SlotRead[]; extra: DoseRead[] }
export interface StayRead { stay: string; patient_id: string; place_id: string | null; medicines: MedicineRead[] }
/** bedside.round: every stay admitted here, the round's time and when it opened */
export interface RoundRead { patient_ids: string[]; now: string; round_at: string | null; opens_at: string; late_after: number; stays: StayRead[] }
/** bedside.sheet: one stay's medicines over a day, or the whole stay */
export interface SheetRead { patient_ids: string[]; stay: string | null; day?: 'today' | 'yesterday' | 'stay'; from?: string; to?: string
  now?: string; medicines?: MedicineRead[] }
/** the board's doses of a stay */
export interface DosesBoard { late: number; due: number; unset: number }
export interface BoardRead extends News2Board { doses?: Record<string, DosesBoard> }

/** "Paracetamol 1 g" */
export function drugWords(m: Pick<MedicineRead, 'drug' | 'dose'>): string {
  const d = m.dose?.value ? ` ${m.dose.value}${m.dose.unit ? ` ${m.dose.unit}` : ''}` : ''
  return `${m.drug?.text ?? 'Medicine'}${d}`
}
const ROUTE: Record<string, string> = { iv: 'IV', intravenous: 'IV', sc: 'SC', subcutaneous: 'SC', im: 'IM', intramuscular: 'IM' }
/** "IV · every 6 hours", "SC · by the sliding scale · before meals, by the glucose" */
export function howWords(m: MedicineRead): string {
  const route = m.route ? ROUTE[m.route.toLowerCase()] ?? m.route : ''
  const timing = m.prn ? `as needed${m.prn_for ? ` for ${m.prn_for}` : ''}` : m.timing ? FREQUENCY[m.timing] ?? m.timing : ''
  return [route, timing, m.text, m.instructions].filter((x) => !!x && x.trim()).join(' · ')
}
/** ↵ gives in one key only when the prescription names its dose */
export const hasDose = (m: Pick<MedicineRead, 'dose'>) => !!m.dose?.value
/** "late 6 h", "late 25 min" */
export function lateWords(due: string, now: number): string {
  const min = Math.max(0, Math.floor((now - new Date(due).getTime()) / 60_000))
  return min < 60 ? `late ${min} min` : `late ${Math.floor(min / 60)} h`
}
/** "Nour" from "Nour Adel"; "Ali" from "Dr. Ali Hassan" */
export const shortName = (name: string | null | undefined): string => (name ?? '').replace(/^\s*dr\.?\s+/i, '').trim().split(/\s+/)[0] ?? ''

type Give = { given: true; dose?: Quantity; site?: string; note?: string } | { given: false; reason: Reason }
/** the dose the round writes for a medicine and its time (null: as needed, or a time not set): given as prescribed or as changed, or
 *  not given with its reason; no empty keys */
export function doseData(m: MedicineRead, due: string | null, c: Give): EntryData['bedside.dose'] {
  const drug = m.drug ? { drug: m.drug } : {}; const route = m.route ? { route: m.route } : {}
  if (!c.given) return { medication: m.medication, ...drug, ...route, status: 'not-done', reason: REASONS[c.reason], bedside: { ...(due ? { due } : {}), not_given: c.reason } }
  const dose = c.dose ?? m.dose
  return { medication: m.medication, ...drug, ...(dose ? { dose } : {}), ...route, ...(c.site ? { site: c.site } : {}), ...(c.note?.trim() ? { note: c.note.trim() } : {}),
    status: 'completed', ...(due ? { bedside: { due } } : {}) }
}

/** the board's doses of this stay, read defensively */
function dosesOf(row: PresenceRow, read: unknown): DosesBoard | undefined {
  const all = read && typeof read === 'object' ? (read as { doses?: unknown }).doses : undefined
  const d = all && typeof all === 'object' && Object.hasOwn(all, row.item) ? (all as Record<string, unknown>)[row.item] : undefined
  return d && typeof d === 'object' ? d as DosesBoard : undefined
}
/** the tile's dose words: "1 dose late" / "n doses late" in red, "times not set" in amber (a word with each colour) */
export function doseTileWords(row: PresenceRow, read: unknown): TileWord[] {
  if (row.kind !== 'stay' || row.state !== 'admitted') return []
  const d = dosesOf(row, read); if (!d) return []
  const out: TileWord[] = []
  if (typeof d.late === 'number' && d.late > 0) out.push({ text: d.late === 1 ? '1 dose late' : `${d.late} doses late`, tone: 'danger' })
  if (typeof d.unset === 'number' && d.unset > 0) out.push({ text: 'times not set', tone: 'warn' })
  return out
}
/** Ward nursing's tile line (C7: the board's read is ctx.read): the NEWS2 word (else "no obs yet"), then the doses' words */
export function wardTile(row: PresenceRow, ctx: Pick<TileCtx, 'org' | 'identity' | 'read'>, now: number): TileWords | null {
  const a = tileWords(row, ctx, ctx.read, now)
  const words = [...(a ? (typeof a.words === 'string' ? [a.words] : a.words) : []), ...doseTileWords(row, ctx.read)]
  return words.length ? { words } : null
}

