// The Chemotherapy day unit (spec/openCare.md §5.7, the picture #onc-unit): chairs on the base's board. Oncology's line on each tile
// says the regimen and cycle ("AC C3 D1"), a dose reduced, and a reaction watch for the first 30 minutes of a drug the regimen marks;
// under the board, today's cycles not in a chair yet (the pack's rows, core change C5), each with the base's Admit here as its Start.
// The cycles are the pack's table, oncology.cycles, read for the day unit and today. The tile line is pure and reads what was read last
// (kept here by department); the rows read it again and keep it.
import type { PresenceRow } from '@core/db/types'
import type { TileCtx, TileWords } from '@core/screens/ward/tiles'
import { regimensOf } from './model'

export interface CycleRow { item: string; patient_id: string; to_department_id: string; from_department_id: string | null; regimen: string; name: string | null; cycle: number; of_cycles: number | null
  day: number; decision: string; percent: number | null; due: string; status: string; ordered_at: string }
const kept = new Map<string, { rows: CycleRow[]; at: number }>()
let regimens: ReturnType<typeof regimensOf> = { regimens: [], plans: [] }
/** the clinic's day (YYYY-MM-DD) in its own time zone */
export const clinicDay = (tz = 'Africa/Cairo', now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
/** how the tiles read today's cycles (unitRead.ts: the pack's table through the read door), set once by the pack */
let reader: ((deptId: string, day: string) => Promise<CycleRow[]>) | null = null
export const setCycleReader = (r: typeof reader) => { reader = r }
export const keepCycles = (deptId: string, rows: CycleRow[]) => kept.set(deptId, { rows, at: Date.now() })
export const keepRegimens = (r: ReturnType<typeof regimensOf>) => { regimens = r }
/** a kept read, for a test */
export function keepForTest(deptId: string, rows: CycleRow[], r = regimens) { kept.set(deptId, { rows, at: Date.now() }); regimens = r }

const WATCH_MIN = 30
/** the tile's words: the cycle in short, a dose reduced, the reaction watch in the first 30 minutes of a drug that can react */
export function tileWords(row: PresenceRow, ctx: Pick<TileCtx, 'dept'>, now = Date.now()): TileWords | null {
  const k = kept.get(ctx.dept.id)
  // not read yet (or a minute old): read it now; the board's next refresh shows it (the rows under the board read it at once)
  if (reader && (!k || now - k.at > 60_000)) { kept.set(ctx.dept.id, { rows: k?.rows ?? [], at: now }); void reader(ctx.dept.id, clinicDay()).then((rows) => kept.set(ctx.dept.id, { rows, at: Date.now() })).catch(() => undefined) }
  const c = (k?.rows ?? []).filter((r) => r.patient_id === row.patient_id && r.status !== 'revoked' && r.decision !== 'delay')
    .sort((a, b) => b.ordered_at.localeCompare(a.ordered_at))[0]
  if (!c) return null
  const reg = regimens.regimens.find((r) => r.key === c.regimen)
  const weekly = (reg?.every_days ?? 0) === 7
  const words: TileWords['words'] = [`${(c.name ?? c.regimen).replace(/ weekly$/i, '')} ${weekly ? 'W' : 'C'}${c.cycle}${weekly ? '' : ` D${c.day}`}`]
  if (c.percent != null && c.percent < 100) words.push({ text: `${c.percent} % dose`, tone: 'info' })
  const since = (now - Date.parse(row.checked_in_at)) / 60_000
  const watch = (reg?.drugs ?? []).filter((d) => d.watch).map((d) => d.drug.toLowerCase())
  if (watch.length && since >= 0 && since < WATCH_MIN) words.push({ text: `reaction watch · ${watch.join(', ')}`, tone: 'warn' })
  else if (c.status === 'completed') words.push({ text: 'given', tone: 'ok' })
  return { words }
}

/** today's cycles whose patient is not in a chair here: not admitted today to this unit */
export function notInAChair(rows: CycleRow[], stays: Pick<PresenceRow, 'patient_id' | 'department_id'>[]): CycleRow[] {
  const inChair = new Set(stays.map((s) => s.patient_id))
  return rows.filter((r) => r.status === 'active' && r.decision !== 'delay' && !inChair.has(r.patient_id))
}
