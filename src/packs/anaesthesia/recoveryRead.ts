// Recovery's read for its tile line (core change C7): the pack's table, anaesthesia.recovery, for the patients in Recovery's bays, through
// the read door; the same rows while nothing changes, so the board draws again only when an Aldrete or a pain score lands.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import { useStays } from '@core/hooks/reads'
import type { TableRead } from '@core/db/types'
import type { RecRow } from './model'

export function useRecoveryRead(dept: { id: string }): RecRow[] | undefined {
  const stays = useStays(dept.id)
  const patients = useMemo(() => [...new Set((stays.data?.rows ?? []).map((r) => r.patient_id))].sort(), [stays.data])
  const q = useQuery({ queryKey: ['anaesthesia.recovery', dept.id, patients.join(',')], enabled: patients.length > 0, staleTime: 15_000, refetchInterval: 30_000,
    placeholderData: (was) => was,
    queryFn: async () => (await read<TableRead<RecRow>>({ shape: 'table', table: 'anaesthesia.recovery', department_id: dept.id, where: { patient_id: patients }, entries: false })).rows })
  return q.data
}
