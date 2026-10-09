// Cardiology (spec/openCare.md §5.8), as pure decisions: the /ecg line and the result it writes (no order, each measure with its LOINC
// code and range, the conclusion), read back for the card and the Heart section; /hf (NYHA, oedema, lying flat, the weight, the dry
// weight); the four medicine groups against the clinic's target doses; /echo ordering from the Echo room only where it works for this one.
//   npm run test:cardio
import assert from 'node:assert/strict'
import { registerCommands } from '../src/packs/cardio/commands'
import { conclusionOf, ecgData, ecgOf, parseEcg } from '../src/packs/cardio/ecg'
import { hfOf, parseHf } from '../src/packs/cardio/hf'
import { groupsLine, groupsOf, mgADay, weightOf, type Target } from '../src/packs/cardio/heart'
import { parse, type Ctx, type Parsed } from '../src/core/screens/visit/parse'
import { draftEntries } from '../src/core/db/entries'
import type { Medication, ValueRow } from '../src/core/db/types'
registerCommands()

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const ok = (r: ReturnType<typeof parseEcg>): Parsed[] => { if (!r || !('ok' in r)) throw new Error(JSON.stringify(r)); return r.ok }
const DEPTS = [{ id: 'cc', name: 'Cardiology clinic', packs: ['cardio'] }, { id: 'echo', name: 'Echo room', packs: ['cardio'] }, { id: 'gp', name: 'General Practice', packs: [] }]
const SVC = [{ id: 'echo1', code: 'echo', name: 'Echo · transthoracic', department_id: 'echo', section_name: 'Echo' }, { id: 'cbc', code: 'cbc', name: 'Complete blood count', department_id: 'lab' }]
const at = (departmentId: string, packs: string[], services = SVC): Ctx => ({ services, departments: DEPTS, problems: [], departmentId, packs, templates: [], usedIn: (p: string) => DEPTS.filter((d) => d.packs.includes(p)).map((d) => d.name) })

test('/ecg: the rhythm, the rate, PR, QRS, QTc, axis, ST-T words and "; the conclusion"', () => {
  const [d] = ok(parseEcg('af 108 qrs 96 qtc 452 axis 20 nad'))
  assert.equal(d.function, 'result'); assert.equal(d.line, 'ECG · AF 108 · QRS 96 · QTc 452 · axis +20° · no acute change')
  const e = ecgOf(d.params); assert.deepEqual([e.rhythm, e.rate, e.pr, e.qrs, e.qtc, e.axis, e.st], ['AF', 108, null, 96, 452, 20, ['no acute change']])
  assert.equal(d.params.conclusion, 'Atrial fibrillation, ventricular rate 108. No acute ST change. QTc long (452 ms).')
  const [s] = ok(parseEcg('sinus hr78 pr164 qrs 92 qtc 418 axis -10 ; Normal ECG.')); assert.equal(ecgOf(s.params).pr, 164); assert.equal(s.params.conclusion, 'Normal ECG.')
  assert.equal(ecgOf(ok(parseEcg('af 110 pr 160'))[0].params).pr, null, 'no PR in AF')
  const bad = parseEcg('sinus 78 wobble'); assert.ok(bad && 'error' in bad && /wobble/.test(bad.error), 'an unknown word is said, never dropped')
  assert.equal(parseEcg(''), null)
})
test('the result it writes: the ECG study\'s code, each measure an analyte with its LOINC, unit and range, flagged by it; no order', () => {
  const data = ecgData({ ecg: true, rhythm: 'AF', rate: 108, pr: null, qrs: 96, qtc: 452, axis: 20, st: ['no acute change'], conclusion: null })
  assert.deepEqual((data.code as { codings: { code: string }[] }).codings.map((c) => c.code), ['11524-6'])
  const as = data.analytes as { key: string; code?: { code: string }; value?: { ucum: string }; interpretation?: string }[]
  assert.deepEqual(as.map((a) => a.key), ['rhythm', 'rate', 'qrs', 'qtc', 'axis', 'st'])
  assert.deepEqual(as.filter((a) => a.code).map((a) => a.code!.code), ['8867-4', '8633-0', '8636-3', '8632-2'])
  assert.equal(as.find((a) => a.key === 'rate')!.interpretation, 'H'); assert.equal(as.find((a) => a.key === 'qtc')!.interpretation, 'H')
  assert.equal(as.find((a) => a.key === 'axis')!.value!.ucum, 'deg')
  assert.equal(ecgData({ ecg: true, rhythm: 'sinus', rate: 70, pr: null, qrs: null, qtc: 455, axis: null, st: [], conclusion: null, female: true }).analytes
    && (ecgData({ ecg: true, rhythm: 'sinus', rate: 70, pr: null, qrs: null, qtc: 455, axis: null, st: [], conclusion: null, female: true }).analytes as { key: string; interpretation?: string }[])
      .find((a) => a.key === 'qtc')!.interpretation, 'N', 'a woman\'s QTc to 460')
  const [entry] = draftEntries({ id: 'x', function: 'result', params: data }, { patientId: 'p', departmentId: 'cc' })
  assert.equal(entry.type, 'result'); assert.equal(entry.refers_to, undefined, 'a result with no order')
  assert.equal(conclusionOf({ ecg: true, rhythm: 'sinus', rate: 78, pr: 164, qrs: 92, qtc: 418, axis: 30, st: ['no acute change'], conclusion: null }), 'Sinus rhythm, rate 78. No acute ST change.')
})
test('/hf: NYHA with the oedema and lying flat in its note, the weight as vitals, the dry weight as its own observation', () => {
  const r = parseHf('nyha 2 wt 71.4 oedema ankles flat dry 70'); assert.ok(r && 'ok' in r)
  const [o, v, d] = r.ok
  assert.equal(o.function, 'observation'); assert.deepEqual(o.params.value, { text: 'II' }); assert.equal(o.params.note, 'oedema: ankles · lying flat: flat')
  assert.equal(o.line, 'Heart failure visit · NYHA II · ankles oedema · lies flat'); assert.deepEqual(hfOf(o.params), { nyha: 2, oedema: 'ankles', flat: 'flat' })
  assert.equal(v.function, 'vitals'); assert.equal(v.params.weight, 71.4)
  assert.deepEqual(d.params.value, { quantity: { value: '70', unit: 'kg', ucum: 'kg' } })
  const e = parseHf('nyha 5'); assert.ok(e && 'error' in e)
})
const med = (atc: string, dose: number, frequency: string, name = atc): Medication => ({ id: atc, drug_code: `atc:${atc}`, drug_name: name, dose_number: dose, dose_unit: 'mg', route: 'oral', frequency, prn: false, problem_id: null, status: 'active', started_on: '' })
const TARGETS: Target[] = [{ group: 'ras', name: 'Sacubitril/valsartan 97/103 mg twice', atc: 'C09DX04', mg_a_day: 194 }, { group: 'bb', name: 'Bisoprolol 10 mg once', atc: 'C07AB07', mg_a_day: 10 },
  { group: 'mra', name: 'Spironolactone 50 mg once', atc: 'C03DA01', mg_a_day: 50 }, { group: 'sglt2', name: 'Dapagliflozin 10 mg once', atc: 'A10BK01', mg_a_day: 10 }]
