// What a pack may add to a row of a department's list besides its mark (spec/openCare.md §5.4, the core changes the owner approved on
// 2026-10-08): (a) a row action — one button of its own on the row, its card folded out inline under the row; (b) the lines due — the
// lines a screen prices itself and hands on its rows (a name, a quantity, an amount: plain numbers, no currency word) for row actions to
// read; (c) a soft check — single orders on a row marked waiting with a word and a tone, whose buttons the core greys while the row's
// other orders stay workable, and an inline "…anyway" card with a required reason the pack records; on the doctor's chart, the same
// word and tone alone on an open order's line (the owner extended (c) there on 2026-10-08). And (d)'s question, asked without
// naming a pack: does a pack this department uses declare that it charges. Only the packs the department uses speak, in its pack order,
// one each; a pack that fails, or whose data failed, says nothing. Never a server refusal, never a hold kept in core. Pure: a node test
// imports it (npm run test:board); the screens draw it through useRows.tsx.
import type { ComponentType } from 'react'
import type { Department, OrderRow, Organization, PackDeclared } from '../db/types'
import { isPackKey, stateTone, type MarkRow, type StateTone } from './marks'

/** where a row is drawn: the desk, the clinic queue (and its requests), the base bench, the bench's patient page, the page that answers
 *  one request (Request.tsx), a pack's own list built on the core ListRow, and the doctor's chart (its order lines: a soft check's word
 *  and tone only, never a button, a card or "…anyway"; owner, 2026-10-08) */
export type RowList = 'desk' | 'queue' | 'bench' | 'patient' | 'request' | 'screen' | 'chart'

/** (b) one line a department prices itself: what it is, how many, what it comes to (plain numbers), and the order it belongs to where it
 *  has one (so a soft check can wait per order) */
export interface DueLine { name: string; quantity: number; amount: number; order?: string }
/** a row as row actions and soft checks read it: the patient, the visit (none on a bench), the orders on the row, the lines it hands */
export interface PackRow extends MarkRow { key: string; lines?: DueLine[] }
export type RowDept = Pick<Department, 'id' | 'name' | 'packs' | 'declared'>
export interface RowCtx { list: RowList; dept: RowDept; org?: Organization; can: (action: string) => boolean }
/** what a pack reads of its own for a list, once per list (its own door; never another pack's): handed back as `data` */
export type RowLoad = (rows: PackRow[], ctx: RowCtx) => Promise<unknown>
/** the packs' data for a list, by pack: a pack that loads and has nothing here yet (loading, or failed) is absent and says nothing */
export type PackData = Readonly<Record<string, unknown>>

/** a row as a mark reads it, with its key and the lines it hands */
export const packRowOf = (key: string, m: MarkRow, lines?: DueLine[]): PackRow => ({ key, ...m, ...(lines?.length ? { lines } : {}) })
/** the list's patients and orders, as a load's key: the same rows read once */
export const rowsKey = (rows: PackRow[]) => [[...new Set(rows.map((r) => r.patient_id))].sort().join(','),
  [...new Set(rows.flatMap((r) => r.orders.map((o) => `${o.item}@${o.version}`)))].sort().join(',')].join('/')
const ready = (d: { pack: string; load?: RowLoad }, data: PackData) => !d.load || Object.prototype.hasOwnProperty.call(data, d.pack)
const used = <D extends { pack: string }>(defs: readonly D[], ctx: RowCtx) => ctx.dept.packs.flatMap((p) => defs.filter((d) => d.pack === p))

// ── (d) a pack that charges ──
/** does a pack this department uses declare that it charges (core.declare_pack … charges): asked without naming the pack */
export const chargesHere = (dept: Pick<Department, 'packs' | 'declared'> | null | undefined): boolean =>
  !!dept && dept.packs.some((p) => (dept.declared?.[p] as PackDeclared | undefined)?.charges === true)

// ── (b) lines due ──
const round2 = (n: number) => Math.round(n * 100) / 100
/** the lines as handed: each with words, a quantity above nothing and an amount of nothing or more, plain numbers to the hundredth;
 *  anything else is dropped, so a row action never reads a word where a number belongs */
export function dueLines(lines: readonly unknown[] | null | undefined): DueLine[] {
  return (lines ?? []).flatMap((x) => {
    const l = x as Partial<DueLine> | null
    const name = typeof l?.name === 'string' ? l.name.replace(/\s+/g, ' ').trim() : ''
    if (!name || typeof l?.quantity !== 'number' || typeof l.amount !== 'number' || !Number.isFinite(l.quantity) || !Number.isFinite(l.amount) || l.quantity <= 0 || l.amount < 0) return []
    return [{ name, quantity: round2(l.quantity), amount: round2(l.amount), ...(typeof l.order === 'string' && l.order ? { order: l.order } : {}) }]
  })
}
/** what the lines come to, to the hundredth */
export const dueTotal = (lines: readonly DueLine[]) => round2(lines.reduce((n, l) => n + l.amount, 0))

