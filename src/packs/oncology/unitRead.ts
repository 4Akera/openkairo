// The day unit's read of today's cycles (spec/openCare.md §5.8): the pack's table, oncology.cycles, through the read door, for the
// rows under the board and the tiles' line (its read, core change C7).
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import { useDepartment } from '@core/hooks/organization'
import type { TableRead } from '@core/db/types'
import { regimensOf } from './model'
import { clinicDay, type CycleRow, type UnitRead } from './unit'

export const readCycles = async (deptId: string, day: string) =>
  (await read<TableRead<CycleRow>>({ shape: 'table', table: 'oncology.cycles', department_id: deptId, where: { to_department_id: deptId, due: day }, entries: false })).rows
type Org = Parameters<typeof regimensOf>[0] & { organization: { time_zone?: string } }
/** today's cycles for the day unit */
export function useTodayCycles(deptId: string, org: Org | undefined) {
  const day = clinicDay(org?.organization.time_zone || undefined)
  return useQuery({ queryKey: ['oncology.cycles', deptId, day], staleTime: 15_000, refetchInterval: 30_000, queryFn: () => readCycles(deptId, day) })
}
/** the tiles' read (C7): today's cycles and the regimens, the same object while neither changes */
export function useUnitRead(dept: { id: string }): UnitRead | undefined {
  const { org } = useDepartment()
  const q = useTodayCycles(dept.id, org)
  return useMemo(() => (q.data && org ? { rows: q.data, regimens: regimensOf(org) } : undefined), [q.data, org])
}
