// Critical care's client (spec/openCare.md §5.6; its key intensive, a person always reads "Critical care"): one pack for the ICU and
// the CCU. Each bed's tile says its stay's airway, its one infusion that matters most, the MAP and a low urine, read once per board
// through the pack's own op (the owner's C1, on the core's tile read C7: boardRead.ts), and its button ICU chart opens the pack's tab on that patient: the hourly chart, one
// column an hour signed once (vitals, the ventilator, infusions, in and out). Its types (the ventilator's settings, an infusion's rate)
// are the server's. Piece I2: the Round tab (SOFA from the record's worst of 24 hours and the daily goals, signed once), its button
// Goals on each taken bed, and the banner's words: the ventilation's day, the stay's SOFA, "goals not done". Piece I3: where the
// department's cardiac rows are on (a CCU), the tile's rhythm, the chart's Heart and Bloods, the reperfusion strip, heparin by aPTT,
// and the banner's Killip class.
import { registerBannerWords } from '@core/screens/chart/words'
import { registerScreen } from '@core/screens/registry'
import { registerTileButton, registerTileLine } from '@core/screens/ward/tiles'
import { tileWords } from './board'
import { useBoardRead } from './boardRead'
import { IcuChart } from './IcuChart'
import { Round } from './Round'
import { icuWords } from './words'

// the ICU chart, a tab beside the board (a pack's view in the chart's center would be a core door)
registerScreen('intensive.chart', IcuChart)

// its words on each tile, from the board's read (once per board: each stay's airway, infusions, MAP and urine, read for treatment, for a
// reader who may read the record here; boardRead.ts)
registerTileLine('intensive', (row, ctx) => tileWords(row, ctx, ctx.read, Date.now()), useBoardRead)
// its button on a taken bed: the ICU chart on this patient
registerTileButton('intensive', { label: 'ICU chart', path: (row) => `/?tab=intensive.chart&stay=${row.item}` })
// the morning round, a tab beside the chart; its button on a taken bed
registerScreen('intensive.round', Round)
registerTileButton('intensive', { label: 'Goals', path: (row) => `/?tab=intensive.round&stay=${row.item}` })
// the banner's words, only where the department uses the pack; never the infusions (the banner reads its types in one page)
registerBannerWords({ key: 'intensive.icu', types: ['procedure', 'score', 'intensive.goals', 'intensive.reperfusion'], words: (x) => icuWords(x) })
export const key = 'intensive'
