// Obs due (spec/openCare.md §5.6, W1): what bedside.obs_due answers for each stay admitted here — its latest NEWS2, its level, the
// ward's rule and when the next obs are due — and the words drawn from it: "obs due 15:06" or "obs overdue 20 min" (amber) on the tile,
// right after its NEWS2 word, and the Obs due tab's list, the most overdue first. Only for 16 and over, as NEWS2 itself. Overdue is
// decided here from the server's due time and the clock; facts shown, never a stop. Pure: npm run test:ward2.
import type { PresenceRow } from '@core/db/types'
import { fits, type Who } from '@core/screens/chart/sections'
import type { TileCtx, TileWord, TileWords } from '@core/screens/ward/tiles'
import { ymd } from '@core/ui/time'
import { NEWS2_FIT } from './news2'
import { dueTime, LEVELS, type Level } from './response'

export interface ObsDue { score: string; version: string; total: number; band: string; at: string; threes: string[]; level: Level; every: number; tell?: string; due_at: string }
/** bedside.obs_due's answer: the patients it names, and each stay's obs due by the stay's item */
export interface ObsDueRead { patient_ids: string[]; stays: Record<string, ObsDue> }
/** a stay's obs due from data that carries them under obs (the board's data; the tab wraps its read so); malformed: none */
export function dueOf(data: unknown, item: string): ObsDue | undefined {
  const all = data && typeof data === 'object' ? (data as { obs?: unknown }).obs : undefined
  const d = all && typeof all === 'object' && Object.hasOwn(all, item) ? (all as Record<string, ObsDue>)[item] : undefined
  return d && typeof d === 'object' && typeof d.total === 'number' && typeof d.due_at === 'string' && !Number.isNaN(Date.parse(d.due_at))
    && LEVELS.includes(d.level) ? d : undefined
}
/** whole minutes past due (from 1), or null while not yet overdue */
export function overdueBy(d: Pick<ObsDue, 'due_at'>, now: number): number | null { const m = Math.floor((now - Date.parse(d.due_at)) / 60_000); return m >= 1 ? m : null }
/** "20 min", "2 h", "2 h 10 min" */
export const lateWords = (m: number) => m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`
/** the due word: "obs due 15:06" ("tomorrow" first when it falls on the next clinic day), or "obs overdue 20 min" in amber */
export function dueWord(d: Pick<ObsDue, 'due_at'>, now: number): TileWord {
  const m = overdueBy(d, now)
  if (m !== null) return { text: `obs overdue ${lateWords(m)}`, tone: 'warn' }
  return { text: `obs due ${dueTime(Date.parse(d.due_at), now)}` }
}
/** NEWS2 is for 16 and over (NEWS2_FIT), the rule tileWords colours by; an age not known fits */
export const adultHere = (identity: TileCtx['identity'] | undefined, now: number) =>
  !identity || fits(NEWS2_FIT, { sex: identity.gender, birth: identity.birth_date ?? null, today: ymd(new Date(now).toISOString()) })
/** the ward's rules for the line under the cards, only for 16 and over (a child's /v keeps piece 1's words, with no due time); the
 *  patient as the composer's record shows it, an age not known fits */
export const adultRules = <R>(rules: R | undefined, patient: { sex: string; born_on: string | null } | undefined, now = Date.now()): R | undefined =>
  rules && (!patient || fits(NEWS2_FIT, { sex: patient.sex as Who['sex'], birth: patient.born_on ?? null, today: ymd(new Date(now).toISOString()) })) ? rules : undefined
/** the tile's line with the due word right after its NEWS2 word (first when there is none); only an admitted adult's stay with obs due */
export function withDueWord(w: TileWords | null | undefined, row: PresenceRow, ctx: Pick<TileCtx, 'identity'>, data: unknown, now: number): TileWords | null | undefined {
  const d = row.kind === 'stay' && row.state === 'admitted' && adultHere(ctx.identity, now) ? dueOf(data, row.item) : undefined
  if (!d) return w
  const words = w ? (typeof w.words === 'string' ? [w.words] : [...w.words]) : []
  const at = words.findIndex((x) => (typeof x === 'string' ? x : x?.text ?? '').startsWith('NEWS2 '))
  words.splice(at + 1, 0, dueWord(d, now))
  return { words }
}
export interface DueRow { row: PresenceRow; due?: ObsDue; at: number; late: boolean; word: TileWord | null }
/** the Obs due list: every stay admitted here. First those with a NEWS2, by when their obs are due, the most overdue first; then those
 *  with none, by admission. late: past due, or no vitals at all an hour after admission (piece 1's tile rule); a child's due (adult()
 *  false) is dropped; while the read is missing (loading, failed) nothing is late */
export function dueRows(rows: readonly PresenceRow[], read: Pick<ObsDueRead, 'stays'> | null | undefined, now: number,
  adult: (row: PresenceRow) => boolean = () => true): DueRow[] {
  return rows.filter((r) => r.kind === 'stay' && r.state === 'admitted').map((row): DueRow => {
    const due = read && adult(row) ? dueOf({ obs: read.stays }, row.item) : undefined
    if (due) { const word = dueWord(due, now); return { row, due, at: Date.parse(due.due_at), late: !!word.tone, word } }
    const at = Date.parse(row.checked_in_at)
    return { row, at, late: !!read && !row.has_vitals && now - at >= 3_600_000, word: null }
  }).sort((a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || a.at - b.at || a.row.item.localeCompare(b.row.item))
}
