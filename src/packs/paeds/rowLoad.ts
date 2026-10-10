// Paediatrics' queue word's read, once a list (rowWords.ts holds the word, pure): the pack's growth table for the queue's patients.
import { read } from '@core/db/rpc'
import type { TableRead } from '@core/db/types'
import type { PackRow, RowCtx } from '@core/screens/rows'
import { GROWTH } from './growth'
import { growthRowsOf, type GrowthRows } from './rowWords'

/** the list's read, once */
export async function loadGrowth(rows: PackRow[], ctx: RowCtx): Promise<GrowthRows | null> {
  if (ctx.list !== 'queue') return null
  const ids = [...new Set(rows.map((r) => r.patient_id))]; if (!ids.length) return {}
  const t = await read<TableRead<Record<string, unknown>>>({ shape: 'table', table: GROWTH, department_id: ctx.dept.id, where: { patient_id: ids }, entries: false, limit: 2000 })
  return growthRowsOf(ids, t)
}
