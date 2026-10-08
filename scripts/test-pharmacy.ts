// The pharmacy's day one (spec/openCare.md §5.3), as pure decisions: the directions in Arabic, the amount to give, and another brand
// of the same medicine.   npm run test:pharmacy
import assert from 'node:assert/strict'
import { amountToGive, ar, arabicDirections } from '../src/packs/pharmacy/directions'
import { bareName, sameMedicine } from '../src/packs/pharmacy/substitutes'
import { batchFor, boxesToMinimum, inBoxes, lowAt, pickProduct, productsFor, stateOf, type Elsewhere, type Product } from '../src/packs/pharmacy/shelf'
import { countIn, inStrips, linesFor, priceOf, priceWords, productFor, productsOf, withPrices, type PricedProduct } from '../src/packs/pharmacy/pricing'
import { dueLines, dueTotal } from '../src/core/screens/rows'
import type { Organization } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

test('the directions in Arabic: the dose, how often, the prescription\'s own words, how long', () => {
  assert.equal(ar(30), '٣٠'); assert.equal(ar('0.5'), '٠٫٥')
  assert.equal(arabicDirections({ dose: '500 mg', frequency: 'BD', days: 30, instructions: 'with meals' }), '٥٠٠ مجم مرتين يومياً مع الأكل لمدة ٣٠ يوماً')
  assert.equal(arabicDirections({ dose: '1 tab', frequency: 'BID', days: 7, instructions: 'after meals' }), 'قرص واحد مرتين يومياً بعد الأكل لمدة ٧ أيام')
  assert.equal(arabicDirections({ dose: '2 puffs', frequency: 'PRN' }), 'بختين عند اللزوم')
  assert.equal(arabicDirections({ dose: '1 g', frequency: 'TID', days: 2 }), '١ جم ٣ مرات يومياً لمدة يومين')
  assert.equal(arabicDirections({ dose: '0.5 tab', frequency: 'OD', days: 1 }), 'نصف قرص مرة واحدة يومياً لمدة يوم واحد')
  assert.equal(arabicDirections({ dose: '3 caps', frequency: 'q8h', days: 14, prn: false }), '٣ كبسولات كل ٨ ساعات لمدة ١٤ يوماً')
  assert.equal(arabicDirections({ dose: '5 ml', frequency: 'TDS', days: 5, prn: true }), '٥ مل ٣ مرات يومياً عند اللزوم لمدة ٥ أيام')
  assert.equal(arabicDirections({ dose: '20 mg', frequency: 'OD', instructions: 'swallow whole' }), '٢٠ مجم مرة واحدة يومياً', 'words not known here are left out')
})
test('the amount to give: a dose per take (one unit for a strength) × takes a day × days; none when as needed', () => {
  assert.deepEqual(amountToGive({ dose: '1 g', frequency: 'BID', days: 7 }), { value: 14, unit: 'tablets' })
  assert.deepEqual(amountToGive({ dose: '500 mg', frequency: 'BD', days: 30 }), { value: 60, unit: 'tablets' })
  assert.deepEqual(amountToGive({ dose: '2 tab', frequency: 'TDS', days: 5 }), { value: 30, unit: 'tablets' })
  assert.deepEqual(amountToGive({ dose: '1 cap', frequency: 'q12h', days: 10 }), { value: 20, unit: 'capsules' })
  assert.equal(amountToGive({ dose: '2 puffs', frequency: 'PRN', days: 30 }), null); assert.equal(amountToGive({ dose: '10 mg', frequency: 'OD' }), null)
})
test('another brand of the same medicine: by any of its names; brands first, then the generic; never the one prescribed', () => {
  assert.equal(bareName('Metformin 500 mg'), 'metformin'); assert.equal(bareName('Augmentin 1 g'), 'augmentin')
  const c = sameMedicine('Cidophage 500')!
  assert.equal(c.generic, 'Metformin'); assert.ok(c.others.includes('Glucophage') && c.others.includes('Metformin') && !c.others.includes('Cidophage'))
  assert.ok(!c.others.includes('metformin XR'), 'a form is not a brand')
  const a = sameMedicine('Augmentin')!
  assert.equal(a.atc, 'J01CR02'); assert.deepEqual(a.others, ['Hibiotic', 'Megamox', 'Curam', 'Amoxicillin + clavulanic acid'])
  assert.ok(!sameMedicine('Metformin')!.others.includes('Metformin'), 'the generic prescribed: only brands')
  assert.equal(sameMedicine('Unknown tonic'), null)
})
test('stock: amounts in boxes; out, low, expiring; the batch to give (first to expire with enough); the products a prescription matches', () => {
  assert.deepEqual([60, 46, 16, 0, 1].map((u) => inBoxes(u, 30)), ['2 boxes', '1 box + 16', '16', 'none', '1'])
  const P = (over: Partial<Product>): Product => ({ id: 'p', brand: 'Glucophage 500', generic: 'Metformin', atc: 'A10BA02', pack_size: 30, minimum: 10, on_hand: 360, batches: [], ...over })
  const today = new Date('2026-10-07')
  assert.equal(stateOf(P({ on_hand: 0 }), today), 'out'); assert.equal(stateOf(P({ on_hand: 240 }), today), 'low', 'below 10 boxes')
  assert.equal(stateOf(P({ batches: [{ batch: 'A', expiry: '2026-11-30', units: 30 }] }), today), 'expiring'); assert.equal(stateOf(P({ batches: [{ batch: 'A', expiry: '2027-05-31', units: 30 }] }), today), null)
  const two = P({ batches: [{ batch: 'LATE', expiry: '2027-05-31', units: 300 }, { batch: 'SOON', expiry: '2026-12-31', units: 10 }] })
  assert.equal(batchFor(two, 14)?.batch, 'LATE', 'the first to expire has not enough: the next'); assert.equal(batchFor(two, 10)?.batch, 'SOON')
  assert.equal(batchFor(P({ batches: [] }), 1), null)
  const list = [P({ id: 'g' }), P({ id: 'c', brand: 'Cidophage 500' }), P({ id: 'n', brand: 'Nexium 40', generic: 'Esomeprazole', atc: 'A02BC05' })]
  const m = productsFor(list, 'Cidophage 500 mg'); assert.equal(m.named?.id, 'c'); assert.deepEqual(m.same.map((x) => x.id), ['g'])
  assert.deepEqual(productsFor(list, 'Metformin').same.map((x) => x.id), ['g', 'c'], 'the generic prescribed: every brand of it'); assert.equal(productsFor(list, 'Metformin').named, null)
  const shelfOf = [P({ id: 'g', on_hand: 360 }), P({ id: 'c', brand: 'Cidophage 500', on_hand: 0 })]
  assert.equal(pickProduct(shelfOf, 'Cidophage 500')?.id, 'g', 'the brand named is out: the other brand of it'); assert.equal(pickProduct(shelfOf, 'Metformin')?.id, 'g')
  assert.equal(pickProduct(shelfOf, 'Glucophage 500')?.id, 'g'); assert.equal(pickProduct(shelfOf, 'Nexium 40'), null)
})
test('the store: what is low at the other places (out first), and the boxes back to each one\'s minimum', () => {
  const E = (department_id: string, product_id: string, units: number, minimum: number): Elsewhere => ({ department_id, product_id, units, minimum })
  const aug = { id: 'aug', pack_size: 14 }; const away = [E('ph', 'aug', 112, 15), E('ward', 'aug', 0, 5), E('ph', 'glu', 600, 10), E('ip', 'aug', 300, 10)]
  assert.deepEqual(lowAt(aug, away).map((e) => e.department_id), ['ward', 'ph'], 'out at the ward first, then the pharmacy (8 boxes of 15); the inpatient pharmacy is fine')
  assert.equal(boxesToMinimum(E('ph', 'aug', 112, 15), 14), 7, '8 boxes there, 15 the minimum: 7 more')
  assert.equal(boxesToMinimum(E('ward', 'aug', 0, 5), 14), 5); assert.equal(boxesToMinimum(E('ph', 'aug', 205, 15), 14), 1, 'never less than a box')
})