test('the four groups: read from the list by ATC class, against the clinic\'s target doses: half, at target, not on', () => {
  const rows = groupsOf([med('C09DX04', 49, 'BID', 'Entresto'), med('C07AB07', 5, 'OD', 'Concor'), med('A10BK01', 10, 'OD', 'Forxiga'), med('C03CA01', 40, 'OD', 'Lasix')], TARGETS)
  assert.deepEqual(rows.map((r) => r.standing), ['half', 'half', 'not on', 'at target'])
  assert.equal(rows[2].target?.name, 'Spironolactone 50 mg once', 'not on: the group\'s first target named')
  assert.equal(groupsLine(rows), 'ACEi/ARB/ARNI and Beta-blocker at half the target · SGLT2 inhibitor at target · MRA not on')
  assert.equal(mgADay({ dose_number: 49, dose_unit: 'mg', frequency: 'BD' }), 98); assert.equal(mgADay({ dose_number: 5, dose_unit: 'mg', frequency: null }), null)
  assert.equal(groupsOf([med('C09AA05', 2.5, 'OD')], TARGETS)[0].standing, 'on', 'a medicine with no target of its own: on')
  assert.equal(groupsOf([med('C07AB07', 2.5, 'OD')], TARGETS)[1].standing, 'low')
})
const val = (key: string, code: string | null, value: number, at: string): ValueRow => ({ id: `${key}${at}`, item: key, key, patient_id: 'p', code, name: key, value, ucum: null, unit: null, interpretation: null, at, entry_id: `${key}${at}`, visit_id: null, source_entries: [] })
test('the weight against the dry weight the doctor set last', () => {
  const w = weightOf([val('weight', 'loinc:29463-7', 73.8, '2026-06-01'), val('weight', 'loinc:29463-7', 70.2, '2026-09-02'), val('weight', 'loinc:29463-7', 71.4, '2026-10-08'),
    val('value', 'cardio.terms:dry_weight', 70, '2026-09-02')])
  assert.equal(w.now?.value, 71.4); assert.equal(w.dry?.value, 70); assert.equal(w.over, 1.4); assert.deepEqual(w.trend.map((v) => v.value), [73.8, 70.2, 71.4])
})
test('/echo: the Echo room\'s echo wherever it works for this department, "? the question" alone enough; /ecg only where the pack is ticked', () => {
  const r = parse('/echo ? lv function, new af', at('gp', [])); assert.ok(r && 'ok' in r)
  assert.equal(r.ok[0].params.service_id, 'echo1'); assert.equal(r.ok[0].params.question_text, 'lv function, new af')
  const u = parse('/echo urgent ? murmur', at('gp', [])); assert.ok(u && 'ok' in u); assert.equal(u.ok[0].params.priority, 'urgent')
  const e = parse('/ecg sinus 78', at('gp', [])); assert.ok(e && 'error' in e && /used in: Cardiology clinic, Echo room/.test(e.error), JSON.stringify(e))
  const c = parse('/ecg sinus 78', at('cc', ['cardio'])); assert.ok(c && 'ok' in c)
  const away = parse('/echo ? lv', at('gp', [], SVC.filter((s) => s.code !== 'echo'))); assert.ok(away && 'error' in away)
})
console.log(`✓ cardio: ${n} groups of checks`)
