// ObGyn's labour ward, the birth (spec/openCare.md §5.6), the client's pure decisions: Apgar's five signs in the
// declared table's words; the birth card's problems, its PPH notice (WHO: 500 mL after a vaginal birth, 1000 after a caesarean; only a
// notice), oxytocin's and vitamin K's doses; the ONE set its Sign writes (the mother's birth, oxytocin and pregnancy's end; each baby's
// record, stay, weight, Apgar and doses), for one baby and for twins; the free cots; the tile's words after birth and a baby's, the
// buttons gone after birth; the banner's PPH. Pure: no browser, no database.   npm run test:birth
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { APGAR, APGAR_SIGNS, apgarComplete, apgarStarted, type ApgarInputs } from '../src/packs/obgyn/labour/apgar'
import { addBaby, apgarWaiting, babyName, clockTime, emptyBirth, entriesOf, freeCots, oxytocinOf, pphOf, problemsOf, vitaminKOf, withMode, type BirthDraft, type Where } from '../src/packs/obgyn/labour/birth'
import { afterWords, babyWords, pphWord } from '../src/packs/obgyn/labour/after'
import { birthButton, inLabour, labourWords, partographButton, rememberBoard, tileWords, type LabourBoard, type LabourStay } from '../src/packs/obgyn/labour/board'
import { BIRTH } from '../src/packs/obgyn/labour/codes'
import { registerTileButton, tileActions, tileButtonDefs, type TileCtx } from '../src/core/screens/ward/tiles'
import { ownOf } from '../src/core/screens/chart/sections'
import type { WordsInput } from '../src/core/screens/chart/words'
import { E, ctx as chartCtx, org as baseOrg, presence, record, table } from './chart-fixtures'
import type { Place, PresenceRow } from '../src/core/db/types'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const NOW = Date.parse('2026-10-09T10:00:00Z')
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString()
const all = (v: '0' | '1' | '2'): ApgarInputs => ({ colour: v, heart: v, grimace: v, activity: v, breathing: v })
const ids = () => { let k = 0; return () => `id${++k}` }

test('Apgar: the five signs in the table\'s order and words; complete and started', () => {
  assert.equal(APGAR, 'obgyn.apgar')
  assert.deepEqual(APGAR_SIGNS.map((s) => s.key), ['colour', 'heart', 'grimace', 'activity', 'breathing'])
  assert.deepEqual(APGAR_SIGNS[0].words, ['Blue or pale all over', 'Blue hands and feet', 'Pink all over'])
  assert.deepEqual(APGAR_SIGNS[1].words, ['None', 'Under 100', '100 or more']); assert.deepEqual(APGAR_SIGNS[4].words, ['None', 'Slow or irregular', 'Good, crying'])
  assert.ok(apgarComplete(all('2'))); assert.ok(!apgarComplete({ colour: '1' })); assert.ok(apgarStarted({ colour: '1' })); assert.ok(!apgarStarted({})); assert.ok(!apgarComplete({}))
})

