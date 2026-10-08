// The billing pack's client (spec/openCare.md §5.4), as pure decisions: money in piastres, the payment card's lines and sums and what the
// pay operation takes from them, a row's words and marks, a receipt's lines, a drawer counted; every refusal the pack raises has its
// words; billing names no other pack, in its screens or its server.   npm run test:billing
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { blankCard, cardLines, cardSum, cents, drawerWords, egp, owedMarks, owedWords, payArgs, printedWords, receiptLines, receiptView, signed, wire, type Card, type Lines, type Payment } from '../src/packs/billing/money'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReceiptPaper } from '../src/packs/billing/ReceiptPaper'
import { ReceiptSlip } from '../src/packs/billing/ReceiptSlip'
import { setClinicTimeZone } from '../src/core/ui/time'
import { REFUSALS } from '../src/packs/billing/words'
import { WORD, anywayDue, asHanded, asSent, centsOf, chartData, dueOf, handedDue, noData, ordersOf, restOf, rowButton, rowData, rowWaits, type RowData } from '../src/packs/billing/rows'
import { REFUSALS as PHARMACY_WORDS } from '../src/packs/pharmacy/answers'
import type { OrderRow } from '../src/core/db/types'
import { chartRowOf, chartWait, waitsOf, type PackRow, type RowCtx } from '../src/core/screens/rows'
import { registerWords, words } from '../src/core/db/words'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const root = new URL('../', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, root), 'utf8')
const NAMES: Record<string, string> = { im: 'Internal Medicine', lab: 'Laboratory', ph: 'Pharmacy' }
const nameOf = (id: string | null | undefined) => (id && NAMES[id]) || null
const hm = (iso: string) => iso.slice(11, 16)

const lines: Lines = { desk: 'everyone', patient_id: 'pt', waiting: ['lab'], before_payment: true, back: [],
  charges: [{ item: 'v1', department_id: 'im', kind: 'visit', name: null, from_department_id: null, at: '2026-10-08T10:12:00Z', amount: 150 },
    { item: 'o1', department_id: 'lab', kind: 'service', name: 'CBC', from_department_id: 'im', at: '2026-10-08T10:24:00Z', amount: '80.00' },
    { item: 'o2', department_id: 'lab', kind: 'service', name: 'Chest X-ray', from_department_id: 'im', at: '2026-10-08T10:25:00Z', at_order: true }],
  sent: [{ id: 's1', bill_id: 'b1', department_id: 'ph', order_item: 'rx1', name: 'Augmentin 1 g', quantity: 1, amount: 96, at: '2026-10-08T10:30:00Z' },
    { id: 's2', bill_id: 'b1', department_id: 'ph', order_item: null, name: 'Panadol Extra', quantity: '2.00', amount: '30.50', at: '2026-10-08T10:30:00Z' }] }

