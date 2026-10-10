// Ward nursing's going home (spec/openCare.md §5.6, W3b): /home and its words, the card drafted from the stay (the patient's own
// medicines on Continue, the ward's undecided), a medicine's words, the line with its counts, a new or changed medicine as /rx reads it,
// the letter, the one set (the letter, a ward medicine kept signed again, the stops, changes and new ones, an order where /rx sends
// from this ward, the discharge while the stay is admitted), and the ward's Arabic words for the patient. Pure: no browser, no
// database.   npm run test:home
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { addMed, addWords, changeOf, daysLeft, homeEntries, homeLine, homeText, medHow, parseHome, phrasesIn, toDecide, type HomeMed, type HomeParams } from '../src/packs/bedside/home'
import type { Ctx } from '../src/core/screens/visit/parse'
import { PLAIN_SEND, registerSend } from '../src/core/screens/visit/send'
import type { Medication, Organization, Service } from '../src/core/db/types'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

const drug = (text: string, atc: string) => ({ text, codings: [{ system: 'atc', code: atc, display: text }] })
const med = (id: string, over: Partial<Medication>): Medication => ({ id, drug_code: null, drug_name: '', dose_number: null, dose_unit: null, route: null, frequency: null, prn: false,
  problem_id: null, status: 'active', started_on: '2026-10-07', ...over })
const m1 = med('m1', { entry_id: 'e1', drug_name: 'Prednisolone', dose_number: 40, dose_unit: 'mg', frequency: 'OD', route: 'oral', duration_days: 5,
  data: { basis: 'prescribed', drug: drug('Prednisolone', 'H02AB06'), dosage: { dose: { value: '40', unit: 'mg', ucum: 'mg' }, timing: { code: 'OD' }, route: 'oral' }, duration_days: 5, status: 'active' } })
const m2 = med('m2', { entry_id: 'e2', drug_name: 'Salbutamol nebuliser', dose_number: 5, dose_unit: 'mg', frequency: 'q6h', route: 'inhaled',
  data: { basis: 'prescribed', drug: drug('Salbutamol nebuliser', 'R03AC02'), dosage: { dose: { value: '5', unit: 'mg', ucum: 'mg' }, timing: { code: 'q6h' }, route: 'inhaled' }, status: 'active' } })
const m3 = med('m3', { entry_id: 'e3', drug_name: 'Amoxicillin', status: 'stopped' })
const m4 = med('m4', { entry_id: 'e4', drug_name: 'Tiotropium', dose_number: 18, dose_unit: 'mcg', frequency: 'OD', route: 'inhaled', basis: 'reported',
  data: { basis: 'reported', drug: drug('Tiotropium', 'R03BB04'), dosage: { dose: { value: '18', unit: 'mcg', ucum: 'ug' }, timing: { code: 'OD' }, route: 'inhaled' }, status: 'active' } })
const ctx = { services: [], templates: [], departments: [{ id: 'ward', name: 'Medical Ward', packs: ['bedside'] }], problems: [{ id: 'p1', name: 'COPD exacerbation' }],
  departmentId: 'ward', record: { medications: [m1, m2, m3, m4], allergies: [], values: [] } } as unknown as Ctx
const AR = 'ارجع المستشفى على طول لو حصل ضيق في النفس.'
const NOW = Date.parse('2026-10-09T07:30:00Z')   // 10:30 in Cairo

test('/home and its words', () => {
  const r = parseHome('', ctx); assert.ok(r && 'ok' in r)
  const [d] = r.ok; const q = d.params as unknown as HomeParams
  assert.equal(d.function, 'bedside.home'); assert.equal(d.action, 'write:discharged'); assert.equal(q.to, 'home'); assert.equal(q.diagnoses, 'COPD exacerbation')
  assert.deepEqual(q.meds.map((m) => m.id), ['m1', 'm2', 'm4'])
  assert.deepEqual(q.meds.map((m) => [m.keep, m.reported]), [[undefined, false], [undefined, false], ['continue', true]])
  const to = (w: string) => { const x = parseHome(w, ctx); return x && 'ok' in x ? (x.ok[0].params as unknown as HomeParams).to : x }
  assert.equal(to('facility'), 'other-hcf'); assert.equal(to('LAMA'), 'aadvice'); assert.equal(to('other'), 'oth')
  for (const w of ['died', 'hospice']) { const x = parseHome(w, ctx); assert.ok(x && 'error' in x && x.error.includes('Discharge → Died')) }
  assert.deepEqual(parseHome('xyz', ctx), { error: 'Going home: /home, or /home facility · lama · other' })
})

