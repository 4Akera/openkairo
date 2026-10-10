// The children's ward's read for paediatrics' tile line (beds' C1, "a pack reads its data once per board", through the core's tile
// read, C7): the latest weight of each child with a stay here, from the pack's own table paeds.growth through the read door, in one
// read for the board; again when the stays change (a new admission, vitals written in a stay) and on the clinic's hints, never on a
// timer. The same map while nothing changes, so the board draws again only when a weight lands.
import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { PresenceRow, TableRead } from '@core/db/types'
import { mayIn } from '@core/db/views'
import { useLive } from '@core/hooks/live'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import { GROWTH, rowsOf } from './growth'
import { weightsOf, type WardRead } from './ward'

/** the board's stays as they are: a new stay, a move or vitals written in one reads the weights again */
export const staysKey = (rows: readonly PresenceRow[]) => rows.map((r) => `${r.item}@${r.version}:${r.has_vitals ? 1 : 0}`).sort().join(',')

export function useWardRead(dept: { id: string }): WardRead | undefined {
  const { org } = useDepartment()
  const rows = useStays(dept.id).data?.rows
  const patients = useMemo(() => [...new Set((rows ?? []).map((r) => r.patient_id))].sort(), [rows])
  const key = staysKey(rows ?? [])
  const may = mayIn(org, 'read:record', dept.id)
  useLive(org && may ? `organization:${org.organization.id}` : null, [['paeds.ward']])
  const q = useQuery({ queryKey: ['paeds.ward', dept.id, key], enabled: !!org && may && patients.length > 0, placeholderData: keepPreviousData, retry: false,
    queryFn: async () => weightsOf(rowsOf({ [GROWTH]: await read<TableRead<unknown>>({ shape: 'table', table: GROWTH, department_id: dept.id,
      where: { patient_id: patients }, entries: false, limit: 2000 }) }), patients) })
  // a read that failed leaves the line to say nothing
  return q.isError ? undefined : q.data
}
