// Billing's pure model (spec/openCare.md §5.4): money in whole piastres (no floating point), the server's lines turned into the payment
// card's lines and back into what the pay operation takes, the row's words, the receipt's lines, the day's tiles and a drawer's words.
// No React and no client here, so `npm run test:billing` reads it.

/** what billing.lines answers for a patient at this desk */
export interface ChargeLine { item: string; department_id: string; kind: 'service' | 'visit'; name: string | null; from_department_id: string | null; at: string
  amount?: number | string; at_order?: boolean }
export interface SentLine { id: string; bill_id: string; department_id: string; order_item: string | null; name: string; quantity: number | string; amount: number | string; at: string }
/** a line a department's row hands (its own priced work), paid at its counter */
export interface Handed { name: string; quantity: number; amount: number | string; order_item?: string | null }
export interface Lines { desk: Desk; patient_id: string; charges: ChargeLine[]; sent: SentLine[]; waiting: string[]; before_payment: boolean
  back: { item: string; department_id: string; kind: string; name: string | null; payment_id: string; receipt: string }[] }
export type Desk = 'none' | 'own' | 'everyone'
/** one row of who owes (billing.owed) */
export interface OwedRow { patient_id: string; last_at: string; total: number | string; unpriced: number; lines: number; visits: number; services: number; names: (string | null)[]
  sent: string[]; waiting: string[]; before_payment: boolean }
export interface Owed { desk: Desk; rows: OwedRow[]; more: boolean; count: number; paid: number; none: { patient_id: string; department_id: string }[] }
export interface PaymentLine { n: number; kind: 'charge' | 'sent' | 'handed'; department_id: string; name: string | null; quantity: number | string | null; amount: number | string; typed: boolean }
export interface Payment { payment_id: string; receipt: string; department_id: string; patient_id: string | null; method: 'cash' | 'card'; total: number | string; discount: number | string
  discount_reason: string | null; received: number | string | null; change: number | string | null; at: string; author_id: string; by: string | null; reason: string | null
  refund_of: string | null; refunded_by: string | null; lines: PaymentLine[] }

export const MAX = 1_000_000_000   // 10,000,000.00: the most a price or a line may be (in piastres)

