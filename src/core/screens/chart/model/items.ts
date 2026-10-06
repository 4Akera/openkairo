// The chart's items (chart-plan.md §1.3–§1.4): entries folded by item — every version, crossed out, corrected — an order carrying its
// steps and answers, an answer knowing its order, open review rows attached. The blocks, the encounter, the Whole record and the drafts
// all draw from these. Pure: no React, no window.
import type { OrderRow, Organization, ReviewRow, ServerEntry, TableRead } from '../../../db/types'
import { draftEntries, type Draft, type Where } from '../../../db/entries'

export type Family = 'note' | 'vitals' | 'result' | 'medication' | 'order' | 'problem' | 'allergy' | 'review' | 'given' | 'procedure' | 'observation' | 'alert' | 'died' | 'other'
/** the kind filter's buckets, in the order the chips show */
export type Kind = 'notes' | 'results' | 'vitals' | 'medicines' | 'orders' | 'problems' | 'allergies' | 'other'
export const KINDS: Kind[] = ['notes', 'results', 'vitals', 'medicines', 'orders', 'problems', 'allergies', 'other']
/** the entry types a kind reads (the Whole record passes them to the reader; a pack's type follows its base_type there) */
export const KIND_TYPES: Record<Kind, string[]> = { notes: ['note'], results: ['result'], vitals: ['vitals'], medicines: ['medication', 'given', 'list_review'], orders: ['order'],
  problems: ['problem', 'list_review'], allergies: ['allergy', 'list_review'], other: ['procedure', 'observation', 'alert', 'pregnancy', 'breastfeeding', 'score', 'died', 'crossed_out'] }

export interface ChartItem {
  id: string; item: string; type: string; base: string; family: Family
  entry: ServerEntry                 // the version drawn: the latest one the page holds (a placeholder when hidden)
  versions: ServerEntry[]            // earlier versions the client holds, oldest first
  later: ServerEntry[]               // versions written after the one drawn (a past visit's medicine changed since), oldest first
  crossed?: { reason: string; text?: string; by: string | null; at: string }
  corrected: boolean; hidden: boolean; set_id: string; visit_id: string | null; at: string   // at: clinical time (occurred_at)
  order?: { row: OrderRow | null; steps: ServerEntry[]; answers: ServerEntry[]; stepKeys: string[] }   // family 'order'
  answers_order?: string             // a result or note answering an order: the order's item
  review?: ReviewRow                 // an open review row for me or my department
  isNew?: boolean
  draft?: Draft                      // a draft drawn as a block (its entries built by the composer's own draftEntries)
}
export interface BlockGroup { kind: 'rx' | 'orders' | 'problems' | 'allergies' | 'single'; items: ChartItem[] }
export interface ItemCtx {
  types?: Organization['types']; services?: Organization['services']
  me?: string; departmentId?: string  // whose review rows count as mine
  orders?: TableRead<OrderRow>        // base.orders and its entries: steps and answers join their order through it
  reviews?: ReviewRow[]               // base.review's open rows
  pool?: ServerEntry[]                // more versions the client holds (base.lists entries, crossed-out facts): history, never items of their own
  newSince?: string                   // an item recorded after this is new (a clinic patient back: since Done)
}

// the presence moves and the privacy and review marks are not in the record (in_record = false): a set head shows the moves
export const MOVES = new Set(['checked_in', 'admitted', 'here', 'not_here', 'called', 'seen', 'back_to_waiting', 'away', 'urgent', 'assigned', 'transferred', 'left', 'done', 'moved', 'discharged'])
const NOT_IN_RECORD = new Set([...MOVES, 'reviewed', 'private', 'not_private', 'opened_anyway'])
export const FAMILY: Record<string, Family> = { note: 'note', vitals: 'vitals', result: 'result', medication: 'medication', order: 'order', problem: 'problem', allergy: 'allergy',
  list_review: 'review', given: 'given', procedure: 'procedure', observation: 'observation', alert: 'alert', died: 'died',
  pregnancy: 'observation', breastfeeding: 'observation', score: 'observation' }
/** a type's base (the registry's base_type: pharmacy.dispense → step), else the type itself */
export const baseOf = (type: string, types?: ItemCtx['types']) => types?.find((t) => t.key === type)?.base_type ?? type
export const family = (type: string, types?: ItemCtx['types']): Family => FAMILY[baseOf(type, types)] ?? 'other'
export const inRecord = (type: string, types?: ItemCtx['types']) => types?.find((t) => t.key === type)?.in_record ?? !NOT_IN_RECORD.has(baseOf(type, types))
export const isMove = (type: string, types?: ItemCtx['types']) => MOVES.has(baseOf(type, types))
/** a review row is mine when it names me, or names no one and my department (a flag) */
export const isForMe = (r: ReviewRow, me?: string, departmentId?: string) => r.for_user ? r.for_user === me : r.for_department === departmentId
const byVersion = (a: ServerEntry, b: ServerEntry) => a.item_version - b.item_version || a.recorded_at.localeCompare(b.recorded_at)
const newest = (a: ServerEntry, b: ServerEntry) => b.recorded_at.localeCompare(a.recorded_at) || b.id.localeCompare(a.id)

