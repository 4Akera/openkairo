// The machine readings (spec/openCare.md §5.6, D2b): each the pack's own type haemodialysis.reading on the base's vitals — the BP and
// the pulse as the base's, the machine's numbers beside them (blood flow, arterial, venous and transmembrane pressures, the fluid taken
// off so far, the heparin rate). The grid by time (a BP under 100 systolic in amber, under 90 in red), the card's numbers (a blank
// machine field keeps the last reading's; the fluid typed in litres, kept in mL), its notices (shown, never a stop: the nurse decides)
// and the entry in the stay. Pure: npm run test:haemodialysis.
import { newId } from '@core/db/entries'
import type { EntryIn } from '@core/db/rpc'
import type { EntryData, Quantity } from '@core/db/shapes.generated'
import type { ServerEntry } from '@core/db/types'
import { hm } from '@core/ui/time'
import { litres } from './board'
import { qv } from './session'

export type Reading = EntryData['haemodialysis.reading']
export type Machine = Reading['haemodialysis']
export type RowKey = 'bp' | 'hr' | keyof Machine
export interface ReadingRow { key: RowKey; label: string; unit: string; group: 'Patient' | 'Machine' }
/** the grid's rows and the card's fields, in order */
export const READING_ROWS: ReadingRow[] = [
  { key: 'bp', label: 'BP', unit: 'mmHg', group: 'Patient' }, { key: 'hr', label: 'Pulse', unit: '/min', group: 'Patient' },
  { key: 'blood_flow', label: 'Blood flow', unit: 'mL/min', group: 'Machine' }, { key: 'arterial', label: 'Arterial', unit: 'mmHg', group: 'Machine' },
  { key: 'venous', label: 'Venous', unit: 'mmHg', group: 'Machine' }, { key: 'tmp', label: 'TMP', unit: 'mmHg', group: 'Machine' },
  { key: 'uf', label: 'Taken off', unit: 'L', group: 'Machine' }, { key: 'heparin', label: 'Heparin', unit: 'units/h', group: 'Machine' },
]
export const MACHINE: (keyof Machine)[] = ['blood_flow', 'arterial', 'venous', 'tmp', 'uf', 'heparin']
const UNITS: Record<keyof Machine, [string, string?]> = { blood_flow: ['mL/min', 'mL/min'], arterial: ['mmHg', 'mm[Hg]'], venous: ['mmHg', 'mm[Hg]'], tmp: ['mmHg', 'mm[Hg]'],
  uf: ['mL', 'mL'], heparin: ['units/h'] }

/** a BP's tone: red under 90 systolic, amber under 100 (Claude's choice) */
export const bpFlag = (sys: number): 'low' | 'warn' | undefined => sys < 90 ? 'low' : sys < 100 ? 'warn' : undefined
export interface GridCell { text: string; flag?: 'low' | 'warn' }
export interface Grid { columns: { id: string; at: string; hm: string }[]; rows: { row: ReadingRow; cells: GridCell[] }[] }
/** a cell's words for one reading */
export function cellOf(d: Partial<Reading> | undefined, key: RowKey): GridCell {
  if (!d) return { text: '' }
  if (key === 'bp') { const s = qv(d.bp?.sys); const dd = qv(d.bp?.dia); if (s === undefined || dd === undefined) return { text: '' }
    const flag = bpFlag(s); return { text: `${s}/${dd}`, ...(flag ? { flag } : {}) } }
  const v = key === 'hr' ? qv(d.hr) : qv(d.haemodialysis?.[key])
  return { text: v === undefined ? '' : key === 'uf' ? litres(v) : String(v) }
}
/** the readings as a grid: a column a reading (its time), a row a number */
export function gridOf(readings: readonly Pick<ServerEntry, 'id' | 'occurred_at' | 'data'>[]): Grid {
  const cols = [...readings].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
  return { columns: cols.map((r) => ({ id: r.id, at: r.occurred_at, hm: hm(r.occurred_at) })),
    rows: READING_ROWS.map((row) => ({ row, cells: cols.map((r) => cellOf(r.data as Partial<Reading> | undefined, row.key)) })) }
}

export type Inputs = Partial<Record<RowKey, string>>
const NUM = /^-?(\d+\.?\d*|\.\d+)$/
const numOf = (s: string | undefined) => { const t = (s ?? '').trim(); return NUM.test(t) ? Number(t) : null }
const qty = (n: number, unit: string, ucum?: string): Quantity => ({ value: String(n), unit, ...(ucum ? { ucum } : {}) })
/** "128/76" → the BP; anything else null */
export function bpOf(s: string | undefined): { sys: number; dia: number } | null {
  const m = (s ?? '').trim().match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/); return m ? { sys: Number(m[1]), dia: Number(m[2]) } : null
}
/** the fields that are never under 0 (the pressures may be) */
const FROM_0: RowKey[] = ['hr', 'blood_flow', 'uf', 'heparin']
/** no session takes off more than this many litres: a larger number is the machine's millilitres typed */
export const UF_MAX_L = 10
/** what on the card cannot be read (each field's words) */
export function inputProblems(x: Inputs): string[] {
  const out: string[] = []
  if (x.bp?.trim() && !bpOf(x.bp)) out.push('BP as 128/76')
  for (const r of READING_ROWS) {
    if (r.key === 'bp' || !x[r.key]?.trim()) continue
    const n = numOf(x[r.key])
    if (n === null) out.push(`${r.label}: a number`)
    else if (FROM_0.includes(r.key) && n < 0) out.push(`${r.label}: a number from 0`)
    else if (r.key === 'uf' && n > UF_MAX_L) out.push('Taken off in litres, e.g. 1.4')
  }
  return out
}
/** why the card cannot be signed yet, when nothing typed is wrong: no BP or pulse; or no machine number typed and none to keep (the
 *  session's first reading) */