const fill = (d: BirthDraft, over: Partial<BirthDraft> = {}): BirthDraft => ({ ...d, mode: 'normal', babies: d.babies.map((b) => ({ ...b, sex: 'female', grams: 3100 })), ...over })
test('the card: what blocks Sign, the PPH notice, oxytocin and vitamin K by How and the weight', () => {
  const d = emptyBirth(new Date(NOW), 'me', ids(), ['c3', 'c4'])
  assert.equal(d.bornAt, new Date(NOW).toISOString()); assert.equal(d.by, 'me'); assert.ok(d.oxytocin)
  assert.deepEqual(d.babies[0].doses, { vitamin_k: true, eye: true, hep_b: false }); assert.equal(d.babies[0].cot, 'c3')
  const texts = (x: BirthDraft) => problemsOf(x, NOW).map((p) => `${p.field}: ${p.text}`)
  assert.deepEqual(texts(d), ['mode: How was she delivered?', 'baby0.sex: Girl, boy or not sure', 'baby0.grams: The weight in grams, 300–6500'])
  const ok = fill(d); assert.deepEqual(texts(ok), [])
  assert.deepEqual(texts({ ...ok, bornAt: ago(-2) }), ['bornAt: The birth time is after now']); assert.deepEqual(texts({ ...ok, bornAt: ago(-1) }), [], 'a minute\'s grace')
  assert.deepEqual(texts({ ...ok, bornAt: ago(25 * 60) }), ['bornAt: A birth more than a day ago: write it in the chart'])
  assert.deepEqual(texts({ ...ok, babies: [{ ...ok.babies[0], grams: 6800 }] }), ['baby0.grams: The weight in grams, 300–6500'])
  assert.deepEqual(texts({ ...ok, babies: [{ ...ok.babies[0], apgar1: { colour: '1', heart: '2' } }] }), ['baby0.apgar1: Apgar at 1 minute: all five signs, or none'])
  assert.deepEqual(texts({ ...ok, bloodLoss: 6000 }), ['bloodLoss: Blood loss in mL, 0–5000'])
  assert.deepEqual(texts({ ...ok, perineum: 'intact', episiotomy: true }), ['perineum: An episiotomy: the perineum is not intact — choose the degree'], 'as the birth\'s check refuses')
  assert.equal(pphOf(ok), null, 'no blood loss said: no notice')
  assert.equal(pphOf({ mode: 'normal', bloodLoss: 499 })?.over, false)
  assert.deepEqual(pphOf({ mode: 'normal', bloodLoss: 500 }), { ml: 500, over: true, words: 'PPH: 500 mL (500 or more after a vaginal birth). Tell the doctor now. Only a notice.' })
  assert.equal(pphOf({ mode: 'caesarean', bloodLoss: 900 })?.over, false)
  assert.equal(pphOf({ mode: 'caesarean', bloodLoss: 1000 })?.words, 'PPH: 1000 mL (1000 or more after a caesarean). Tell the doctor now. Only a notice.')
  const cs = withMode({ ...ok, perineum: 'second', episiotomy: true, repaired: true }, 'caesarean')
  assert.deepEqual([cs.perineum, cs.episiotomy, cs.repaired], [undefined, false, false], 'a caesarean clears the perineum')
  assert.deepEqual(oxytocinOf('caesarean'), { dose: 5, route: 'iv', words: '5 units slow IV' })
  assert.deepEqual(oxytocinOf('normal'), { dose: 10, route: 'im', words: '10 units IM' }); assert.deepEqual(oxytocinOf(undefined), oxytocinOf('normal'))
  assert.equal(vitaminKOf(1499).mg, 0.5); assert.equal(vitaminKOf(1499).words, '0.5 mg IM'); assert.equal(vitaminKOf(1500).mg, 1); assert.equal(vitaminKOf(3100).words, '1 mg IM')
  assert.equal(clockTime('12:40', NOW), '2026-10-09T09:40:00.000Z', 'today in the clinic\'s zone'); assert.equal(clockTime('25:00', NOW), null)
  const night = Date.parse('2026-10-08T21:05:00Z') // 00:05 in Cairo
  assert.equal(clockTime('23:55', night), '2026-10-08T20:55:00.000Z', 'signed after midnight: the evening before'); assert.equal(clockTime('00:01', night), '2026-10-08T21:01:00.000Z')
  assert.deepEqual(problemsOf({ ...ok, bornAt: clockTime('23:55', night)! }, night), [])
  const place = (id: string, name: string, position: number, closed = false): Place => ({ id, department_id: 'lw', parent_id: null, label: 'bed', name, position, closed, closed_reason: null })
  const places = [place('d1', 'Delivery 1', 1), place('c2', 'Cot 2', 12), place('c1', 'Cot 1', 11), place('c3', 'Cot 3', 13, true), { ...place('x', 'Cot 9', 1), department_id: 'other' }]
  assert.deepEqual(freeCots(places, [{ place_id: 'c1', state: 'admitted' }, { place_id: 'c2', state: 'discharged' }], 'lw').map((p) => p.id), ['c2'], 'the free cots, open, here')
  assert.deepEqual(freeCots([place('d1', 'Delivery 1', 1), place('d2', 'Delivery 2', 2)], [{ place_id: 'd1', state: 'admitted' }], 'lw').map((p) => p.id), ['d2'], 'no cots: the free places')
  assert.deepEqual(freeCots(places, [{ place_id: 'c1', state: 'admitted' }, { place_id: 'c2', state: 'admitted' }], 'lw').map((p) => p.id), ['d1'], 'every cot taken: the free places')
})

