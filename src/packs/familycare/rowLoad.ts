// The family pack's queue word's read, once a list (rowWords.ts holds the word, pure): the queue's presence rows for who the patients
// are, and the base's values by the clinic's checks' codes.
import { read } from '@core/db/rpc'
import type { PresenceRow, TableRead } from '@core/db/types'
import type { PackRow, RowCtx } from '@core/screens/rows'
import { BMI, checksOf } from './checks'
import { checkRowsOf, type CheckRows, type Values } from './rowWords'

/** the list's read, once: the queue's visits (who) and the values the clinic's checks name, for its patients only */
export async function loadChecks(rows: PackRow[], ctx: RowCtx): Promise<CheckRows | null> {
  if (ctx.list !== 'queue') return null
  const visits = [...new Set(rows.flatMap((r) => r.visit_id ? [r.visit_id] : []))]; const ids = [...new Set(rows.map((r) => r.patient_id))]
  if (!ids.length || !visits.length) return {}
  const codes = [...new Set([BMI, ...checksOf(ctx.org).flatMap((c) => c.codes)])]
  const t = <R,>(table: string, where: Record<string, unknown>) => read<TableRead<R>>({ shape: 'table', table, department_id: ctx.dept.id, where, entries: false, limit: 2000 })
  const [who, values] = await Promise.all([t<PresenceRow>('base.presence', { item: visits }), t<Values>('base.values', { code: codes, patient_id: ids })])
  return checkRowsOf(ids, who.patients, values.rows)
}
