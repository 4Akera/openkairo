// The ward tile's one read and one line (W2's useWardRead and withWardWords, moved here in W3a; wardLine new), so the board and the
// Handover tab say exactly the same, and nothing imports in a circle: this file imports neither ward2.ts nor HandoverTab.tsx.
import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'
import type { PresenceRow } from '@core/db/types'
import { mayIn } from '@core/db/views'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import type { TileCtx, TileWords } from '@core/screens/ward/tiles'
import { wardHere, withBalanceWord, type FluidsRead } from './balance'
import { useBoardRead } from './boardRead'
import { wardTile } from './doses'
import { staysKey } from './news2'
import { withDueWord, type ObsDueRead } from './obsdue'
import { makeWardMerge, type WardRead } from './wardread'

/** the tile line's read: bedside.board's (boardRead.ts), bedside.obs_due's and bedside.fluids', side by side, read for treatment, once per
 *  board, again when the stays change and on the clinic's hints (their keys under bedside.board's, so the same hints reach them), never on
 *  a timer; obs due under obs, the charted stays' fluids under fluids. Each extra read may fail alone, or the line have no Obs due: the
 *  NEWS2 words stand. The same object while nothing changes (makeWardMerge) */
export function useWardRead(dept: { id: string }): WardRead | null | undefined {
  const board = useBoardRead(dept)
  const { org } = useDepartment()
  const rows = useStays(dept.id).data?.rows
  const may = mayIn(org, 'read:record', dept.id) && wardHere(org, dept.id); const key = staysKey(rows ?? []); const on = !!org && may && !!rows?.length
  const o = useQuery({ queryKey: ['bedside.board', dept.id, key, 'obs_due'], enabled: on,
    queryFn: () => packOp<ObsDueRead>('bedside.obs_due', dept.id, {}, 'TREAT'), placeholderData: keepPreviousData, retry: false })
  // from: 25 h back, worked out when the read runs, never in the key (a key with the clock in it reads again on every render)
  const f = useQuery({ queryKey: ['bedside.board', dept.id, key, 'fluids'], enabled: on, placeholderData: keepPreviousData, retry: false,
    queryFn: () => packOp<FluidsRead>('bedside.fluids', dept.id, { from: new Date(Date.now() - 25 * 3_600_000).toISOString() }, 'TREAT') })
  const [merge] = useState(makeWardMerge)
  return merge(board, o.isError ? undefined : o.data, f.isError ? undefined : f.data)
}
/** the tile's line: piece 1's words, obs due right after NEWS2, the balance last */
export const withWardWords = (w: TileWords | null | undefined, row: PresenceRow, ctx: TileCtx, data: unknown, now: number) =>
  withBalanceWord(withDueWord(w, row, ctx, data, now), row, ctx, data, now)
/** the tile's one line: piece 1's words, obs due right after NEWS2, the drug round's doses, the balance last (index.tsx's line, word for
 *  word) */
export const wardLine = (row: PresenceRow, ctx: TileCtx, now: number) => withWardWords(wardTile(row, ctx, now), row, ctx, ctx.read, now)