// ── the pharmacy's own prices (spec §5.4, owner 2026-10-08): per box, per strip; its lines handed on the Dispensing row ──
const PP = (over: Partial<PricedProduct>): PricedProduct => ({ id: 'aug', brand: 'Augmentin 1 g', generic: 'Amoxicillin + clavulanic acid', atc: 'J01CR02', form: 'tablet', pack_size: 14,
  price_box: 145, strip_size: 7, price_strip: 75, ...over })
test('prices: counted in the product\'s own units — whole boxes, then strips for the rest, else a box more; one box where it cannot be counted', () => {
  assert.equal(inStrips(PP({})), true); assert.equal(inStrips(PP({ price_strip: undefined })), false, 'a strip with no price is not sold'); assert.equal(inStrips(PP({ strip_size: 14 })), false, 'a strip the size of the box')
  assert.deepEqual(countIn(PP({}), 14), { boxes: 1, strips: 0 }); assert.deepEqual(countIn(PP({}), 21), { boxes: 1, strips: 1 })
  assert.deepEqual(countIn(PP({}), 6), { boxes: 0, strips: 1 }, 'six tablets: a strip'); assert.deepEqual(countIn(PP({}), 10), { boxes: 1, strips: 0 }, 'strips that would fill a box are a box')
  assert.deepEqual(countIn(PP({ strip_size: undefined, price_strip: undefined }), 15), { boxes: 2, strips: 0 }, 'not sold in strips: a box more')
  assert.deepEqual(countIn(PP({ form: 'syrup', pack_size: 1 }), 21), { boxes: 1, strips: 0 }, 'a syrup: one bottle, whatever the dose count')
  assert.deepEqual(countIn(PP({}), null), { boxes: 1, strips: 0 }, 'an amount not known: one box'); assert.deepEqual(countIn(PP({}), Number.NaN), { boxes: 1, strips: 0 })
  assert.deepEqual(countIn(PP({ form: undefined, pack_size: 30 }), 60), { boxes: 2, strips: 0 }, 'no form, a box of 30: counted')
})
test('prices: the lines handed — a name, a quantity, an amount (plain numbers), the order; free without a box price', () => {
  assert.deepEqual(linesFor(PP({}), 21, 'o1'), [{ name: 'Augmentin 1 g · box', quantity: 1, amount: 145, order: 'o1' }, { name: 'Augmentin 1 g · strip', quantity: 1, amount: 75, order: 'o1' }])
  assert.deepEqual(linesFor(PP({ price_box: undefined }), 14), [], 'no price on the box: free, no line')
  assert.deepEqual(linesFor(PP({ brand: 'Panadol syrup', form: 'syrup', pack_size: 1, price_box: 32.5, strip_size: undefined, price_strip: undefined }), 30),
    [{ name: 'Panadol syrup', quantity: 1, amount: 32.5 }], 'a bottle is its own unit')
  assert.deepEqual(linesFor(PP({ price_box: 0.1 }), 42), [{ name: 'Augmentin 1 g · box', quantity: 3, amount: 0.3 }], 'to the hundredth')
  const lines = [...linesFor(PP({}), 21, 'o1'), ...linesFor(PP({ id: 'nex', brand: 'Nexium 40', pack_size: 14, price_box: 190, strip_size: undefined, price_strip: undefined }), 28, 'o2')]
  assert.deepEqual(dueLines(lines), lines, 'they pass the core\'s lines-due rule as they are'); assert.equal(dueTotal(lines), 600)
  assert.equal(priceWords(linesFor(PP({}), 21)), '1 box + 1 strip · 220'); assert.equal(priceWords(linesFor(PP({ pack_size: 30, strip_size: 10, price_strip: 50 }), 20)), '2 strips · 100')
  assert.equal(priceWords([]), '')
  assert.ok(lines.every((l) => !/EGP|£|\$/.test(JSON.stringify(l))), 'no currency word')
})
test('prices: the product a medicine is — chosen, its brand, else the only one with its active ingredient; the clinic\'s list from its settings', () => {
  const org = { settings: [{ key: 'pharmacy.product', thing_id: 'g', owner_id: null, recorded_at: '', data: { brand: 'Glucophage 500', generic: 'Metformin', atc: 'A10BA02', form: 'tablet', pack_size: 30, price_box: 45 } },
    { key: 'pharmacy.product', thing_id: 'c', owner_id: null, recorded_at: '', data: { brand: 'Cidophage 500', generic: 'Metformin', atc: 'A10BA02', form: 'tablet', pack_size: 30, price_box: 30 } },
    { key: 'pharmacy.product', thing_id: 'n', owner_id: null, recorded_at: '', data: { brand: 'Nexium 40', generic: 'Esomeprazole', atc: 'A02BC05', form: 'tablet', pack_size: 14 } },
    { key: 'pharmacy.counselling', thing_id: 'o', owner_id: null, recorded_at: '', data: { show: true } }] } as unknown as Organization
  const list = productsOf(org)
  assert.deepEqual(list.map((p) => p.id), ['c', 'g', 'n'], 'the products only, by brand')
  assert.equal(productFor(list, 'Glucophage 500 mg')?.id, 'g'); assert.equal(productFor(list, 'Metformin 500 mg', 'c')?.id, 'c', 'the one chosen from the shelf')
  assert.equal(productFor(list, 'Metformin 500 mg'), null, 'two brands of it: none guessed'); assert.equal(productFor(list, 'Esomeprazole 40 mg')?.id, 'n', 'the only one of it')
  assert.equal(productFor(list, 'Unknown tonic'), null)
})
test('prices as typed and saved: a number to the hundredth (a comma too), empty is free; a strip price needs its size', () => {
  assert.equal(priceOf(' 145 '), 145); assert.equal(priceOf('72,5'), 72.5); assert.equal(priceOf(''), undefined)
  for (const bad of ['1.234', '-3', 'abc', '12 EGP', '100000000']) assert.ok(Number.isNaN(priceOf(bad)), bad)
  const base = PP({ price_box: undefined, strip_size: undefined, price_strip: undefined })
  assert.deepEqual(withPrices(base, '145', '75', '7'), { brand: 'Augmentin 1 g', generic: 'Amoxicillin + clavulanic acid', atc: 'J01CR02', form: 'tablet', pack_size: 14, price_box: 145, strip_size: 7, price_strip: 75 })
  assert.deepEqual(withPrices(PP({}), '', '', ''), { brand: 'Augmentin 1 g', generic: 'Amoxicillin + clavulanic acid', atc: 'J01CR02', form: 'tablet', pack_size: 14 }, 'emptied: free again, no id saved')
  assert.equal(withPrices(base, '145', '75', ''), null, 'a strip price needs the strip\'s size'); assert.equal(withPrices(base, 'x', '', ''), null); assert.equal(withPrices(base, '1', '', '0'), null)
})
console.log(`pharmacy: ${n} groups passed`)
