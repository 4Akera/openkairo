// The pharmacy's day one (spec/openCare.md §5.3), as pure decisions: the directions in Arabic, the amount to give, and another brand
// of the same medicine.   npm run test:pharmacy
import assert from 'node:assert/strict'
import { amountToGive, ar, arabicDirections } from '../src/packs/pharmacy/directions'
import { bareName, sameMedicine } from '../src/packs/pharmacy/substitutes'
import { batchFor, inBoxes, pickProduct, productsFor, stateOf, type Product } from '../src/packs/pharmacy/shelf'

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
console.log(`pharmacy: ${n} groups passed`)