test('a medicine in words', () => {
  assert.equal(medHow(m1), '40 mg · OD · oral · 5 days')
  assert.equal(medHow(med('x', { dose_number: 200, dose_unit: 'mcg', frequency: 'PRN', prn: true, prn_reason_text: 'wheeze', route: 'inhaled' })), '200 mcg · PRN wheeze · inhaled')
  // a PRN one with a schedule keeps it; a dose in words alone is shown as written
  assert.equal(medHow(med('x', { dose_number: 200, dose_unit: 'mcg', frequency: 'q4h', prn: true, prn_reason_text: 'wheeze', route: 'inhaled' })), '200 mcg · q4h PRN wheeze · inhaled')
  assert.equal(medHow(med('x', { route: 'sc', data: { basis: 'prescribed', drug: drug('Soluble insulin (human)', 'A10AB01'), dosage: { text: 'by the sliding scale', route: 'sc' }, status: 'active' } })),
    'by the sliding scale · sc')
})

const homeMed = (m: Medication, over: Partial<HomeMed> = {}): HomeMed => ({ id: m.id, entry_id: m.entry_id, name: m.drug_name, how: medHow(m), reported: m.data?.basis === 'reported', data: m.data,
  started_on: m.started_on, ...over })
test('the line and its counts', () => {
  assert.equal(homeLine({ to: 'home', meds: [homeMed(m1, { keep: 'continue' }), homeMed(m4, { keep: 'continue' })] }), 'Going home · Home · 2 kept')
  const c1 = changeOf(homeMed(m1), '20 mg od 3d', ctx); assert.ok(!('error' in c1))
  assert.equal(homeLine({ to: 'home', meds: [homeMed(m4, { keep: 'continue' }), homeMed(m2, { keep: 'stop' }), c1], added: [{ line: 'x', params: {} }] }),
    'Going home · Home · 1 kept · 1 stopped · 1 changed · 1 new')
  // Change with no new dose read is not decided: never "changed"
  assert.equal(homeLine({ to: 'home', meds: [homeMed(m4, { keep: 'continue' }), homeMed(m1, { keep: 'change' })] }), 'Going home · Home · 1 kept · 1 to decide')
  const r = parseHome('', ctx); assert.ok(r && 'ok' in r)
  assert.equal(homeLine(r.ok[0].params as Partial<HomeParams>), 'Going home · Home · 1 kept · 2 to decide'); assert.equal(r.ok[0].line, 'Going home · Home · 1 kept · 2 to decide')
  assert.equal(toDecide(r.ok[0].params as Partial<HomeParams>), 2)
  assert.equal(homeLine({ to: 'other-hcf', meds: [], added: [] }), 'Going home · Another facility · no medicines')
})

test('a new or changed medicine, as /rx reads it', () => {
  const a = addMed('cefuroxime 500 bd 5d', ctx); assert.ok('ok' in a)
  assert.equal(a.ok.params.action, 'start'); assert.equal(a.ok.params.send, false); assert.match(String((a.ok.params.drug as { name: string }).name), /^Cefuroxime/); assert.match(a.ok.line, /^Cefuroxime/)
  const s = addMed('cefuroxime 500 bd 5d send', ctx); assert.ok('ok' in s && s.ok.params.send === true)
  assert.ok('error' in addMed('', ctx))
  assert.deepEqual(addMed('for dm', ctx), { error: 'Type the drug name after /rx' })
  const c = changeOf(homeMed(m1), '20 mg od 3d', ctx); assert.ok(!('error' in c))
  assert.equal(c.keep, 'change'); assert.equal(c.change?.action, 'change'); assert.equal(c.change?.medication_id, 'm1'); assert.match(c.change_line ?? '', /20 mg/)
  // a change keeps what the item was: its name as written, its ATC code, its route when none is typed
  const inh = med('m6', { entry_id: 'e6', drug_name: 'Salbutamol inhaler', dose_number: 200, dose_unit: 'mcg', frequency: 'PRN', prn: true, prn_reason_text: 'wheeze', route: 'inhaled',
    data: { basis: 'reported', drug: drug('Salbutamol inhaler', 'R03AC02'), dosage: { dose: { value: '200', unit: 'mcg', ucum: 'ug' }, as_needed: true, as_needed_for: 'wheeze', route: 'inhaled' }, status: 'active' } })
  const ci = changeOf(homeMed(inh), '100 mcg qid', ctx); assert.ok(!('error' in ci))
  assert.deepEqual(ci.change?.drug, { name: 'Salbutamol inhaler', code: 'atc:R03AC02' }); assert.equal(ci.change?.route, 'inhaled'); assert.match(ci.change_line ?? '', /^Salbutamol inhaler 100 mcg/)
  const [en] = homeEntries({ to: 'home', diagnoses: '', done: '', meds: [ci], added: [], follow: '', words: '' }, { patientId: 'pt', departmentId: 'ward', visitId: 'st' },
    { item: 'st', patient_id: 'pt', latest_entry: 'L', state: 'discharged' }, NOW).filter((e) => e.type === 'medication')
  const d = en.data as { drug: { text: string; codings: { code: string }[] }; dosage: { route?: string } }
  assert.equal(d.drug.text, 'Salbutamol inhaler'); assert.equal(d.drug.codings[0]?.code, 'R03AC02'); assert.equal(d.dosage.route, 'inhaled')
})

