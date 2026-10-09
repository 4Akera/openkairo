// Ward nursing's W1 (spec/openCare.md §5.6): obs due and the ward's NEWS2 response, registered here so that the pack's other files take
// it in one line each. The Obs due tab beside the board (bedside.obs); the composer's line under the cards from the ward's own response
// (its setting, through response.ts's hook); and the tile line's read (the owner's C1, through the core's tile read, C7): bedside.board's
// answer as boardRead.ts reads it, with bedside.obs_due's beside it under obs. index.tsx imports useWardRead and withDueWord from here.
import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'
import type { Organization } from '@core/db/types'
import { mayIn } from '@core/db/views'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import { registerScreen } from '@core/screens/registry'
import { useBoardRead } from './boardRead'
import { staysKey, type News2Board } from './news2'
import { ObsDueTab } from './ObsDueTab'
import type { ObsDueRead } from './obsdue'
import { rulesIn, setRulesHook, type Rules } from './response'
export { withDueWord } from './obsdue'

// the Obs due tab beside the board (bedside.obs)
registerScreen('bedside.obs', ObsDueTab)
/** whether this department's Screens line holds Obs due: an ICU or ER that ticks the pack for NEWS2 alone gets no ward due times */
const obsHere = (org: Organization | undefined, departmentId: string) => !!org?.departments.find((d) => d.id === departmentId)?.screens.includes('bedside.obs')
// the composer's response line: the ward's own (its setting), read where the note draws; elsewhere piece 1's RCP words
function useRulesHere(departmentId: string): Rules | undefined {
  const { org } = useDepartment()
  return obsHere(org, departmentId) ? rulesIn(org, departmentId) : undefined
}
setRulesHook(useRulesHere)

/** the tile line's read: bedside.board's (boardRead.ts) and bedside.obs_due's, side by side, read for treatment, once per board, again when
 *  the stays change and on the clinic's hints (its key under bedside.board's, so the same hints reach it), never on a timer; obs due under
 *  obs. If obs due fails, or the line has no Obs due, the NEWS2 words stand alone. The same object while nothing changes */
export function useWardRead(dept: { id: string }): (News2Board & { obs?: ObsDueRead['stays'] }) | null | undefined {
  const board = useBoardRead(dept)
  const { org } = useDepartment()
  const rows = useStays(dept.id).data?.rows
  const may = mayIn(org, 'read:record', dept.id) && obsHere(org, dept.id)
  const q = useQuery({ queryKey: ['bedside.board', dept.id, staysKey(rows ?? []), 'obs_due'], enabled: !!org && may && !!rows?.length,
    queryFn: () => packOp<ObsDueRead>('bedside.obs_due', dept.id, {}, 'TREAT'), placeholderData: keepPreviousData, retry: false })
  const obs = q.isError ? undefined : q.data?.stays
  return useMemo(() => board && obs ? { ...board, obs } : board, [board, obs])
}
