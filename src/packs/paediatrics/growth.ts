// Paediatrics' growth as its section, banner and lines read it (spec/openCare.md §5.7, the picture #paeds-growth): the rows of its own
// table, paediatrics.growth, which the server fills from the base's vitals with each value's z-score and centile on the WHO tables (the
// age on the day, the sex, the tables' version). Nothing here works out a z-score; it only says what the server worked out. Also the
// words a child's age and weight are said in, centile lines crossed, and Holliday–Segar's maintenance from a weight. Pure.
import type { TableRead } from '@core/db/types'
import type { TileWords } from '@core/screens/ward/tiles'

export const GROWTH = 'paediatrics.growth'
export type Ind = 'wfa' | 'lfa' | 'hcfa' | 'wfl'
export const INDICATORS: { key: Ind; label: string; unit: string }[] = [
  { key: 'wfa', label: 'Weight-for-age', unit: 'kg' }, { key: 'lfa', label: 'Length-for-age', unit: 'cm' },
  { key: 'hcfa', label: 'Head-for-age', unit: 'cm' }, { key: 'wfl', label: 'Weight-for-length', unit: 'kg' }]
export interface Z { z: number; c: number }
export interface GrowthRow {
  item: string; patient_id: string; at: string; age_days: number; sex: string | null; weight: number | null; length: number | null; head: number | null
  lying: boolean; z: Partial<Record<Ind, Z>>; outside: string[]; version: string; source_entries: string[]
}
const num = (v: unknown) => v === null || v === undefined || v === '' ? null : Number(v)

/** the patient's measurements, oldest first, from the record read's tables (a row whose source is hidden from the reader is withheld) */
export function rowsOf(tables: Record<string, TableRead<unknown> | undefined> | undefined, patientIds?: string[]): GrowthRow[] {
  const t = tables?.[GROWTH] as TableRead<Record<string, unknown>> | undefined
  return (t?.rows ?? []).filter((r) => !patientIds || patientIds.includes(String(r.patient_id))).map((r) => ({
    item: String(r.item), patient_id: String(r.patient_id), at: String(r.at), age_days: Number(r.age_days), sex: (r.sex as string | null) ?? null,
    weight: num(r.weight), length: num(r.length), head: num(r.head), lying: !!r.lying, z: (r.z ?? {}) as GrowthRow['z'],
    outside: (r.outside as string[] | null) ?? [], version: String(r.version ?? ''), source_entries: (r.source_entries as string[] | null) ?? [] }))
    .sort((a, b) => a.at.localeCompare(b.at))
}
/** the value an indicator measures, in a row */
export const valueOf = (r: GrowthRow, k: Ind) => k === 'wfa' || k === 'wfl' ? r.weight : k === 'lfa' ? r.length : r.head
/** each indicator's latest row that has its value */
export function latestOf(rows: GrowthRow[]): Partial<Record<Ind, GrowthRow>> {
  const out: Partial<Record<Ind, GrowthRow>> = {}
  for (const r of rows) for (const { key } of INDICATORS) if (valueOf(r, key) !== null && (key !== 'wfl' || r.length !== null)) out[key] = r
  return out
}
export const latestWeight = (rows: GrowthRow[]) => [...rows].reverse().find((r) => r.weight !== null) ?? null

// ── words ──
const MINUS = '−'
/** a z-score as the record says it: one decimal (two in the line under the card), a true minus */
export const zText = (z: number, places = 1) => `${z < 0 ? MINUS : ''}${Math.abs(z).toFixed(places)}`
const ordinal = (n: number) => { const t = n % 100; const s = t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'; return `${n}${s}` }
/** a centile in words: 2nd, 39th; under the first, below 1st; over the 99th, above 99th */
export const centileText = (c: number) => { const n = Math.round(c); return n < 1 ? 'below 1st' : n > 99 ? 'above 99th' : ordinal(n) }
/** a z-score beyond ±2 asks for something (the WHO's lines for wasting, stunting, a small or large head) */
export const zOff = (z: number | undefined) => z !== undefined && Math.abs(z) >= 2
/** a child's age in a word: days in the first month, months to two years, then years */
export function ageText(days: number): string {
  if (days < 31) return `${days} d`
  const months = Math.floor(days / 30.4375)
  return months < 24 ? `${months} mo` : `${Math.floor(months / 12)} y`
}
/** a weight in kg as the record says it: one decimal */
export const kgText = (kg: number) => `${kg.toFixed(1)} kg`
/** the sex the WHO table is read for, in the section's words */
export const sexWords = (sex: string | null) => sex === 'male' ? 'boys' : sex === 'female' ? 'girls' : null

// ── centile lines crossed (the WHO chart's: 3rd, 15th, 50th, 85th, 97th) ──
export const LINES: [string, number][] = [['97th', 1.881], ['85th', 1.036], ['50th', 0], ['15th', -1.036], ['3rd', -1.881]]
const between = (a: number, b: number) => LINES.filter(([, z]) => z > Math.min(a, b) && z < Math.max(a, b)).length
/** the most recent earlier measurement from which today's weight-for-age has crossed two centile lines or more: its age, the lines, the way */
export function crossed(rows: GrowthRow[]): { since: GrowthRow; lines: number; down: boolean; now: GrowthRow } | null {
  const ws = rows.filter((r) => r.z.wfa); const now = ws[ws.length - 1]; if (!now) return null
  for (let i = ws.length - 2; i >= 0; i--) { const n = between(ws[i].z.wfa!.z, now.z.wfa!.z); if (n >= 2) return { since: ws[i], lines: n, down: now.z.wfa!.z < ws[i].z.wfa!.z, now } }
  return null
}
const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five']
export const crossedText = (x: NonNullable<ReturnType<typeof crossed>>) =>
  `Crossed ${NUMBERS[x.lines] ?? x.lines} centile lines ${x.down ? 'down' : 'up'} since ${x.since.age_days < 31 ? 'birth' : ageText(x.since.age_days).replace(' mo', ' months').replace(' y', ' years')} (${centileText(x.since.z.wfa!.c)} → ${centileText(x.now.z.wfa!.c)}).`

// ── maintenance fluid (Holliday–Segar): 100 mL/kg a day for the first 10 kg, 50 for the next 10, 20 for each kg above ──
export function maintenance(kg: number): { day: number; hour: number } {
  const day = Math.round(100 * Math.min(kg, 10) + 50 * Math.min(Math.max(kg - 10, 0), 10) + 20 * Math.max(kg - 20, 0))
  return { day, hour: Math.round(day / 24) }
}

/** days between two moments, by the calendar day (today 0) */
export const daysAgo = (at: string, now: Date) => {
  const a = new Date(at); const d = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
  return Math.round((d(now) - d(a)) / 86_400_000)
}
/** a weight and how old it is, for the board: today, (1 d) to (3 d), then "4 d ago" in amber (doses by weight hang on it) */
export function weightAge(kg: number, at: string, now: Date): { text: string; old: boolean } {
  const n = daysAgo(at, now)
  return n <= 0 ? { text: `${kgText(kg)} today`, old: false } : n <= 3 ? { text: `${kgText(kg)} (${n} d)`, old: false } : { text: `${kgText(kg)}, ${n} d ago`, old: true }
}
/** the board's words for a weight taken at a moment: the weight and its age, then maintenance */
export function lineOf(kg: number, at: string, now: Date): TileWords {
  const a = weightAge(kg, at, now); const m = maintenance(kg)
  return { words: [a.old ? { text: a.text, tone: 'warn' } : a.text, `maint. ${m.hour} mL/h`] }
}
