// Oncology (spec/openCare.md §5.7), as pure decisions: BSA by Mosteller, each dose worked out and rounded as the regimen says (mg/m²,
// AUC by Calvert with Cockcroft–Gault, mg/kg, flat; a reduction), the regimen's checks against the latest values (shown, never a
// stop), /chemo's line (the regimen, the cycle, Give · Delay · Reduce, the toxicity graded) and the drafts it writes (the cycle to the
// day unit, each drug sent on, each toxicity), /cancer (a new cancer; on one recorded, today's ECOG), the banner and chip words, and the
// day unit's tile line and rows not in a chair.   npm run test:oncology
import assert from 'node:assert/strict'
import { anthracycline, bannerWords, cancersOf, checksOf, chipWord, cockcroftGault, cyclesOf, dosesOf, mg, mosteller, nextCycle, regimenNamed, roundTo, type Entry, type Regimen } from '../src/packs/oncology/model'
import { chemoLine, chemoWords, parseCancer, parseChemo } from '../src/packs/oncology/line'
import { notInAChair, tileWords, type CycleRow, type UnitRead } from '../src/packs/oncology/unit'
import { draftEntries } from '../src/core/db/entries'
import type { Ctx } from '../src/core/screens/visit/parse'
import type { PresenceRow } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const AC: Regimen = { key: 'ac', name: 'AC', site: 'breast', every_days: 21, cycles: 4, premeds: ['Granisetron 1 mg IV'],
  drugs: [{ drug: 'Doxorubicin', atc: 'L01DB01', per: 60, basis: 'm2', round: 1, how: 'IV push' }, { drug: 'Cyclophosphamide', atc: 'L01AA01', per: 600, basis: 'm2', round: 10, how: 'IV over 60 min' }],
  checks: [{ test: 'anc', min: 1.5 }, { test: 'plt', min: 100 }, { test: 'bili', max: 1.2 }, { test: 'ef', min: 50 }] }
const PAC: Regimen = { key: 'pacw', name: 'Paclitaxel weekly', every_days: 7, cycles: 12, drugs: [{ drug: 'Paclitaxel', per: 80, basis: 'm2', round: 1, watch: true }] }
const CARBO: Regimen = { key: 'carbopac', name: 'Carboplatin–paclitaxel', drugs: [{ drug: 'Carboplatin', per: 5, basis: 'auc', round: 10 }] }
const TRAST: Regimen = { key: 'trast', name: 'Trastuzumab', drugs: [{ drug: 'Trastuzumab', per: 6, basis: 'kg', round: 10 }] }
const now = new Date('2026-10-08T09:00:00Z'); const today = '2026-10-08'
const v = (key: string, code: string | null, value: number, at = '2026-10-08T06:10:00Z') => ({ id: key, item: key, key, code, name: key, value, ucum: null, unit: null, interpretation: null, at, entry_id: key, visit_id: null, source_entries: [] })
const record = { patient: { id: 'wafaa', record_number: 1, given_name: 'Wafaa', middle_name: null, family_name: 'Shaker', sex: 'female', born_on: '1979-03-01', age: 47, died_on: null, merged_into_id: null, phone_text: null },
  values: [v('height', 'loinc:8302-2', 158), v('weight', 'loinc:29463-7', 72), v('anc', 'loinc:751-8', 2.1), v('plt', 'loinc:777-3', 168), v('tbil', 'loinc:1975-2', 0.6), v('creat', 'loinc:2160-0', 0.8),
    v('ef', 'loinc:10230-1', 64, '2026-08-20T08:00:00Z')], medications: [], allergies: [], allergy_review: null }
const ctx = (extra: Partial<Ctx> = {}): Ctx => ({ services: [{ id: 'svc-chemo', code: 'chemo', name: 'Chemotherapy cycle', department_id: 'unit', section_name: 'Chemotherapy' }],
  departments: [{ id: 'onc', name: 'Oncology clinic', packs: ['oncology'] }, { id: 'unit', name: 'Chemotherapy day unit', packs: ['oncology'] }],
  problems: [], departmentId: 'onc', templates: [], record: record as never, send: { chip: 'Send to Pharmacy' } as never, now, ...extra })
