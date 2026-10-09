// Recovery's line on each bay (spec/openCare.md §5.8, Q48; Recovery's picture): minutes since the patient came in, Aldrete
// first → last (the base's score, a declared table the server adds up), pain (the base's vitals key), and "ready for the ward" at 9 or
// more, in words. Read from the pack's table, anaesthesia.recovery, for the department's patients (recoveryRead.ts, the line's own read:
// core change C7); the line is pure.
import type { PresenceRow } from '@core/db/types'
import type { TileCtx, TileWords } from '@core/screens/ward/tiles'
import { recoveryWords, type RecRow } from './model'

export function recoveryLine(row: PresenceRow, ctx: Pick<TileCtx, 'read'>, now = Date.now()): TileWords | null {
  return { words: recoveryWords((ctx.read as RecRow[] | undefined) ?? [], row.patient_id, row.checked_in_at, now) }
}
