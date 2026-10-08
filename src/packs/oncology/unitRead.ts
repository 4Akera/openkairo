// The day unit's read of today's cycles (spec/openCare.md §5.7): the pack's table, oncology.cycles, through the read door, for the
// tiles (unit.ts) and the rows under the board.
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { TableRead } from '@core/db/types'
import { regimensOf } from './model'
import { clinicDay, keepCycles, keepRegimens, type CycleRow } from './unit'

export const readCycles = async (deptId: string, day: string) =>
  (await read<TableRead<CycleRow>>({ shape: 'table', table: 'oncology.cycles', department_id: deptId, where: { to_department_id: deptId, due: day }, entries: false })).rows
type Org = Parameters<typeof regimensOf>[0] & { organization: { time_zone?: string } }
/** today's cycles for the day unit, kept for its tiles */
export function useTodayCycles(deptId: string, org: Org | undefined) {
  const day = clinicDay(org?.organization.time_zone || undefined)
  return useQuery({ queryKey: ['oncology.cycles', deptId, day], staleTime: 15_000, refetchInterval: 30_000,
    queryFn: async () => { if (org) keepRegimens(regimensOf(org)); const rows = await readCycles(deptId, day); keepCycles(deptId, rows); return rows } })
}