test('money in piastres: typed or sent, at most two decimals, never below nothing; said with thousands, sent with a point', () => {
  assert.deepEqual(['80', '80.5', '80.05', '1,234.50', ' 7 ', '0'].map(cents), [8000, 8050, 8005, 123450, 700, 0])
  assert.deepEqual(['9.999', '-5', 'abc', '', '123456789'].map(cents), [null, null, null, null, null], 'three decimals, below nothing, words, nothing, more than 99,999,999')
  assert.equal(cents(80.1), 8010, 'a number from the server, no floating point drift'); assert.equal(cents(150), 15000); assert.equal(cents(null), null)
  assert.equal(signed('-510.00'), -51000); assert.equal(signed(0.1 + 0.2), 30)
  assert.equal(egp(123450), '1,234.50'); assert.equal(egp(5), '0.05'); assert.equal(egp(-51000), '−510.00')
  assert.equal(wire(123450), '1234.50'); assert.equal(wire(5), '0.05')
})
test('the card\'s lines: each charge with where and when it came from; a sending department\'s lines as one; an open price empty', () => {
  const c = cardLines(lines, nameOf, hm)
  assert.deepEqual(c.map((l) => l.words), ['Visit · Internal Medicine', 'CBC', 'Chest X-ray', 'Pharmacy · Augmentin 1 g, Panadol Extra × 2'])
  assert.deepEqual(c.map((l) => l.source), ['Internal Medicine · checked in 10:12', 'Laboratory · ordered 10:24', 'Laboratory · ordered 10:25', 'Pharmacy · sent 10:30'])
  assert.deepEqual(c.map((l) => l.price), [15000, 8000, null, 12650]); assert.deepEqual(c.map((l) => l.open), [false, false, true, false])
  assert.deepEqual(c[3].sent, ['s1', 's2'])
  const h = cardLines({ charges: [], sent: [] }, nameOf, hm, [{ name: 'Nexium 40', quantity: 1, amount: '75', order_item: 'rx2' }], 'ph')
  assert.equal(h[0].kind, 'handed'); assert.equal(h[0].words, 'Nexium 40'); assert.equal(h[0].source, 'Pharmacy · here'); assert.equal(h[0].price, 7500)
})
test('the card\'s sums: only what is ticked; a typed open price; a discount at most the lines, with a reason; cash at least the total, its change', () => {
  const c = cardLines(lines, nameOf, hm); const k = (i: number) => c[i].key
  let card: Card = blankCard()
  assert.equal(cardSum(c, card).problem, 'Type the price of each line priced at the order')
  card = { ...card, typed: { [k(2)]: '300' } }
  let s = cardSum(c, card); assert.equal(s.total, 15000 + 8000 + 30000 + 12650); assert.equal(s.problem, null); assert.equal(s.change, 0, 'cash received empty: the total')
  card = { ...card, ticked: { [k(3)]: false } }; assert.equal(cardSum(c, card).total, 53000, 'the Pharmacy\'s lines left for later')
  card = { ...card, discount: { amount: '20', reason: null } }; assert.equal(cardSum(c, card).problem, 'Pick the discount\'s reason')
  card = { ...card, discount: { amount: '20', reason: 'Staff' } }; s = cardSum(c, card); assert.equal(s.total, 51000); assert.equal(s.problem, null)
  assert.equal(cardSum(c, { ...card, discount: { amount: '600', reason: 'Staff' } }).problem, 'A discount is at most what is ticked')
  assert.equal(cardSum(c, { ...card, received: '500' }).problem, 'Cash received is less than the total')
  s = cardSum(c, { ...card, received: '600' }); assert.equal(s.change, 9000)
  assert.equal(cardSum(c, { ...card, method: 'card', received: '' }).change, null, 'a card has no change')
  assert.equal(cardSum(c, { ...card, ticked: { [k(0)]: false, [k(1)]: false, [k(2)]: false, [k(3)]: false } }).problem, 'Tick a line to take')
  assert.equal(cardSum(c, { ...card, typed: { [k(2)]: '10000000.01' } }).problem, 'Type the price of each line priced at the order', 'at most 10,000,000')
})
test('what the pay operation takes: the ticked charges (a typed price on the open one), the sent lines, the handed ones, the discount, the total shown', () => {
  const c = cardLines(lines, nameOf, hm, [{ name: 'Nexium 40', quantity: 1, amount: 75, order_item: 'rx2' }], 'ph'); const k = (i: number) => c[i].key
  const card: Card = { ...blankCard(), typed: { [k(2)]: '300' }, ticked: { [k(1)]: false }, discount: { amount: '20', reason: 'Charity' }, received: '700' }
  assert.deepEqual(payArgs('pt', c, card, { rx2: '0.00', rx9: '10.00' }), { patient_id: 'pt', method: 'cash', total: '631.50', received: '700.00',
    charges: [{ item: 'v1', department_id: 'im' }, { item: 'o2', department_id: 'lab', price: '300.00' }], sent: ['s1', 's2'],
    handed: [{ name: 'Nexium 40', quantity: 1, amount: '75.00', order_item: 'rx2' }], basis: { rx2: '0.00' }, discount: { amount: '20.00', reason: 'Charity' } })
  assert.ok(!('basis' in payArgs('pt', c, { ...card, ticked: { ...card.ticked, [k(4)]: false } }, { rx2: '0.00' })), 'the handed line unticked: no basis sent')
  const byCard = payArgs('pt', c, { ...card, method: 'card', discount: null })
  assert.equal(byCard.method, 'card'); assert.ok(!('received' in byCard) && !('discount' in byCard))
})
test('a row of who owes in words, and its marks: a department waiting (Pay first), work done before payment', () => {
  const w = owedWords({ visits: 1, names: ['CBC', 'HbA1c'], sent: ['ph'], unpriced: 1 }, nameOf)
  assert.equal(w.what, 'Visit · CBC, HbA1c · Pharmacy'); assert.equal(w.unpriced, '1 to price')
  assert.equal(owedWords({ visits: 0, names: ['A', 'B', 'C', 'D'], sent: [], unpriced: 0 }, nameOf).what, 'A, B +2')
  assert.equal(owedWords({ visits: 2, names: [], sent: ['zz'], unpriced: 0 }, nameOf).what, '2 visits · A department')
  assert.deepEqual(owedMarks({ waiting: ['lab'], before_payment: true }, nameOf), [{ key: 'w:lab', word: 'Laboratory is waiting', tone: 'warn' }, { key: 'before', word: 'done before payment', tone: 'info' }])
  assert.deepEqual(owedMarks({ waiting: [], before_payment: false }, nameOf), [])
  assert.deepEqual(owedMarks({ waiting: [], before_payment: false, back: 1 }, nameOf), [{ key: 'back', word: 'to give back', tone: 'warn' }],
    'paid for work not done: listed, so the cashier is told')
})
test('the receipt\'s lines: each charge, a department\'s sent or handed lines as one with their sum; a refund below nothing', () => {
  const p: Pick<Payment, 'lines'> = { lines: [
    { n: 3, kind: 'sent', department_id: 'ph', name: 'Augmentin 1 g', quantity: 1, amount: 96, typed: false },
    { n: 1, kind: 'charge', department_id: 'im', name: null, quantity: null, amount: '150.00', typed: false },
    { n: 2, kind: 'charge', department_id: 'lab', name: 'Chest X-ray', quantity: null, amount: 300, typed: true },
    { n: 4, kind: 'sent', department_id: 'ph', name: 'Panadol Extra', quantity: '2.00', amount: '30.50', typed: false }] }
  assert.deepEqual(receiptLines(p, nameOf), [{ words: 'Visit · Internal Medicine', amount: 15000 }, { words: 'Chest X-ray', amount: 30000 },
    { words: 'Pharmacy · Augmentin 1 g, Panadol Extra × 2', amount: 12650 }])
  assert.deepEqual(receiptLines({ lines: [{ n: 1, kind: 'charge', department_id: 'lab', name: 'CBC', quantity: null, amount: '-80.00', typed: false }] }, nameOf), [{ words: 'CBC', amount: -8000 }])
})
// the receipt printed (§3.13 Printing, owner 2026-10-08): the same drawing as the screen's, on the 80 mm roll
setClinicTimeZone('Africa/Cairo')
const paid: Payment = { payment_id: 'p1', receipt: 'R-00412', department_id: 'cash', patient_id: 'pt', method: 'cash', total: '480.00', discount: '20.00', discount_reason: 'Staff',
  received: '500.00', change: '20.00', at: '2026-10-08T07:05:00Z', author_id: 'u', by: 'Mona Saad', reason: null, refund_of: null, refunded_by: null,
  lines: [{ n: 1, kind: 'charge', department_id: 'im', name: null, quantity: null, amount: '150.00', typed: false }, { n: 2, kind: 'charge', department_id: 'lab', name: 'CBC', quantity: null, amount: 80, typed: false },
    { n: 3, kind: 'sent', department_id: 'ph', name: 'Augmentin 1 g', quantity: 1, amount: 270, typed: false }], prints: [] }
