// The Ward nursing pack's client (spec/openCare.md §5.6; its key bedside, since the core already uses the word ward). Piece 1: NEWS2
// with the obs. The nurse types /obs on a stay (obs.tsx): the base's vitals and the base's score for NEWS2, in one set. The banner
// says the stay's latest NEWS2, the record panel has its section with the stay's trend, and a stay with no obs yet says so on its tile.
// No type, table, setting, action or role of its own yet.
import { registerBannerWords } from '@core/screens/chart/words'
import { registerSection } from '@core/screens/chart/sections'
import { registerTileLine } from '@core/screens/ward/tiles'
import { NEWS2_FIT, news2Chip, news2Rows, news2Summary, news2Words, obsTileLine } from './news2'
import { News2 } from './Section'
import './obs'

// the banner's word, only where the department uses the pack: the open stay's latest NEWS2, amber at 5–6, red at 7 or more
registerBannerWords({ key: 'bedside.news2', types: ['score'], words: news2Words })
// its section: for adults; data only when a NEWS2 is there (score is also the base's GCS)
registerSection({ key: 'bedside.news2', title: 'NEWS2', types: ['score'], fit: NEWS2_FIT, has: (x) => news2Rows(x.own, x.rec, x.ctx.org).length > 0,
  word: news2Chip, summary: news2Summary, Body: News2 })
// its words on each tile: a stay with no obs yet
registerTileLine('bedside', (row) => obsTileLine(row, Date.now()))
export const key = 'bedside'