/** an amount as typed or as the server sends it, in piastres; null when it is not one (at most two decimals, never below nothing) */
export function cents(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const t = typeof v === 'number' ? v.toFixed(2) : v.trim().replace(/,/g, '')
  const m = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(t)
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null
}
/** what a signed amount from the server is, in piastres (a refund is below nothing) */
export const signed = (v: number | string | null | undefined) => v === null || v === undefined ? 0 : Math.round(Number(v) * 100)
/** piastres as the screen says them: 1,234.50 (a minus sign below nothing) */
export const egp = (c: number) => `${c < 0 ? '−' : ''}${Math.floor(Math.abs(c) / 100).toLocaleString('en')}.${String(Math.abs(c) % 100).padStart(2, '0')}`
/** piastres as the server takes them: 1234.50 */
export const wire = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`

/** one line of the payment card: a charge, a sending department's lines as one, or a line this row hands */
export interface CardLine { key: string; kind: 'charge' | 'sent' | 'handed'; department_id: string; words: string; source: string; at: string | null
  price: number | null; open: boolean; charge?: { item: string; department_id: string }; sent?: string[]; handed?: Handed }
type Names = (id: string | null | undefined) => string | null
/** the card's lines: each charge (its name, or "Visit · the department"; where and when it came from; its price, or none yet when priced
 *  At the order), each sending department's lines as one line (the department's name and the lines' names, their sum), then what a row
 *  hands. The department's words are the clinic's, read from the directory, never named in code */
export function cardLines(l: Pick<Lines, 'charges' | 'sent'>, nameOf: Names, timeOf: (iso: string) => string, handed: Handed[] = [], here?: string): CardLine[] {
  const out: CardLine[] = l.charges.map((c) => ({ key: `c:${c.item}:${c.department_id}`, kind: 'charge', department_id: c.department_id, at: c.at,
    words: c.kind === 'visit' ? `Visit · ${nameOf(c.department_id) ?? 'the clinic'}` : c.name ?? 'A service',
    source: `${nameOf(c.department_id) ?? ''} · ${c.kind === 'visit' ? 'seen' : 'ordered'} ${timeOf(c.at)}`.replace(/^ · /, ''),
    price: c.at_order ? null : cents(c.amount), open: !!c.at_order, charge: { item: c.item, department_id: c.department_id } }))
  const byDept = new Map<string, SentLine[]>()
  for (const s of l.sent) byDept.set(s.department_id, [...(byDept.get(s.department_id) ?? []), s])
  for (const [dept, ss] of byDept) {
    out.push({ key: `s:${dept}`, kind: 'sent', department_id: dept, at: ss[0].at, words: `${nameOf(dept) ?? 'A department'} · ${ss.map(lineName).join(', ')}`,
      source: `${nameOf(dept) ?? ''} · sent ${timeOf(ss[0].at)}`.replace(/^ · /, ''), price: ss.reduce((n, s) => n + (cents(s.amount) ?? 0), 0), open: false, sent: ss.map((s) => s.id) })
  }
  handed.forEach((h, i) => out.push({ key: `h:${i}`, kind: 'handed', department_id: here ?? '', at: null, words: lineName(h), source: `${nameOf(here) ?? ''} · here`.replace(/^ · /, ''),
    price: cents(h.amount), open: false, handed: h }))
  return out
}
const lineName = (x: { name: string; quantity: number | string }) => Number(x.quantity) === 1 ? x.name : `${x.name} × ${Number(x.quantity)}`

export interface Card { ticked: Record<string, boolean>; typed: Record<string, string>; discount: { amount: string; reason: string | null } | null; method: 'cash' | 'card'; received: string }
export const blankCard = (): Card => ({ ticked: {}, typed: {}, discount: null, method: 'cash', received: '' })
/** a line is ticked unless the cashier unticked it (only what is ticked is paid) */
export const isTicked = (c: Card, k: string) => c.ticked[k] !== false
/** the card's sums and what stops it: an open price not typed, a discount over the lines or with no reason, cash short of the total */
export function cardSum(lines: CardLine[], c: Card) {
  const on = lines.filter((l) => isTicked(c, l.key))
  const priceOf = (l: CardLine) => l.open ? cents(c.typed[l.key] ?? '') : l.price
  const sub = on.reduce((n, l) => n + (priceOf(l) ?? 0), 0)
  const off = c.discount ? cents(c.discount.amount) : 0
  const total = sub - (off ?? 0)
  const received = c.method === 'cash' ? (c.received.trim() ? cents(c.received) : total) : null
  const problem = !on.length ? 'Tick a line to take'
    : on.some((l) => l.open && !(priceOf(l)! > 0 && priceOf(l)! <= MAX)) ? 'Type the price of each line priced at the order'
    : c.discount && (off === null || off > sub) ? 'A discount is at most what is ticked'
    : c.discount && off! > 0 && !c.discount.reason ? 'Pick the discount\'s reason'
    : c.method === 'cash' && (received === null || received < total) ? 'Cash received is less than the total' : null
  return { sub, discount: off ?? 0, total, received, change: received === null ? null : received - total, problem, ticked: on.length }
}
/** what billing.pay takes from the card: the ticked lines, typed prices, the discount, cash or card, and the total it showed */
export function payArgs(patientId: string, lines: CardLine[], c: Card) {
  const s = cardSum(lines, c); const on = lines.filter((l) => isTicked(c, l.key))
  return { patient_id: patientId, method: c.method, total: wire(s.total), ...(c.method === 'cash' && s.received !== null ? { received: wire(s.received) } : {}),
    charges: on.filter((l) => l.charge).map((l) => ({ ...l.charge!, ...(l.open ? { price: wire(cents(c.typed[l.key] ?? '')!) } : {}) })),
    sent: on.flatMap((l) => l.sent ?? []),
    handed: on.filter((l) => l.handed).map((l) => ({ name: l.handed!.name, quantity: l.handed!.quantity, amount: wire(cents(l.handed!.amount)!), order_item: l.handed!.order_item ?? null })),
    ...(c.discount && s.discount > 0 ? { discount: { amount: wire(s.discount), reason: c.discount.reason } } : {}) }
}

/** a row of who owes in words: "Visit · CBC, HbA1c · Dispensary" and how many wait for a price */
export function owedWords(r: Pick<OwedRow, 'visits' | 'names' | 'sent' | 'unpriced'>, nameOf: Names) {
  const names = r.names.filter((x): x is string => !!x)
  const parts = [r.visits ? (r.visits > 1 ? `${r.visits} visits` : 'Visit') : '', names.length > 3 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', '),
    ...r.sent.map((d) => nameOf(d) ?? 'A department')].filter(Boolean)
  return { what: parts.join(' · '), unpriced: r.unpriced ? `${r.unpriced} to price` : '' }
}
/** the marks on a row: a department waiting (Pay first), work done before payment */
export const owedMarks = (r: Pick<OwedRow, 'waiting' | 'before_payment'>, nameOf: Names) => [
  ...r.waiting.map((d) => ({ key: `w:${d}`, word: `${nameOf(d) ?? 'A department'} is waiting`, tone: 'warn' as const })),
  ...(r.before_payment ? [{ key: 'before', word: 'done before payment', tone: 'info' as const }] : [])]

/** a receipt's lines as printed and shown: each charge, each department's sent or handed lines as one, with the sum */
export function receiptLines(p: Pick<Payment, 'lines'>, nameOf: Names): { words: string; amount: number }[] {
  const out: { words: string; amount: number }[] = []; const grouped = new Map<string, PaymentLine[]>()
  for (const l of [...p.lines].sort((a, b) => a.n - b.n)) {
    if (l.kind === 'charge') out.push({ words: l.name ?? `Visit · ${nameOf(l.department_id) ?? 'the clinic'}`, amount: signed(l.amount) })
    else grouped.set(l.department_id, [...(grouped.get(l.department_id) ?? []), l])
  }
  for (const [dept, ls] of grouped) out.push({ words: `${nameOf(dept) ?? 'A department'} · ${ls.map((l) => lineName({ name: l.name ?? '', quantity: l.quantity ?? 1 })).join(', ')}`,
    amount: ls.reduce((n, l) => n + signed(l.amount), 0) })
  return out
}

/** a drawer counted against what it should hold */
export function drawerWords(expected: number, counted: number | null) {
  if (counted === null) return null
  const d = counted - expected
  return d === 0 ? { word: 'even', tone: 'ok' as const, difference: 0 } : { word: `${egp(Math.abs(d))} ${d < 0 ? 'short' : 'over'}`, tone: 'warn' as const, difference: d }
}
