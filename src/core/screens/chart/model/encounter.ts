// The center (chart-plan.md §3.2): this visit's or stay's items as signed sets, a stay's days, what came since yesterday or since Done,
// and the entries outside any visit. Pure: times in the clinic's zone through ymd (ui/time), never a cut ISO string.
import type { OrderRow, PresenceRow, ServerEntry, ServerRecord, TableRead } from '../../../db/types'
import { flagOfResult } from '../../../db/views'
import { ymd } from '../../../ui/time'
import { baseOf, countKinds, filterKind, groupBlocks, inRecord, isMove, itemsOf, type BlockGroup, type ChartItem, type ItemCtx, type Kind } from './items'

type Tables = Pick<ServerRecord, 'tables'>
export interface SetGroup {
  set_id: string; at: string; occurred_at: string        // at: when it was signed (recorded); occurred_at: its earliest clinical time
  author_id: string | null; department_id: string; items: ChartItem[]; groups: BlockGroup[]; moves: ServerEntry[]
}
export interface DayGroup { day: string; n: number; sets: SetGroup[] }   // n: day of the stay, day 1 = the admission day

/** the pool of versions every chart read shares: the lists' entries (a change draws the dose before it) */
export const listPool = (rec: Tables) => Object.values(rec.tables['base.lists']?.entries ?? {})

/** the encounter's entries: the page read by visit, and every entry of its orders — the bench writes steps and answers with no visit_id,
 *  so they join through base.orders (the demo's results, steps and dispenses all carry none) */
export function encounterEntries(page: ServerEntry[], rec: Tables, visitId: string): ServerEntry[] {
  const orders = rec.tables['base.orders']
  const joined = (orders?.rows ?? []).filter((o) => o.visit_id === visitId).flatMap((o) => o.source_entries.map((id) => orders!.entries[id]))
  return [...new Map([...joined, ...page].filter((e): e is ServerEntry => !!e).map((e) => [e.id, e])).values()]
}
/** this encounter's items: the page, the answers to its orders, open review rows; history from the lists (and the facts' cross-outs) */
export function encounterItems(page: ServerEntry[], rec: Tables, visitId: string, ctx: ItemCtx = {}): ChartItem[] {
  return itemsOf(encounterEntries(page, rec, visitId), { ...ctx, orders: rec.tables['base.orders'], reviews: rec.tables['base.review']?.rows ?? ctx.reviews,
    pool: [...listPool(rec), ...(ctx.pool ?? [])] })
}

/** the visit's or stay's own entries (base.presence: presence types are not in the record, so the page never has them), oldest first */
export function movesOf(rec: Tables, visitId: string): ServerEntry[] {
  const p = rec.tables['base.presence']; const row = p?.rows.find((r) => r.item === visitId)
  return (row?.source_entries ?? []).map((id) => p!.entries[id]).filter((e): e is ServerEntry => !!e).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
}
/** when a visit or stay began, in clinical time: its opening entry's occurred_at (an admission written late keeps its day), else the
 *  check-in's recorded time */
export function startOf(row: PresenceRow, p?: TableRead<PresenceRow>) { return p?.entries[row.item]?.occurred_at ?? row.checked_in_at }
const dayMs = 86_400_000
const dayDiff = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / dayMs)
const dayBefore = (d: string) => new Date(Date.parse(d) - dayMs).toISOString().slice(0, 10)   // a YYYY-MM-DD date, not a clinical instant
/** the day of a stay: day 1 is the admission day, in the clinic's time zone */
export const stayDay = (start: string, at: string = new Date().toISOString()) => Math.max(1, dayDiff(ymd(start), ymd(at)) + 1)

// moves that stand as a set of their own (a bed move, a transfer); calling and the like only head a set with something written
const SHOWN = new Set(['admitted', 'moved', 'transferred', 'discharged', 'back_to_waiting', 'left'])
/** items (and the encounter's moves) as signed sets, newest first: one card per Done or Sign */
export function bySet(items: ChartItem[], moves: ServerEntry[] = [], types?: ItemCtx['types']): SetGroup[] {
  const sets = new Map<string, SetGroup>()
  const set = (e: ServerEntry) => sets.get(e.set_id) ?? sets.set(e.set_id, { set_id: e.set_id, at: e.recorded_at, occurred_at: e.occurred_at, author_id: e.author_id ?? null,
    department_id: e.department_id, items: [], groups: [], moves: [] }).get(e.set_id)!
  for (const i of items) { const s = set(i.entry); s.items.push(i); if (i.at < s.occurred_at) s.occurred_at = i.at }
  for (const m of moves) if (isMove(m.type, types) && (sets.has(m.set_id) || SHOWN.has(baseOf(m.type, types)))) set(m).moves.push(m)
  for (const s of sets.values()) s.groups = groupBlocks(s.items)
  return [...sets.values()].sort((a, b) => b.at.localeCompare(a.at) || b.set_id.localeCompare(a.set_id))
}
/** a stay's days, newest first, every day from admission to today (or the discharge) — an empty day says so; a set lands on its clinical day */
export function byDay(sets: SetGroup[], start: string, end: string = new Date().toISOString()): DayGroup[] {
  const first = ymd(start); const days: DayGroup[] = []
  for (let d = ymd(end); d >= first; d = dayBefore(d)) days.push({ day: d, n: dayDiff(first, d) + 1, sets: [] })
  if (!days.length) days.push({ day: first, n: 1, sets: [] })
  for (const s of sets) { const d = ymd(s.occurred_at); (days.find((x) => x.day === d) ?? (d < first ? days[days.length - 1] : days[0])).sets.push(s) }
  for (const d of days) d.sets.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.at.localeCompare(a.at))
  return days
}

