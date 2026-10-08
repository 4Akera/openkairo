// Chronic care's pure half (spec/openCare.md §5.7, Q28–Q30; pictures #chronic-visit, #chronic-list): registers from the problem list's
// codes (resolved takes a patient off), measures against the clinic's target or the patient's own, checks done by any entry with one of
// their codes and due by their interval (sooner while off target), a shared check counted once; /review and /target read. No browser,
// no database. npm run test:chronic_care
import assert from 'node:assert/strict'
import { careOf, checkOf, conditionsOf, measureOf, offWords, registersOf, summaryOf, targetWords, type Condition, type OwnTarget, type Value } from '../src/packs/chronic_care/model'
import { parseReview, parseTarget, serviceFor } from '../src/packs/chronic_care/line'
import type { Organization } from '../src/core/db/types'
import type { Ctx } from '../src/core/screens/visit/parse'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const now = new Date('2026-10-08T10:00:00Z')
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
const DM: Condition = { key: 'dm', name: 'Diabetes', codes: ['E10', 'E11', 'E12', 'E13', 'E14'], targets: [{ measure: 'hba1c', op: '<', value: 7 }, { measure: 'bp', op: '<', value: 130, value2: 80 }, { measure: 'ldl', op: '<', value: 70 }],
  checks: [{ key: 'hba1c', name: 'HbA1c', codes: ['loinc:4548-4'], every_months: 6, off_target_months: 3 }, { key: 'eyes', name: 'Eyes', codes: ['chronic_care.check:eyes'], every_months: 12 },
    { key: 'feet', name: 'Feet', codes: ['chronic_care.check:feet'], every_months: 12 }, { key: 'acr', name: 'Urine ACR', codes: ['loinc:14959-1'], every_months: 12 }] }
const HTN: Condition = { key: 'htn', name: 'Hypertension', codes: ['I10'], targets: [{ measure: 'bp', op: '<', value: 130, value2: 80 }], checks: [{ key: 'acr', name: 'Urine ACR', codes: ['loinc:14959-1'], every_months: 12 }] }
const CKD: Condition = { key: 'ckd', name: 'CKD', codes: ['N18'], targets: [], checks: [] }
const cs = [DM, HTN, CKD]
const ashraf = [{ code: 'icd10:E11', status: 'active' }, { code: 'icd10:I10', status: 'active' }, { code: 'icd10:N18.3', status: 'active' }]
const values: Value[] = [{ code: 'loinc:4548-4', value: 8.2, at: ago(57) }, { code: 'loinc:4548-4', value: 7.9, at: ago(160) }, { code: 'loinc:2089-1', value: 112, at: ago(57) },
  { code: 'loinc:8480-6', value: 146, at: ago(0) }, { code: 'loinc:8462-4', value: 90, at: ago(0) }, { code: 'loinc:14959-1', value: 24, at: ago(446) }]

