// Critical care's read for its tile line (the owner's C1, 2026-10-08, through the core's tile read, C7): each stay's airway, infusions,
// MAP, urine, SOFA, goals and rhythm by the pack's own op, intensive.board, read for treatment and once per board, for a reader who may
// read the record here; again when the stays change and on the clinic's hints, never on a timer. The same answer while nothing changes,
// so the board draws again only when one lands.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'
import type { PresenceRow } from '@core/db/types'
import { mayIn } from '@core/db/views'
import { useLive } from '@core/hooks/live'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import type { IcuBoard } from './board'

/** the stays as the board's read depends on them: each stay's item and version */
const staysKey = (rows: readonly PresenceRow[]) => rows.map((r) => `${r.item}@${r.version}`).sort().join(',')

export function useBoardRead(dept: { id: string }): IcuBoard | null | undefined {
  const { org } = useDepartment()
  const rows = useStays(dept.id).data?.rows
  const may = mayIn(org, 'read:record', dept.id)
  useLive(org && may ? `organization:${org.organization.id}` : null, [['intensive.board']])
  const q = useQuery({ queryKey: ['intensive.board', dept.id, staysKey(rows ?? [])], enabled: !!org && may && !!rows?.length,
    queryFn: () => packOp<IcuBoard>('intensive.board', dept.id, {}, 'TREAT'), placeholderData: keepPreviousData, retry: false })
  // a read that failed leaves the words to the row alone
  return q.isError ? undefined : q.data
}
