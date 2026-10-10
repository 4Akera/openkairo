// Ward nursing's W1 (spec/openCare.md §5.6): obs due and the ward's NEWS2 response, registered here so that the pack's other files take
// it in one line each. The Obs due tab beside the board (bedside.obs); the composer's line under the cards from the ward's own response
// (its setting, through response.ts's hook); and the tile line's read (the owner's C1, through the core's tile read, C7): bedside.board's
// answer as boardRead.ts reads it, with bedside.obs_due's beside it under obs. index.tsx imports useWardRead and withWardWords from here.
// W2: /in, /out and /fluids (fluids.ts), the Fluid balance section and the banner's balance (balance.ts, FluidBalance.tsx), and the fluids
// beside obs due in the tile's one read (useWardRead, wardread.ts); one type (the fluid chart), one setting (the shifts) and one op
// (bedside.fluids) of its own.
// W3a: the Handover tab (HandoverTab.tsx, handover.ts; one screen, one op); the tile's read and line live in wardline.ts.
// W3b: Going home (/home, its card, its save and its draft's block: home.ts, homesave.ts, GoingHome.tsx); one setting,
// bedside.home_words; the set itself is the base's.
import { createElement } from 'react'
import type { Organization } from '@core/db/types'
import { useDepartment } from '@core/hooks/organization'
import { registerRenderer } from '@core/renderers'
import { ANYONE, registerSection } from '@core/screens/chart/sections'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerScreen } from '@core/screens/registry'
import { registerCard, registerCommand, registerDraftSave } from '@core/screens/visit/commands'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { fluidChip, fluidHas, fluidNotes, fluidSummary, fluidWords, wardHere } from './balance'
import { FluidBalance, FluidNote } from './FluidBalance'
import { CHART_TYPE, parseChart, parseIn, parseOut } from './fluids'
import { HomeBlock, HomeCard } from './GoingHome'
import { HandoverTab } from './HandoverTab'
import { emptyHome, HOME, homeLine, parseHome, type HomeParams } from './home'
import { saveHome } from './homesave'
import { ObsDueTab } from './ObsDueTab'
import { rulesIn, setRulesHook, type Rules } from './response'

export { useWardRead, withWardWords } from './wardline'

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

// the Handover tab beside the board (bedside.handover)
registerScreen('bedside.handover', HandoverTab)

// Going home: the letter, the medicines and the discharge in one set, for whoever may discharge
registerCommand({ name: 'home', pack: 'bedside', groupTitle: 'Ward nursing', title: 'Going home', label: 'Going home: the letter, the medicines and the discharge, in one set',
  example: '/home · /home facility', action: 'write:discharged', writes: [HOME], parse: (rest, ctx) => parseHome(rest, ctx), empty: (ctx) => emptyHome(ctx) })
registerCard({ function: HOME, pack: 'bedside', Editor: HomeCard, line: (q) => homeLine(q as Partial<HomeParams>) })
registerDraftSave({ function: HOME, pack: 'bedside', save: saveHome })
registerRenderer(HOME, { Block: HomeBlock })
