// Ward nursing's one tile read, merged (spec/openCare.md §5.6, W1 and W2; the core's C7): bedside.board's answer, with obs due's
// (bedside.obs_due) and the charted stays' fluids (bedside.fluids) beside it, under obs and fluids. The board draws again whenever the
// read changes, so the merge keeps its answer's identity while the three answers are the same objects. Pure: npm run test:fluids.
import type { BoardRead } from './doses'
import type { ObsDueRead } from './obsdue'
import type { FluidsRead } from './balance'

/** the pack's tile read: bedside.board's answer (NEWS2 and the drug round's doses) with obs due and the charted stays' fluids beside it */
export type WardRead = BoardRead & { obs?: ObsDueRead['stays']; fluids?: FluidsRead['stays'] }
/** a one-slot merge: the same object back while the board's, obs due's and the fluids' answers are the same objects (C7: the board draws
 *  again only when one lands); no board yet: as the board (null or undefined); a failed extra read (undefined) is left out */
export function makeWardMerge() {
  let last: { b: unknown; o: unknown; f: unknown; out: WardRead | null | undefined } | null = null
  return (b: BoardRead | null | undefined, o: ObsDueRead | null | undefined, f: FluidsRead | null | undefined): WardRead | null | undefined => {
    if (last && last.b === b && last.o === o && last.f === f) return last.out
    const out = b && { ...b, ...(o ? { obs: o.stays } : {}), ...(f ? { fluids: f.stays } : {}) }
    last = { b, o, f, out }; return out
  }
}
