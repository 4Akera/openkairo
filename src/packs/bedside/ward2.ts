// Ward nursing's W1 (spec/openCare.md §5.6): obs due and the ward's NEWS2 response, registered here so that the pack's other files take
// it in one line each. The Obs due tab beside the board (bedside.obs); the composer's line under the cards from the ward's own response
// (its setting, through response.ts's hook); and the tile line's read (the owner's C1, through the core's tile read, C7): bedside.board's
// answer as boardRead.ts reads it, with bedside.obs_due's beside it under obs. index.tsx imports useWardRead and withWardWords from here.
// W2: /in, /out and /fluids (fluids.ts), the Fluid balance section and the banner's balance (balance.ts, FluidBalance.tsx), and the fluids
// beside obs due in the tile's one read (useWardRead, wardread.ts); one type (the fluid chart), one setting (the shifts) and one op
// (bedside.fluids) of its own.
import { createElement, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'
import type { Organization, PresenceRow } from '@core/db/types'
import { mayIn } from '@core/db/views'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import { ANYONE, registerSection } from '@core/screens/chart/sections'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerScreen } from '@core/screens/registry'
import { registerCommand } from '@core/screens/visit/commands'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import type { TileCtx, TileWords } from '@core/screens/ward/tiles'
import { fluidChip, fluidHas, fluidNotes, fluidSummary, fluidWords, wardHere, withBalanceWord, type FluidsRead } from './balance'
import { useBoardRead } from './boardRead'
import { FluidBalance, FluidNote } from './FluidBalance'
import { CHART_TYPE, parseChart, parseIn, parseOut } from './fluids'
import { staysKey } from './news2'
import { ObsDueTab } from './ObsDueTab'
import { withDueWord, type ObsDueRead } from './obsdue'
import { rulesIn, setRulesHook, type Rules } from './response'
import { makeWardMerge, type WardRead } from './wardread'

// the Obs due tab beside the board (bedside.obs)
registerScreen('bedside.obs', ObsDueTab)
/** whether this department's Screens line holds Obs due: an ICU or ER that ticks the pack for NEWS2 alone gets no ward due times */
const obsHere = (org: Organization | undefined, departmentId: string) => wardHere(org, departmentId)
// the composer's response line: the ward's own (its setting), read where the note draws; elsewhere piece 1's RCP words
function useRulesHere(departmentId: string): Rules | undefined {
  const { org } = useDepartment()
  return obsHere(org, departmentId) ? rulesIn(org, departmentId) : undefined
}
setRulesHook(useRulesHere)

// in and out (the base's observations, B1's codes) and the fluid chart, under Ward nursing in the / list
const note = (items: Parsed[], ctx: Ctx) => fluidNotes(items, ctx, Date.now()).length ? createElement(FluidNote, { items, ctx }) : null
registerCommand({ name: 'in', pack: 'bedside', groupTitle: 'Ward nursing', title: 'Fluid in', label: 'Fluid in: how much, and IV, by mouth or by tube',
  example: '/in 250 iv', action: 'write:observation', writes: ['observation'], parse: (rest) => parseIn(rest), note })
registerCommand({ name: 'out', pack: 'bedside', groupTitle: 'Ward nursing', title: 'Fluid out', label: 'Fluid out: urine, a drain, a tube, vomit or stool, in mL',
  example: '/out urine 300', action: 'write:observation', writes: ['observation'], parse: (rest) => parseOut(rest), note })
registerCommand({ name: 'fluids', pack: 'bedside', groupTitle: 'Ward nursing', title: 'Fluid chart', label: 'Start or stop a fluid chart, with the day’s target',
  example: '/fluids target -1000', action: 'write:bedside.fluid_chart', writes: [CHART_TYPE], parse: (rest) => parseChart(rest),
  empty: () => { const r = parseChart(''); return r && 'ok' in r ? r.ok : [] } })
// the record panel's Fluid balance, for the stay open now; the banner's balance while a chart is on
registerSection({ key: 'bedside.fluids', title: 'Fluid balance', types: [CHART_TYPE], fit: ANYONE, has: fluidHas,
  word: (x) => fluidChip(x), summary: (x) => fluidSummary(x), Body: FluidBalance })
registerBannerWords({ key: 'bedside.fluids', types: [CHART_TYPE], words: (x) => fluidWords(x) })

/** the tile line's read: bedside.board's (boardRead.ts), bedside.obs_due's and bedside.fluids', side by side, read for treatment, once per
 *  board, again when the stays change and on the clinic's hints (their keys under bedside.board's, so the same hints reach them), never on
 *  a timer; obs due under obs, the charted stays' fluids under fluids. Each extra read may fail alone, or the line have no Obs due: the
 *  NEWS2 words stand. The same object while nothing changes (makeWardMerge) */
export function useWardRead(dept: { id: string }): WardRead | null | undefined {
  const board = useBoardRead(dept)
  const { org } = useDepartment()
  const rows = useStays(dept.id).data?.rows
  const may = mayIn(org, 'read:record', dept.id) && obsHere(org, dept.id); const key = staysKey(rows ?? []); const on = !!org && may && !!rows?.length
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
