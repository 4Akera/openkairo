// ObGyn's queue word's read, once a list (marks.ts holds the word, pure): the pack's own table for the queue's patients, with their
// identities.
import { read } from '@core/db/rpc'
import type { TableRead } from '@core/db/types'
import type { PackRow, RowCtx } from '@core/screens/rows'
import { obRowsOf, type MarkRow, type ObRows } from './marks'

/** the list's read, once: the pack's table for the queue's patients */
export async function loadOb(rows: PackRow[], ctx: RowCtx): Promise<ObRows | null> {
  if (ctx.list !== 'queue') return null
  const ids = [...new Set(rows.map((r) => r.patient_id))]; if (!ids.length) return {}
  const t = await read<TableRead<MarkRow>>({ shape: 'table', table: 'obgyn.marks', department_id: ctx.dept.id, where: { patient_id: ids }, entries: false, limit: 2000 })
  return obRowsOf(ids, t.rows, t.patients)
}