// ── (a) row actions ──
export interface RowActionCardProps { row: PackRow; ctx: RowCtx; data: unknown; close: (changed?: boolean) => void }
export interface RowAction {
  load?: RowLoad
  /** its button's word on this row, or none (null: not on this row, nor for this role) */
  button: (row: PackRow, ctx: RowCtx, data: unknown) => string | null | undefined
  /** folded out inline under the row; close(true) when it changed something, so the list's pack data is read again */
  Card: ComponentType<RowActionCardProps>
}
export interface RowActionDef extends RowAction { pack: string }
const actionDefs: RowActionDef[] = []
/** a pack's one row action (a second is refused, and so is one of the core or the base) */
export function registerRowAction(pack: string, a: RowAction): boolean {
  if (!isPackKey(pack)) { console.error(`openCare: row actions belong to a pack: ${pack}`); return false }
  if (actionDefs.some((d) => d.pack === pack)) { console.error(`openCare: ${pack} has its row action already`); return false }
  if (typeof a?.button !== 'function' || !a.Card) { console.error(`openCare: the row action of ${pack} needs a button and a card`); return false }
  actionDefs.push({ pack, ...a }); return true
}
export const rowActionDefs = (): readonly RowActionDef[] => actionDefs
export interface RowButton { pack: string; label: string }
/** a row's pack buttons: the packs this department uses, in its pack order, one each; a word of its own; a failing pack says nothing */
export function rowButtonsOf(defs: readonly RowActionDef[], row: PackRow, ctx: RowCtx, data: PackData): RowButton[] {
  return used(defs, ctx).flatMap((d) => {
    if (!ready(d, data)) return []
    let label: string | null | undefined = null
    try { label = d.button(row, ctx, data[d.pack]) } catch (e) { console.error(`openCare: the row action of ${d.pack} failed`, e) }
    const word = typeof label === 'string' ? label.replace(/\s+/g, ' ').trim() : ''
    return word ? [{ pack: d.pack, label: word }] : []
  })
}

// ── (c) soft checks ──
/** one order on the row waiting, in the pack's words (never an amount, a price or a number), with a state tone or none */
export interface Wait { order: string; word: string; tone?: StateTone }
export interface Anyway { row: PackRow; orders: string[]; reason: string; ctx: RowCtx }
export interface SoftCheck {
  load?: RowLoad
  waiting: (row: PackRow, ctx: RowCtx, data: unknown) => readonly Wait[] | null | undefined
  /** someone went ahead anyway with these of its waiting orders, for this reason: the pack records it (who and when are its own) */
  anyway: (a: Anyway) => Promise<unknown> | void
}
export interface SoftCheckDef extends SoftCheck { pack: string }
const checkDefs: SoftCheckDef[] = []
/** a pack's one soft check (a second is refused, and so is one of the core or the base) */
export function registerSoftCheck(pack: string, c: SoftCheck): boolean {
  if (!isPackKey(pack)) { console.error(`openCare: soft checks belong to a pack: ${pack}`); return false }
  if (checkDefs.some((d) => d.pack === pack)) { console.error(`openCare: ${pack} has its soft check already`); return false }
  if (typeof c?.waiting !== 'function' || typeof c.anyway !== 'function') { console.error(`openCare: the soft check of ${pack} needs waiting and anyway`); return false }
  checkDefs.push({ pack, ...c }); return true
}
export const softCheckDefs = (): readonly SoftCheckDef[] => checkDefs
/** an order waiting: the first word the packs give it (in the department's pack order), its tone, and every pack that holds it */
export interface OrderWait { word: string; tone?: StateTone; packs: string[] }
/** a word with a digit is dropped: an amount, a price or a number never reaches a list or the chart through a word */
const wordOf = (w: unknown) => { const s = typeof w === 'string' ? w.replace(/\s+/g, ' ').trim() : ''; return s && !/\d/.test(s) ? s : '' }
/** the row's waiting orders, by order: only orders on the row, from the packs the department uses, in its pack order; a failing pack,
 *  a pack whose data failed, a word with no letters or with a number say nothing */
export function waitsOf(defs: readonly SoftCheckDef[], row: PackRow, ctx: RowCtx, data: PackData): Map<string, OrderWait> {
  const out = new Map<string, OrderWait>(); const on = new Set(row.orders.map((o) => o.item))
  for (const d of used(defs, ctx)) {
    if (!ready(d, data)) continue
    let ws: readonly Wait[] | null | undefined = null
    try { ws = d.waiting(row, ctx, data[d.pack]) } catch (e) { console.error(`openCare: the soft check of ${d.pack} failed`, e); continue }
    for (const w of Array.isArray(ws) ? ws : []) {
      const word = wordOf(w?.word); if (!word || !on.has(w.order)) continue
      const had = out.get(w.order); const tone = stateTone(w.tone)
      if (!had) out.set(w.order, { word, ...(tone ? { tone } : {}), packs: [d.pack] })
      else if (!had.packs.includes(d.pack)) had.packs.push(d.pack)
    }
  }
  return out
}
/** an order still open (sent, started, held): the only ones a word may stand on, on the chart */
export const OPEN_ORDER = new Set(['active', 'in-progress', 'on-hold'])
/** the doctor's chart as the soft checks read it (owner, 2026-10-08): one row, the record's open orders; none open (or none read), no
 *  row, so nothing is asked */