// ── what came since: a stay's since yesterday (by clinical day), a clinic patient back since Done (by arrival) ──
export type Window = { since: 'yesterday'; now?: string } | { since: 'done'; at: string }
export interface Digest { from: string; items: ChartItem[]; moves: ServerEntry[]; counts: Record<Kind | 'all', number>; critical: ChartItem[]; abnormal: ChartItem[]; started: ChartItem[] }
const fromOf = (w: Window) => w.since === 'done' ? w.at : ymd(new Date(Date.parse(w.now ?? new Date().toISOString()) - dayMs).toISOString())
/** in the window: since yesterday is yesterday's clinic date or later (when it happened); since Done is written after Done (when it came) */
export const inWindow = (e: Pick<ServerEntry, 'occurred_at' | 'recorded_at'>, w: Window) => w.since === 'done' ? e.recorded_at > w.at : ymd(e.occurred_at) >= fromOf(w)
export function sinceDigest(items: ChartItem[], moves: ServerEntry[], w: Window, types?: ItemCtx['types']): Digest {
  const got = items.filter((i) => !i.draft && inWindow(i.entry, w))
  const flag = (i: ChartItem) => i.family === 'result' && !i.hidden ? flagOfResult(i.entry, types) : null
  return { from: fromOf(w), items: got, moves: moves.filter((m) => SHOWN.has(baseOf(m.type, types)) && inWindow(m, w)), counts: countKinds(got),
    critical: got.filter((i) => flag(i) === 'critical'), abnormal: got.filter((i) => ['low', 'high', 'abnormal'].includes(flag(i) ?? '')),
    started: got.filter((i) => (i.family === 'problem' || i.family === 'medication') && i.entry.item_version === 1) }
}

/** "Outside a visit": the record's first page's entries with no visit (signed on another's patient, outside records) — an answer whose
 *  order has a visit is drawn in that visit's encounter, and a step inside its order, so neither is listed here (Record.tsx ByVisit kept) */
export function outsideOf(entries: ServerEntry[], rec: Tables, types?: ItemCtx['types']): ServerEntry[] {
  const o: TableRead<OrderRow> | undefined = rec.tables['base.orders']
  const inVisit = new Set((o?.rows ?? []).filter((r) => r.visit_id).flatMap((r) => r.source_entries))
  return entries.filter((e) => !e.visit_id && inRecord(e.type, types) && !inVisit.has(e.id) && baseOf(e.type, types) !== 'step')
}

// ── the kind filter over sets, and the Whole record's two views (organization.record_view) ──
/** the sets with only the items of a kind, regrouped; a set left empty goes, and with a filter on the moves say nothing */
export function filterSets(sets: SetGroup[], kind: Kind | 'all' | null | undefined): SetGroup[] {
  if (!kind || kind === 'all') return sets
  return sets.map((s) => { const items = filterKind(s.items, kind); return { ...s, items, groups: groupBlocks(items), moves: [] } }).filter((s) => s.items.length)
}
export interface VisitGroup { visit_id: string | null; at: string; sets: SetGroup[] }
/** by visit (a set is signed in one visit; an answer written with none goes with its order's visit, through base.orders): the newest
 *  activity first, the sets outside any visit last */
export function byVisit(sets: SetGroup[], orders?: Pick<OrderRow, 'item' | 'visit_id'>[]): VisitGroup[] {
  const by = new Map<string | null, VisitGroup>(); const ordered = new Map((orders ?? []).map((o) => [o.item, o.visit_id]))
  const visitOf = (i: ChartItem) => i.visit_id ?? (i.answers_order ? ordered.get(i.answers_order) ?? null : null)
  for (const s of sets) { const v = s.items.map(visitOf).find(Boolean) ?? null; const g = by.get(v) ?? by.set(v, { visit_id: v, at: s.at, sets: [] }).get(v)!
    g.sets.push(s); if (s.at > g.at) g.at = s.at }
  return [...by.values()].sort((a, b) => Number(a.visit_id === null) - Number(b.visit_id === null) || b.at.localeCompare(a.at))
}
/** by the clinic's day each set happened on, the newest first */
export function byDate(sets: SetGroup[]): { day: string; sets: SetGroup[] }[] {
  const by = new Map<string, SetGroup[]>()
  for (const s of sets) { const d = ymd(s.occurred_at); by.set(d, [...(by.get(d) ?? []), s]) }
  return [...by.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([day, ss]) => ({ day, sets: ss }))
}
