// The vaccines pack's reads: a child's doses from the chart's entries (the pack's type), and the room's from the pack's own table
// (vaccines.doses, every child with a dose recorded), with each child's identity (birth date, phone) as the table read hands it.
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { TableRead } from '@core/db/types'
import { DOSE_TYPE, type Dose } from './schedule'
export { doseOf, dosesOf } from './schedule'

export interface DoseRow { item: string; patient_id: string; department_id: string; vaccine: string; dose: number | null; status: 'completed' | 'not-done'; source: 'here' | 'card'; given_at: string; reason: string | null }
/** every dose recorded, read where the reader works (the room, a clinic using the pack): the children the room knows */
export function useRoomDoses(deptId: string | null) {
  return useQuery({ queryKey: ['vaccines.doses', deptId], enabled: !!deptId, staleTime: 15_000,
    queryFn: async () => read<TableRead<DoseRow>>({ shape: 'table', table: 'vaccines.doses', department_id: deptId, entries: false, limit: 2000 }) })
}
export const rowDose = (r: DoseRow): Dose => ({ item: r.item, vaccine: r.vaccine, dose: r.dose, status: r.status, given_at: r.given_at, source: r.source, reason: r.reason, department_id: r.department_id })
export { DOSE_TYPE }
