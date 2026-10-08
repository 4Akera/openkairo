// Billing on a department's list rows (spec/openCare.md §5.4, "Pay on a row", "A department's own priced lines", "Pay first"), as pure
// decisions: what billing reads for a list (billing.waiting, and who owes at this desk), the one button it puts on a row — Pay where the
// department takes payment here, Send to cashier where it does not and the row hands lines of its own — the lines a row still hands, and
// the orders that wait under Pay first: an order billing holds unpaid (a charge, a sent line), or one the row prices itself and nobody
// paid in full. A row hands what each order comes to so far (a medicine given in part: the part given and the rest to give); billing
// hands on only the rest beyond what it already holds of that order — paid, and, to pay here, owed on its open bill — so a rest given
// later is charged in addition, a line left unticked stays owed, and nothing is handed twice. Billing never names the department the
// lines come from: any department's rows may hand them (core change (b)). No React here, so `npm run test:billing` reads it.
import { dueLines, type DueLine, type PackRow, type Wait } from '@core/screens/rows'
import { cents, wire, type Desk, type Handed } from './money'

/** a line billing holds of this department's own for an order: on a payment that stands (paid), or owed on its open bill */
export interface HeldLine { name: string; quantity: number | string; amount: number | string; paid: boolean }
/** what billing holds of one order's own lines: paid, owed on its open bill, and the lines themselves */
export interface Own { paid: number | string; sent: number | string; lines: HeldLine[] }
/** what billing.waiting answers for a list's orders (own: this department's own lines per order, when asked) */
export interface Waiting { waiting: string[]; ahead?: string[]; pay_first?: boolean; desk?: Desk; own?: Record<string, Own> }
interface Held { paid: number; sent: number; lines: { name: string; quantity: number; amount: number; paid: boolean }[] }
/** what billing knows for a list: the desk (Takes payment here), Pay first, the orders it holds waiting and gone ahead, what it holds of
 *  each order's own lines (in piastres), and who owes here */
export interface RowData { desk: Desk; payFirst: boolean; waiting: ReadonlySet<string>; ahead: ReadonlySet<string>; own: ReadonlyMap<string, Held>
  owes: ReadonlyMap<string, { total: number; unpriced: number }> }
export const WORD = 'Waiting for payment'
export const noData = (desk: Desk = 'none'): RowData => ({ desk, payFirst: false, waiting: new Set(), ahead: new Set(), own: new Map(), owes: new Map() })

/** billing's reading of a list, put together: the waiting read (if it was allowed) and who owes at this desk (if this person takes payment) */
export function rowData(desk: Desk, w: Waiting | null, owed: { patient_id: string; total: number | string; unpriced: number }[] | null): RowData {
  return { desk: w?.desk ?? desk, payFirst: !!w?.pay_first, waiting: new Set(w?.waiting ?? []), ahead: new Set(w?.ahead ?? []),
    own: new Map(Object.entries(w?.own ?? {}).map(([k, v]) => [k, { paid: cents(v.paid) ?? 0, sent: cents(v.sent) ?? 0,
      lines: (v.lines ?? []).map((l) => ({ name: l.name, quantity: Number(l.quantity), amount: cents(l.amount) ?? 0, paid: !!l.paid })) }])),
    owes: new Map((owed ?? []).map((r) => [r.patient_id, { total: cents(r.total) ?? 0, unpriced: r.unpriced ?? 0 }])) }
}

/** the orders on these rows, each once (what the waiting read asks about), in reads of at most 500 */
export function ordersOf(rows: readonly PackRow[]): string[][] {
  const all = [...new Set(rows.flatMap((r) => r.orders.map((o) => o.item)))].sort(); const out: string[][] = []
  for (let i = 0; i < all.length; i += 500) out.push(all.slice(i, i + 500))
  return out
}
const lineCents = (l: Pick<DueLine, 'amount'>) => Math.round(l.amount * 100)
/** what the lines come to, in piastres */
export const centsOf = (ls: readonly Pick<DueLine, 'amount'>[]) => ls.reduce((n, l) => n + lineCents(l), 0)
const round2 = (n: number) => Math.round(n * 100) / 100
/** one order's lines by name: the same name once, its quantities and amounts added */
function byName(ls: readonly DueLine[]): DueLine[] {
  const out: DueLine[] = []
  for (const l of ls) { const x = out.find((y) => y.name === l.name)
    if (x) { x.quantity = round2(x.quantity + l.quantity); x.amount = (lineCents(x) + lineCents(l)) / 100 } else out.push({ ...l }) }
  return out
}
/** what one order's lines come to beyond what billing holds of it: by name, the quantity not held yet, at the line's own price; where what
 *  is held is not told by name (a name not handed, more than handed), the difference of the sums, as one line (chosen in the build,
 *  awaiting the owner) */
export function restOf(handed: readonly DueLine[], held: readonly { name: string; quantity: number; amount: number }[]): DueLine[] {
  const h = byName(handed); if (!held.length || !h.length) return h
  const had = new Map<string, number>(); for (const x of held) had.set(x.name, round2((had.get(x.name) ?? 0) + x.quantity))
  if ([...had].every(([n, q]) => q <= (h.find((l) => l.name === n)?.quantity ?? 0))) return h.flatMap((l) => {
    const q = round2(l.quantity - (had.get(l.name) ?? 0)); return q > 0 ? [{ ...l, quantity: q, amount: Math.round(lineCents(l) * q / l.quantity) / 100 }] : [] })
  const left = centsOf(h) - centsOf(held)
  return left > 0 ? [{ name: `${h.map((l) => l.name).join(', ')} · rest`, quantity: 1, amount: left / 100, ...(h[0].order ? { order: h[0].order } : {}) }] : []
}

