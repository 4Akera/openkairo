// Critical care (spec/openCare.md §5.6), piece I3: the cardiac rows. The hour's rhythm, ectopics, ST and its fall as the base's
// observations in the pack's own code system, the chest pain on the vitals, and what stops the sign; the chart's Heart group (the heart
// rate and BP moved into it) and its Bloods from the base's values; the tile's rhythm word. Pure: no browser, no database.
//   npm run test:intensive
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { E, presence, val } from './chart-fixtures'
import type { Organization, PresenceRow, ServerEntry } from '../src/core/db/types'
import { CARDIAC, cardiacOf, cardiacProblems } from '../src/packs/intensive/cardiac'
import { chartOf, type ChartModel } from '../src/packs/intensive/chart'
import { emptyDraft, entriesOf, hourNow, isEmpty, problemsOf, type HourDraft } from '../src/packs/intensive/hour'
import { unitOf } from '../src/packs/intensive/unit'
import { tileWords, type IcuBoard, type StayWords } from '../src/packs/intensive/board'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

// the CCU's setting as its starter setup writes it: three of its infusions, the cardiac rows on
const INFUSIONS = [{ key: 'heparin', name: 'Heparin', short: 'heparin', kind: 'anticoagulant', dose_unit: 'units/h', amount: 25000, amount_unit: 'units', volume: 50 },
  { key: 'gtn', name: 'Glyceryl trinitrate (GTN)', short: 'GTN', kind: 'vasodilator', dose_unit: 'ug/min', amount: 50, amount_unit: 'mg', volume: 50 },
  { key: 'amiodarone', name: 'Amiodarone', short: 'amiodarone', kind: 'antiarrhythmic', dose_unit: 'mg/h', amount: 900, amount_unit: 'mg', volume: 500 }]
const setting = (key: string, data: Record<string, unknown>) => ({ key, thing_id: 'ccu', owner_id: 'ccu', data, recorded_at: '2026-10-01T00:00:00Z' })
const org = { settings: [setting('intensive.unit', { day_starts: 8, infusions: INFUSIONS }), setting('intensive.cardiac', { on: true })],
  settingKeys: [], datatypes: {}, departments: [{ id: 'ccu', packs: ['intensive'] }] } as unknown as Organization
