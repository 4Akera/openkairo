// The family pack's word on a queue row ("2 checks due"; spec/openCare.md §5.8 Q50, the picture #family-day: each pack the department
// ticks may put one word on a row), through the core's (l) of §5.7: read once a list — who the patients are (the queue's own presence
// rows: the sex and the birth date) and the base's values by the clinic's checks' codes — then the checks due by age and sex worked out
// as the chart's banner works them out (met by values; never ticked). Only on the clinic queue; a failed read says nothing.
import type { Identity, Organization } from '@core/db/types'
import type { OrderWord, PackRow, RowCtx } from '@core/screens/rows'
import { checksFor, checksOf, dueWords, metOf, type Person } from './checks'

/** each patient's sex and birth, and their values by the checks' codes */
export type CheckRows = Record<string, { person: Person; values: { code: string | null; value: number; at: string }[] }>
export type Values = { patient_id: string; code: string | null; value: number; at: string }

/** the read as the word takes it (pure) */
export function checkRowsOf(ids: string[], patients: Record<string, Identity>, values: Values[]): CheckRows {
  return Object.fromEntries(ids.map((id) => [id, { person: { sex: patients[id]?.gender, born: patients[id]?.birth_date }, values: values.filter((v) => v.patient_id === id) }]))
}
/** the row's word (pure): "2 checks due", amber; nothing when none is due */
export function checkWords(row: Pick<PackRow, 'patient_id'>, ctx: Pick<RowCtx, 'list'> & { org?: Organization }, data: CheckRows | null | undefined, now = new Date()): OrderWord[] {
  const r = ctx.list === 'queue' ? data?.[row.patient_id] : undefined; if (!r) return []
  const w = dueWords(checksFor(checksOf(ctx.org), r.person, metOf(r.values), now))
  return w ? [{ word: w, tone: 'warn' }] : []
}