/** which order each answer or step item answers: from base.orders (its source entries) and from the entries' own links */
function ordersOf(all: Map<string, ServerEntry>, ctx: ItemCtx) {
  const of = new Map<string, string>()
  for (const r of ctx.orders?.rows ?? []) for (const id of r.source_entries) { const e = ctx.orders!.entries[id] ?? all.get(id); if (e && e.item !== r.item) of.set(e.item, r.item) }
  for (const e of all.values()) {
    const t = e.relation === 'answers' && e.refers_to ? all.get(e.refers_to) : undefined
    if (t && baseOf(t.type, ctx.types) === 'order' && !of.has(e.item)) of.set(e.item, t.item)
  }
  return of
}

/** entries → items: one per item the entries name (versions from the pool fill its history); steps fold into their order when it is
 *  among the items, and a step whose order is not stays an item of its own so nothing disappears. Newest first, as the reader pages. */
export function itemsOf(entries: ServerEntry[], ctx: ItemCtx = {}): ChartItem[] {
  const all = new Map<string, ServerEntry>()
  for (const e of [...(ctx.pool ?? []), ...Object.values(ctx.orders?.entries ?? {}), ...entries]) all.set(e.id, e)
  const versions = new Map<string, ServerEntry[]>()
  for (const e of all.values()) versions.set(e.item, [...(versions.get(e.item) ?? []), e])
  const orderOf = ordersOf(all, ctx)
  const here = new Set(entries.filter((e) => inRecord(e.type, ctx.types)).map((e) => e.item))
  const onPage = new Set(entries.map((e) => e.id))
  const out: ChartItem[] = []
  for (const item of here) {
    const vs = (versions.get(item) ?? []).sort(byVersion)
    const crossedOut = (v: ServerEntry) => baseOf(v.type, ctx.types) === 'crossed_out'
    const content = vs.filter((v) => !crossedOut(v))
    // the version drawn: the latest the page holds, else the latest known; a cross-out alone (its content paged out) is drawn as itself
    const drawn = [...content].reverse().find((v) => onPage.has(v.id)) ?? content[content.length - 1]
    const shown = drawn ?? vs[vs.length - 1]
    const b = baseOf((content[0] ?? shown).type, ctx.types)
    if (b === 'step' && orderOf.has(item) && here.has(orderOf.get(item)!)) continue          // drawn inside its order
    const x = [...vs].reverse().find((v) => crossedOut(v) && (!drawn || v.item_version > drawn.item_version))
    const i: ChartItem = { id: shown.id, item, type: shown.type, base: b, family: FAMILY[b] ?? 'other', entry: shown,
      versions: content.filter((v) => v.item_version < shown.item_version), later: content.filter((v) => v.item_version > shown.item_version),
      crossed: x ? { reason: String(x.data?.reason ?? 'other'), text: x.data?.text as string | undefined, by: x.author_id ?? null, at: x.recorded_at } : undefined,
      corrected: !!drawn && drawn.item_version > 1 && !!drawn.replaces, hidden: shown.hidden, set_id: shown.set_id, visit_id: shown.visit_id, at: shown.occurred_at }
    if (i.family === 'order') {
      const row = ctx.orders?.rows.find((r) => r.item === item) ?? null
      const joined = [...all.values()].filter((e) => orderOf.get(e.item) === item)
      const svc = ctx.services?.find((s) => s.id === (row?.service_id ?? (shown.data?.service as { id?: string } | undefined)?.id))
      const answers = row ? row.answers.map((id) => all.get(id)).filter((e): e is ServerEntry => !!e)
        : [...new Set(joined.filter((e) => baseOf(e.type, ctx.types) !== 'step').map((e) => e.item))].map((it) => (versions.get(it) ?? []).sort(byVersion).at(-1)!)
      i.order = { row, steps: joined.filter((e) => baseOf(e.type, ctx.types) === 'step').sort((a, c) => a.recorded_at.localeCompare(c.recorded_at)),
        answers: answers.filter((e) => baseOf(e.type, ctx.types) !== 'crossed_out'), stepKeys: svc?.steps ?? [] }
    }
    if (orderOf.has(item) && b !== 'step') i.answers_order = orderOf.get(item)
    const review = ctx.reviews?.find((r) => r.item === item && isForMe(r, ctx.me, ctx.departmentId))
    if (review) i.review = review
    if (ctx.newSince) i.isNew = shown.recorded_at > ctx.newSince
    out.push(i)
  }
  return out.sort((a, c) => newest(a.entry, c.entry))
}

