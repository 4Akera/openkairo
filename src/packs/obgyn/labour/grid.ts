// The Labour tab's numbers (spec/openCare.md §5.6): the women in labour on the ward in bed order; under the partograph, the grid by
// time as the picture drew it — the baby (heart rate, liquor, moulding), the contractions (in 10 min, lasting), the mother (pulse, BP,
// temperature) — a column per minute something was written, the last 12; a heart rate under 110 or over 160 flagged; and the notice
// when the latest cervix is past the alert or the action line, the time between the exams to the minute (a notice, never a stop: the
// doctor decides). Pure: npm run test:labour.
import type { Place, PresenceRow, ServerEntry } from '@core/db/types'
import { hm } from '@core/ui/time'
import { EXAM, FHR_HIGH, FHR_LOW, LIQUOR, isFhr } from './codes'
import { inLabour, stayOf, type ExamPoint, type LabourBoard } from './board'
import type { Partograph } from './partograph'

export interface Cell { text: string; flag?: 'low' | 'high' }
export interface Row { group?: string; label: string; unit?: string; cells: (Cell | null)[] }
export interface GridModel { times: string[]; rows: Row[] }

/** the most columns the grid draws: the latest ones */
export const COLUMNS = 12
const MINUTE = 60_000

type Obj = Record<string, unknown>
const obj = (x: unknown): Obj | undefined => x && typeof x === 'object' && !Array.isArray(x) ? x as Obj : undefined
/** a quantity's value as written ("142", "37.4"), or nothing */
const qv = (x: unknown): string | null => { const v = obj(x)?.value; return typeof v === 'string' || typeof v === 'number' ? String(v) : null }
const text = (v: unknown): Cell | null => typeof v === 'string' || typeof v === 'number' ? { text: String(v) } : null
const LETTER = new Map(LIQUOR.map(([k, , l]) => [k as string, l]))

/** the grid of a stay's entries (each item's latest, the crossed out gone): a column per distinct minute of a labour examination, a
 *  baby's heart or the mother's signs, oldest first, the last 12; a row with nothing in it left out, but the baby's heart rate */
export function gridOf(entries: readonly ServerEntry[]): GridModel {
  const mine = entries.filter((e) => e.type === EXAM || e.type === 'vitals' || isFhr(e))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.recorded_at.localeCompare(b.recorded_at))
  const minute = (e: ServerEntry) => new Date(Date.parse(e.occurred_at)).toISOString().slice(0, 16)
  const keys = [...new Set(mine.map(minute))].slice(-COLUMNS)
  const at = new Map(keys.map((k, i) => [k, i]))
  const cells = new Map<string, (Cell | null)[]>()
  const put = (row: string, i: number, c: Cell | null) => { if (!c) return; const r = cells.get(row) ?? keys.map(() => null); r[i] = c; cells.set(row, r) }
  for (const e of mine) {
    const i = at.get(minute(e)); if (i === undefined) continue
    const d = obj(e.data) ?? {}
    if (e.type === EXAM) {
      put('liquor', i, typeof d.liquor === 'string' && LETTER.has(d.liquor) ? { text: LETTER.get(d.liquor)! } : null)
      put('moulding', i, text(d.moulding))
      const c = obj(d.contractions)
      put('per10', i, text(c?.per_10)); put('seconds', i, text(c?.seconds))
    } else if (e.type === 'vitals') {
      put('pulse', i, text(qv(d.hr)))
      const bp = obj(d.bp); const sys = qv(bp?.sys), dia = qv(bp?.dia)
      put('bp', i, sys && dia ? { text: `${sys}/${dia}` } : null)
      put('temp', i, text(qv(d.temp)))
    } else {
      const v = qv(obj(d.value)?.quantity); const n = Number(v)
      put('fhr', i, v === null ? null : Number.isFinite(n) && n < FHR_LOW ? { text: v, flag: 'low' } : Number.isFinite(n) && n > FHR_HIGH ? { text: v, flag: 'high' } : { text: v })
    }
  }
  const ROWS: [string, Omit<Row, 'cells'>][] = [['fhr', { group: 'Baby', label: 'Heart rate', unit: '/min' }], ['liquor', { group: 'Baby', label: 'Liquor' }], ['moulding', { group: 'Baby', label: 'Moulding' }],
    ['per10', { group: 'Contractions', label: 'in 10 min' }], ['seconds', { group: 'Contractions', label: 'lasting', unit: 's' }],
    ['pulse', { group: 'Mother', label: 'Pulse', unit: '/min' }], ['bp', { group: 'Mother', label: 'BP', unit: 'mmHg' }], ['temp', { group: 'Mother', label: 'Temperature', unit: '°C' }]]
  const rows = ROWS.flatMap(([k, r]) => cells.has(k) || k === 'fhr' ? [{ ...r, cells: cells.get(k) ?? keys.map(() => null) }] : [])
  return { times: keys.map((k) => hm(`${k}:00Z`)), rows }
}

/** the women in labour on this ward (the board's read names each stay), in bed order, then those with no bed here */
export function labourStays(board: LabourBoard | null | undefined, rows: readonly PresenceRow[], places: readonly Place[]): PresenceRow[] {
  const pos = (r: PresenceRow) => places.find((p) => p.id === r.place_id)?.position ?? Number.POSITIVE_INFINITY
  return rows.filter((r) => inLabour(stayOf(board, r.item))).sort((a, b) => pos(a) - pos(b) || a.item.localeCompare(b.item))
}

/** an exam's point for G and P and the partograph, from the stay's entries */
export const examPoints = (entries: readonly ServerEntry[]): ExamPoint[] => entries.filter((e) => e.type === EXAM)
  .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).map((e) => { const d = obj(e.data) ?? {}
    const n = (k: string) => typeof d[k] === 'number' ? { [k]: d[k] as number } : {}
    return { at: e.occurred_at, ...n('cervix'), ...n('descent'), ...n('gravida'), ...n('para') } })

/** a time between two exams to the minute ("3 h 55 min", "6 h", "40 min"): rounded to the hour, "4 → 5 cm in 1 h" would read as on the
 *  line a cervix 84 minutes later that is past it */
export function span(ms: number): string {
  const m = Math.max(0, Math.round(ms / MINUTE)); const h = Math.floor(m / 60)
  return h === 0 ? `${m} min` : m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

export interface Notice { tone: 'warn' | 'danger'; title: string; text: string }
/** the Labour tab's notice when the latest cervix is past a line: what it is, and that the doctor decides */
export function noticeOf(p: Partograph): Notice | null {
  if (!p.start || !p.latest || !p.past) return null
  const moved = `${p.start.cervix} → ${p.latest.cervix} cm in ${span(Date.parse(p.latest.at) - Date.parse(p.start.at))}.`
  return p.past === 'action'
    ? { tone: 'danger', title: 'Past the action line', text: `${moved} Tell the doctor now. Only a notice — the doctor decides.` }
    : { tone: 'warn', title: 'Past the alert line', text: `${moved} Tell the doctor; the action line is at ${p.actionAt ? hm(p.actionAt) : '—'}. Only a notice — the doctor decides.` }
}
