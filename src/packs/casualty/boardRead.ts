// Emergency's read for its tile line (the owner's C1, through the core's tile read, C7): each stay's latest triage, "seen", where to and
// the police case by the pack's own op, casualty.board, read for treatment and once per board, for a reader who may read the record here;
// again when the stays change and on the clinic's hints. The same query as the Patients tab's, so a card's save refreshes both. The same
// answer while nothing changes, so the board draws again only when one lands.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'
import { mayIn } from '@core/db/views'
import { useLive } from '@core/hooks/live'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import { staysKey, type Board } from './board'

/** the board's query key: the department and its stays as they are */
export const boardKey = (deptId: string, key: string) => ['casualty-board', deptId, key]

export function useBoardRead(dept: { id: string }): Board | null | undefined {
  const { org } = useDepartment()
  const rows = useStays(dept.id).data?.rows
  const may = mayIn(org, 'read:record', dept.id)
  useLive(org && may ? `organization:${org.organization.id}` : null, [['casualty-board']])
  const q = useQuery({ queryKey: boardKey(dept.id, staysKey(rows ?? [])), enabled: !!org && may && !!rows?.length,
    queryFn: () => packOp<Board>('casualty.board', dept.id, {}, 'TREAT'), placeholderData: keepPreviousData, retry: false })
  // a read that failed leaves the words to the row alone
  return q.isError ? undefined : q.data
}
