// The vaccines pack's queue word's read, once a list (rowWords.ts holds the words, pure): the queue's presence rows for who the patients
// are and the pack's doses of those patients.
import { read } from '@core/db/rpc'
import type { DoseRow } from './data'
import type { PresenceRow, TableRead } from '@core/db/types'
import type { PackRow, RowCtx } from '@core/screens/rows'
import { vaxRowsOf, type VaxRows } from './rowWords'

/** the list's read: the queue's visits (their patients' identities) and the pack's doses of those patients, once */
export async function loadVax(rows: PackRow[], ctx: RowCtx): Promise<VaxRows | null> {
  if (ctx.list !== 'queue') return null
  const visits = [...new Set(rows.flatMap((r) => r.visit_id ? [r.visit_id] : []))]; const ids = [...new Set(rows.map((r) => r.patient_id))]
  if (!ids.length) return { born: {}, doses: {} }
  const t = <R,>(table: string, where: Record<string, unknown>) => read<TableRead<R>>({ shape: 'table', table, department_id: ctx.dept.id, where, entries: false, limit: 2000 })
  const [who, d] = await Promise.all([visits.length ? t<PresenceRow>('base.presence', { item: visits }) : Promise.resolve(null), t<DoseRow>('vaccines.doses', { patient_id: ids })])
  return vaxRowsOf(ids, { ...(who?.patients ?? {}), ...d.patients }, d.rows)
}
