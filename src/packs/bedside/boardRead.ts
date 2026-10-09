// Ward nursing's read for its tile line (the owner's C1, 2026-10-08, through the core's tile read, C7): each stay's latest NEWS2 by the
// pack's own op, bedside.board, read for treatment and once per board, for a reader who may read the record here; again when the stays
// change and on the clinic's hints, never on a timer. The same answer while nothing changes, so the board draws again only when one lands.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'
import { mayIn } from '@core/db/views'
import { useLive } from '@core/hooks/live'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import type { BoardRead } from './doses'
import { staysKey } from './news2'

export function useBoardRead(dept: { id: string }): BoardRead | null | undefined {
  const { org } = useDepartment()
  const rows = useStays(dept.id).data?.rows
  const may = mayIn(org, 'read:record', dept.id)
  useLive(org && may ? `organization:${org.organization.id}` : null, [['bedside.board']])
  const q = useQuery({ queryKey: ['bedside.board', dept.id, staysKey(rows ?? [])], enabled: !!org && may && !!rows?.length,
    queryFn: () => packOp<BoardRead>('bedside.board', dept.id, {}, 'TREAT'), placeholderData: keepPreviousData, retry: false })
  // a read that failed leaves the words to the row alone
  return q.isError ? undefined : q.data
}
