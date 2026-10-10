// Recovery's leaving, saved (spec §5.8, Q48; the core's (k) path, commands.ts registerDraftSave): Sign saves the composer's other drafts
// first, then this one as one set (back.ts): the Recovery stay discharged and, for a ward, the ward's stay opened about it (beds Q3).
// Only for a patient still admitted here; a warning is never confirmed here, and the draft stays with what went wrong.
import { oneSet } from '@core/db/entries'
import { read, write, WriteWarned } from '@core/db/rpc'
import type { PresenceRow, TableRead } from '@core/db/types'
import type { DraftWhere } from '@core/screens/visit/commands'
import { backEntries, type BackParams } from './back'

export async function saveBack(params: Record<string, unknown>, where: DraftWhere) {
  if (!where.visitId) throw new Error('Back to the ward is written in the patient’s stay in Recovery')
  const t = await read<TableRead<PresenceRow>>({ shape: 'table', table: 'base.presence', department_id: where.departmentId, where: { item: where.visitId } })
  const stay = t.rows.find((r) => r.item === where.visitId && r.kind === 'stay' && r.department_id === where.departmentId && r.state === 'admitted')
  if (!stay) throw new Error('Back to the ward is for a patient in a bay here')
  try { return await write(oneSet(backEntries(params as unknown as BackParams, stay, where.departmentId))) }
  catch (e) { if (e instanceof WriteWarned) throw new Error(`Not signed — check first: ${e.message}`); throw e }
}
