// The vaccines pack's client (spec/openCare.md §5.8, Q25, Q26; pictures #vax-chart, #vax-room): a shared pack, ticked by paediatrics,
// family medicine, the vaccination room and the obstetric clinic (tetanus in pregnancy). /vax writes each dose as the pack's type extending the base's
// given (its card: site, lot, expiry, who gave it, here or from the card, or not given and why; under it the child's schedule worked
// out). The Vaccines section lists the national rows by age and the optional ones apart; the banner says what is overdue. The room's own
// list (Due today, This week, Overdue · to call, Given today) stands in for its queue, with its walk-in.
import { registerCard, registerCommand } from '@core/screens/visit/commands'
import { ANYONE, registerSection } from '@core/screens/chart/sections'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerScreen } from '@core/screens/registry'
import { registerPrintout } from '@core/print/registry'
import { CARD_KEY, VaxCardSheet, type VaxCard } from './printout'
import { DoseCard, VaxNote, cardLine } from './Compose'
import { parseVax } from './line'
import { DOSE_TYPE, PACK } from './schedule'
import { VaccinesSection } from './Section'
import { VaccinesRoom } from './Room'
import { bannerWords, chipWord, pregnantOf, summaryLine } from './words'

registerCommand({ name: 'vax', pack: PACK, groupTitle: 'Vaccines', title: 'Vaccine', label: 'Vaccines — a dose given, copied from the card, or not given and why',
  example: '/vax mmr 1, opv 5 · /vax opv 1 card 2025-11-09 · /vax mmr 1 not fever 39', action: 'write:vaccines.dose', writes: [DOSE_TYPE],
  parse: (rest) => parseVax(rest), note: (items, ctx) => <VaxNote items={items} ctx={ctx} /> })
registerCard({ function: DOSE_TYPE, Editor: DoseCard, line: cardLine, pack: PACK })
registerSection({ key: 'vaccines.doses', title: 'Vaccines', types: [DOSE_TYPE], fit: ANYONE, Body: VaccinesSection,
  word: (x) => chipWord(x.ctx.org, x.own.shown, x.identity.birth_date, pregnantOf(x.facts)), summary: (x) => summaryLine(x.ctx.org, x.own.shown, x.identity.birth_date, pregnantOf(x.facts)) })
registerBannerWords({ key: 'vaccines.due', types: [DOSE_TYPE], words: (x) => bannerWords(x.ctx.org, x.own.shown, x.identity.birth_date) })
registerScreen('vaccines.room', VaccinesRoom)
// the child's card, printed from the Vaccines section (Q26 b; built 2026-10-10)
registerPrintout<VaxCard>(CARD_KEY, { paper: 'a5', Component: VaxCardSheet })
export const key = PACK