// the server's Apgar answer, as the card keeps it (the test adds up; the card never does)
const apgar: Where['apgar'] = (i) => { const t = Object.values(i).reduce((a, v) => a + Number(v), 0); return { total: t, band: t >= 7 ? 'reassuring' : t >= 4 ? 'moderate' : 'low', version: '1953' } }
const preg = { entry: 'pe2', item: 'pi', version: 2, data: { status: 'current' as const, pregnant: true, lmp: { value: '2026-01-07', precision: 'day' } } }
const W: Where = { mother: 'mum', motherName: 'Salma Ahmed Abdelrahman', stay: 'st1', dept: 'lw', pregnancy: preg, apgar }
const none: Where['apgar'] = () => null
const AT = '2026-10-09T09:40:00.000Z'
test('the set, one baby: its order, the baby\'s record and stay, weight, Apgar, doses; the mother\'s oxytocin and pregnancy\'s end', () => {
  const d = fill(emptyBirth(new Date(NOW), 'me', ids(), ['c3']), { bornAt: AT, perineum: 'second', repaired: true, placenta: 'complete', bloodLoss: 350 })
  d.babies[0] = { ...d.babies[0], breathing: 'cried', apgar1: { colour: '1', heart: '2', grimace: '2', activity: '1', breathing: '2' }, apgar5: all('2') }
  assert.ok(apgarWaiting(d, none), 'an Apgar complete with no answer yet: Sign waits'); assert.ok(!apgarWaiting(d, apgar))
  assert.ok(!apgarWaiting({ ...d, babies: [{ ...d.babies[0], apgar1: {}, apgar5: {} }] }, none), 'no Apgar: nothing to wait for')
  const x = entriesOf(d, W, ids(), NOW)
  assert.deepEqual(x.entries.map((e) => e.type), ['obgyn.birth', 'given', 'pregnancy', 'admitted', 'vitals', 'score', 'score', 'given', 'given'])
  const [b, ox, end, adm, vit, a1, a5, vk, eye] = x.entries
  assert.deepEqual(b.data, { mode: 'normal', perineum: 'second', repaired: true, placenta: 'complete', blood_loss: { value: '350', unit: 'mL', ucum: 'mL' }, delivered_by: { to: 'user', id: 'me' },
    babies: [{ patient: { to: 'patient', id: 'id1' }, born_at: AT, sex: 'female', grams: 3100, breathing: 'cried' }] })
  assert.deepEqual([b.patient_id, b.visit_id, b.occurred_at], ['mum', 'st1', AT])
  assert.deepEqual(ox.data, { drug: { text: 'Oxytocin', codings: [] }, dose: { value: '10', unit: 'units', ucum: '[iU]' }, route: 'im', status: 'completed' })
  assert.equal(ox.occurred_at, '2026-10-09T09:41:00.000Z')
  assert.deepEqual([end.refers_to, end.relation, end.data], ['pe2', 'changes', { ...preg.data, status: 'ended', reason: 'delivered' }]); assert.deepEqual(x.seen, { pi: 2 })
  for (const e of [adm, vit, a1, a5, vk, eye]) assert.deepEqual([e.patient_id, e.visit_id], ['id1', 'id2'], 'the baby\'s own entries, in its own stay')
  assert.equal(adm.id, 'id2'); assert.deepEqual(adm.data, { department_id: 'lw', place_id: 'c3', admit_source: 'born', reason: 'born here' })
  assert.deepEqual(vit.data, { weight: { value: '3.1', unit: 'kg', ucum: 'kg' } })
  assert.deepEqual(a1.data, { score: 'obgyn.apgar', version: '1953', inputs: d.babies[0].apgar1, total: 8, band: 'reassuring', note: '1 min' })
  assert.deepEqual([a5.data, a5.occurred_at], [{ score: 'obgyn.apgar', version: '1953', inputs: all('2'), total: 10, band: 'reassuring', note: '5 min' }, '2026-10-09T09:45:00.000Z'])
  assert.deepEqual(vk.data, { drug: { text: 'Vitamin K (phytomenadione)' }, dose: { value: '1', unit: 'mg', ucum: 'mg' }, route: 'im', status: 'completed' })
  assert.deepEqual(eye.data, { drug: { text: 'Eye ointment (tetracycline 1%)' }, route: 'eye', status: 'completed' }); assert.equal(vk.occurred_at, new Date(NOW).toISOString())
  assert.deepEqual(x.patients, [{ id: 'id1', mother: 'mum', full_name: 'Baby of Salma Ahmed Abdelrahman', gender: 'female', birth_date: '2026-10-09', department_id: 'lw' }])
  const bare = entriesOf({ ...d, oxytocin: false, babies: [{ ...d.babies[0], cot: null, grams: 3350, apgar1: {}, apgar5: {} }] }, { ...W, pregnancy: null }, ids(), NOW)
  assert.deepEqual(bare.entries.map((e) => e.type), ['obgyn.birth', 'admitted', 'vitals', 'given', 'given'], 'no oxytocin, no pregnancy, no Apgar'); assert.deepEqual(bare.seen, {})
  assert.deepEqual(bare.entries[1].data, { department_id: 'lw', admit_source: 'born', reason: 'born here' }, 'no cot: no place'); assert.deepEqual(bare.entries[2].data, { weight: { value: '3.35', unit: 'kg', ucum: 'kg' } })
  const c = entriesOf(withMode({ ...d, bloodLoss: 700 }, 'caesarean'), W, ids(), NOW)
  assert.deepEqual(c.entries[1].data, { drug: { text: 'Oxytocin', codings: [] }, dose: { value: '5', unit: 'units', ucum: '[iU]' }, route: 'iv', note: 'slow IV', status: 'completed' })
  assert.ok(!('perineum' in c.entries[0].data) && !('repaired' in c.entries[0].data), 'no perineum after a caesarean')
  const small = entriesOf({ ...d, babies: [{ ...d.babies[0], grams: 1200 }] }, W, ids(), NOW).entries.find((e) => e.type === 'given' && e.patient_id === 'id1')
  assert.deepEqual((small?.data as { dose?: unknown }).dose, { value: '0.5', unit: 'mg', ucum: 'mg' }, 'the preterm dose under 1500 g')
})
test('twins: one birth with two babies, two records "Baby 1 of …" and "Baby 2 of …", two cots; up to four on the card', () => {
  const g = ids(); const one = emptyBirth(new Date(NOW), 'me', g, ['c4', 'c5'])
  const d = fill(addBaby(one, g, ['c4', 'c5']), { bornAt: AT })
  assert.deepEqual(d.babies.map((b) => b.cot), ['c4', 'c5'], 'the next free cot')
  const x = entriesOf({ ...d, babies: [d.babies[0], { ...d.babies[1], sex: 'male', grams: 2550 }] }, W, ids(), NOW)
  assert.equal(x.entries.filter((e) => e.type === BIRTH).length, 1)
  assert.deepEqual((x.entries[0].data as { babies: { patient: { id: string }; sex: string }[] }).babies.map((b) => [b.patient.id, b.sex]), [['id1', 'female'], ['id3', 'male']])
  assert.deepEqual(x.patients.map((p) => [p.full_name, p.gender]), [['Baby 1 of Salma Ahmed Abdelrahman', 'female'], ['Baby 2 of Salma Ahmed Abdelrahman', 'male']])
  assert.deepEqual(x.entries.filter((e) => e.type === 'admitted').map((e) => [e.patient_id, (e.data as { place_id?: string }).place_id]), [['id1', 'c4'], ['id3', 'c5']])
  assert.equal(babyName('Salma', 1, 1), 'Baby of Salma'); assert.equal(addBaby(addBaby(addBaby(d, g, []), g, []), g, []).babies.length, 4, 'four at most')
  assert.equal(addBaby(addBaby(d, g, []), g, []).babies[3].cot, null, 'no cot left')
})