export function chartRowOf(patient: string, orders: readonly OrderRow[] | null | undefined): PackRow[] {
  const open = (orders ?? []).filter((o) => OPEN_ORDER.has(o.status))
  return open.length ? [packRowOf(`chart ${patient}`, { patient_id: patient, visit_id: null, orders: open })] : []
}
/** the word an order shows on the chart: only an open order on the row, and only while a pack holds it and nobody went ahead */
export function chartWait(item: string, status: string | null | undefined, waits: ReadonlyMap<string, OrderWait>, ahead: ReadonlySet<string>): OrderWait | null {
  return status && OPEN_ORDER.has(status) && !isFree(item, waits, ahead) ? waits.get(item) ?? null : null
}
type Ordered = { order: Pick<OrderRow, 'item'> }
/** free to work: no pack holds it, or someone went ahead anyway */
export const isFree = (item: string, waits: ReadonlyMap<string, OrderWait>, ahead: ReadonlySet<string>) => !waits.has(item) || ahead.has(item)
/** the rows free to work */
export const freeRows = <R extends Ordered>(rows: R[], waits: ReadonlyMap<string, OrderWait>, ahead: ReadonlySet<string>) => rows.filter((r) => isFree(r.order.item, waits, ahead))
/** the waiting rows by their word, a view each (named by its word, D9), in the order the words first come */
export function byWord<R extends Ordered>(rows: R[], waits: ReadonlyMap<string, OrderWait>, ahead: ReadonlySet<string>): { word: string; tone?: StateTone; rows: R[] }[] {
  const out: { word: string; tone?: StateTone; rows: R[] }[] = []
  for (const r of rows) {
    if (isFree(r.order.item, waits, ahead)) continue
    const w = waits.get(r.order.item)!; const g = out.find((x) => x.word === w.word)
    if (g) g.rows.push(r); else out.push({ word: w.word, ...(w.tone ? { tone: w.tone } : {}), rows: [r] })
  }
  return out
}
/** the words a set of orders waits on, each once, in order: what a row says */
export function waitWords(items: readonly string[], waits: ReadonlyMap<string, OrderWait>, ahead: ReadonlySet<string>): { word: string; tone?: StateTone }[] {
  const out: { word: string; tone?: StateTone }[] = []
  for (const i of items) { if (isFree(i, waits, ahead)) continue; const w = waits.get(i)!; if (!out.some((x) => x.word === w.word)) out.push({ word: w.word, ...(w.tone ? { tone: w.tone } : {}) }) }
  return out
}
/** a stop on an order — not done, not given, declined (a step's or an answer's status: cancelled, rejected, failed) — is never greyed:
 *  what a form would write on a waiting order counts only when it is one */
export const isStop = (body: unknown) => ['cancelled', 'rejected', 'failed'].includes(String((body as { data?: { status?: unknown } } | null)?.data?.status ?? ''))
/** the "…anyway" reason: one line, required, at most 200 letters */
export const REASON_MAX = 200
export const reasonOf = (s: string) => s.replace(/\s+/g, ' ').trim()
export const reasonReady = (s: string) => { const r = reasonOf(s); return r.length > 0 && r.length <= REASON_MAX }
/** who records going ahead with these orders: each pack that holds any, with its own orders only */
export function anywayCalls(items: readonly string[], waits: ReadonlyMap<string, OrderWait>): { pack: string; orders: string[] }[] {
  const out: { pack: string; orders: string[] }[] = []
  for (const i of items) for (const p of waits.get(i)?.packs ?? []) { const c = out.find((x) => x.pack === p); if (c) { if (!c.orders.includes(i)) c.orders.push(i) } else out.push({ pack: p, orders: [i] }) }
  return out
}
/** go ahead anyway: the reason is required; each pack holding any of the orders records it for its own; none waiting is nothing to do */
export async function goAhead(defs: readonly SoftCheckDef[], row: PackRow, items: readonly string[], reason: string, waits: ReadonlyMap<string, OrderWait>, ctx: RowCtx): Promise<string[]> {
  if (!reasonReady(reason)) throw new Error('Say why, in a line')
  const calls = anywayCalls(items, waits)
  await Promise.all(calls.map((c) => defs.find((d) => d.pack === c.pack)!.anyway({ row, orders: c.orders, reason: reasonOf(reason), ctx })))
  return calls.flatMap((c) => c.orders)
}