/** the lines a row still hands, and with them what it knew billing held of each order (basis: paid, and to pay here owed on its open bill,
 *  as the server checks it): priced (above nothing); to take here (pay), each order's rest beyond what is paid and on its open bill (that
 *  bill is paid as itself); to send (send), each order's rest beyond what is paid, only where it is not what its open bill holds already
 *  (a resend replaces what is not paid). A line with no order is always handed (billing cannot tell it was paid) */
export function dueOf(row: Pick<PackRow, 'lines'>, d: RowData, mode: 'pay' | 'send'): { lines: DueLine[]; basis: Record<string, string> } {
  const ls = dueLines(row.lines).filter((l) => lineCents(l) > 0); const lines: DueLine[] = []; const basis: Record<string, string> = {}
  for (const o of [...new Set(ls.flatMap((l) => l.order ? [l.order] : []))]) {
    const held = d.own.get(o); const sent = held?.sent ?? 0
    const rest = restOf(ls.filter((l) => l.order === o), (held?.lines ?? []).filter((x) => mode === 'pay' || x.paid).map((x) => ({ ...x, amount: x.amount / 100 })))
    if (!rest.length || (mode === 'send' && centsOf(rest) === sent)) continue
    lines.push(...rest); basis[o] = wire((held?.paid ?? 0) + (mode === 'pay' ? sent : 0))
  }
  return { lines: [...lines, ...ls.filter((l) => !l.order)], basis }
}
/** the lines a row still hands (dueOf's lines) */
export const handedDue = (row: Pick<PackRow, 'lines'>, d: RowData, mode: 'pay' | 'send') => dueOf(row, d, mode).lines
/** the lines as the pay operation takes them (handed at this counter) */
export const asHanded = (ls: readonly DueLine[]): Handed[] => ls.map((l) => ({ name: l.name, quantity: l.quantity, amount: l.amount.toFixed(2), order_item: l.order ?? null }))
/** the lines as the send operation takes them (an open bill for the main cashier) */
export const asSent = (ls: readonly DueLine[]) => ls.map((l) => ({ name: l.name, quantity: l.quantity, amount: l.amount.toFixed(2), ...(l.order ? { order_item: l.order } : {}) }))

/** billing's button on a row: Pay where the department takes payment here and the patient owes this desk (its charges, its open bills)
 *  or the row hands lines, for whoever takes payment; Send to cashier where it does not and the row hands lines not yet sent as they stand,
 *  for whoever works the list; Sent to cashier once they are (the card says so); none otherwise */
export function rowButton(row: Pick<PackRow, 'patient_id' | 'lines' | 'orders'>, can: (action: string) => boolean, d: RowData): string | null {
  if (d.desk === 'own' || d.desk === 'everyone') {
    if (!can('write:billing.payment')) return null
    const o = d.owes.get(row.patient_id)
    return centsOf(handedDue(row, d, 'pay')) > 0 || (!!o && (o.total > 0 || o.unpriced > 0)) ? 'Pay' : null
  }
  if (!can('read:bench')) return null
  if (handedDue(row, d, 'send').length) return 'Send to cashier'
  return dueLines(row.lines).some((l) => l.order && (d.own.get(l.order)?.sent ?? 0) > 0) ? 'Sent to cashier' : null
}

/** the row's orders waiting for payment (the soft check, core change (c)): those billing holds unpaid (Pay first on where the work is
 *  done: a charge, a sent line), and, under this department's own Pay first, those whose lines the row hands come to more than is paid
 *  of them (sent is not paid); an order someone went ahead with anyway never waits again */
export function rowWaits(row: Pick<PackRow, 'orders' | 'lines'>, d: RowData): Wait[] {
  const on = new Set(row.orders.map((o) => o.item)); const out = new Set<string>()
  for (const o of on) if (d.waiting.has(o) && !d.ahead.has(o)) out.add(o)
  if (d.payFirst) {
    const ls = dueLines(row.lines).filter((l) => lineCents(l) > 0)
    for (const o of new Set(ls.flatMap((l) => l.order && on.has(l.order) && !d.ahead.has(l.order) ? [l.order] : []))) {
      const paid = (d.own.get(o)?.lines ?? []).filter((x) => x.paid).map((x) => ({ ...x, amount: x.amount / 100 }))
      if (centsOf(restOf(ls.filter((l) => l.order === o), paid)) > 0) out.add(o)
    }
  }
  return [...out].map((order) => ({ order, word: WORD, tone: 'warn' as const }))
}

/** going ahead anyway with these orders: the lines the row hands for them that are not paid, nor on an open bill as they stand, go to the
 *  cashier first as an open bill (with the basis the send checks), so the patient still owes them and the cashier sees the work was
 *  done before payment (chosen in the build, awaiting the owner) */
export const anywayDue = (row: Pick<PackRow, 'lines'>, orders: readonly string[], d: RowData) =>
  dueOf({ lines: dueLines(row.lines).filter((l) => !!l.order && orders.includes(l.order)) }, d, 'send')