const header = { name: 'Nile Clinic', logo: null, address: '12 Nile St, Cairo', phone: '02 2345 6789', tax_number: '123-456-789' }
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()
test('the receipt as kept: the clinic, its number, date and time, the patient, each line with its amount, the discount, the total, cash and change, who took it', () => {
  const v = receiptView(paid, nameOf, { name: 'Magdy Rizk', number: 3301 })
  assert.deepEqual([v.title, v.number, v.patient, v.total, v.by, v.refunded, v.gives_back], ['Receipt', 'R-00412', 'Magdy Rizk · 3301', 48000, 'Taken by Mona Saad', null, null])
  assert.deepEqual(v.lines.map((l) => [l.words, l.amount]), [['Visit · Internal Medicine', 15000], ['CBC', 8000], ['Pharmacy · Augmentin 1 g', 27000]])
  assert.deepEqual(v.discount, { words: 'Discount · Staff', amount: -2000 }); assert.deepEqual(v.tender, [{ words: 'Cash received', amount: 50000 }, { words: 'Change', amount: 2000 }])
  assert.deepEqual(receiptView({ ...paid, method: 'card', received: null, change: null }, nameOf, null).tender, [{ words: 'Card', amount: 48000 }])
  assert.equal(receiptView({ ...paid, patient_id: null }, nameOf, null).patient, 'No patient on record', 'erased: no patient')
  const t = text(renderToStaticMarkup(createElement(ReceiptPaper, { view: v, header })))
  for (const w of ['Nile Clinic', '12 Nile St, Cairo', 'Tel. 02 2345 6789 · Tax no. 123-456-789', 'Receipt R-00412 · 2026-10-08 10:05', 'Magdy Rizk · 3301', 'Visit · Internal Medicine 150.00',
    'CBC 80.00', 'Pharmacy · Augmentin 1 g 270.00', 'Discount · Staff −20.00', 'Total 480.00', 'Cash received 500.00', 'Change 20.00', 'Taken by Mona Saad']) assert.ok(t.includes(w), `${w} in: ${t}`)
})
test('printed, it says what the screen says; a later copy is marked Reprint with its time; a refund slip names the receipt it undoes; a refunded receipt says so', () => {
  const v = receiptView(paid, nameOf, { name: 'Magdy Rizk', number: 3301 })
  const screen = text(renderToStaticMarkup(createElement(ReceiptPaper, { view: v, header })))
  assert.equal(text(renderToStaticMarkup(createElement(ReceiptSlip, { data: v, header, reprint: null }))), screen, 'the first copy: the screen\'s words, nothing more')
  assert.equal(text(renderToStaticMarkup(createElement(ReceiptSlip, { data: v, header, reprint: '10:50' }))), `Reprint · 10:50 ${screen}`)
  const back = receiptView({ ...paid, receipt: 'R-00413', total: '-480.00', discount: 0, discount_reason: null, received: null, change: null, refund_of: 'R-00412', reason: 'charged twice', by: 'Mona Saad' }, nameOf, null)
  assert.deepEqual([back.title, back.gives_back, back.by, back.total], ['Refund slip', 'Gives back receipt R-00412 · charged twice', 'Given back by Mona Saad', -48000])
  assert.match(text(renderToStaticMarkup(createElement(ReceiptSlip, { data: back, header, reprint: null }))), /Refund slip R-00413 · .*Gives back receipt R-00412 · charged twice.*Total −480\.00/)
  const refunded = receiptView({ ...paid, refunded_by: 'R-00413' }, nameOf, null)
  assert.equal(refunded.refunded, 'Refunded · given back on R-00413'); assert.match(text(renderToStaticMarkup(createElement(ReceiptPaper, { view: refunded, header }))), /Refunded · given back on R-00413/)
  assert.equal(printedWords([], (x) => x), ''); assert.equal(printedWords([{ at: '10:42', by: null }, { at: '10:50', by: null }, { at: '11:02', by: null }], (x) => x), 'Printed 10:42 · again 10:50, 11:02')
  const src = read('src/packs/billing/Receipt.tsx')
  assert.ok(src.indexOf("packOp<{ reprint: boolean }>('billing.print'") < src.indexOf("key: 'billing.receipt'"), 'each copy recorded first, then printed')
  assert.match(src, /again: c\.reprint/, 'the copy\'s mark from billing\'s own count'); assert.match(src, /patientId: p\.patient_id, purpose: 'PATADMIN'/, 'the print of the patient\'s receipt logged like a read')
})
test('a drawer counted: even, short or over, by how much', () => {
  assert.deepEqual(drawerWords(411000, 409000), { word: '20.00 short', tone: 'warn', difference: -2000 })
  assert.deepEqual(drawerWords(411000, 411050), { word: '0.50 over', tone: 'warn', difference: 50 })
  assert.deepEqual(drawerWords(411000, 411000), { word: 'even', tone: 'ok', difference: 0 }); assert.equal(drawerWords(1, null), null)
})
// a department billing knows nothing of (a test-only Physiotherapy, no pack of its own): its rows hand the lines it prices itself
const order = (item: string) => ({ item, version: 1, service_name: 'Session' }) as unknown as OrderRow
const physio = (lines: PackRow['lines'], items = ['s1', 's2']): PackRow => ({ key: 'r', patient_id: 'pt', visit_id: null, orders: items.map(order), lines })
const sessions = [{ name: 'Session · 45 min', quantity: 1, amount: 250, order: 's1' }, { name: 'Session · 45 min', quantity: 1, amount: 250, order: 's2' },
  { name: 'Elastic band', quantity: 2, amount: 60 }]
