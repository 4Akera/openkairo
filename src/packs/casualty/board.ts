// Each ER stay's level and time (spec/openCare.md §5.6), from the pack's own read of the board (casualty.board, the owner's C1): its
// latest triage (the level, its scale, when) and when a doctor first wrote in the stay ("seen"). The tile's words, the Patients tab's
// row words, its order and its counted views, and the chart banner's word share them. Then where the patient goes, as decided ("for
// home", "for Medical Ward · boarding 40 min", "to Al Salam Hospital"), and "police case". The level's clock starts at triage (the
// Australasian scale's indicator is triage to medical assessment): red once past the level's time, or at once for level 1. Before
// triage the clock is the arrival's: amber under 15 minutes, red from 15 (the RCEM initial-assessment standard). Chosen by Claude
// at the owner's request, awaiting the owner. Pure: npm run test:casualty.
import type { PresenceRow } from '@core/db/types'
import type { BannerWord, WordsInput } from '@core/screens/chart/words'
import type { StateTone } from '@core/screens/marks'
import type { TileCtx, TileWord, TileWords } from '@core/screens/ward/tiles'
import { isLevel, isScale, levelWord, targetOf, toneOf, type Level, type Scale } from './scale'
import { dur, isAdmit, isTo, type Decided } from './where'

export { dur }
export interface StayFacts { triage?: { level: Level; scale: Scale; at: string }; seen_at?: string; decided?: Decided; police?: boolean }
export interface Board { patient_ids: string[]; stays: Record<string, StayFacts> }
/** minutes before an untriaged wait turns red */
export const UNTRIAGED_LIMIT = 15

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const time = (x: unknown): string | undefined => typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? x : undefined
const text = (x: unknown): string | undefined => typeof x === 'string' && x !== '' ? x : undefined
/** the standing decision, read defensively: an unknown where to, or no time or entry, is none */
function decidedOf(d: unknown): Decided | undefined {
  if (!obj(d) || !isTo(d.to) || !time(d.at) || !text(d.entry)) return undefined
  const x: Decided = { to: d.to, at: d.at as string, entry: d.entry as string }
  for (const k of ['department_id', 'facility', 'why', 'police_report'] as const) { const v = text(d[k]); if (v) x[k] = v }
  return x
}
/** the board's read, read defensively: anything not an object with a stays object is none; a triage without a real level or scale, or
 *  a decision with an unknown where to, is dropped */
export function boardOf(data: unknown): Board | null {
  if (!obj(data) || !obj(data.stays)) return null
  const stays: Record<string, StayFacts> = {}
  for (const [item, f] of Object.entries(data.stays)) {
    if (!obj(f)) continue
    const s: StayFacts = {}; const t = f.triage; const seen = time(f.seen_at)
    if (obj(t) && isLevel(t.level) && isScale(t.scale) && time(t.at)) s.triage = { level: t.level, scale: t.scale, at: t.at as string }
    if (seen) s.seen_at = seen
    const d = decidedOf(f.decided); if (d) s.decided = d
    if (typeof f.police === 'boolean') s.police = f.police
    stays[item] = s
  }
  return { patient_ids: Array.isArray(data.patient_ids) ? data.patient_ids.filter((x): x is string => typeof x === 'string') : [], stays }
}

const since = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))

/** a department's name, from the clinic's directory */
export type Names = Pick<TileCtx, 'org'>
const nameIn = (ctx: Names | undefined, id: string | undefined) => (id && ctx?.org?.departments.find((d) => d.id === id)?.name) || 'a ward'
/** where the patient goes, as decided: "for home" (green), "for Medical Ward" or "for the operating room" then "boarding 40 min",
 *  "to Al Salam Hospital"; then "police case" */
function moreWords(f: StayFacts | undefined, ctx: Names | undefined, now: number): TileWord[] {
  const out: TileWord[] = []; const d = f?.decided
  if (d?.to === 'home') out.push({ text: 'for home', tone: 'ok' })
  else if (d && isAdmit(d.to)) out.push({ text: d.to === 'operating_room' ? 'for the operating room' : `for ${nameIn(ctx, d.department_id)}` }, { text: `boarding ${dur(since(d.at, now))}` })
  else if (d?.to === 'other_facility') out.push({ text: `to ${d.facility ?? 'another facility'}` })
  if (f?.police) out.push({ text: 'police case' })
  return out
}

