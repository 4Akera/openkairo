// The Chemotherapy day unit (spec/openCare.md §5.8, the picture #onc-unit): chairs on the base's board. Oncology's line on each tile
// says the regimen and cycle ("AC C3 D1"), a dose reduced, and a reaction watch for the first 30 minutes of a drug the regimen marks;
// under the board, today's cycles not in a chair yet (the pack's rows, core change C5), each with the base's Admit here as its Start.
// The cycles are the pack's table, oncology.cycles, read for the day unit and today (unitRead.ts); the tile line is pure and reads them
// from its own read (core change C7).
import type { PresenceRow } from '@core/db/types'
import type { TileCtx, TileWords } from '@core/screens/ward/tiles'
import type { regimensOf } from './model'

export interface CycleRow { item: string; patient_id: string; to_department_id: string; from_department_id: string | null; regimen: string; name: string | null; cycle: number; of_cycles: number | null
  day: number; decision: string; percent: number | null; due: string; status: string; ordered_at: string }
/** what the tile line reads (C7): today's cycles for the unit and the clinic's regimens */
export interface UnitRead { rows: CycleRow[]; regimens: ReturnType<typeof regimensOf> }
/** the clinic's day (YYYY-MM-DD) in its own time zone */
export const clinicDay = (tz = 'Africa/Cairo', now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

const WATCH_MIN = 30
/** the tile's words: the cycle in short, a dose reduced, the reaction watch in the first 30 minutes of a drug that can react */
export function tileWords(row: PresenceRow, ctx: Pick<TileCtx, 'read'>, now = Date.now()): TileWords | null {
  const read = ctx.read as UnitRead | undefined
  const c = (read?.rows ?? []).filter((r) => r.patient_id === row.patient_id && r.status !== 'revoked' && r.decision !== 'delay')
    .sort((a, b) => b.ordered_at.localeCompare(a.ordered_at))[0]
  if (!c) return null
  const reg = read?.regimens.regimens.find((r) => r.key === c.regimen)
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
