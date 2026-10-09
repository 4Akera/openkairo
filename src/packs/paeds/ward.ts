// Paediatrics' words on the children's ward board (spec/openCare.md §5.7, the picture #paeds-ward): each tile's one pack line says the
// child's latest weight and how old it is (older than 3 days in amber: doses by weight hang on it) and the day's maintenance fluid by
// Holliday–Segar from that weight ("12.4 kg (1 d) · maint. 47 mL/h"). Shown, never an order. Paediatrics brings no tile button.
// The board hands a tile line only the row (core-v3); the weights are read once per board from the pack's own table, kept here, and
// drawn from the board's next redraw (a change on the board, a view chip). (Ward nursing's door that hands a pack its data once per board replaces this at integration.)
import type { PresenceRow } from '@core/db/types'
import type { TileCtx, TileWords } from '@core/screens/ward/tiles'
import { read } from '@core/db/rpc'
import { GROWTH, latestWeight, lineOf, rowsOf, type GrowthRow } from './growth'

type Weights = { at: number; rows: Map<string, GrowthRow | null> }
const boards = new Map<string, Weights>(); const asking = new Map<string, Set<string>>(); const FRESH = 60_000

/** a ward's children's latest weights, read in one go for the patients its tiles name (a patient read once a minute at most) */
function ask(dept: string, patient: string) {
  const b = boards.get(dept); if (b && b.rows.has(patient) && Date.now() - b.at < FRESH) return
  const q = asking.get(dept); if (q) { q.add(patient); return }
  asking.set(dept, new Set([patient]))
  queueMicrotask(async () => {
    const ids = [...(asking.get(dept) ?? [])]; asking.delete(dept)
    try {
      const t = await read<{ rows: unknown[]; entries: Record<string, never>; patients: Record<string, never>; withheld: number }>({ shape: 'table', table: GROWTH, department_id: dept,
        where: { patient_id: ids }, entries: false, limit: 2000 })
      const rows = rowsOf({ [GROWTH]: t } as never)
      const next: Weights = { at: Date.now(), rows: new Map(boards.get(dept)?.rows ?? []) }
      for (const id of ids) next.rows.set(id, latestWeight(rows.filter((r) => r.patient_id === id)))
      boards.set(dept, next)
    } catch { /* the line says nothing; the next draw asks again */ }
  })
}

/** the line: the weight and its age, then maintenance; nothing until the weights are read, nothing for a child never weighed */
export function wardLine(row: PresenceRow, ctx: TileCtx, now = new Date()): TileWords | null {
  ask(ctx.dept.id, row.patient_id)
  const w = boards.get(ctx.dept.id)?.rows.get(row.patient_id)
  if (!w || w.weight === null) return null
  return lineOf(w.weight, w.at, now)
}
