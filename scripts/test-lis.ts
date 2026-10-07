// The laboratory's day one (spec/openCare.md §5.3), as pure decisions: tubes, fasting, the tests a typed line names.   npm run test:lis
import assert from 'node:assert/strict'
import { MOST_ASKED, needsFasting, testsIn, tubeOf, tubesFor } from '../src/packs/lis/tubes'
import { changeOf, columnsOf, workedOut } from '../src/packs/lis/grid'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const T = (code: string, name: string, section_name: string | null = 'Chemistry') => ({ code, name, section_name })
const CATALOGUE = [T('cbc', 'Complete blood count', 'Haematology'), T('lipids', 'Lipid profile'), T('hba1c', 'HbA1c'), T('fbs', 'Fasting glucose'), T('rbs', 'Random glucose'),
  T('kft', 'Kidney function'), T('lft', 'Liver function'), T('pt', 'Prothrombin time · INR', 'Coagulation'), T('urine', 'Urine analysis', 'Urine & stool'), T('tsh', 'TSH', 'Hormones')]

test('tubes: by the test, else its section; grouped in a fixed order; fasting where it matters', () => {
  assert.deepEqual(['cbc', 'hba1c', 'lipids', 'fbs', 'pt', 'urine', 'tsh'].map((c) => tubeOf(CATALOGUE.find((t) => t.code === c)!).cap), ['purple', 'purple', 'yellow', 'grey', 'blue', 'cup', 'yellow'])
  const g = tubesFor([CATALOGUE[1], CATALOGUE[0], CATALOGUE[3], CATALOGUE[2]])
  assert.deepEqual(g.map((x) => [x.tube.word, x.tests.map((t) => t.code)]), [['Purple · EDTA', ['cbc', 'hba1c']], ['Yellow · gel', ['lipids']], ['Grey · fluoride', ['fbs']]])
  assert.deepEqual(['fbs', 'lipids', 'cbc'].map(needsFasting), [true, true, false])
})
test('a typed line: by code, name or a word labs use, in order, each once; what it cannot place is handed back', () => {
  const r = testsIn('/order cbc, lipid profile, hba1c, fbs', CATALOGUE)
  assert.deepEqual(r.found.map((t) => t.code), ['cbc', 'lipids', 'hba1c', 'fbs']); assert.deepEqual(r.unknown, [])
  assert.deepEqual(testsIn('kidney and liver; thyroid', CATALOGUE).found.map((t) => t.code), ['kft', 'lft', 'tsh'])
  assert.deepEqual(testsIn('CBC, cbc, Random glucose', CATALOGUE).found.map((t) => t.code), ['cbc', 'rbs'], 'once each')
  assert.deepEqual(testsIn('cbc, zinc', CATALOGUE).unknown, ['zinc'])
  assert.equal(MOST_ASKED.length, 6)
})
test('results: the columns once each; LDL and eGFR worked out; the change check against the last within 30 days', () => {
  assert.deepEqual(columnsOf([{ fields: [{ key: 'urea' }, { key: 'creat' }, { key: 'egfr' }] }, { fields: [{ key: 'creat' }, { key: 'egfr' }] }, { fields: [{ key: 'alt' }] }]).map((f) => f.key),
    ['urea', 'creat', 'egfr', 'alt'])
  assert.equal(workedOut('ldl', { chol: '238', hdl: '38', tg: '190' }, { sex: 'female', age: 34 }), 162, 'Friedewald: 238 − 38 − 38')
  assert.equal(workedOut('ldl', { chol: '300', hdl: '40', tg: '450' }, { sex: 'male', age: 50 }), null, 'TG 400 or more: not worked out')
  assert.equal(workedOut('ldl', { chol: '238', hdl: '' }, { sex: 'male', age: 50 }), null)
  assert.equal(workedOut('egfr', { creat: '1.0' }, { sex: 'male', age: 50 }), 92, 'CKD-EPI 2021, a man of 50, creatinine 1.0')
  assert.equal(workedOut('egfr', { creat: '0.8' }, { sex: 'female', age: 60 }), 84)
  assert.equal(workedOut('egfr', { creat: '0.5' }, { sex: 'female', age: 8 }), null, 'a child: none')
  const today = Date.parse('2026-10-07T12:00:00Z'); const ago = (d: number) => new Date(today - d * 86_400_000).toISOString()
  assert.deepEqual(changeOf('creat', 3.9, { value: 1.0, at: ago(4) }, today), { was: 1, days: 4 }, 'creatinine 1.0 → 3.9 in 4 days')
  assert.equal(changeOf('creat', 1.2, { value: 1.0, at: ago(4) }, today), null, 'within its share')
  assert.deepEqual(changeOf('hb', 7.4, { value: 12.9, at: ago(6) }, today), { was: 12.9, days: 6 }, 'Hb down 5.5 g/dL')
  assert.equal(changeOf('hb', 11, { value: 12.9, at: ago(6) }, today), null, 'Hb within 3')
  assert.equal(changeOf('creat', 3.9, { value: 1.0, at: ago(45) }, today), null, 'older than 30 days: no check'); assert.equal(changeOf('creat', 3.9, undefined, today), null)
})
console.log(`lis: ${n} groups passed`)
