// Paediatrics' words on the children's ward board (spec/openCare.md §5.8, the picture #paeds-ward): each tile's one pack line says the
// child's latest weight and how old it is (older than 3 days in amber: doses by weight hang on it) and the day's maintenance fluid by
// Holliday–Segar from that weight ("12.4 kg (1 d) · maint. 47 mL/h"). Shown, never an order. Paediatrics brings no tile button: Give
// and Obs are ward nursing's. The weights come from the pack's own read, once per board (beds' C1 through the core's tile read, C7:
// wardRead.ts, 2026-10-10, in place of the small store the clinics lane kept here); the line is pure.
import type { PresenceRow } from '@core/db/types'
import type { TileCtx, TileWords } from '@core/screens/ward/tiles'
import { latestWeight, lineOf, type GrowthRow } from './growth'

/** what the line reads (C7): each child's latest weighed growth row by patient, null for a child never weighed */
export type WardRead = ReadonlyMap<string, GrowthRow | null>
/** each patient's latest weighed row (null: never weighed), from the table's rows */
export function weightsOf(rows: GrowthRow[], patients: readonly string[]): WardRead {
  return new Map(patients.map((p) => [p, latestWeight(rows.filter((r) => r.patient_id === p))]))
}

/** the line: the weight and its age, then maintenance; nothing while the weights are read, nothing for a child never weighed */
export function wardLine(row: PresenceRow, ctx: Pick<TileCtx, 'read'>, now = new Date()): TileWords | null {
  const w = (ctx.read as WardRead | undefined)?.get(row.patient_id)
  if (!w || w.weight === null) return null
  return lineOf(w.weight, w.at, now)
}