test('registers come from the problem list’s codes; resolved takes the patient off', () => {
  assert.deepEqual(registersOf(cs, ashraf).map((r) => r.condition.key), ['dm', 'htn', 'ckd'])
  assert.deepEqual(registersOf(cs, [{ code: 'icd10:E11', status: 'resolved' }]), [])
  assert.deepEqual(registersOf(cs, [{ code: 'icd10:J45', status: 'active' }]), [])
  assert.deepEqual(registersOf(cs, [{ code: null, status: 'active' }]), [], 'a problem with no code is no register')
})
test('a measure against the target, the patient’s own winning, with its trend', () => {
  const a1c = measureOf('hba1c', DM, values, [])
  assert.equal(a1c.value, 8.2); assert.equal(a1c.off, true); assert.equal(a1c.up, true); assert.deepEqual(a1c.trend, [7.9, 8.2])
  const bp = measureOf('bp', HTN, values, []); assert.equal(bp.value, 146); assert.equal(bp.value2, 90); assert.equal(bp.off, true); assert.equal(offWords(bp), 'BP 146/90')
  const own: OwnTarget[] = [{ condition: 'htn', measure: 'bp', op: '<', value: 150, value2: 90, reason: '81, falls', at: ago(200) }]
  const fawzia = measureOf('bp', HTN, [{ code: 'loinc:8480-6', value: 156, at: ago(10) }, { code: 'loinc:8462-4', value: 88, at: ago(10) }], own)
  assert.equal(fawzia.target?.own?.reason, '81, falls'); assert.equal(fawzia.off, true, '156 is above her own 150')
  assert.equal(measureOf('bp', HTN, [{ code: 'loinc:8480-6', value: 140, at: ago(1) }, { code: 'loinc:8462-4', value: 85, at: ago(1) }], own).off, false, 'within her own target')
  assert.equal(targetWords({ measure: 'bp', op: '<', value: 130, value2: 80 }), '< 130/80')
  assert.equal(measureOf('hba1c', DM, [], []).off, false, 'no value: not off target')
})
test('a check: done by any entry with one of its codes, due once its interval passed, sooner while off target', () => {
  const a = checkOf(DM.checks![0], values, [], true, now); assert.equal(a.due, false, 'HbA1c 57 days ago, off target: every 3 months')
  assert.equal(checkOf(DM.checks![0], [{ code: 'loinc:4548-4', value: 8, at: ago(100) }], [], true, now).due, true)
  assert.equal(checkOf(DM.checks![0], [{ code: 'loinc:4548-4', value: 6.5, at: ago(100) }], [], false, now).due, false, 'on target: every 6 months')
  const eyes = checkOf(DM.checks![1], [], [{ codes: ['chronic_care.check:eyes'], at: ago(432), text: 'no retinopathy' }], false, now)
  assert.equal(eyes.due, true); assert.equal(eyes.months, 14); assert.equal(eyes.text, 'no retinopathy')
  assert.equal(checkOf(DM.checks![2], [], [], false, now).due, true, 'never done: due')
})
test('the whole picture: three conditions, three checks due, a shared check counted once', () => {
  const st = careOf(cs, ashraf, values, [{ codes: ['chronic_care.check:eyes'], at: ago(432) }, { codes: ['chronic_care.check:feet'], at: ago(432) }], [], now)
  assert.deepEqual(st.map((s) => s.condition.key), ['dm', 'htn', 'ckd'])
  assert.deepEqual(st[1].checks, [], 'urine ACR is diabetes’s check too: counted once')
  const s = summaryOf(st)
  assert.deepEqual(s.due.map((c) => c.check.name), ['Eyes', 'Feet', 'Urine ACR'])
  assert.deepEqual(s.offTarget.map((m) => m.key), ['hba1c', 'bp', 'ldl'])
})
const org = { settings: [{ key: 'chronic_care.conditions', thing_id: null, data: { window_months: 18, conditions: cs } }], settingKeys: [], datatypes: {} } as unknown as Organization
const ctx = { departmentId: 'dm', now, templates: [], problems: [], departments: [{ id: 'lab', name: 'Laboratory' }], org,
  services: [{ id: 's-acr', code: 'acr', name: 'Urine ACR', department_id: 'lab', fields: [{ code: 'loinc:14959-1' }] }, { id: 's-a1c', code: 'hba1c', name: 'HbA1c', department_id: 'lab', fields: [{ code: 'loinc:4548-4' }] }],
  record: { values: values.map((v, i) => ({ id: `v${i}`, item: `v${i}`, key: 'x', patient_id: 'p', code: v.code, name: null, value: v.value, ucum: null, unit: null, interpretation: null, at: v.at, entry_id: `e${i}`, visit_id: null, source_entries: [] })) } } as unknown as Ctx
test('/review dm: the feet and the eyes as observations, the due tests a service here does as orders, each tagged with its condition', () => {
  assert.equal(conditionsOf(org).conditions.length, 3)
  const r = parseReview('dm', ctx); assert.ok(r && 'ok' in r)
  assert.deepEqual(r.ok.map((i) => i.function), ['observation', 'observation', 'order'])
  assert.deepEqual(r.ok.map((i) => (i.params as { code?: { codings: { code: string }[] } }).code?.codings[0].code ?? i.params.service_id), ['feet', 'eyes', 's-acr'], 'HbA1c is not due: only the ACR is ordered')
  assert.ok(r.ok.every((i) => i.tag === 'chronic_care:dm'))
  assert.equal(r.ok[2].action, 'write:order')
  const bad = parseReview('xx', ctx); assert.ok(bad && 'error' in bad)
  assert.equal(serviceFor(['loinc:4548-4'], ctx)?.id, 's-a1c')
})
test('/target: a patient’s own target with its reason', () => {
  const r = parseTarget('htn bp < 150/90 ; 81, falls', ctx); assert.ok(r && 'ok' in r)
  assert.deepEqual(r.ok[0].params, { condition: 'htn', measure: 'bp', op: '<', value: 150, value2: 90, reason: '81, falls', status: 'active' })
  assert.equal(r.ok[0].function, 'chronic_care.target'); assert.match(r.ok[0].line, /Own target · BP < 150\/90 · hypertension · 81, falls/)
  const x = parseTarget('dm zz < 1', ctx); assert.ok(x && 'error' in x && /Not a measure/.test(x.error))
  assert.equal(parseTarget('', ctx), null)
})

console.log(`✓ chronic care: ${n} groups passed`)
