// Recovery's line on each bay (spec/openCare.md §5.7, Q48; Recovery's picture): minutes since the patient came in, Aldrete
// first → last (the base's score, a declared table the server adds up), pain (the base's vitals key), and "ready for the ward" at 9 or
// more, in words. Read from the pack's table, anaesthesia.recovery, for the department's patients; the line is pure and reads what was
// read last, reading again when it is a minute old (the board's next refresh shows it).
import type { PresenceRow } from '@core/db/types'
import type { TileCtx, TileWords } from '@core/screens/ward/tiles'
import { recoveryWords, type RecRow } from './model'

const kept = new Map<string, { rows: RecRow[]; at: number; patients: string }>()
/** how the tiles read the pack's table (set once by the pack: the read door) */
let reader: ((deptId: string, patients: string[]) => Promise<RecRow[]>) | null = null
export const setRecoveryReader = (r: typeof reader) => { reader = r }
export function keepForTest(deptId: string, rows: RecRow[]) { kept.set(deptId, { rows, at: Date.now(), patients: '' }) }
export function recoveryLine(row: PresenceRow, ctx: Pick<TileCtx, 'dept'>, now = Date.now()): TileWords | null {
  const k = kept.get(ctx.dept.id)
  // every patient a tile has asked about, read together; again when one is new or the read is a minute old
  const known = new Set((k?.patients ?? '').split(',').filter(Boolean)); const isNew = !known.has(row.patient_id); known.add(row.patient_id)
  const patients = [...known].sort().join(',')
  if (reader && (!k || isNew || now - k.at > 60_000)) {
    kept.set(ctx.dept.id, { rows: k?.rows ?? [], at: now, patients })
    void reader(ctx.dept.id, [...known]).then((rows) => kept.set(ctx.dept.id, { rows, at: Date.now(), patients })).catch(() => undefined)
  }
  return { words: recoveryWords(k?.rows ?? [], row.patient_id, row.checked_in_at, now) }
}
