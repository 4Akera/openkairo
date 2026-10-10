// Paediatrics' word on a queue row ("weight z −2.3", amber; spec/openCare.md §5.8, the picture #family-day), through the core's (l) of
// §5.7: the pack's own growth table read once a list for the queue's patients (its read hands each child's identity too), then the
// banner's z-score word beyond ±2 — nothing for a child growing within the lines, nor for anyone 19 or over. Only on the clinic queue.
import type { Identity, TableRead } from '@core/db/types'
import type { OrderWord, PackRow, RowCtx } from '@core/screens/rows'
import { GROWTH, rowsOf, type GrowthRow } from './growth'
import { childWords } from './words'

/** each child's growth rows and birth date */
export type GrowthRows = Record<string, { rows: GrowthRow[]; born: string | null }>

/** the read as the word takes it (pure) */
export function growthRowsOf(ids: string[], t: TableRead<Record<string, unknown>>): GrowthRows {
  const patients: Record<string, Identity> = t.patients ?? {}
  return Object.fromEntries(ids.map((id) => [id, { rows: rowsOf({ [GROWTH]: t }, [id]), born: patients[id]?.birth_date ?? null }]))
}
/** the row's word (pure): the banner's first amber word, a z-score beyond ±2 */
export function growthWords(row: Pick<PackRow, 'patient_id'>, ctx: Pick<RowCtx, 'list'>, data: GrowthRows | null | undefined, now = new Date()): OrderWord[] {
  const r = ctx.list === 'queue' ? data?.[row.patient_id] : undefined; if (!r?.rows.length || !r.born) return []
  const w = childWords(r.rows, { birth_date: r.born }, [], now).find((x) => x.tone === 'warn' && / z /.test(x.word))
  return w ? [{ word: w.word, tone: 'warn' }] : []
}