export interface RowWords { level: Level | null; words: { text: string; tone?: StateTone }[]; more: TileWord[]; past: boolean; triaged: boolean }
/** a stay's words: with no board, the time in the ER; not triaged, the wait since arrival (amber, red from 15 minutes); triaged, the
 *  level in its tone, then the wait since triage for a doctor (red past the level's time, or at once for level 1), or when seen. More:
 *  where the patient goes, as decided, and the police case */
export function rowWords(row: PresenceRow, board: Board | null, now: number, ctx?: Names): RowWords {
  const arrived = since(row.checked_in_at, now)
  if (!board) return { level: null, words: [{ text: `in the ER ${dur(arrived)}` }], more: [], past: false, triaged: false }
  const f = board.stays[row.item]; const t = f?.triage; const more = moreWords(f, ctx, now)
  if (!t) return { level: null, words: [{ text: `not triaged · ${dur(arrived)}`, tone: arrived >= UNTRIAGED_LIMIT ? 'danger' : 'warn' }], more, past: false, triaged: false }
  const lw = { text: levelWord(t.level), ...(toneOf(t.level) ? { tone: toneOf(t.level) } : {}) }
  if (f.seen_at) return { level: t.level, words: [lw, { text: `seen ${dur(since(f.seen_at, now))} ago` }], more, past: false, triaged: true }
  const m = since(t.at, now); const past = m > targetOf(t.scale, t.level)
  const wait = { text: row.place_id ? `no doctor · ${dur(m)}` : `waiting ${dur(m)}`, ...(t.level === 1 || past ? { tone: 'danger' as const } : {}) }
  return { level: t.level, words: [lw, wait], more, past, triaged: true }
}

/** the tile's words for a stay admitted here (none for a visit); before the board answers, the row alone */
export function tileWords(row: PresenceRow, ctx: Names, data: unknown, now: number): TileWords | null {
  if (row.kind !== 'stay' || row.state !== 'admitted') return null
  const w = rowWords(row, boardOf(data), now, ctx)
  return { words: [...w.words, ...w.more].map((x) => x.tone ? x : x.text) }
}

/** the list's order: not triaged first (the longest arrived first), then by level (most urgent first), then the longest since triage;
 *  with no board, by arrival */
export function order<R extends PresenceRow>(rows: readonly R[], board: Board | null, now: number): R[] {
  const arr = (r: R) => Date.parse(r.checked_in_at)
  if (!board) return [...rows].sort((a, b) => arr(a) - arr(b))
  // the minutes since triage, the longest first: the negative of the minutes sorts ascending
  const key = (r: R) => { const t = board.stays[r.item]?.triage; return t ? [1, t.level, -(now - Date.parse(t.at))] : [0, 0, arr(r)] }
  return [...rows].sort((a, b) => { const x = key(a); const y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || arr(a) - arr(b) })
}

export interface Views { all: number; untriaged: number; untriagedLong: number; past: number; toLeave: number }
/** a stay decided and still here: To leave */
export const toLeave = (row: PresenceRow, board: Board | null) => row.state === 'admitted' && !!board?.stays[row.item]?.decided
/** the counted views: All, Not triaged, Not triaged 15 minutes or more, Past the level's time (triaged, not seen, past), To leave */
export function views(rows: readonly PresenceRow[], board: Board | null, now: number): Views {
  const ws = rows.map((r) => ({ r, w: rowWords(r, board, now) }))
  const untriaged = board ? ws.filter((x) => !x.w.triaged) : []
  return { all: rows.length, untriaged: untriaged.length, untriagedLong: untriaged.filter((x) => since(x.r.checked_in_at, now) >= UNTRIAGED_LIMIT).length,
    past: ws.filter((x) => x.w.past).length, toLeave: rows.filter((r) => toLeave(r, board)).length }
}

/** the banner's word: the open stay here, its latest triage as "2 · Very urgent" in its tone */
export function levelBanner(x: WordsInput): BannerWord[] {
  const stay = x.rec.tables['base.presence']?.rows.find((r) => r.kind === 'stay' && r.state === 'admitted' && r.department_id === x.ctx.departmentId)
  if (!stay) return []
  const e = x.own.shown.find((y) => y.visit_id === stay.item && isLevel((y.data?.casualty as { level?: unknown } | undefined)?.level))
  if (!e) return []
  const level = (e.data!.casualty as { level: Level }).level; const tone = toneOf(level)
  return [{ word: levelWord(level), rank: 1, ...(tone ? { tone } : {}) }]
}
