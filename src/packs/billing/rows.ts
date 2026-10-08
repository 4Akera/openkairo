// Billing on a department's list rows (spec/openCare.md §5.4, "Pay on a row", "A department's own priced lines", "Pay first"), as pure
// decisions: what billing reads for a list (billing.waiting, and who owes at this desk), the one button it puts on a row — Pay where the
// department takes payment here, Send to cashier where it does not and the row hands lines of its own — the lines a row still hands
// (none paid, none sent; a line sent again only when it changed), and the orders that wait under Pay first: an order billing holds
// unpaid (a charge, a sent line), or one the row prices itself and nobody paid. Billing never names the department the lines come from:
// any department's rows may hand them (core change (b)). No React here, so `npm run test:billing` reads it.
import { dueLines, type DueLine, type PackRow, type RowList, type Wait } from '@core/screens/rows'
import { cents, type Desk, type Handed } from './money'

/** what billing.waiting answers for a list's orders (sent: this department's own open bills, per order, when asked) */
export interface Waiting { waiting: string[]; paid?: string[]; ahead?: string[]; pay_first?: boolean; desk?: Desk; sent?: Record<string, number | string> }
/** what billing knows for a list: the desk (Takes payment here), Pay first, the orders waiting, paid, gone ahead, sent, and who owes here */
export interface RowData { desk: Desk; payFirst: boolean; waiting: ReadonlySet<string>; paid: ReadonlySet<string>; ahead: ReadonlySet<string>
  sent: ReadonlyMap<string, number>; owes: ReadonlyMap<string, { total: number; unpriced: number }> }
export const WORD = 'Waiting for payment'
export const noData = (desk: Desk = 'none'): RowData => ({ desk, payFirst: false, waiting: new Set(), paid: new Set(), ahead: new Set(), sent: new Map(), owes: new Map() })

/** billing's reading of a list, put together: the waiting read (if it was allowed) and who owes at this desk (if this person takes payment) */
export function rowData(desk: Desk, w: Waiting | null, owed: { patient_id: string; total: number | string; unpriced: number }[] | null): RowData {
  return { desk: w?.desk ?? desk, payFirst: !!w?.pay_first, waiting: new Set(w?.waiting ?? []), paid: new Set(w?.paid ?? []), ahead: new Set(w?.ahead ?? []),
    sent: new Map(Object.entries(w?.sent ?? {}).map(([k, v]) => [k, cents(v) ?? 0])),
    owes: new Map((owed ?? []).map((r) => [r.patient_id, { total: cents(r.total) ?? 0, unpriced: r.unpriced ?? 0 }])) }
}

/** the orders on these rows, each once (what the waiting read asks about), in reads of at most 500 */
export function ordersOf(rows: readonly PackRow[]): string[][] {
  const all = [...new Set(rows.flatMap((r) => r.orders.map((o) => o.item)))].sort(); const out: string[][] = []
  for (let i = 0; i < all.length; i += 500) out.push(all.slice(i, i + 500))
  return out
}
const lineCents = (l: DueLine) => cents(l.amount.toFixed(2)) ?? 0
/** the lines a row still hands: priced (above nothing), not paid; to take here (pay), none of an order already sent to the cashier (its
 *  open bill is paid instead); to send (send), an order's lines again only where they changed since they were sent. A line with no order
 *  is always handed (billing cannot tell it was paid) */
export function handedDue(row: Pick<PackRow, 'lines'>, d: RowData, mode: 'pay' | 'send'): DueLine[] {
  const ls = dueLines(row.lines).filter((l) => lineCents(l) > 0 && !(l.order && d.paid.has(l.order)))
  return ls.filter((l) => {
    if (!l.order || !d.sent.has(l.order)) return true
    if (mode === 'pay') return false
    return ls.filter((x) => x.order === l.order).reduce((n, x) => n + lineCents(x), 0) !== d.sent.get(l.order)
  })
}
/** the lines as the pay operation takes them (handed at this counter) */
export const asHanded = (ls: readonly DueLine[]): Handed[] => ls.map((l) => ({ name: l.name, quantity: l.quantity, amount: l.amount.toFixed(2), order_item: l.order ?? null }))
/** the lines as the send operation takes them (an open bill for the main cashier) */
export const asSent = (ls: readonly DueLine[]) => ls.map((l) => ({ name: l.name, quantity: l.quantity, amount: l.amount.toFixed(2), ...(l.order ? { order_item: l.order } : {}) }))
/** what the lines come to, in piastres */
export const centsOf = (ls: readonly DueLine[]) => ls.reduce((n, l) => n + lineCents(l), 0)

/** billing's button on a row: Pay where the department takes payment here and the patient owes this desk (its charges, its open bills)
 *  or the row hands lines, for whoever takes payment; Send to cashier where it does not and the row hands lines not yet sent, for whoever
 *  works the list; Sent to cashier once they are (the card says so); none otherwise */
export function rowButton(row: Pick<PackRow, 'patient_id' | 'lines' | 'orders'>, can: (action: string) => boolean, d: RowData): string | null {
  if (d.desk === 'own' || d.desk === 'everyone') {
    if (!can('write:billing.payment')) return null
    const o = d.owes.get(row.patient_id)
    return centsOf(handedDue(row, d, 'pay')) > 0 || (!!o && (o.total > 0 || o.unpriced > 0)) ? 'Pay' : null
  }
  if (!can('read:bench')) return null
  if (handedDue(row, d, 'send').length) return 'Send to cashier'
  return dueLines(row.lines).some((l) => l.order && d.sent.has(l.order)) ? 'Sent to cashier' : null
}

/** the row's orders waiting for payment (the soft check, core change (c)): those billing holds unpaid (Pay first on where the work is
 *  done: a charge, a sent line), and, under this department's own Pay first, those whose lines the row hands, priced and not paid; an
 *  order someone went ahead with anyway never waits again. On the doctor's chart, billing's own words only (the row hands nothing) */
export function rowWaits(row: Pick<PackRow, 'orders' | 'lines'>, list: RowList, d: RowData): Wait[] {
  const on = new Set(row.orders.map((o) => o.item)); const out = new Set<string>()
  for (const o of on) if (d.waiting.has(o) && !d.ahead.has(o)) out.add(o)
  if (d.payFirst && list !== 'chart') for (const l of dueLines(row.lines)) {
    if (l.order && on.has(l.order) && lineCents(l) > 0 && !d.paid.has(l.order) && !d.ahead.has(l.order)) out.add(l.order)
  }
  return [...out].map((order) => ({ order, word: WORD, tone: 'warn' as const }))
}

/** going ahead anyway with these orders: the lines the row hands for them, not yet sent or paid, go to the cashier first as an open bill,
 *  so the patient still owes them and the cashier sees the work was done before payment (chosen in the build, awaiting the owner) */
export const anywayLines = (row: Pick<PackRow, 'lines'>, orders: readonly string[]) =>
  dueLines(row.lines).filter((l) => !!l.order && orders.includes(l.order) && lineCents(l) > 0)
