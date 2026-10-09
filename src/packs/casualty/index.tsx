// Emergency's client (spec/openCare.md §5.6; its key casualty, since the core and the base already use the word emergency). Its
// Patients tab (Arrived, the triage card, Take, Where to), each board tile's level and time and where the patient goes from the pack's
// own read of the board (the owner's C1) with its Triage and Where to buttons, the chart banner's level, the decision in the record, and
// its refusals in words. Its patients with no bed are the base board's
// waiting chairs; its resus bays and cubicles are the base's places.
import { registerWords } from '@core/db/words'
import { registerRenderer } from '@core/renderers'
import { registerScreen } from '@core/screens/registry'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerTileButton, registerTileLine } from '@core/screens/ward/tiles'
import { levelBanner, tileWords } from './board'
import { useBoardRead } from './boardRead'
import { REFUSALS } from './words'
import { Patients } from './Patients'
import { Disposition } from './Disposition'

// its one tab: the stays admitted here, the chairs first by their wait
registerScreen('casualty.patients', Patients)
// its words on each tile: the level and the wait for a doctor, or not triaged yet; then where to, as decided, and a police case — from
// the board's read, once per board (boardRead.ts): each stay's latest triage and when a doctor first wrote in it (read for treatment)
registerTileLine('casualty', (row, ctx) => tileWords(row, ctx, ctx.read, Date.now()), useBoardRead)
// its button on each tile: the triage card for that patient, on the Patients tab (a retriage once triaged); its buttons read nothing of
// the board, only the row and the rights here
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