const may = (...as: string[]) => (a: string) => as.includes(a)
/** what billing holds of an order of the department's own lines: paid lines, and lines owed on its open bill (amounts in units) */
const held = (lines: { name: string; quantity: number; amount: number; paid: boolean }[]) => ({ paid: lines.filter((l) => l.paid).reduce((n, l) => n + Math.round(l.amount * 100), 0),
  sent: lines.filter((l) => !l.paid).reduce((n, l) => n + Math.round(l.amount * 100), 0), lines: lines.map((l) => ({ ...l, amount: Math.round(l.amount * 100) })) })
const own = (desk: RowData['desk'], m: Record<string, { name: string; quantity: number; amount: number; paid: boolean }[]>, payFirst = false): RowData =>
  ({ ...noData(desk), payFirst, own: new Map(Object.entries(m).map(([k, v]) => [k, held(v)])) })
test('billing\'s reading of a list: the waiting read and who owes here, put together; orders asked about once, 500 a read', () => {
  const d = rowData('none', { waiting: ['s1'], ahead: [], pay_first: true, desk: 'own', own: { s1: { paid: '0.00', sent: '250.00', lines: [{ name: 'Session', quantity: '1.00', amount: '250.00', paid: false }] } } },
    [{ patient_id: 'pt', total: '150.00', unpriced: 1 }])
  assert.equal(d.desk, 'own', 'the server\'s desk over the screen\'s settings'); assert.ok(d.payFirst); assert.deepEqual([...d.waiting], ['s1'])
  assert.deepEqual(d.own.get('s1'), { paid: 0, sent: 25000, lines: [{ name: 'Session', quantity: 1, amount: 25000, paid: false }] })
  assert.deepEqual(d.owes.get('pt'), { total: 15000, unpriced: 1 })
  assert.equal(rowData('everyone', null, null).desk, 'everyone', 'no read allowed: the settings\' desk, nothing waiting'); assert.equal(rowData('everyone', null, null).waiting.size, 0)
  const many = Array.from({ length: 1201 }, (_, i) => ({ key: `${i}`, patient_id: 'p', visit_id: null, orders: [order(`o${String(i).padStart(4, '0')}`), order('o0000')] }))
  assert.deepEqual(ordersOf(many).map((x) => x.length), [500, 500, 201])
})
test('the lines a row still hands: priced, beyond what billing holds of each order; to pay here past its open bill too; to send only what changed', () => {
  const d = own('none', { s1: [{ name: 'Session · 45 min', quantity: 1, amount: 250, paid: false }], s2: [{ name: 'Session · 45 min', quantity: 1, amount: 250, paid: true }] })
  assert.deepEqual(handedDue(physio(sessions), d, 'pay').map((l) => l.name), ['Elastic band'], 's1 on its open bill, s2 paid: the band (no order) is always handed')
  assert.deepEqual(handedDue(physio(sessions), d, 'send').map((l) => l.order ?? '-'), ['-'], 's1 sent as it stands: not again')
  const dearer = [{ ...sessions[0], amount: 300 }, sessions[2]]
  assert.deepEqual(dueOf(physio(dearer), d, 'send'), { lines: [{ ...sessions[0], amount: 300 }, sessions[2]], basis: { s1: '0.00' } },
    'changed since it was sent: sent again (it replaces what is not paid), with what was paid of it (nothing)')
  assert.deepEqual(handedDue(physio([{ name: 'Free', quantity: 1, amount: 0, order: 's1' }, { name: ' ', quantity: 1, amount: 5 }, { name: 'x', quantity: 0, amount: 5 }]), noData(), 'pay'), [],
    'nothing at nothing, no words, no quantity: not a line')
  assert.equal(centsOf(sessions), 56000)
  assert.deepEqual(asHanded([sessions[0]]), [{ name: 'Session · 45 min', quantity: 1, amount: '250.00', order_item: 's1' }])
  assert.deepEqual(asSent([sessions[2]]), [{ name: 'Elastic band', quantity: 2, amount: '60.00' }])
})
// a medicine given in part (old audit F38): 28 tablets prescribed, a box of 14 at 145, a strip of 7 at 75; the row hands what the order
// comes to so far (the part given and the rest to give), billing hands on only the rest
const aug = (box: number, strip = 0, o = 'rx') => [{ name: 'Augmentin 1 g · box', quantity: box, amount: 145 * box, order: o },
  ...(strip ? [{ name: 'Augmentin 1 g · strip', quantity: strip, amount: 75 * strip, order: o }] : [])]
