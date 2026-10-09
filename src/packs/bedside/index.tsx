// The Ward nursing pack's client (spec/openCare.md §5.6; its key bedside, since the core already uses the word ward). NEWS2 with the
// obs: where a department uses the pack, the base's /v also writes NEWS2 (obs.tsx, the owner's C3) — the vitals' own air or oxygen and
// ACVPU are its two answers (Q5). The banner says the stay's latest NEWS2, the record panel has its section with the stay's trend, and
// each tile says its stay's latest NEWS2, read once per board through the pack's own op (C1, by the tile line's read), or that a stay has
// no obs yet.
// Obs due, the ward's NEWS2 response and the Obs due tab are ward2.ts's (one setting, one screen, one op); no type, table, action or role
// of its own.
import { registerBannerWords } from '@core/screens/chart/words'
import { registerSection } from '@core/screens/chart/sections'
import { registerTileLine } from '@core/screens/ward/tiles'
import { NEWS2_FIT, news2Chip, news2Rows, news2Summary, news2Words, tileWords } from './news2'
import { News2 } from './Section'
import './obs'
import { useWardRead, withDueWord } from './ward2'

// the banner's word, only where the department uses the pack: the open stay's latest NEWS2, amber at 5–6, red at 7 or more
registerBannerWords({ key: 'bedside.news2', types: ['score'], words: news2Words })
// its section: for adults; data only when a NEWS2 is there (score is also the base's GCS)
registerSection({ key: 'bedside.news2', title: 'NEWS2', types: ['score'], fit: NEWS2_FIT, has: (x) => news2Rows(x.own, x.rec, x.ctx.org).length > 0,
  word: news2Chip, summary: news2Summary, Body: News2 })
// its words on each tile: the stay's latest NEWS2, then when its obs are due, from the board's read (once per board: boardRead.ts, with
// ward2.ts's obs due beside it); else a stay with no obs yet
registerTileLine('bedside', (row, ctx) => withDueWord(tileWords(row, ctx, ctx.read, Date.now()), row, ctx, ctx.read, Date.now()), useWardRead)
export const key = 'bedside'
