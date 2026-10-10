// Going home's save (W3b, spec §5.6): Sign saves the composer's other drafts first, then this one through here (the core's own (k) path,
// commands.ts registerDraftSave): one set — the letter (the base's note, kind discharge), the medicine changes and, while the stay is still
// admitted here, the base's discharge. If Discharge was pressed instead, its own set closed the stay first: the letter and the medicines
// then go into that stay alone. A warning is never confirmed here: Going home is not signed, and the draft stays.
import { oneSet } from '@core/db/entries'
import { read, write, WriteWarned } from '@core/db/rpc'
import type { PresenceRow, TableRead } from '@core/db/types'
import type { DraftWhere } from '@core/screens/visit/commands'
import { homeEntries, type HomeParams } from './home'

export async function saveHome(params: Record<string, unknown>, where: DraftWhere) {
  if (!where.visitId) throw new Error('Going home is written in the patient’s stay')
  const t = await read<TableRead<PresenceRow>>({ shape: 'table', table: 'base.presence', department_id: where.departmentId, where: { item: where.visitId } })
  const stay = t.rows.find((r) => r.item === where.visitId && r.kind === 'stay' && r.department_id === where.departmentId && (r.state === 'admitted' || r.state === 'discharged'))
  if (!stay) throw new Error('Going home is for a patient admitted here')
  try { return await write(oneSet(homeEntries(params as unknown as HomeParams, { ...where, visitId: where.visitId }, stay, Date.now()))) }
  catch (e) { if (e instanceof WriteWarned) throw new Error(`Not signed — check first: ${e.message}. Change it in Going home, or write that medicine with /rx and Sign anyway, then Sign again`); throw e }
}
