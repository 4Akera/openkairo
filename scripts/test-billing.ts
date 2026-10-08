// The billing pack's client (spec/openCare.md §5.4), as pure decisions: money in piastres, the payment card's lines and sums and what the
// pay operation takes from them, a row's words and marks, a receipt's lines, a drawer counted; every refusal the pack raises has its
// words; billing names no other pack, in its screens or its server.   npm run test:billing
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { blankCard, cardLines, cardSum, cents, drawerWords, egp, owedMarks, owedWords, payArgs, receiptLines, signed, wire, type Card, type Lines, type Payment } from '../src/packs/billing/money'
import { REFUSALS } from '../src/packs/billing/words'
import { WORD, anywayLines, asHanded, asSent, centsOf, handedDue, noData, ordersOf, rowButton, rowData, rowWaits } from '../src/packs/billing/rows'
import type { OrderRow } from '../src/core/db/types'
import type { PackRow } from '../src/core/screens/rows'
import { words } from '../src/core/db/words'

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
  assert.deepEqual(c.map((l) => l.source), ['Internal Medicine · seen 10:12', 'Laboratory · ordered 10:24', 'Laboratory · ordered 10:25', 'Pharmacy · sent 10:30'])
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
  assert.deepEqual(payArgs('pt', c, card), { patient_id: 'pt', method: 'cash', total: '631.50', received: '700.00',
    charges: [{ item: 'v1', department_id: 'im' }, { item: 'o2', department_id: 'lab', price: '300.00' }], sent: ['s1', 's2'],
    handed: [{ name: 'Nexium 40', quantity: 1, amount: '75.00', order_item: 'rx2' }], discount: { amount: '20.00', reason: 'Charity' } })
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
test('billing\'s reading of a list: the waiting read and who owes here, put together; orders asked about once, 500 a read', () => {
  const d = rowData('none', { waiting: ['s1'], paid: ['s2'], ahead: [], pay_first: true, desk: 'own', sent: { s1: '250.00' } }, [{ patient_id: 'pt', total: '150.00', unpriced: 1 }])
  assert.equal(d.desk, 'own', 'the server\'s desk over the screen\'s settings'); assert.ok(d.payFirst); assert.deepEqual([...d.waiting], ['s1']); assert.equal(d.sent.get('s1'), 25000)
  assert.deepEqual(d.owes.get('pt'), { total: 15000, unpriced: 1 })
  assert.equal(rowData('everyone', null, null).desk, 'everyone', 'no read allowed: the settings\' desk, nothing waiting'); assert.equal(rowData('everyone', null, null).waiting.size, 0)
  const many = Array.from({ length: 1201 }, (_, i) => ({ key: `${i}`, patient_id: 'p', visit_id: null, orders: [order(`o${String(i).padStart(4, '0')}`), order('o0000')] }))
  assert.deepEqual(ordersOf(many).map((x) => x.length), [500, 500, 201])
})
test('the lines a row still hands: priced, not paid; to pay here none already sent; to send again only an order whose lines changed', () => {
  const d = { ...noData('none'), paid: new Set(['s2']), sent: new Map([['s1', 25000]]) }
  assert.deepEqual(handedDue(physio(sessions), d, 'pay').map((l) => l.name), ['Elastic band'], 's1 sent, s2 paid: the band (no order) is always handed')
  assert.deepEqual(handedDue(physio(sessions), d, 'send').map((l) => l.order ?? '-'), ['-'], 'sent as it stands: not again')
  const dearer = [{ ...sessions[0], amount: 300 }, sessions[2]]
  assert.deepEqual(handedDue(physio(dearer), d, 'send').map((l) => l.order ?? '-'), ['s1', '-'], 'changed since it was sent: sent again (it replaces what is not paid)')
  assert.deepEqual(handedDue(physio([{ name: 'Free', quantity: 1, amount: 0, order: 's1' }, { name: ' ', quantity: 1, amount: 5 }, { name: 'x', quantity: 0, amount: 5 }]), noData(), 'pay'), [],
    'nothing at nothing, no words, no quantity: not a line')
  assert.equal(centsOf(sessions), 56000)
  assert.deepEqual(asHanded([sessions[0]]), [{ name: 'Session · 45 min', quantity: 1, amount: '250.00', order_item: 's1' }])
  assert.deepEqual(asSent([sessions[2]]), [{ name: 'Elastic band', quantity: 2, amount: '60.00' }])
})
test('billing\'s one button on any department\'s row: Pay where it takes payment here, Send to cashier where it does not, for whoever may', () => {
  const pays = may('write:billing.payment', 'read:bench')
  assert.equal(rowButton(physio(sessions), pays, noData('own')), 'Pay', 'its own lines, at its counter')
  assert.equal(rowButton(physio([]), pays, noData('own')), null, 'nothing handed, nothing owed: no button')
  assert.equal(rowButton(physio([]), pays, { ...noData('everyone'), owes: new Map([['pt', { total: 0, unpriced: 1 }]]) }), 'Pay', 'a line to price owed at this desk')
  assert.equal(rowButton(physio(sessions), may('read:bench'), noData('own')), null, 'not for whoever does not take payment')
  assert.equal(rowButton(physio(sessions), may('read:bench'), noData('none')), 'Send to cashier')
  assert.equal(rowButton(physio(sessions), may(), noData('none')), null, 'nor for whoever does not work the list')
  const sent = { ...noData('none'), sent: new Map([['s1', 25000], ['s2', 25000]]) }
  assert.equal(rowButton(physio(sessions.slice(0, 2)), may('read:bench'), sent), 'Sent to cashier', 'sent as it stands: the card says so')
  assert.equal(rowButton(physio([{ ...sessions[0], amount: 300 }, sessions[1]]), may('read:bench'), sent), 'Send to cashier', 'changed: send it again')
  assert.equal(rowButton(physio(sessions.slice(0, 2)), pays, { ...noData('own'), sent: new Map([['s1', 25000], ['s2', 25000]]), owes: new Map([['pt', { total: 50000, unpriced: 0 }]]) }), 'Pay',
    'sent before the counter took payment: its open bill is paid here')
})
test('Pay first, per order: what billing holds unpaid, and under the department\'s own Pay first what its row prices and nobody paid; gone ahead, never again', () => {
  const row = physio(sessions, ['s1', 's2', 'lab1'])
  assert.deepEqual(rowWaits(row, 'screen', { ...noData(), waiting: new Set(['lab1']) }).map((w) => w.order), ['lab1'], 'Pay first off here: only what billing holds')
  const on = { ...noData(), payFirst: true, paid: new Set(['s2']), ahead: new Set(['lab1']), waiting: new Set(['lab1']) }
  assert.deepEqual(rowWaits(row, 'screen', on), [{ order: 's1', word: WORD, tone: 'warn' }], 's2 paid, lab1 gone ahead, the band has no order: s1 waits')
  assert.deepEqual(rowWaits(physio([{ name: 'Free', quantity: 1, amount: 0, order: 's1' }]), 'bench', { ...noData(), payFirst: true }), [], 'free never waits')
  assert.deepEqual(rowWaits(physio(sessions, ['s2']), 'bench', { ...noData(), payFirst: true }).map((w) => w.order), ['s2'], 'only orders on the row')
  assert.deepEqual(rowWaits(row, 'chart', { ...noData(), payFirst: true, waiting: new Set(['s2']) }).map((w) => w.order), ['s2'], 'the chart: billing\'s own words only')
  assert.ok(rowWaits(row, 'screen', on).every((w) => !/\d/.test(w.word)), 'a word, never a number')
  assert.deepEqual(anywayLines(physio(sessions), ['s2']).map((l) => l.order), ['s2'], 'going ahead: the lines of those orders go to the cashier first')
})
const sql = read('supabase/migrations/20260926000013_billing.sql')
const code = (t: string) => t.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
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
  assert.deepEqual([...index.matchAll(/register(\w+)\('([^']+)'/g)].map((m) => `${m[1]}:${m[2]}`),
    ['Screen:billing.cashier', 'Screen:billing.today', 'Screen:billing.prices', 'RowAction:billing', 'SoftCheck:billing'])
  assert.doesNotMatch(index, /registerRowMark|registerBannerWords|registerSection|registerTileLine|registerRenderer/)
})
console.log(`billing: ${n} groups passed`)