const unit = unitOf(org, 'ccu')
const at = (h: number, m = 0) => `2026-10-09T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
const where = { patientId: 'pt', departmentId: 'ccu', stay: 'st1' }
let ids = 0; const id = () => `n${++ids}`
const draft = (over: Partial<HourDraft> = {}): HourDraft => ({ ...emptyDraft(at(9)), ...over })
const coding = (code: string, display: string) => ({ text: display, codings: [{ system: CARDIAC, code, display }] })

test('the hour\'s cardiac rows: an observation each in the pack\'s system; the pain on the vitals; what stops the sign', () => {
  assert.equal(unit.cardiac, true); assert.equal(unitOf(org, 'icu').cardiac, false, 'off where the department has not switched them on')
  const now = hourNow([], undefined, at(10), unit, 84)
  const out = entriesOf(draft({ hr: '128', cardiac: { rhythm: 'af', ectopics: 'ves', pain: '3', st: 'resolving', st_fall: '60' } }), now, unit, where, id).entries
  assert.deepEqual(out.map((e) => e.type), ['vitals', 'observation', 'observation', 'observation', 'observation'])
  assert.deepEqual(out[0].data, { hr: { value: '128', unit: 'bpm', ucum: '/min' }, pain: { value: '3', unit: '/10', ucum: '{score}' } })
  assert.deepEqual(out.slice(1).map((e) => e.data), [
    { code: coding('rhythm', 'Heart rhythm'), value: { concept: coding('af', 'Atrial fibrillation') } },
    { code: coding('ectopics', 'Ectopic beats'), value: { concept: coding('ves', 'Ventricular ectopics') } },
    { code: coding('st', 'ST segment'), value: { concept: coding('resolving', 'Resolving') } },
    { code: coding('st_fall', 'ST elevation fall'), value: { quantity: { value: '60', unit: '%', ucum: '%' } } }])
  assert.ok(out.every((e) => e.occurred_at === at(9) && e.visit_id === 'st1'))
  assert.deepEqual(out.slice(1).map((e) => cardiacOf({ type: e.type, data: e.data } as ServerEntry)),
    [{ kind: 'rhythm', code: 'af', text: 'Atrial fibrillation' }, { kind: 'ectopics', code: 'ves', text: 'Ventricular ectopics' }, { kind: 'st', code: 'resolving', text: 'Resolving' }, { kind: 'st_fall', value: 60 }])
  const other = entriesOf(draft({ cardiac: { rhythm: 'other', rhythm_text: 'Wenckebach' } }), now, unit, where, id).entries
  assert.deepEqual(other[0].data, { code: coding('rhythm', 'Heart rhythm'), value: { concept: coding('other', 'Wenckebach') } }, 'another rhythm: its words typed')
  assert.deepEqual(entriesOf(draft({ cardiac: {} }), now, unit, where, id).entries, [], 'blank: nothing'); assert.equal(isEmpty(draft({ cardiac: { st: '' } })), true)
  assert.equal(isEmpty(draft({ cardiac: { rhythm: 'sr' } })), false)
  const off = unitOf(org, 'icu')
  assert.deepEqual(entriesOf(draft({ hr: '90', cardiac: { rhythm: 'af', pain: '3' } }), now, off, where, id).entries.map((e) => [e.type, e.data]),
    [['vitals', { hr: { value: '90', unit: 'bpm', ucum: '/min' } }]], 'cardiac rows off: none written')
  assert.deepEqual(cardiacProblems({ pain: '11', st_fall: '120', rhythm: 'other' }).map((p) => [p.field, p.text]),
    [['pain', 'Chest pain is 0 to 10'], ['st_fall', '120 % is not plausible'], ['rhythm', 'Say the rhythm']])
  assert.deepEqual(cardiacProblems({ pain: '2.5' }).map((p) => p.text), ['Chest pain is 0 to 10'], 'a whole number')
  assert.deepEqual(problemsOf(draft({ cardiac: { pain: '11' } }), now, unit).map((p) => p.text), ['Chest pain is 0 to 10'])
  assert.deepEqual(problemsOf(draft({ cardiac: { pain: '11' } }), now, off), [], 'only where the rows are on')
})

// Maher's four hours (Cairo 09:00–12:00): sinus and the ST resolving, ectopics, then AF with pain, AF and no new change
const W = { visit_id: 'st1', author_id: 'rn' }
const q = (value: number, unit: string, ucum = unit) => ({ ucum, unit, value: String(value) })
const vit = (h: number, hr: number, sys: number, dia: number, pain: number) => E('vitals', { ...W, occurred_at: at(h), data: { hr: q(hr, 'bpm', '/min'),
  bp: { sys: q(sys, 'mmHg', 'mm[Hg]'), dia: q(dia, 'mmHg', 'mm[Hg]') }, pain: q(pain, '/10', '{score}') } })
const card = (h: number, kind: string, words: string, code: string, text: string) => E('observation', { ...W, occurred_at: at(h), data: { code: coding(kind, words), value: { concept: coding(code, text) } } })
const rhythm = (h: number, code: string, text: string) => card(h, 'rhythm', 'Heart rhythm', code, text)
const fall = (h: number, v: number) => E('observation', { ...W, occurred_at: at(h), data: { code: coding('st_fall', 'ST elevation fall'), value: { quantity: q(v, '%') } } })
const HOURS = [vit(6, 82, 122, 70, 0), rhythm(6, 'sr', 'Sinus rhythm'), card(6, 'st', 'ST segment', 'resolving', 'Resolving'), fall(6, 60),
  vit(7, 84, 118, 72, 0), rhythm(7, 'sr', 'Sinus rhythm'), card(7, 'ectopics', 'Ectopic beats', 'ves', 'Ventricular ectopics'),
  vit(8, 128, 98, 60, 3), rhythm(8, 'af', 'Atrial fibrillation'), vit(9, 104, 110, 66, 0), rhythm(9, 'af', 'Atrial fibrillation'), card(9, 'st', 'ST segment', 'no_new_change', 'No new change')]
const lab = (code: string, value: number, h: number, m: number, interpretation: string) => val('x', code, value, at(h, m), E('result', { occurred_at: at(h, m) }), interpretation)
const VALUES = [lab('loinc:2823-3', 3.4, 8, 15, 'L'), lab('loinc:19123-9', 0.8, 8, 15, 'N'), lab('loinc:3173-2', 44, 8, 40, 'H'), lab('loinc:10839-9', 1.84, 5, 40, 'H')]
const rowOf = (m: ChartModel, g: string, r: string) => m.groups.find((x) => x.key === g)?.rows.find((x) => x.key === r)
test('the chart: the Heart group first with the heart rate and BP; rhythm, chest pain, ST; the Bloods before in and out', () => {
  const m = chartOf({ entries: HOURS, from: at(6), now: at(9, 20), dayStarts: 8, kg: 84, users: [], cardiac: { values: VALUES, needleAt: at(5, 3) } })
  assert.deepEqual(m.groups.map((g) => g.key), ['heart', 'vitals', 'bloods', 'fluids', 'signed'])
  assert.deepEqual(m.groups[0].rows.map((r) => r.key), ['rhythm', 'hr', 'bp', 'pain', 'st'])
  assert.equal(rowOf(m, 'vitals', 'hr'), undefined, 'the heart rate left the vitals'); assert.equal(rowOf(m, 'vitals', 'bp'), undefined)
  assert.deepEqual(rowOf(m, 'heart', 'rhythm')?.cells.map((c) => c?.text ?? null), ['SR', 'SR · VEs', 'AF · new', 'AF'])
  assert.deepEqual(rowOf(m, 'heart', 'hr')?.cells.map((c) => c?.text ?? null), ['82', '84', '128', '104'])
  assert.deepEqual(rowOf(m, 'heart', 'pain')?.cells.map((c) => c?.text ?? null), ['0', '0', '3', '0']); assert.equal(rowOf(m, 'heart', 'pain')?.unit, '0–10')
  assert.deepEqual(rowOf(m, 'heart', 'st')?.cells.map((c) => c?.text ?? null), ['↓ 60 % at 57 min', null, null, 'no new change'], 'the fall, 57 min after the needle')
  const noNeedle = chartOf({ entries: HOURS, from: at(6), now: at(9, 20), dayStarts: 8, kg: 84, users: [], cardiac: { values: VALUES, needleAt: null } })
  assert.equal(rowOf(noNeedle, 'heart', 'st')?.cells[0]?.text, '↓ 60 %')
  assert.deepEqual(m.groups.find((g) => g.key === 'bloods')?.rows.map((r) => [r.label, r.unit]), [['aPTT', 's'], ['Troponin I', 'ng/mL'], ['Potassium', 'mmol/L'], ['Magnesium', 'mmol/L']])
  assert.deepEqual(rowOf(m, 'bloods', 'k')?.cells, [null, null, { text: '3.4', flag: 'low' }, null], 'potassium 3.4 low by its interpretation')
  assert.deepEqual(rowOf(m, 'bloods', 'mg')?.cells[2], { text: '0.8' })
  assert.deepEqual(rowOf(m, 'bloods', 'aptt')?.cells[2], { text: '44', flag: 'high' }, 'the aPTT by its interpretation while no heparin target is given')
  assert.deepEqual(rowOf(m, 'bloods', 'trop')?.cells, [null, null, null, null], 'a value before the first hour is not drawn')
  const others = chartOf({ entries: [rhythm(6, 'other', 'Wenckebach'), rhythm(7, 'other', 'Wenckebach'), rhythm(8, 'other', 'Torsades')], from: at(6), now: at(9, 20),
    dayStarts: 8, kg: 84, users: [], cardiac: { values: [], needleAt: null } })
  assert.deepEqual(rowOf(others, 'heart', 'rhythm')?.cells.map((c) => c?.text ?? null), ['Wenckebach', 'Wenckebach', 'Torsades · new', null], 'another rhythm, by its words')
  const plain = chartOf({ entries: HOURS, from: at(6), now: at(9, 20), dayStarts: 8, kg: 84, users: [] })
  assert.deepEqual(plain.groups.map((g) => g.key), ['vitals', 'fluids', 'signed'], 'cardiac rows off: the ICU\'s chart')
  assert.deepEqual(rowOf(plain, 'vitals', 'hr')?.cells.map((c) => c?.text ?? null), ['82', '84', '128', '104'])
})

test('the tile: a rhythm that is not sinus first, in amber; sinus says nothing', () => {
  const NOW = Date.parse('2026-10-09T12:20:00Z'); const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString()
  const row = (item: string): PresenceRow => presence(item, { kind: 'stay', state: 'admitted', department_id: 'ccu', checked_in_at: ago(5) })
  const tc = { org, dept: { id: 'ccu', packs: ['intensive'] } }
  const board = (w: StayWords): IcuBoard => ({ patient_ids: ['pt'], stays: { st1: { goals_at: ago(1), ...w } } })
  const maher: StayWords = { rhythm: { code: 'af', at: ago(1) }, infusions: [{ key: 'amiodarone', drug: 'Amiodarone', dose: '37.4', unit: 'mg/h', rate: '20.8' },
    { key: 'heparin', drug: 'Heparin', dose: '1000', unit: 'units/h', rate: '2' }] }
  assert.deepEqual(tileWords(row('st1'), tc, board(maher), NOW)?.words, [{ text: 'AF', tone: 'warn' }, 'amiodarone 37.4 mg/h'])
  for (const code of ['sr', 'sinus_tachy', 'sinus_brady']) assert.deepEqual(tileWords(row('st1'), tc, board({ ...maher, rhythm: { code, at: ago(1) } }), NOW)?.words, ['amiodarone 37.4 mg/h'], code)
  assert.deepEqual(tileWords(row('st1'), tc, board({ rhythm: { code: 'avb3', at: ago(1) } }), NOW)?.words, [{ text: 'CHB', tone: 'warn' }])
  assert.equal(tileWords(row('st1'), tc, board({ rhythm: { code: 'nonsense', at: ago(1) } }), NOW), null, 'a code the pack does not know: nothing')
})
console.log(`intensive ccu: ${n} groups passed`)