// the board's read after the births, as obgyn.board answers it
const HEBA: LabourStay = { exams: [{ at: ago(660), cervix: 4 }], birth: { at: '2026-10-09T03:40:00Z', mode: 'normal', blood_loss: 350, babies: [{ sex: 'female', grams: 3100, born_at: '2026-10-09T03:40:00Z' }] } }
const MARWA: LabourStay = { exams: [{ at: ago(1500), cervix: 3 }], birth: { at: '2026-10-08T07:30:00Z', mode: 'caesarean', blood_loss: 700, babies: [{ sex: 'male', grams: 3350, born_at: '2026-10-08T07:30:00Z' }] } }
const BABY: LabourStay = { exams: [], baby: { apgar: [{ note: '1 min', total: 8 }, { note: '5 min', total: 9 }], kg: 3.1, given: [{ drug: 'Vitamin K (phytomenadione)', at: ago(300) }, { drug: 'Eye ointment (tetracycline 1%)', at: ago(300) }] } }
const SALMA: LabourStay = { exams: [{ at: ago(60), cervix: 6 }], pregnancy: { at: ago(100) } }
const BOARD: LabourBoard = { patient_ids: [], stays: { heba: HEBA, marwa: MARWA, baby: BABY, salma: SALMA } }
const row = (item: string, over: Partial<PresenceRow> = {}): PresenceRow => presence(item, { kind: 'stay', state: 'admitted', department_id: 'lw', ...over })
const t: TileCtx = { dept: { id: 'lw', packs: ['obgyn'] }, place: null, identity: null, day: 1, can: () => true, org: baseOrg }
test('the tile after birth: the birth\'s words, each baby, PPH; a baby\'s weight, Apgar and doses; no button after birth', () => {
  assert.deepEqual(tileWords(row('heba'), t, BOARD, NOW), { words: ['born 06:40', 'normal', 'girl 3.1 kg'] })
  assert.deepEqual(tileWords(row('marwa'), t, BOARD, NOW), { words: ['CS day 1', 'boy 3.4 kg'] })
  assert.deepEqual(afterWords(row('x'), { ...MARWA, birth: { ...MARWA.birth!, mode: 'normal', at: '2026-10-07T07:30:00Z', blood_loss: 300 } }, t, NOW), { words: ['day 2 after birth', 'boy 3.4 kg'] })
  assert.deepEqual(afterWords(row('x'), { ...HEBA, birth: { ...HEBA.birth!, blood_loss: 600 } }, t, NOW)?.words.at(-1), { text: 'PPH 600 mL', tone: 'danger' })
  assert.deepEqual(pphWord({ mode: 'caesarean', blood_loss: 900 }), null); assert.deepEqual(pphWord({ mode: 'caesarean', blood_loss: 1000 }), { text: 'PPH 1000 mL', tone: 'danger' })
  const born = row('baby', { checked_in_at: ago(300) })
  assert.deepEqual(tileWords(born, t, BOARD, NOW), { words: ['3.1 kg', 'Apgar 8 · 9', 'vitamin K given', 'hepatitis B due'] })
  assert.deepEqual(babyWords(born, BABY, NOW + 25 * 3_600_000)?.words.at(-1), { text: 'hepatitis B late', tone: 'warn' })
  assert.deepEqual(babyWords(born, { exams: [], baby: { apgar: [{ note: '1 min', total: 8 }], kg: 3.35, given: [{ drug: 'Hepatitis B vaccine', at: ago(1) }] } }, NOW)?.words,
    ['3.4 kg', 'Apgar 8', { text: 'vitamin K due', tone: 'warn' }, 'hepatitis B given'])
  assert.ok(!inLabour(HEBA) && !inLabour(BABY) && inLabour(SALMA), 'a birth or a baby\'s data: no longer in labour')
  assert.ok(registerTileButton('obgyn', partographButton)); assert.ok(registerTileButton('obgyn', birthButton))
  rememberBoard('lw', BOARD)
  const buttons = (item: string) => tileActions(tileButtonDefs(), { closed: false }, { row: row(item), ctx: t }, true).filter((a) => !a.base).map((a) => a.label)
  assert.deepEqual(buttons('salma'), ['Partograph', 'Birth']); assert.deepEqual(buttons('heba'), []); assert.deepEqual(buttons('baby'), [])
  assert.equal(birthButton.path?.(row('salma'), t), '/?tab=obgyn.labour&stay=salma&birth=1')
})
const open = record({ 'base.presence': table([presence('st1', { kind: 'stay', state: 'admitted', department_id: 'lw' })]) })
const birthE = (mode: string, ml: number) => E(BIRTH, { visit_id: 'st1', department_id: 'lw', occurred_at: ago(30), data: { mode, blood_loss: { value: String(ml), unit: 'mL', ucum: 'mL' }, babies: [] } })
const input = (es: ReturnType<typeof E>[]): WordsInput => ({ rec: open, ctx: { ...chartCtx, org: baseOrg, departmentId: 'lw' }, identity: { gender: 'female', birth_date: '1999-01-01' } as WordsInput['identity'],
  own: ownOf(es, [BIRTH]) })
test('the banner after birth: PPH when over, only a notice; nothing else', () => {
  assert.deepEqual(labourWords(input([birthE('normal', 600)]), new Date(NOW)), [{ word: 'PPH 600 mL', rank: 1, tone: 'danger' }])
  assert.deepEqual(labourWords(input([birthE('normal', 350)]), new Date(NOW)), [])
  assert.deepEqual(labourWords(input([birthE('caesarean', 900)]), new Date(NOW)), []); assert.deepEqual(labourWords(input([birthE('caesarean', 1000)]), new Date(NOW))[0]?.word, 'PPH 1000 mL')
})
console.log(`birth: ${n} groups passed`)
