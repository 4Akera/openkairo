// Ward nursing's handover (spec/openCare.md §5.6, W3a): what bedside.handover answers (each admitted stay's active alerts and its last
// handover), the shift being handed over and the next (from the ward's shifts, with a grace: handovers run over the change of shift),
// whether a stay is handed over this shift, the facts on each row (the ward tile's own words, the alerts, the orders out: nobody types
// them), the base's note one bed's handover becomes (kind handover), and the tab's rows in bed order. Pure: npm run test:handover.
import type { PresenceRow } from '@core/db/types'
import type { TileWord, TileWords } from '@core/screens/ward/tiles'
import { placeOf, shiftLabels } from './balance'

/** bedside.handover's answer: each admitted stay's active alerts and its latest handover */
export interface HandoverLast { at: string; by?: string; heading?: string; text?: string }
export interface HandoverStay { alerts: string[]; last?: HandoverLast }
export interface HandoverRead { patient_ids: string[]; stays: Record<string, HandoverStay> }
/** a stay's part of the answer, malformed parts dropped (alerts not a list of words: none; last with no time: none) */
export function handoverOf(read: Pick<HandoverRead, 'stays'> | null | undefined, item: string): HandoverStay | undefined {
  const s = read?.stays && typeof read.stays === 'object' && Object.hasOwn(read.stays, item) ? read.stays[item] : undefined
  if (!s || typeof s !== 'object') return undefined
  const alerts = Array.isArray(s.alerts) ? s.alerts.filter((a): a is string => typeof a === 'string' && !!a.trim()) : []
  const last = s.last && typeof s.last === 'object' && typeof s.last.at === 'string' && !Number.isNaN(Date.parse(s.last.at)) ? s.last : undefined
  return { alerts, ...(last ? { last } : {}) }
}
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/** handovers run over the change of shift: a time up to this many minutes after a shift's end still belongs to it (Claude's number,
 *  awaiting the owner) */
export const GRACE = 30
const back = (t: number) => new Date(t - GRACE * 60000).toISOString()
/** the shift now and the next, from the ward's shift starts (minutes after midnight, earliest first): "08–14" → "14–20", handed over at
 *  "14:00"; day and shift: the place (now − GRACE) has (balance.ts placeOf: a time closes the shift it ends) */
export interface ShiftNow { from: string; to: string; at: string; day: string; shift: number }
export function shiftNow(s: readonly number[], now: number): ShiftNow {
  const p = placeOf(back(now), s); const labels = shiftLabels(s); const next = (p.shift + 1) % s.length
  return { from: labels[p.shift], to: labels[next], at: clock(s[next]), day: p.day, shift: p.shift }
}
/** handed over this shift: the stay's latest handover, moved back by GRACE, closes the same shift as now (13:55, 14:00, 14:05 are
 *  08–14's) */
export function handedOver(last: HandoverLast | undefined, s: readonly number[], sh: Pick<ShiftNow, 'day' | 'shift'>): boolean {
  if (!last || typeof last.at !== 'string' || Number.isNaN(Date.parse(last.at))) return false
  const p = placeOf(back(Date.parse(last.at)), s); return p.day === sh.day && p.shift === sh.shift
}
/** the row's facts, nobody types them: the ward's tile words as they are, each active alert in amber, the orders not yet answered */
export function factsOf(line: TileWords | null | undefined, alerts: readonly string[], ordersOut: number): TileWord[] {
  const words = line ? (typeof line.words === 'string' ? [line.words] : Array.isArray(line.words) ? line.words : []) : []
  return [...words.flatMap((w): TileWord[] => { const text = (typeof w === 'string' ? w : w?.text)?.trim()
      return text ? [typeof w === 'string' || !w.tone ? { text } : { text, tone: w.tone }] : [] }),
    ...alerts.filter((a) => a.trim()).map((a): TileWord => ({ text: a.trim(), tone: 'warn' })),
    ...(ordersOut > 0 ? [{ text: `${ordersOut} order${ordersOut === 1 ? '' : 's'} out` }] : [])]
}
export interface Boxes { shift: string; next: string }
export const NO_BOXES: Boxes = { shift: '', next: '' }
/** the base's note for one bed: kind handover, the shifts in its heading, the facts at handover and the two boxes; none when both
 *  boxes are empty */
export function handoverNote(facts: readonly TileWord[], b: Boxes, sh: Pick<ShiftNow, 'from' | 'to'>): { kind: 'handover'; heading: string; text: string } | null {
  const shift = b.shift.trim(); const next = b.next.trim()
  if (!shift && !next) return null
  const text = [facts.length ? `At handover: ${facts.map((f) => f.text).join(' · ')}` : null, shift ? `This shift: ${shift}` : null,
    next ? `For the next shift: ${next}` : null].filter((x): x is string => !!x).join('\n')
  return { kind: 'handover', heading: `Handover ${sh.from} → ${sh.to}`, text }
}
/** the tab's rows: every stay admitted here, the beds by their position, then those with no bed by admission; todo: only those not
 *  handed over this shift. start: when a stay began (the tab passes its clinical start; checked_in_at otherwise) */
export interface HandoverRow { row: PresenceRow; stay?: HandoverStay; done: boolean }
export function handoverRows(rows: readonly PresenceRow[], read: Pick<HandoverRead, 'stays'> | null | undefined, s: readonly number[],
  sh: Pick<ShiftNow, 'day' | 'shift'>, position: (r: PresenceRow) => number | null, todo = false, start: (r: PresenceRow) => string = (r) => r.checked_in_at): HandoverRow[] {
  return rows.filter((r) => r.kind === 'stay' && r.state === 'admitted').map((row) => { const stay = handoverOf(read, row.item)
      return { row, ...(stay ? { stay } : {}), done: handedOver(stay?.last, s, sh) } })
    .filter((x) => !todo || !x.done)
    .sort((a, b) => { const pa = position(a.row); const pb = position(b.row)
      return (pa === null ? 1 : 0) - (pb === null ? 1 : 0) || (pa ?? 0) - (pb ?? 0) || start(a.row).localeCompare(start(b.row)) || a.row.item.localeCompare(b.row.item) })
}
