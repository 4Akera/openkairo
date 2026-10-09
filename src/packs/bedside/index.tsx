// The Ward nursing pack's client (spec/openCare.md §5.6; its key bedside, since the core already uses the word ward). NEWS2 with the
// obs: where a department uses the pack, the base's /v also writes NEWS2 (obs.tsx, the owner's C3) — the vitals' own air or oxygen and
// ACVPU are its two answers (Q5). The banner says the stay's latest NEWS2, the record panel has its section with the stay's trend, and
// each tile says its stay's latest NEWS2, read once per board through the pack's own op (C1, by the tile line's read), or that a stay has
// no obs yet. Its drug round (piece 3): the Drug round tab (DrugRound.tsx: Due now, Late, As needed, Given this round), each dose the base's
// given as Ward nursing's own dose naming the time it is for; on each tile "1 dose late" and "times not set" from the same board read,
// and a Give button that opens the round on that stay. 3b: the Treatment sheet in the record panel (Sheet.tsx, from the pack's op), the
// banner's "1 dose late" (worked out in the client by the server's rule, twin.ts) and the note under /rx (rx.tsx).
// Its own: the dose type (bedside.dose), its action, the ward's dose times (bedside.round), the round's screen and ops. No table or role.
import { registerWords } from '@core/db/words'
import { registerScreen } from '@core/screens/registry'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerSection } from '@core/screens/chart/sections'
import { registerTileButton, registerTileLine } from '@core/screens/ward/tiles'
import { useBoardRead } from './boardRead'
import { DOSE, doseBannerWords, sheetChip, sheetSummary, wardTile } from './doses'
import { NEWS2_FIT, news2Chip, news2Rows, news2Summary, news2Words } from './news2'
import { Round } from './DrugRound'
import { News2 } from './Section'
import { Sheet } from './Sheet'
import './obs'
import './rx'

// the banner's word, only where the department uses the pack: the open stay's latest NEWS2, amber at 5–6, red at 7 or more
registerBannerWords({ key: 'bedside.news2', types: ['score'], words: news2Words })
// its section: for adults; data only when a NEWS2 is there (score is also the base's GCS)
registerSection({ key: 'bedside.news2', title: 'NEWS2', types: ['score'], fit: NEWS2_FIT, has: (x) => news2Rows(x.own, x.rec, x.ctx.org).length > 0,
  word: news2Chip, summary: news2Summary, Body: News2 })
// the banner's dose words for the open stay: "1 dose late" (red), "times not set" (amber)
registerBannerWords({ key: 'bedside.doses', types: ['given'], words: (x) => doseBannerWords(x) })
// the Treatment sheet: shown with the pack's own doses (a plain given, a transfusion or a vaccine dose elsewhere does not bring it)
registerSection({ key: 'bedside.sheet', title: 'Treatment sheet', types: ['given'], has: (x) => x.own.shown.some((e) => e.type === DOSE),
  word: (x) => sheetChip(x), summary: (x) => sheetSummary(x), Body: Sheet })
// the Drug round tab (declared bedside.round, beside Beds)
registerScreen('bedside.round', Round)
// its words on each tile from the board's read (once per board: boardRead.ts): the stay's latest NEWS2, else no obs yet; then its doses
registerTileLine('bedside', (row, ctx) => wardTile(row, ctx, Date.now()), useBoardRead)
// Give on every admitted stay: the Drug round on that stay only
registerTileButton('bedside', { label: 'Give', show: (row, ctx) => row.kind === 'stay' && row.state === 'admitted' && ctx.can('write:bedside.dose'),
  path: (row) => `/?tab=bedside.round&stay=${row.item}` })
// the refusals' words: the ward's times, a dose, the sheet's day and stay
registerWords({ wrong_count: 'That timing takes another number of times a day', not_every: 'Every n hours takes times n hours apart',
  not_a_medicine: 'That medicine is not on this patient\'s list', reason_on_given: 'A dose given has no reason for not giving',
  unknown_day: 'Today, yesterday or the whole stay', unknown_stay: 'Not a stay of this ward' })
export const key = 'bedside'
