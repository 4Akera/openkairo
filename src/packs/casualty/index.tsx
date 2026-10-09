// Emergency's client (spec/openCare.md §5.6; its key casualty, since the core and the base already use the word emergency). Its
// Patients tab (Arrived, the triage card, Take, Where to), each board tile's level and time and where the patient goes from the pack's
// own read of the board (the owner's C1) with its Triage and Where to buttons, the chart banner's level, the decision in the record, and
// its refusals in words. Its patients with no bed are the base board's
// waiting chairs; its resus bays and cubicles are the base's places.
import { packOp } from '@core/db/rpc'
import { registerWords } from '@core/db/words'
import { registerRenderer } from '@core/renderers'
import { registerScreen } from '@core/screens/registry'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerTileButton, registerTileLine, registerTileLoad } from '@core/screens/ward/tiles'
import { levelBanner, tileWords, type Board } from './board'
import { REFUSALS } from './words'
import { Patients } from './Patients'
import { Disposition } from './Disposition'

// its one tab: the stays admitted here, the chairs first by their wait
registerScreen('casualty.patients', Patients)
// the board's read, once per board: each stay's latest triage and when a doctor first wrote in it (read for treatment)
registerTileLoad('casualty', async (_rows, ctx) => ctx.can('read:record') ? packOp<Board>('casualty.board', ctx.dept.id, {}, 'TREAT') : null)
// its words on each tile: the level and the wait for a doctor, or not triaged yet; then where to, as decided, and a police case
registerTileLine('casualty', (row, ctx, data) => tileWords(row, ctx, data, Date.now()))
// its button on each tile: the triage card for that patient, on the Patients tab (a retriage once triaged)
registerTileButton('casualty', { label: 'Triage', show: (_r, ctx) => ctx.can('write:casualty.triage'), path: (r) => `/?tab=casualty.patients&stay=${r.item}&card=triage` })
// its second: the Where to card for that patient, for whoever may record a leaving here (the ER's doctors)
registerTileButton('casualty', { label: 'Where to', show: (_r, ctx) => ctx.can('write:discharged') && ctx.can('write:casualty.disposition'),
  path: (r) => `/?tab=casualty.patients&stay=${r.item}&card=where` })
// the decision in the record: its line, then why, who signed, its note
registerRenderer('casualty.disposition', { Block: Disposition })
// the banner's word: the open stay's latest level, "2 · Very urgent"
registerBannerWords({ key: 'casualty.triage', types: ['casualty.triage'], words: levelBanner })
registerWords(REFUSALS)
export const key = 'casualty'
