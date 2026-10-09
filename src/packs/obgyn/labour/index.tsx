// ObGyn's labour ward, its client (spec/openCare.md §5.6): where a department uses ObGyn, the composer's /ve, /ctx and /fhr and the
// exam's card (commands.tsx); each tile's words for a woman in labour — G and P, the weeks, the cervix, the hours of active labour,
// past the alert or the action line, the baby's heart when it is off — from the pack's own read once per board (the owner's C1,
// through C7's hook: boardRead.ts); and the banner's words, past a line and the baby's heart. It reads through the core's doors, so
// no node test imports this file (scripts/test-labour.ts registers the same functions itself).
import { registerBannerWords } from '@core/screens/chart/words'
import { registerTileLine } from '@core/screens/ward/tiles'
import { EXAM } from './codes'
import { labourWords, tileWords } from './board'
import { useBoardRead } from './boardRead'
import './commands'

registerTileLine('obgyn', (row, ctx) => tileWords(row, ctx, ctx.read, Date.now()), useBoardRead)
registerBannerWords({ key: 'obgyn.labour', types: [EXAM, 'observation'], words: (x) => labourWords(x) })