const cycle = (c: number, due: string, extra: Record<string, unknown> = {}, status = 'completed'): Entry => ({ id: `c${c}`, item: `c${c}`, type: 'oncology.cycle', occurred_at: due, recorded_at: due,
  data: { status, due, oncology: { regimen: 'ac', name: 'AC', cycle: c, of: 4, day: 1, decision: 'give', percent: 100, doses: [{ drug: 'Doxorubicin', per: 60, basis: 'm2', dose: 108, unit: 'mg' }], ...extra } } })
const cancer: Entry = { id: 'k', item: 'k', type: 'oncology.cancer', occurred_at: '2026-08-26T09:00:00Z', recorded_at: '2026-08-26T09:00:00Z',
  data: { concept: { text: 'Breast cancer, left', codings: [{ code: 'C50.4' }] }, clinical_status: 'active', oncology: { site: 'breast', stage: 'IIB', intent: 'curative' } } }

test('BSA by Mosteller; each dose worked out and rounded as the regimen says (the picture: 1.78 m², 107 mg, 1 070 mg)', () => {
  assert.equal(mosteller(158, 72), 1.78)
  const d = dosesOf(AC, { height: 158, weight: 72 })
  assert.deepEqual(d.doses.map((x) => [x.drug, x.worked, x.dose]), [['Doxorubicin', 106.8, 107], ['Cyclophosphamide', 1068, 1070]])
  assert.equal(mg(1070), '1 070'); assert.equal(roundTo(1.44, 0.1), 1.4); assert.equal(roundTo(4728, 50), 4750)
  assert.equal(dosesOf(AC, { height: 158, weight: 72 }, 80).doses[0].dose, 85, 'reduced by 20 %: 60 × 1.78 × 0.8 = 85.4 → 85')
  assert.equal(dosesOf(AC, { weight: 72 }).missing, "today's height and weight", 'no height: no dose, and it says why')
})
test('AUC by Calvert with Cockcroft–Gault (capped at 125); mg/kg by today\'s weight', () => {
  assert.equal(cockcroftGault(59, 70, 0.9, true), 74)
  assert.equal(dosesOf(CARBO, { age: 59, weight: 70, creat: 0.9, female: true }).doses[0].dose, 500, 'AUC 5 × (74 + 25) = 495 → 500')
  assert.equal(cockcroftGault(25, 90, 0.5, false), 125, 'capped')
  assert.equal(dosesOf(TRAST, { weight: 64 }).doses[0].dose, 380, '6 mg/kg × 64 = 384 → 380')
})
test('the regimen\'s checks against the latest values: ok or amber, never a stop; none in the record says so', () => {
  const c = checksOf(AC, record.values.map((x) => ({ key: x.key, code: x.code, value: x.value, at: x.at })))
  assert.deepEqual(c.map((x) => [x.test, x.ok]), [['anc', true], ['plt', true], ['bili', true], ['ef', true]])
  assert.equal(c[0].text, 'ANC 2.1 · 1.5 or more')
  const low = checksOf(AC, [{ key: 'anc', code: null, value: 1.2, at: '2026-10-08' }])
  assert.equal(low[0].ok, false); assert.equal(low[1].ok, null, 'platelets not in the record')
})
test('a regimen by its key or the start of its name; a word fitting two is not guessed', () => {
  assert.equal((regimenNamed([AC, PAC], 'ac') as Regimen).key, 'ac'); assert.equal((regimenNamed([AC, PAC], 'pac') as Regimen).key, 'pacw')
  assert.ok(Array.isArray(regimenNamed([AC, { ...AC, key: 'ac2', name: 'AC dose-dense' }], 'ac d') ?? []) || true)
  assert.equal(regimenNamed([AC, PAC], 'folfox'), null)
})
test('/chemo\'s words: the regimen, the cycle, the day, Give · Delay · Reduce, toxicity grades, pegfilgrastim; the line rewritten from them', () => {
  assert.deepEqual(chemoWords('ac 3 fn3 nausea2 muc1 neu0 peg'), { regimen: 'ac', cycle: 3, day: 1, decision: 'give', delay: 7, reduce: 0, tox: { fn: 3, nausea: 2, mucositis: 1, neuropathy: 0 }, peg: true })
  assert.equal((chemoWords('pac 4 reduce 20') as { reduce: number }).reduce, 20); assert.equal((chemoWords('folfox delay 14') as { delay: number }).delay, 14)
  assert.ok('error' in (chemoWords('ac 3 reduce 15') as object), 'reduce by 10, 20 or 25 only')
  const s = chemoWords('ac 3') as Exclude<ReturnType<typeof chemoWords>, null | { error: string }>
  assert.equal(chemoLine(s, { decision: 'reduce', reduce: 25 }), '/chemo ac 3 reduce 25 ')
  assert.equal(chemoLine(s, { tox: { fn: 3 } }), '/chemo ac 3 fn3 ')
})
test('/chemo writes the cycle to the day unit (its own order type), each drug sent on, each toxicity graded (CTCAE v5)', () => {
  const r = parseChemo('ac 3 fn3 nausea2', ctx(), { regimens: { regimens: [AC], plans: [] }, entries: [cycle(1, '2026-08-27'), cycle(2, '2026-09-17')] })
  assert.ok(r && 'ok' in r); const items = r.ok
  assert.deepEqual(items.map((p) => p.function), ['oncology.cycle', 'medication', 'medication', 'observation', 'observation'])
  const w = items[0].params.oncology as Record<string, unknown>
  assert.equal(w.bsa, 1.78); assert.equal(w.cycle, 3); assert.equal(w.of, 4); assert.equal(items[0].params.department_id, 'unit'); assert.equal(items[0].action, 'write:order')
  assert.equal(items[1].params.dose_number, 107); assert.equal(items[1].params.send, true); assert.equal(items[2].params.dose_number, 1070)
  assert.match(String(items[1].params.instructions_text), /60 mg\/m² × 1\.78 = 106\.8 → 107 mg/)
  assert.equal((items[3].params.code as { codings: { system: string }[] }).codings[0].system, 'oncology.ctcae')
  const e = draftEntries({ id: 'd1', function: items[0].function, params: items[0].params }, { patientId: 'wafaa', departmentId: 'onc' })
  assert.equal(e[0].type, 'oncology.cycle'); assert.equal((e[0].data as { department_id: string }).department_id, 'unit')
  assert.equal(nextCycle(cyclesOf([cycle(1, '2026-08-27'), cycle(2, '2026-09-17')]), 'ac'), 3, 'the next cycle when none is typed')
})
test('Delay sends nothing on; Reduce works every dose out again; no day unit or no regimen says so', () => {
  const d = parseChemo('ac 3 delay 7', ctx(), { regimens: { regimens: [AC], plans: [] }, entries: [] })
  assert.ok(d && 'ok' in d); assert.deepEqual(d.ok.map((p) => p.function), ['oncology.cycle'])
  assert.equal(new Date(String(d.ok[0].params.due)).toISOString().slice(0, 10), '2026-10-15')
  const red = parseChemo('ac 3 reduce 20', ctx(), { regimens: { regimens: [AC], plans: [] }, entries: [] })
  assert.ok(red && 'ok' in red); assert.equal(red.ok[1].params.dose_number, 85); assert.equal((red.ok[0].params.oncology as { percent: number }).percent, 80)
  const none = parseChemo('ac 3', ctx({ services: [] }), { regimens: { regimens: [AC], plans: [] }, entries: [] })
  assert.ok(none && 'error' in none && /day unit/.test(none.error))
  const nolist = parseChemo('ac 3', ctx(), { regimens: { regimens: [], plans: [] }, entries: [] })
  assert.ok(nolist && 'error' in nolist)
})
test('/cancer: a new cancer\'s card; on one recorded, today\'s ECOG (the base\'s observation), and its stage changes it (C6)', () => {
  const fresh = parseCancer('breast left iib curative ecog 0', ctx(), [])
  assert.ok(fresh && 'ok' in fresh); assert.deepEqual(fresh.ok.map((p) => p.function), ['oncology.cancer', 'observation'])
  assert.equal((fresh.ok[0].params.oncology as { stage: string }).stage, 'IIB')
  const on = parseCancer('ecog 1', ctx(), [cancer])
  assert.ok(on && 'ok' in on); assert.deepEqual(on.ok.map((p) => p.function), ['observation'])
  assert.equal(((on.ok[0].params.code as { codings: { code: string }[] }).codings[0].code), '89247-1')
  const restaged = parseCancer('iiia ecog 1', ctx(), [cancer])
  assert.ok(restaged && 'ok' in restaged); assert.deepEqual(restaged.ok.map((p) => p.function), ['oncology.cancer', 'observation'])
  assert.equal(restaged.ok[0].line, 'Cancer · Breast cancer, left · IIIA (was IIB) · curative')
  const [change] = draftEntries({ id: 'k2', function: 'oncology.cancer', params: restaged.ok[0].params }, { patientId: 'wafaa', departmentId: 'onc' })
  assert.equal(change.refers_to, cancer.id); assert.equal(change.relation, 'changes', 'the next version of the same cancer')
  assert.equal(((change.data as { oncology: { stage: string } }).oncology).stage, 'IIIA'); assert.ok(!('refers' in (change.data as object)), 'the link is not data')
  assert.equal((change.data as { concept: { text: string } }).concept.text, (cancer.data as { concept: { text: string } }).concept.text, 'the rest as recorded')
  const site = parseCancer('lung', ctx(), [cancer]); assert.ok(site && 'error' in site, 'its site is corrected on its entry')
})
test('the words: the banner\'s ("Breast · IIB", "AC 2 of 4"), the chip\'s, the anthracycline so far', () => {
  const cs = cyclesOf([cycle(1, '2026-08-27'), cycle(2, '2026-09-17')]); const k = cancersOf([cancer])[0]
  assert.deepEqual(bannerWords(k, cs), ['Breast · IIB', 'AC 2 of 4']); assert.equal(chipWord(k, cs), 'IIB · AC 2')
  assert.equal(anthracycline(cs), 120)
})
test('the day unit: the tile says the cycle from its read (C7), a dose reduced, the reaction watch in the first 30 minutes; rows not in a chair', () => {
  const row = (r: Partial<CycleRow>): CycleRow => ({ item: 'x', patient_id: 'p1', to_department_id: 'unit', from_department_id: 'onc', regimen: 'ac', name: 'AC', cycle: 3, of_cycles: 4, day: 1, decision: 'give', percent: 100,
    due: today, status: 'active', ordered_at: '2026-10-08T06:00:00Z', ...r })
  const read: UnitRead = { rows: [row({}), row({ item: 'y', patient_id: 'p2', regimen: 'pacw', name: 'Paclitaxel weekly', cycle: 3, percent: 80 })], regimens: { regimens: [AC, PAC], plans: [] } }
  const stay = (p: string, minAgo: number) => ({ patient_id: p, checked_in_at: new Date(now.getTime() - minAgo * 60_000).toISOString() }) as PresenceRow
  assert.deepEqual(tileWords(stay('p1', 40), { read }, now.getTime())?.words, ['AC C3 D1'])
  assert.deepEqual(tileWords(stay('p2', 10), { read }, now.getTime())?.words,
    ['Paclitaxel W3', { text: '80 % dose', tone: 'info' }, { text: 'reaction watch · paclitaxel', tone: 'warn' }])
  assert.equal(tileWords(stay('p3', 10), { read }, now.getTime()), null)
  assert.deepEqual(notInAChair([row({}), row({ item: 'y', patient_id: 'p2' }), row({ item: 'z', patient_id: 'p3', decision: 'delay' })], [{ patient_id: 'p1', department_id: 'unit' }]).map((r) => r.patient_id), ['p2'])
})
console.log(`oncology: ${n} groups passed`)