/** drafts drawn as blocks: the composer's own draftEntries builds the exact type and data Done will write */
export function draftItems(drafts: Draft[], w: Where, ctx: ItemCtx & { now?: string } = {}): ChartItem[] {
  const at = ctx.now ?? new Date().toISOString(); const pool = ctx.pool ?? []
  return drafts.flatMap((d) => {
    const es = draftEntries(d, w).map((e): ServerEntry => {
      const was = e.relation === 'changes' || e.replaces ? pool.find((x) => x.id === (e.replaces ?? e.refers_to)) : undefined
      return { id: e.id, type: e.type, type_version: 1, item: was?.item ?? (e.relation === 'changes' && e.refers_to ? e.refers_to : e.id), item_version: (was?.item_version ?? 0) + 1,
        patient_id: e.patient_id, department_id: e.department_id, visit_id: e.visit_id ?? null, occurred_at: at, precision: 'second', recorded_at: at, set_id: 'draft',
        replaces: e.replaces ?? null, refers_to: e.refers_to ?? null, relation: e.relation ?? null, source: 'staff', hidden: false, line: d.line ?? '',
        data: e.data as unknown as Record<string, unknown>, author_id: ctx.me }
    })
    const pos = (i: ChartItem) => es.findIndex((e) => e.id === i.entry.id)                        // in the order Done writes them
    return itemsOf(es, { ...ctx, newSince: undefined }).sort((a, b) => pos(a) - pos(b)).map((i) => ({ ...i, draft: d }))
  })
}

// ── the kind filter ──
const KIND_OF: Partial<Record<Family, Kind>> = { note: 'notes', result: 'results', vitals: 'vitals', medication: 'medicines', given: 'medicines', order: 'orders',
  problem: 'problems', allergy: 'allergies' }
const LIST_KIND: Record<string, Kind> = { problems: 'problems', medications: 'medicines', allergies: 'allergies' }
/** an item's bucket; a list review goes with its list */
export const kindOf = (i: ChartItem): Kind => i.family === 'review' ? LIST_KIND[String(i.entry.data?.list)] ?? 'other' : KIND_OF[i.family] ?? 'other'
export function countKinds(items: ChartItem[]): Record<Kind | 'all', number> {
  const n = Object.fromEntries([['all', items.length], ...KINDS.map((k) => [k, 0])]) as Record<Kind | 'all', number>
  for (const i of items) n[kindOf(i)]++
  return n
}
export const filterKind = (items: ChartItem[], kind: Kind | 'all' | null | undefined) => !kind || kind === 'all' ? items : items.filter((i) => kindOf(i) === kind)

// ── within a signed set: the paper forms ──
const ORDER_OF: Family[] = ['vitals', 'result', 'problem', 'allergy', 'medication', 'order', 'given', 'procedure', 'observation', 'alert', 'died', 'note', 'review', 'other']
const GROUP: Partial<Record<Family, BlockGroup['kind']>> = { medication: 'rx', problem: 'problems', allergy: 'allergies', order: 'orders' }
/** one set's items as blocks: its medicines are one prescription (with a dispense order about one of them), its orders one requisition,
 *  its problems and its allergies one block each; everything else stands alone */
export function groupBlocks(items: ChartItem[]): BlockGroup[] {
  const meds = new Set(items.filter((i) => i.family === 'medication').flatMap((i) => [i.item, i.entry.id]))
  const about = (i: ChartItem) => i.family === 'order' && (meds.has(i.order?.row?.about_item ?? '') || (i.entry.relation === 'about' && meds.has(i.entry.refers_to ?? '')))
  const groups = new Map<string, BlockGroup>(); const out: BlockGroup[] = []
  const rank = (i: ChartItem) => ORDER_OF.indexOf(about(i) ? 'medication' : i.family)
  for (const i of [...items].sort((a, b) => rank(a) - rank(b))) {
    const kind = about(i) ? 'rx' : GROUP[i.family] ?? 'single'
    if (kind === 'single') { out.push({ kind, items: [i] }); continue }
    const g = groups.get(kind) ?? { kind, items: [] }
    if (!groups.has(kind)) { groups.set(kind, g); out.push(g) }
    g.items.push(i)
  }
  return out
}