const full = (): HomeParams => {
  const c = changeOf(homeMed(m1), '20 mg od 3d', ctx); const a = addMed('cefuroxime 500 bd 5d', ctx)
  if ('error' in c || 'error' in a) throw new Error('drafts')
  return { to: 'home', diagnoses: 'COPD exacerbation', done: 'nebulisers, steroids, controlled oxygen', follow: 'Chest clinic in 2 weeks', words: AR,
    meds: [homeMed(m4, { keep: 'continue' }), homeMed(m2, { keep: 'stop', reason: 'home on his inhalers' }), c], added: [a.ok] }
}
test('the letter', () => {
  const q = full()
  assert.equal(homeText(q), ['Diagnoses: COPD exacerbation', 'What was done: nebulisers, steroids, controlled oxygen',
    `Medicines for home: continue Tiotropium (18 mcg · OD · inhaled) · stop Salbutamol nebuliser (home on his inhalers) · changed ${q.meds[2].change_line} · new ${q.added[0].line}`,
    'Follow-up: Chest clinic in 2 weeks', 'For the patient:', AR].join('\n'))
  const undecided = { ...q, meds: [...q.meds.slice(0, 2), homeMed(m1)] }
  assert.match(homeText(undecided).split('\n')[2], /· not decided: Prednisolone$/)
  assert.equal(homeText({ to: 'home', diagnoses: '', done: '', meds: [], added: [], follow: '', words: '' }), 'Medicines for home: none')
  // Change with no new dose read: not decided, never "changed"
  const pending = { ...q, meds: [homeMed(m1, { keep: 'change' })], added: [] }
  assert.equal(homeText(pending).split('\n')[2], 'Medicines for home: not decided: Prednisolone')
  // a ward course kept says its days left, with the clock
  const amox = homeMed(med('m7', { drug_name: 'Amoxicillin + clavulanic acid', dose_number: 1, dose_unit: 'g', frequency: 'BD', route: 'oral', duration_days: 7, started_on: '2026-10-07',
    data: { basis: 'prescribed', drug: drug('Amoxicillin + clavulanic acid', 'J01CR02'), duration_days: 7, status: 'active' } }), { keep: 'continue' })
  assert.equal(homeText({ ...q, meds: [amox], added: [] }, NOW).split('\n')[2], 'Medicines for home: continue Amoxicillin + clavulanic acid (1 g · BD · oral · 7 days; 5 days left)')
  assert.equal(daysLeft(amox, NOW), 5); assert.equal(daysLeft({ ...amox, started_on: '2026-09-20' }, NOW), 1); assert.equal(daysLeft(homeMed(m4), NOW), null)
  // 00:30 in Cairo on the 9th is still the 8th in UTC: the clinic's day counts
  assert.equal(daysLeft(amox, Date.parse('2026-10-08T21:30:00Z')), 5)
})

