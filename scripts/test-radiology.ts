// Radiology (spec/openCare.md §5.5), as pure decisions: a typed line's words (the side, +c, portable, report, urgent, ? the question),
// which exams it names (with and without contrast are two; anything else fitting two is asked), its order words /xr /us /ct /mri, the
// walk-in's line, what an exam needs, film only, the facts before contrast (eGFR worked out from creatinine), the templates; and the
// core's part (spec §5.5 (a)): an order and a walk-in carrying a pack's own type and words.   npm run test:radiology
import assert from 'node:assert/strict'
import { registerKinds } from '../src/packs/radiology/line'
import { examIn, examsFor, filmOnly, packOrder, samePart, wordsOf } from '../src/packs/radiology/exams'
import { ckdEpi, factsOf } from '../src/packs/radiology/facts'
import { templateOf, templatesFor } from '../src/packs/radiology/templates'
import { examsIn } from '../src/packs/radiology/walkin'
import { contrastOf } from '../src/packs/radiology/line'
registerKinds()
import { parse, type Ctx, type Parsed } from '../src/core/screens/visit/parse'
import { suggest } from '../src/core/screens/visit/expand'
import { commandsFor } from '../src/core/screens/visit/commands'
import { draftEntries } from '../src/core/db/entries'
import { walkInOrders } from '../src/core/screens/bench/walkins'
import type { Service } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const svc = (code: string, name: string, section_name: string, department_id = 'rad') => ({ id: code, code, name, department_id, section_name, steps: ['scanned'] })
const RAD = [svc('xrchest', 'X-ray chest', 'X-ray'), svc('xrknee', 'X-ray knee', 'X-ray'), svc('xrcspine', 'X-ray cervical spine', 'X-ray'), svc('xrlspine', 'X-ray lumbar spine', 'X-ray'),
  svc('usabd', 'US abdomen', 'Ultrasound'), svc('usap', 'US abdomen & pelvis', 'Ultrasound'), svc('ctbrain', 'CT brain', 'CT'), svc('ctbrainc', 'CT brain with contrast', 'CT'),
  svc('ctap', 'CT abdomen & pelvis', 'CT'), svc('ctapc', 'CT abdomen & pelvis with contrast', 'CT'), svc('mrlspine', 'MRI lumbar spine', 'MRI'), svc('cbc', 'Complete blood count', 'Haematology', 'lab')]
const DEPTS = [{ id: 'gp', name: 'General Practice', packs: [] }, { id: 'rad', name: 'Radiology', packs: ['radiology'] }, { id: 'lab', name: 'Laboratory', packs: ['lis'] }, { id: 'physio', name: 'Physiotherapy', packs: [] }]
const at = (departmentId = 'gp', services = RAD): Ctx => ({ services, departments: DEPTS, problems: [], departmentId, packs: [], templates: [] })
const ok = (line: string, c = at()): Parsed[] => { const r = parse(line, c); if (!r || !('ok' in r)) throw new Error(`${line}: ${JSON.stringify(r)}`); return r.ok }
const err = (line: string, c = at()) => { const r = parse(line, c); if (!r || !('error' in r)) throw new Error(`${line}: no error`); return r.error }

