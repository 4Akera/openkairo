// A pack's background work in words (spec/openCare.md §5.2 Off, Setup and guards): Settings → Packs shows a pack on again catching up
// ("catching up · 120 of 400 patients"), work that failed and is tried again, work parked after five tries, and the patients it is
// stale for; Retry is offered while any of it failed. Nothing fails silently. Pure: a node test reads it.
import type { PackWork } from '../../db/types'

export interface WorkLine { text: string; tone: 'info' | 'warn' | 'danger' }
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`

/** its lines, most pressing first, and whether Retry is offered */
export function workOf(w: PackWork): { lines: WorkLine[]; retry: boolean } {
  const lines: WorkLine[] = []
  if (w.parked > 0) lines.push({ text: `${n(w.parked, 'refresh', 'refreshes')} failed five times and stopped`, tone: 'danger' })
  if (w.failing > 0) lines.push({ text: `${n(w.failing, 'refresh', 'refreshes')} failed · trying again`, tone: 'warn' })
  if (w.catchUp) lines.push({ text: `catching up · ${w.catchUp.patients - w.catchUp.left} of ${n(w.catchUp.patients, 'patient')}`, tone: 'info' })
  else if (w.stale > 0) lines.push({ text: `${n(w.stale, 'patient')} to refresh`, tone: 'warn' })
  // a stale mark with nothing waiting (its work lost) is retried too: Retry queues it again
  return { lines, retry: w.parked + w.failing > 0 || (w.stale > 0 && w.waiting === 0 && !w.catchUp) }
}