test('the one set', () => {
  registerSend('shop.dispense', PLAIN_SEND)
  const svc = { id: 'svc', department_id: 'shop', section_name: null, code: 'dispense', name: 'Dispensing', reply_type: 'shop.dispense', coding: null, fields: [], steps: [] } as Service
  const sent = addMed('cefuroxime 500 bd 5d send', ctx); assert.ok('ok' in sent)
  const m5 = med('m5', { entry_id: 'e5', drug_name: 'Amoxicillin + clavulanic acid', dose_number: 1, dose_unit: 'g', frequency: 'BD', route: 'oral',
    data: { basis: 'prescribed', drug: drug('Amoxicillin + clavulanic acid', 'J01CR02'), dosage: { dose: { value: '1', unit: 'g', ucum: 'g' }, timing: { code: 'BD' }, route: 'oral' }, status: 'active' } })
  const c = changeOf(homeMed(m1), '20 mg od 3d', ctx); assert.ok(!('error' in c))
  const q: HomeParams = { ...full(), meds: [homeMed(m5, { keep: 'continue' }), homeMed(m2, { keep: 'stop', reason: 'home on his inhalers' }), c, homeMed(m4, { keep: 'continue' })],
    added: [sent.ok], send_to: svc }
  const w = { patientId: 'pt', departmentId: 'ward', visitId: 'st' }; const stay = { item: 'st', patient_id: 'pt', latest_entry: 'L', state: 'admitted' as const }
  const es = homeEntries(q, w, stay, NOW)
  assert.deepEqual(es.map((e) => e.type), ['note', 'medication', 'medication', 'medication', 'medication', 'order', 'discharged'])
  assert.ok(es.every((e) => e.visit_id === 'st' && e.patient_id === 'pt' && e.department_id === 'ward'))
  const [note, repeat, stop, change, added, order, out] = es
  assert.deepEqual(note.data, { kind: 'discharge', text: homeText(q, NOW) })
  assert.equal(repeat.refers_to, 'e5'); assert.equal(repeat.relation, 'changes'); assert.deepEqual(repeat.data, { ...m5.data, status: 'active' })
  assert.equal(stop.refers_to, 'e2'); assert.equal(stop.relation, 'changes')
  assert.deepEqual([(stop.data as { status: string }).status, (stop.data as { status_reason?: string }).status_reason], ['stopped', 'home on his inhalers'])
  assert.equal(change.refers_to, 'e1'); assert.equal(added.refers_to, undefined)
  assert.equal(order.refers_to, added.id); assert.equal(order.relation, 'about'); assert.equal((order.data as { service: { id: string } }).service.id, 'svc')
  assert.equal(out.refers_to, 'L'); assert.equal(out.relation, 'changes'); assert.deepEqual(out.data, { disposition: 'home' })
  const unsent = homeEntries({ ...q, send_to: null }, w, stay, NOW)
  assert.deepEqual(unsent.map((e) => e.type), ['note', 'medication', 'medication', 'medication', 'medication', 'discharged'])
  assert.deepEqual(homeEntries(q, w, { ...stay, state: 'discharged' }, NOW).map((e) => e.type), ['note', 'medication', 'medication', 'medication', 'medication', 'order'])
  // a 7-day course started two days ago, kept: signed again for the 5 days left
  const m6 = med('m6', { entry_id: 'e6', drug_name: 'Amoxicillin + clavulanic acid', started_on: '2026-10-07',
    data: { basis: 'prescribed', drug: drug('Amoxicillin + clavulanic acid', 'J01CR02'), dosage: { dose: { value: '1', unit: 'g', ucum: 'g' }, timing: { code: 'BD' }, route: 'oral' }, duration_days: 7, status: 'active' } })
  const one = (meds: HomeMed[]) => homeEntries({ ...q, meds, added: [] }, w, { ...stay, state: 'discharged' }, NOW).filter((e) => e.type === 'medication')
  const [r6] = one([homeMed(m6, { keep: 'continue' })])
  assert.equal(r6.refers_to, 'e6'); assert.deepEqual(r6.data, { ...m6.data, duration_days: 5, status: 'active' })
  // Change with no new dose read writes nothing; a ward medicine with no data at hand kept is not signed again (it would lose its dose)
  assert.deepEqual(one([homeMed(m1, { keep: 'change' })]), [])
  assert.deepEqual(one([homeMed(m1, { keep: 'continue', data: undefined })]), [])
})

const SHAPE = { type: 'object', additionalProperties: false, required: ['phrases'], properties: { phrases: { type: 'array', maxItems: 20,
  items: { type: 'object', additionalProperties: false, required: ['label', 'ar'], properties: { label: { type: 'string', minLength: 1, maxLength: 40 }, ar: { type: 'string', minLength: 1, maxLength: 400 } } },
  default: [{ label: 'Come back if', ar: 'ا' }, { label: 'Medicines', ar: 'ب' }, { label: 'Follow-up', ar: 'ت' }, { label: 'Rest and food', ar: 'ث' }, { label: 'Sugar', ar: 'ج' }] } } }
test('the ward’s words for the patient', () => {
  const key = { key: 'bedside.home_words', layer: 'bedside', owner_kind: 'department', many: false, labels: {}, shape: SHAPE, fields: [], form: 'department' }
  const org = (settings: unknown[]) => ({ settings, settingKeys: [key], datatypes: {} }) as unknown as Organization
  assert.deepEqual(phrasesIn(org([]), 'ward').map((p) => p.label), ['Come back if', 'Medicines', 'Follow-up', 'Rest and food', 'Sugar'])
  const row = (data: unknown) => ({ key: 'bedside.home_words', thing_id: 'ward', owner_id: 'ward', data, recorded_at: '2026-10-09T08:00:00Z' })
  assert.deepEqual(phrasesIn(org([row({ phrases: [{ label: 'Diet', ar: 'كل' }, { label: '', ar: 'x' }] })]), 'ward'), [{ label: 'Diet', ar: 'كل' }])
  assert.deepEqual(phrasesIn(org([row({ phrases: 'no' })]), 'ward'), [])
  assert.equal(addWords('', 'a'), 'a'); assert.equal(addWords('x', 'a'), 'x\n\na'); assert.equal(addWords(addWords('x', 'a'), 'a'), 'x\n\na')
})

console.log(`home: ${n} groups passed`)