test('a line\'s words: the side, contrast, portable, report, urgent or stat, ? the question; the exams split by commas', () => {
  assert.deepEqual(wordsOf('abd pelvis +c urgent ? appendicitis'), { exams: ['abd pelvis'], words: {}, contrast: 'with', priority: 'urgent', question: 'appendicitis' })
  assert.deepEqual(wordsOf('knee left portable report, chest').words, { side: 'left', portable: true, report: true })
  assert.deepEqual(wordsOf('knee left portable report, chest').exams, ['knee', 'chest'])
  assert.equal(wordsOf('brain -c stat').contrast, 'without'); assert.equal(wordsOf('both knees').words.side, 'both')
  assert.equal(wordsOf('brain with contrast').contrast, 'with', 'spelled out: +c'); assert.equal(wordsOf('abd pelvis without contrast').contrast, 'without')
  assert.deepEqual(wordsOf('l spine').words, {}, 'a single l is no side: the lumbar spine'); assert.deepEqual(wordsOf('l spine').exams, ['l spine'])
})
test('which exams: by code, else every word the start of a word of the name; +c the one with contrast, nothing the one without', () => {
  const ct = RAD.filter((s) => s.section_name === 'CT')
  assert.deepEqual(examsFor('abd pelvis', ct, contrastOf, null).map((s) => s.code), ['ctap'])
  assert.deepEqual(examsFor('abd pelvis', ct, contrastOf, 'with').map((s) => s.code), ['ctapc'])
  assert.deepEqual(examsFor('brain', ct, contrastOf, 'without').map((s) => s.code), ['ctbrain'])
  assert.deepEqual(examsFor('ctapc', ct, contrastOf, null).map((s) => s.code), ['ctapc'], 'a code is never in doubt')
  assert.deepEqual(examsFor('ct brain', ct, contrastOf, null).map((s) => s.code), ['ctbrain'], 'the kind\'s own word typed')
  const xr = RAD.filter((s) => s.section_name === 'X-ray')
  assert.deepEqual(examsFor('spine', xr, contrastOf, null).map((s) => s.code), ['xrcspine', 'xrlspine'], 'two parts: asked, never guessed')
  assert.deepEqual(examsFor('l spine', xr, contrastOf, null).map((s) => s.code), ['xrlspine'], 'l: the lumbar spine')
  assert.deepEqual(examsFor('chest knee', xr, contrastOf, null), [], 'two exams typed without a comma: none, never the last word\'s')
  assert.deepEqual(examsFor('xr chest', xr, contrastOf, null).map((s) => s.code), ['xrchest'], 'only the kind\'s own word is dropped')
  const us = RAD.filter((s) => s.section_name === 'Ultrasound')
  assert.deepEqual(examsFor('abd', us, contrastOf, null).map((s) => s.code), ['usabd'], 'every word of the abdomen typed, not of the abdomen & pelvis')
  assert.deepEqual(examsFor('abd pel', us, contrastOf, null).map((s) => s.code), ['usap'])
})
test('/ct /xr /us /mri: only their kind of Radiology\'s exams, with radiology\'s words on the order (its own type)', () => {
  const [c] = ok('/ct abd pelvis +c urgent ? appendicitis')
  assert.deepEqual(c.params, { service_id: 'ctapc', priority: 'urgent', question_text: 'appendicitis', as: { type: 'radiology.request', words: {} } })
  assert.equal(c.line, 'CT abdomen & pelvis with contrast · urgent · ? appendicitis → Radiology')
  const [k] = ok('/xr knee left'); assert.deepEqual(k.params.as, { type: 'radiology.request', words: { side: 'left' } }); assert.equal(k.line, 'X-ray knee · left → Radiology')
  const [s] = ok('/xr spine'); assert.deepEqual(s.params.choices, ['xrcspine', 'xrlspine'])
  assert.match(err('/us brain'), /No Ultrasound exam “brain”/, 'a CT is not an ultrasound')
  assert.equal(ok('/ct brain with contrast')[0].params.service_id, 'ctbrainc', '"with contrast" spelled out')
  assert.match(err('/mri lumbar +c'), /has no exam with contrast here/, '+c is never dropped: one exam without contrast is refused')
  assert.match(err('/us abd +c'), /has no exam with contrast here/, 'nor when several fit and none is with contrast')
  assert.equal(ok('/ct brain contrast')[0].params.service_id, 'ctbrainc', '"contrast" alone is +c')
  assert.match(err('/ct brain with and without contrast'), /Say \+c .* or −c/, '"with and without": asked, never guessed')
  for (const x of ['with & without contrast', 'with/without contrast', 'with or without contrast', '± contrast', '+/- contrast', 'w/wo'])
    assert.match(err(`/ct brain ${x}`), /Say \+c .* or −c/, `"${x}": asked`)
  for (const x of ['-contrast', 'non-contrast', 'w/o contrast', 'without contrast']) assert.equal(ok(`/ct brain ${x}`)[0].params.service_id, 'ctbrain', `"${x}": without`)
  assert.equal(ok('/ct brain +contrast')[0].params.service_id, 'ctbrainc', '"+contrast": with')
  assert.equal(ok('/ct abd pelvis +c ? contrast allergy last year')[0].params.question_text, 'contrast allergy last year', 'the question\'s words stay its own')
  assert.match(err('/xr cbc'), /No X-ray exam/, 'the laboratory\'s is not Radiology\'s')
  assert.equal(ok('/mr lumbar')[0].params.service_id, 'mrlspine', '/mr is /mri')
  assert.ok(commandsFor(at()).some((x) => x.name === 'ct'))
  const physio = at('physio', RAD.filter((x) => x.department_id !== 'rad'))
  assert.ok(!commandsFor(physio).some((x) => x.name === 'ct'), 'not where Radiology does not work for the department')
  const cts = suggest('/ct ab', at(), [], new Set())!.items.map((x) => x.label)
  assert.deepEqual(cts.slice(0, 2), ['CT abdomen & pelvis', 'CT abdomen & pelvis with contrast'], 'as typed, first'); assert.ok(cts.every((x) => x.startsWith('CT')), 'only its section')
  assert.ok(suggest('/us a', at(), [], new Set())!.items.every((x) => x.label.startsWith('US')))
})
test('the core\'s part (a): an order draft with a pack\'s type and words; a walk-in too', () => {
  const org = { services: [{ ...RAD[1], reply_type: 'result', coding: null, fields: [] }] } as never
  const [e] = draftEntries({ id: 'd1', function: 'order', params: { service_id: 'xrknee', priority: 'routine', as: { type: 'radiology.request', words: { side: 'left' } } } }, { patientId: 'p', departmentId: 'gp', org })
  assert.equal(e.type, 'radiology.request'); assert.deepEqual((e.data as Record<string, unknown>).radiology, { side: 'left' })
  const [plain] = draftEntries({ id: 'd2', function: 'order', params: { service_id: 'xrknee', priority: 'routine' } }, { patientId: 'p', departmentId: 'gp', org })
  assert.equal(plain.type, 'order'); assert.equal((plain.data as Record<string, unknown>).radiology, undefined, 'the base\'s order as it is')
  const [w] = walkInOrders({ patientId: 'p', from: 'rad', to: 'rad', services: [{ id: 'xrknee', code: 'xrknee', name: 'X-ray knee', coding: null, as: packOrder({ side: 'right' }), priority: 'urgent' }] })
  assert.equal(w.type, 'radiology.request'); assert.deepEqual((w.data as Record<string, unknown>).radiology, { side: 'right' }); assert.equal((w.data as Record<string, unknown>).priority, 'urgent')
  assert.deepEqual(packOrder({ portable: false, side: 'left' }).words, { side: 'left' }, 'only what was said')
})
test('the walk-in\'s line: the doctor\'s words among this bench\'s exams', () => {
  const offered = RAD.filter((s) => s.department_id === 'rad') as unknown as Service[]
  const a = examsIn('/us abd', offered); assert.deepEqual(a.found.map((s) => s.code), ['usabd'])
  const b = examsIn('/xr knee left', offered); assert.deepEqual(b.found.map((s) => s.code), ['xrknee']); assert.equal(b.said.words.side, 'left')
  assert.deepEqual(examsIn('/ct zzz', offered).unknown, ['zzz'])
  assert.deepEqual(examsIn('/xr spine', offered).fits, [{ word: 'spine', names: ['X-ray cervical spine', 'X-ray lumbar spine'] }], 'fits two: said which')
  assert.deepEqual(examsIn('/us abd +c', offered, (s) => s.code === 'usap').found.map((s) => s.code), ['usap'], 'with contrast as the department says, not by the name')
})
test('what an exam needs; film only: reported only when asked, and not asked', () => {
  const list = [{ code: 'xrchest', report: 'asked' as const }, { code: 'xrknee', side: true }, { code: 'ctapc', contrast: true, prep: 'Fasting 4 hours' }]
  assert.deepEqual(examIn(list, 'xrknee'), { code: 'xrknee', side: true, contrast: false, prep: null, prep_ar: null, report: 'always' })
  assert.equal(examIn(list, 'ctbrain').report, 'always', 'an exam it does not name: always reported')
  assert.equal(filmOnly(examIn(list, 'xrchest'), {}), true); assert.equal(filmOnly(examIn(list, 'xrchest'), { report: true }), false, 'the doctor asked')
  assert.equal(filmOnly(examIn(list, 'xrknee'), {}), false)
})
test('the facts before contrast: the latest eGFR, else worked out from creatinine; metformin; a contrast allergy; pregnant', () => {
  const now = Date.parse('2026-10-08T12:00:00Z'); const ago = (d: number) => new Date(now - d * 86_400_000).toISOString()
  assert.equal(ckdEpi(2.6, 46, true), 22); assert.equal(ckdEpi(1.0, 50, false), 92)
  const f = factsOf({ patient: { sex: 'female', age: 46 }, values: [{ key: 'creat', code: 'loinc:2160-0', value: 2.6, at: ago(3) }],
    medications: [{ drug_code: 'atc:A10BA02', drug_name: 'Metformin', status: 'active', dose_number: 1000, dose_unit: 'mg', frequency: 'BID' }],
    allergies: [{ substance_name: 'Iodinated contrast media', status: 'active' }] }, null, now)
  assert.deepEqual(f.egfr, { value: 22, days: 3, worked: true }); assert.equal(f.metformin, 'metformin 1000 mg BID')
  assert.equal(f.contrastAllergy, 'Iodinated contrast media'); assert.equal(f.mayBePregnant, true); assert.equal(f.pregnancy, null)
  const g = factsOf({ patient: { sex: 'male', age: 61 }, values: [{ key: 'egfr', code: null, value: 64, at: ago(2) }, { key: 'creat', code: null, value: 1.2, at: ago(5) }], medications: [], allergies: [], allergy_review: null }, null, now)
  assert.deepEqual(g.egfr, { value: 64, days: 2 }, 'a reported eGFR newer than the creatinine is taken as it is')
  assert.equal(g.mayBePregnant, false); assert.equal(g.allergiesAsked, false)
  assert.equal(factsOf({ values: [{ key: 'egfr', code: null, value: 50, at: ago(40) }] }, null, now).egfr, null, 'older than 30 days: no recent eGFR (the picture)')
  assert.equal(factsOf({ patient: { sex: 'male', age: 40 }, values: [{ key: 'creat', code: 'loinc:2160-0', value: 97, ucum: 'umol/L', at: ago(1) }] }, null, now).egfr?.value, 87,
    'creatinine in µmol/L converted before CKD-EPI')
  assert.equal(factsOf({ patient: { sex: 'male', age: 40 }, values: [{ key: 'creat', code: null, value: 1.1, ucum: 'mmol/L', at: ago(1) }] }, null, now).egfr, null, 'an unknown unit: no eGFR rather than a wrong one')
  const met = (drug_name: string, drug_code: string | null = null) => factsOf({ medications: [{ drug_code, drug_name, status: 'active', dose_number: null, dose_unit: null, frequency: null }] }, null, now).metformin
  assert.ok(met('Galvus Met 50/1000') && met('Janumet') && met('x', 'atc:A10BD07')); assert.equal(met('Synjardy XR', 'atc:A10BD19'), 'metformin', 'by its name')
  assert.equal(met('Glyxambi', 'atc:A10BD19'), null, 'empagliflozin + linagliptin: no metformin')
  assert.equal(factsOf({}, { pregnancy: { entry_id: 'x', data: { status: 'current', pregnant: true }, words: 'Pregnant' } }, now).pregnancy, 'pregnant')
})
test('templates: the impression line is the impression, the rest the findings; this kind\'s first', () => {
  assert.deepEqual(templateOf(['Findings: Lungs clear.', 'Heart normal.', 'Impression: Normal chest X-ray.']), { findings: 'Lungs clear.\nHeart normal.', impression: 'Normal chest X-ray.' })
  const ts = [{ name: 'Normal chest X-ray' }, { name: 'Normal CT brain' }, { name: 'CT renal colic' }, { name: 'Normal US abdomen' }]
  assert.deepEqual(templatesFor(ts, 'CT').map((t) => t.name), ['Normal CT brain', 'CT renal colic'])
  assert.deepEqual(templatesFor(ts, 'MRI').length, 4, 'none of its kind: every one')
})
test('the study before: the same part of the body, of any kind', () => {
  assert.ok(samePart('US abdomen', 'CT abdomen & pelvis with contrast')); assert.ok(samePart('X-ray lumbar spine', 'MRI lumbar spine'))
  assert.ok(!samePart('CT brain', 'CT chest')); assert.ok(!samePart('X-ray cervical spine', 'MRI lumbar spine'), 'two spines are two parts')
})
console.log(`radiology: ${n} groups passed`)
