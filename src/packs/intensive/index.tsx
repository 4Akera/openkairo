// Critical care's client (spec/openCare.md §5.6; its key intensive, a person always reads "Critical care"): one pack for the ICU and
// the CCU. Each bed's tile says its stay's airway, its one infusion that matters most, the MAP and a low urine, read once per board
// through the pack's own op (the owner's C1). Its types (the ventilator's settings, an infusion's rate) are the server's.
import { packOp } from '@core/db/rpc'
import { registerTileLine, registerTileLoad } from '@core/screens/ward/tiles'
import { tileWords, type IcuBoard } from './board'

// the board's read, once per board: each stay's airway, infusions, MAP and urine (read for treatment), for a reader who may read the record here
registerTileLoad('intensive', async (_rows, ctx) => ctx.can('read:record') ? packOp<IcuBoard>('intensive.board', ctx.dept.id, {}, 'TREAT') : null)
// its words on each tile
registerTileLine('intensive', (row, ctx, data) => tileWords(row, ctx, data, Date.now()))
export const key = 'intensive'