export function readingMissing(x: Inputs, last: Partial<Reading> | null | undefined): 'vitals' | 'machine' | null {
  if (!bpOf(x.bp) && numOf(x.hr) === null) return 'vitals'
  return MACHINE.some((k) => numOf(x[k]) !== null || !!last?.haemodialysis?.[k]) ? null : 'machine'
}
export const MISSING_WORDS = { vitals: 'Needs the BP or the pulse.', machine: 'Needs a machine number (blood flow, pressures or taken off): the first reading has none to keep.' }
/** the card → the reading's data: the BP and pulse only when typed; each machine number typed, else the last reading's (a blank keeps the
 *  machine's last); the fluid typed in litres ("1.4") kept in mL ("1400"); the arterial pressure as typed (the machine shows it
 *  negative). Null when there is no BP or pulse, or no machine number at all */
export function readingData(x: Inputs, last: Partial<Reading> | null | undefined): Reading | null {
  const bp = bpOf(x.bp); const hr = numOf(x.hr)
  if (!bp && hr === null) return null
  const machine: Machine = {}
  for (const k of MACHINE) {
    const typed = numOf(x[k]); const [unit, ucum] = UNITS[k]
    if (typed !== null) machine[k] = qty(k === 'uf' ? Math.round(typed * 1000) : typed, unit, ucum)
    else if (last?.haemodialysis?.[k]) machine[k] = last.haemodialysis[k]
  }
  if (!Object.keys(machine).length) return null
  return { ...(bp ? { bp: { sys: qty(bp.sys, 'mmHg', 'mm[Hg]'), dia: qty(bp.dia, 'mmHg', 'mm[Hg]') } } : {}), ...(hr !== null ? { hr: qty(hr, 'bpm', '/min') } : {}),
    haemodialysis: machine } as Reading
}
/** the last reading's numbers as the card's placeholders (the fluid in litres) */
export function placeholders(last: Partial<Reading> | null | undefined): Inputs {
  const out: Inputs = {}
  for (const r of READING_ROWS) { const c = cellOf(last ?? undefined, r.key); if (c.text) out[r.key] = c.text }
  return out
}

export interface ReadingNotice { text: string; tone: 'warn' | 'danger' }
export const FALL = 30
/** the reading's notices (shown, never a stop): a low BP; a fall of 30 or more from the session's first BP; a venous pressure over 250;
 *  an arterial pressure under −250, or over 0 (the machine shows it negative: the minus left off?); less taken off than the last reading
 *  (the count only goes up) */
export function readingNotices(d: Partial<Reading> | null, first: { sys: number } | null | undefined, last?: Partial<Reading> | null): ReadingNotice[] {
  if (!d) return []
  const out: ReadingNotice[] = []
  const sys = qv(d.bp?.sys); const dia = qv(d.bp?.dia)
  if (sys !== undefined && sys < 90) out.push({ text: `BP ${sys}/${dia}: low`, tone: 'danger' })
  if (sys !== undefined && first && first.sys - sys >= FALL) out.push({ text: `BP fell ${first.sys - sys} since the start`, tone: 'warn' })
  const vp = qv(d.haemodialysis?.venous); const ap = qv(d.haemodialysis?.arterial)
  if (vp !== undefined && vp > 250) out.push({ text: `Venous pressure ${vp}: check the needle and the line`, tone: 'warn' })
  if (ap !== undefined && ap < -250) out.push({ text: `Arterial pressure ${ap}: check the needle and the flow`, tone: 'warn' })
  if (ap !== undefined && ap > 0) out.push({ text: `Arterial pressure ${ap}: the machine shows it negative (-${ap})`, tone: 'warn' })
  const uf = qv(d.haemodialysis?.uf); const was = qv(last?.haemodialysis?.uf)
  if (uf !== undefined && was !== undefined && uf < was) out.push({ text: 'Taken off is less than the last reading', tone: 'warn' })
  return out
}
/** one reading in the stay */
export function readingEntry(data: Reading, stay: { item: string; patient_id: string }, departmentId: string): EntryIn {
  return { id: newId(), type: 'haemodialysis.reading', patient_id: stay.patient_id, department_id: departmentId, visit_id: stay.item, data }
}