const rx = (lines: PackRow['lines']): PackRow => ({ key: 'r', patient_id: 'pt', visit_id: null, orders: [order('rx')], lines })
const box1 = { name: 'Augmentin 1 g · box', quantity: 1, amount: 145 }
test('given in part: the rest is charged in addition — never dropped as paid, never left as "sent" for costing the same, never replacing the part', () => {
  // (a) 14 given and its box sent; the Owed row hands both boxes: the rest goes, with what was paid (nothing)
  assert.deepEqual(dueOf(rx(aug(2)), own('none', { rx: [{ ...box1, paid: false }] }), 'send'), { lines: aug(2), basis: { rx: '0.00' } },
    'sent 145 for the part; the order now comes to 290: the open bill becomes 290, never "Sent to cashier" for the same 145')
  assert.equal(rowButton(rx(aug(2)), may('read:bench'), own('none', { rx: [{ ...box1, paid: false }] })), 'Send to cashier')
  // (b) the part paid: only the rest is handed, and under Pay first the order waits until it is paid
  const paidPart = own('none', { rx: [{ ...box1, paid: true }] }, true)
  assert.deepEqual(dueOf(rx(aug(2)), paidPart, 'send'), { lines: aug(1), basis: { rx: '145.00' } }, 'paid 145: the second box, 145, goes; the basis says 145 was paid')
  assert.deepEqual(dueOf(rx(aug(2)), { ...paidPart, desk: 'own' }, 'pay'), { lines: aug(1), basis: { rx: '145.00' } }, 'and at a counter that takes payment: the rest to pay')
  assert.deepEqual(rowWaits(rx(aug(2)), paidPart).map((w) => w.order), ['rx'], 'Pay first: the rest unpaid, the order still waits')
  assert.deepEqual(rowWaits(rx(aug(1)), paidPart), [], 'all of it paid: free')
  // (c) 21 given (a box and a strip, sent, not paid), the rest 7 (a strip): the bill becomes 295, it never drops to 75
  const sent21 = own('none', { rx: [{ ...box1, paid: false }, { name: 'Augmentin 1 g · strip', quantity: 1, amount: 75, paid: false }] })
  assert.deepEqual(dueOf(rx(aug(1, 2)), sent21, 'send').lines.map((l) => `${l.name} × ${l.quantity} ${l.amount}`), ['Augmentin 1 g · box × 1 145', 'Augmentin 1 g · strip × 2 150'])
  assert.deepEqual(dueOf(rx(aug(1, 2)), { ...sent21, desk: 'own' }, 'pay').lines.map((l) => `${l.name} × ${l.quantity} ${l.amount}`), ['Augmentin 1 g · strip × 1 75'],
    'to pay here: the open bill (220) is paid as itself, the strip given since is handed')
  // the rest given as another brand, the part paid: the other brand's line alone
  assert.deepEqual(dueOf(rx([aug(1)[0], { name: 'Megamox 1 g · box', quantity: 1, amount: 110, order: 'rx' }]), paidPart, 'send').lines.map((l) => l.name), ['Megamox 1 g · box'])
  // what is held is not told by name (sent as written under another brand): the difference of the sums, as one line
  assert.deepEqual(restOf([{ name: 'Megamox 1 g · box', quantity: 2, amount: 220, order: 'rx' }], [{ ...box1 }]),
    [{ name: 'Megamox 1 g · box · rest', quantity: 1, amount: 75, order: 'rx' }])
  assert.deepEqual(restOf(aug(1), [{ ...box1, quantity: 2, amount: 290 }]), [], 'more held than handed: nothing more (never below nothing)')
})
test('a line left unticked stays owed: paying one line of an order hands the rest again, and the order waits until all of it is paid', () => {
  const paidBox = own('own', { rx: [{ ...box1, paid: true }] }, true)
  assert.deepEqual(handedDue(rx(aug(1, 1)), paidBox, 'pay').map((l) => `${l.name} ${l.amount}`), ['Augmentin 1 g · strip 75'], 'the strip, unticked when the box was paid')
  assert.deepEqual(rowWaits(rx(aug(1, 1)), paidBox).map((w) => w.order), ['rx'], 'still waiting for the strip')
  assert.equal(rowButton(rx(aug(1, 1)), may('write:billing.payment', 'read:bench'), paidBox), 'Pay')
})
test('given before it was paid or sent: Given today\'s row hands what was given, so the medicine still reaches the cashier', () => {
  assert.equal(rowButton(rx(aug(1)), may('read:bench'), noData('none')), 'Send to cashier', 'nothing held of it: send it')
  assert.equal(rowButton(rx(aug(1)), may('write:billing.payment'), noData('own')), 'Pay', 'or pay at the counter')
  assert.equal(rowButton(rx(aug(1)), may('read:bench'), own('none', { rx: [{ ...box1, paid: false }] })), 'Sent to cashier', 'sent before Give: nothing more')
  assert.equal(rowButton(rx(aug(1)), may('read:bench'), own('none', { rx: [{ ...box1, paid: true }] })), null, 'paid before Give: no button')
})
test('a service charge paid for the same order never counts as the lines it hands (only the department\'s own handed or sent lines do)', () => {
  // billing.waiting answers own from payment lines of kind handed or sent only: a paid Dispensing charge leaves own empty
  assert.deepEqual(handedDue(rx(aug(1)), { ...noData('own'), waiting: new Set() }, 'pay'), aug(1))
  assert.deepEqual(rowWaits(rx(aug(1)), { ...noData(), payFirst: true }).map((w) => w.order), ['rx'])
})
test('billing\'s one button on any department\'s row: Pay where it takes payment here, Send to cashier where it does not, for whoever may', () => {
  const pays = may('write:billing.payment', 'read:bench')
  assert.equal(rowButton(physio(sessions), pays, noData('own')), 'Pay', 'its own lines, at its counter')
  assert.equal(rowButton(physio([]), pays, noData('own')), null, 'nothing handed, nothing owed: no button')
  assert.equal(rowButton(physio([]), pays, { ...noData('everyone'), owes: new Map([['pt', { total: 0, unpriced: 1 }]]) }), 'Pay', 'a line to price owed at this desk')
  assert.equal(rowButton(physio(sessions), may('read:bench'), noData('own')), null, 'not for whoever does not take payment')
  assert.equal(rowButton(physio(sessions), may('read:bench'), noData('none')), 'Send to cashier')
  assert.equal(rowButton(physio(sessions), may(), noData('none')), null, 'nor for whoever does not work the list')
  const s = { name: 'Session · 45 min', quantity: 1, amount: 250, paid: false }
  const sent = own('none', { s1: [s], s2: [s] })
  assert.equal(rowButton(physio(sessions.slice(0, 2)), may('read:bench'), sent), 'Sent to cashier', 'sent as it stands: the card says so')
  assert.equal(rowButton(physio([{ ...sessions[0], amount: 300 }, sessions[1]]), may('read:bench'), sent), 'Send to cashier', 'changed: send it again')
  assert.equal(rowButton(physio(sessions.slice(0, 2)), pays, { ...own('own', { s1: [s], s2: [s] }), owes: new Map([['pt', { total: 50000, unpriced: 0 }]]) }), 'Pay',
    'sent before the counter took payment: its open bill is paid here')
  assert.deepEqual(handedDue(physio(sessions.slice(0, 2)), own('own', { s1: [s], s2: [s] }), 'pay'), [], 'and never handed besides')
})
test('Pay first, per order: what billing holds unpaid, and under the department\'s own Pay first what its row prices and nobody paid; gone ahead, never again', () => {
  const row = physio(sessions, ['s1', 's2', 'lab1'])
  assert.deepEqual(rowWaits(row, { ...noData(), waiting: new Set(['lab1']) }).map((w) => w.order), ['lab1'], 'Pay first off here: only what billing holds')
  const on = { ...own('none', { s2: [{ name: 'Session · 45 min', quantity: 1, amount: 250, paid: true }] }, true), ahead: new Set(['lab1']), waiting: new Set(['lab1']) }
  assert.deepEqual(rowWaits(row, on), [{ order: 's1', word: WORD, tone: 'warn' }], 's2 paid, lab1 gone ahead, the band has no order: s1 waits')
  assert.deepEqual(rowWaits(row, own('none', { s1: [{ name: 'Session · 45 min', quantity: 1, amount: 250, paid: false }] }, true)).map((w) => w.order), ['s1', 's2'],
    'sent is not paid: s1 still waits')
  assert.deepEqual(rowWaits(physio([{ name: 'Free', quantity: 1, amount: 0, order: 's1' }]), { ...noData(), payFirst: true }), [], 'free never waits')
  assert.deepEqual(rowWaits(physio(sessions, ['s2']), { ...noData(), payFirst: true }).map((w) => w.order), ['s2'], 'only orders on the row')
  assert.ok(rowWaits(row, on).every((w) => !/\d/.test(w.word)), 'a word, never a number')
  assert.deepEqual(anywayDue(physio(sessions), ['s2'], noData()), { lines: [sessions[1]], basis: { s2: '0.00' } }, 'going ahead: the lines of those orders go to the cashier first')
  assert.deepEqual(anywayDue(physio(sessions), ['s2'], own('none', { s2: [{ name: 'Session · 45 min', quantity: 1, amount: 250, paid: false }] })).lines, [],
    'already on an open bill as they stand: nothing goes twice')
})
test('the doctor\'s chart (owner, 2026-10-08): billing\'s word on an open order it holds unpaid, wherever performed; the word alone, nothing the chart prices', () => {
  const d = chartData([{ waiting: ['lab1'] }, { waiting: ['s2'] }])
  assert.deepEqual([...d.waiting].sort(), ['lab1', 's2']); assert.equal(d.payFirst, false); assert.equal(d.desk, 'none'); assert.equal(d.own.size, 0); assert.equal(d.owes.size, 0)
  const row = { ...physio(undefined, ['s1', 's2', 'lab1']), key: 'chart pt' }
  assert.deepEqual(rowWaits(row, d), [{ order: 's2', word: WORD, tone: 'warn' }, { order: 'lab1', word: WORD, tone: 'warn' }], 'what billing holds unpaid; s1 is not held')
  assert.deepEqual(rowWaits(row, chartData(null)), [], 'not allowed to read (no read:record): nothing')
  // through the core's rules, as the chart draws it: only where the reader's department uses billing; the word and its tone
  const check = [{ pack: 'billing', waiting: (r: PackRow, _c: RowCtx, data: unknown) => rowWaits(r, (data as RowData | undefined) ?? noData()), anyway: () => {} }]
  const rows = chartRowOf('pt', [{ ...order('s2'), status: 'active' }, { ...order('lab1'), status: 'completed' }] as OrderRow[])
  const ctx = (packs: string[]): RowCtx => ({ list: 'chart', dept: { id: 'im', name: 'Internal Medicine', packs, declared: {} }, can: () => true })
  const w = waitsOf(check, rows[0], ctx(['billing']), { billing: d })
  assert.deepEqual(chartWait('s2', 'active', w, new Set()), { word: 'Waiting for payment', tone: 'warn', packs: ['billing'] })
  assert.equal(w.has('lab1'), false, 'answered: not on the chart\'s row, so no word')
  assert.equal(waitsOf(check, rows[0], ctx(['pharmacy']), { billing: d }).size, 0, 'a department that does not use billing sees no money word')
  const index = read('src/packs/billing/index.tsx')
  assert.match(index, /ctx\.list === 'chart' \? chartOf\(rows, ctx\)/, 'the chart reads billing.chart, never a list\'s read')
  assert.match(index, /if \(!ctx\.can\('read:record'\)\) return chartData\(null\)/, 'for whoever reads the record there')
  assert.match(index, /packOp<ChartWaiting>\('billing\.chart', ctx\.dept\.id, \{ patient_id: r\.patient_id, orders \}\)/)
  assert.doesNotMatch(index, /anywhere/, 'no list read widened for it')
})
const sql = read('supabase/migrations/20260926000013_billing.sql')
const code = (t: string) => t.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
test('billing\'s own words answer its own codes: none is the core\'s or another pack\'s (the first to register a code keeps it)', () => {
  const lis = [...read('src/packs/lis/index.tsx').matchAll(/registerWords\(\{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/([a-z_]+):\s*'/g)].map((x) => x[1]))
  assert.ok(lis.length >= 3, lis.join(', '))
  registerWords(PHARMACY_WORDS); registerWords(Object.fromEntries(lis.map((c) => [c, `lis ${c}`]))); registerWords(REFUSALS)
  for (const [c, w] of Object.entries(REFUSALS)) assert.equal(words(c), w, `${c}: billing's words`)
  assert.equal(words('drawer_count'), 'Count the drawer in pounds and piastres', 'the drawer\'s count is not a stock count')
})
test('every refusal billing raises has its words (its own, or the core\'s)', () => {
  const codes = [...new Set([...code(sql).matchAll(/core\.refuse\('([a-z_]+)'/g)].map((m) => m[1]))]
  assert.ok(codes.length >= 20, `${codes.length} codes`)
  for (const c of codes) assert.notEqual(c in REFUSALS ? REFUSALS[c] : words(c), c.replace(/_/g, ' '), `${c} has words`)
  const checks = [...new Set([...code(sql).matchAll(/'code', '([a-z_]+)'/g)].map((m) => m[1]))]
  for (const c of checks) assert.ok(c in REFUSALS || words(c) !== c.replace(/_/g, ' '), `the settings check's ${c} has words`)
})
test('billing names no other pack, in its screens or its server (it learns of another department\'s work only from the lines it hands)', () => {
  const packs = readdirSync(new URL('src/packs/', root), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'billing').map((d) => d.name)
  const re = new RegExp(`(?<![A-Za-z0-9_])(${packs.join('|')})(?![A-Za-z0-9_])`, 'i')
  const files = readdirSync(new URL('src/packs/billing/', root)).map((f) => `src/packs/billing/${f}`)
  for (const f of [...files, 'supabase/migrations/20260926000013_billing.sql']) assert.doesNotMatch(code(read(f)), re, f)
  assert.ok(packs.length >= 2, packs.join(', '))
})
test('money never reaches the chart: billing draws its own screens, one button and one soft check on a row, never a mark, a banner word or a section', () => {
  const index = read('src/packs/billing/index.tsx')
  assert.deepEqual([...index.matchAll(/register(\w+)(?:<\w+>)?\('([^']+)'/g)].map((m) => `${m[1]}:${m[2]}`),
    ['Screen:billing.cashier', 'Screen:billing.today', 'Screen:billing.prices', 'Printout:billing.receipt', 'RowAction:billing', 'SoftCheck:billing'])
  assert.doesNotMatch(index, /registerRowMark|registerBannerWords|registerSection|registerTileLine|registerRenderer/)
})
console.log(`billing: ${n} groups passed`)
