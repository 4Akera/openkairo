// Chronic care's queue word's read, once a list (rowWords.ts holds the words, pure): the base's problem lists and values, the pack's
// own checks and targets, for the queue's patients only.
import { read } from '@core/db/rpc'
import type { TableRead } from '@core/db/types'
import type { PackRow, RowCtx } from '@core/screens/rows'
import { careCodes, careRowsOf, type CareRows, type Checks, type Lists, type Targets, type Values } from './rowWords'

/** the list's read, once: the queue's patients only */
export async function loadCare(rows: PackRow[], ctx: RowCtx): Promise<CareRows | null> {
  if (ctx.list !== 'queue') return null
  const ids = [...new Set(rows.map((r) => r.patient_id))]; if (!ids.length) return {}
  const t = <R,>(table: string, where: Record<string, unknown>) => read<TableRead<R>>({ shape: 'table', table, department_id: ctx.dept.id, where, entries: false, limit: 2000 }).then((x) => x.rows)
  const [lists, values, checks, targets] = await Promise.all([t<Lists>('base.lists', { list: 'problems', patient_id: ids }),
    t<Values>('base.values', { code: careCodes(ctx.org), patient_id: ids }), t<Checks>('chroniccare.checks', { patient_id: ids }), t<Targets>('chroniccare.targets', { patient_id: ids })])
  return careRowsOf(ids, lists, values, checks, targets)
}
