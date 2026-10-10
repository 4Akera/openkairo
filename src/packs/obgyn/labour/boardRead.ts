// The labour ward's read for its tile line (the owner's C1, 2026-10-08, through the core's tile read, C7): each admitted stay's labour
// examinations, the baby's latest heart rate and the pregnancy standing, by the pack's own op obgyn.board, read for treatment and once
// per board, for a reader who may read the record here; again when the stays change and on the clinic's hints, never on a timer. The
// answer is also kept for the tile's Partograph button (board.ts rememberBoard), since a button gets no read.
import { useEffect } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'
import { mayIn } from '@core/db/views'
import { useLive } from '@core/hooks/live'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import { rememberBoard, type LabourBoard } from './board'

export function useBoardRead(dept: { id: string }): LabourBoard | null | undefined {
  const { org } = useDepartment()
  const rows = useStays(dept.id).data?.rows
  const may = mayIn(org, 'read:record', dept.id)
  useLive(org && may ? `organization:${org.organization.id}` : null, [['obgyn.board']])
  const key = (rows ?? []).map((r) => `${r.item}@${r.version}`).sort().join(',')
  const q = useQuery({ queryKey: ['obgyn.board', dept.id, key], enabled: !!org && may && !!rows?.length,
    queryFn: () => packOp<LabourBoard>('obgyn.board', dept.id, {}, 'TREAT'), placeholderData: keepPreviousData, retry: false })
  // the button follows the line: the last good answer, forgotten when the read fails or the reader may not read here
  const kept = !may || q.isError ? undefined : q.data
  useEffect(() => { rememberBoard(dept.id, kept) }, [dept.id, kept])
  // a read that failed leaves the tile to the base's words
  return kept
}
