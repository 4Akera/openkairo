// Critical care (spec/openCare.md §5.6), piece I3: the cardiac rows. The hour's rhythm, ectopics, ST and its fall as the base's
// observations in the pack's own code system, the chest pain on the vitals, and what stops the sign; the chart's Heart group (the heart
// rate and BP moved into it) and its Bloods from the base's values; the tile's rhythm word; a time typed HH:MM as its instant; heparin by
// aPTT from the unit's table; the reperfusion strip against its targets, its data and its entry; the banner's Killip. Pure: no browser,
// no database.
//   npm run test:intensive
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { E, presence, val } from './chart-fixtures'
import type { Identity, Organization, PresenceRow, ServerEntry } from '../src/core/db/types'
import { CARDIAC, cardiacOf, cardiacProblems } from '../src/packs/intensive/cardiac'
import { chartOf, type ChartModel } from '../src/packs/intensive/chart'
import { emptyDraft, entriesOf, hourNow, isEmpty, problemsOf, type HourDraft } from '../src/packs/intensive/hour'
import { unitOf } from '../src/packs/intensive/unit'
import { tileWords, type IcuBoard, type StayWords } from '../src/packs/intensive/board'
import { adviceFits, heparinAdvice, heparinOf, heparinSince, type HeparinTable } from '../src/packs/intensive/heparin'
import { clinicInstant } from '../src/packs/intensive/hours'
import { draftOf, duration, headline, reperfusionData, reperfusionEntry, reperfusionProblems, strip, targetsOf, type Reperfusion } from '../src/packs/intensive/reperfusion'
import { icuWords } from '../src/packs/intensive/words'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

// the CCU's setting as its starter setup writes it: three of its infusions, the cardiac rows on
const INFUSIONS = [{ key: 'heparin', name: 'Heparin', short: 'heparin', kind: 'anticoagulant', dose_unit: 'units/h', amount: 25000, amount_unit: 'units', volume: 50 },
  { key: 'gtn', name: 'Glyceryl trinitrate (GTN)', short: 'GTN', kind: 'vasodilator', dose_unit: 'ug/min', amount: 50, amount_unit: 'mg', volume: 50 },
  { key: 'amiodarone', name: 'Amiodarone', short: 'amiodarone', kind: 'antiarrhythmic', dose_unit: 'mg/h', amount: 900, amount_unit: 'mg', volume: 500 }]
const setting = (key: string, data: Record<string, unknown>) => ({ key, thing_id: 'ccu', owner_id: 'ccu', data, recorded_at: '2026-10-01T00:00:00Z' })
const TABLE: HeparinTable = { low: 50, high: 70, steps: [{ max: 39, change: 200, next: 6 }, { min: 40, max: 49, change: 100, next: 6 }, { min: 50, max: 70, change: 0, next: 24 },
  { min: 71, max: 85, change: -100, next: 6 }, { min: 86, max: 100, change: -200, hold: 30, next: 6 }, { min: 101, change: -300, hold: 60, next: 6 }] }
const org = { settings: [setting('intensive.unit', { day_starts: 8, infusions: INFUSIONS }), setting('intensive.cardiac', { on: true }), setting('intensive.heparin', TABLE)],
  settingKeys: [], datatypes: {}, departments: [{ id: 'ccu', packs: ['intensive'] }] } as unknown as Organization
const unit = unitOf(org, 'ccu')
const at = (h: number, m = 0) => `2026-10-09T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
const where = { patientId: 'pt', departmentId: 'ccu', stay: 'st1' }
let ids = 0; const id = () => `n${++ids}`
const draft = (over: Partial<HourDraft> = {}): HourDraft => ({ ...emptyDraft(at(9)), ...over })
const coding = (code: string, display: string) => ({ text: display, codings: [{ system: CARDIAC, code, display }] })

test('a time typed HH:MM: today or yesterday on the clinic\'s clock', () => {
  assert.equal(clinicInstant('07:30', 0, at(9, 20)), '2026-10-09T04:30:00.000Z'); assert.equal(clinicInstant('07:30', 1, at(9, 20)), '2026-10-08T04:30:00.000Z')
  assert.equal(clinicInstant('07:30', 0, '2026-10-09T22:30:00.000Z'), '2026-10-10T04:30:00.000Z', 'after midnight in Cairo, today is the 10th')
  assert.equal(clinicInstant('23:50', 1, '2026-10-09T22:30:00.000Z'), '2026-10-09T20:50:00.000Z')
  for (const bad of ['x', '7:30', '24:00', '07:60', '']) assert.equal(clinicInstant(bad, 0, at(9)), null, bad)
})

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
  const hep = chartOf({ entries: HOURS, from: at(6), now: at(9, 20), dayStarts: 8, kg: 84, users: [], cardiac: { values: VALUES, needleAt: null, heparin: TABLE } })
  assert.deepEqual(rowOf(hep, 'bloods', 'aptt')?.cells[2], { text: '44', flag: 'low' }, 'the aPTT against the unit\'s heparin target, not the lab\'s range')
  assert.deepEqual(rowOf(hep, 'bloods', 'k')?.cells[2], { text: '3.4', flag: 'low' }, 'the others still by their interpretation')
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

test('heparin by aPTT: the unit\'s table suggests; an aPTT already acted on says nothing', () => {
  assert.deepEqual(heparinOf(org, 'ccu'), TABLE); assert.equal(heparinOf(org, 'icu'), null, 'no table: no advice')
  const h = { dose: 1000, since: at(5) }; const a = (value: number) => ({ value, at: at(9, 40) })
  const go = (v: number, dose = 1000) => { const x = heparinAdvice(a(v), { ...h, dose }, TABLE); return x && [x.change, x.dose, x.hold] }
  assert.deepEqual(heparinAdvice(a(44), h, TABLE), { text: 'aPTT 44 s at 12:40 (target 50–70 s) → raise by 100 units/h to 1 100 · next aPTT 18:40',
    dose: 1100, change: 100, hold: null, next: at(15, 40) })
  assert.deepEqual([go(35), go(44), go(60), go(75), go(95), go(120)], [[200, 1200, null], [100, 1100, null], [0, 1000, null], [-100, 900, null], [-200, 800, 30], [-300, 700, 60]])
  // a decimal between two whole-second steps falls in the lower one (v ≥ its min and below the next step's min), never in none
  assert.deepEqual([go(39.5), go(49.5), go(70.5), go(85.5), go(100.5)], [[200, 1200, null], [100, 1100, null], [0, 1000, null], [-100, 900, null], [-200, 800, 30]], 'decimals between steps')
  assert.equal(heparinAdvice(a(60), h, TABLE)?.text, 'aPTT 60 s at 12:40 (target 50–70 s) → no change · next aPTT 12:40 tomorrow', 'next in 24 h: its day said')
  assert.equal(heparinAdvice(a(95), h, TABLE)?.text, 'aPTT 95 s at 12:40 (target 50–70 s) → lower by 200 units/h to 800; stop for 30 min first · next aPTT 18:40')
  assert.deepEqual(go(120, 200), [-200, 0, 60], 'never below 0')
  assert.equal(heparinAdvice(a(44), { dose: 1000, since: at(9, 40) }, TABLE), null, 'an aPTT before the last change (or at it): acted on')
  assert.equal(heparinAdvice(a(44), null, TABLE), null, 'no heparin'); assert.equal(heparinAdvice(null, h, TABLE), null, 'no aPTT')
  const low = { ...TABLE, steps: [{ min: 20, max: 39, change: 200, next: 6 }, ...TABLE.steps.slice(1)] }
  assert.equal(heparinAdvice(a(15), h, low)?.change, 200, 'the first step holds everything below it, a min or not')
  // the 12:00 column's rate acts on the 12:40 aPTT only when signed after it; a column before the aPTT shows no advice
  const apt = { at: at(9, 40) }; const col = (recordedAt: string) => heparinSince({ latestAt: at(9), recordedAt }, apt)
  assert.equal(col(at(9, 50)), at(10), 'signed after the aPTT: acted on'); assert.equal(heparinAdvice(a(44), { dose: 1100, since: col(at(9, 50)) }, TABLE), null)
  assert.equal(col(at(9, 5)), at(9), 'signed before the aPTT: not acted on'); assert.ok(heparinAdvice(a(120), { dose: 1000, since: col(at(9, 5)) }, TABLE))
  assert.equal(heparinSince({ latestAt: at(9, 10), recordedAt: at(9, 50) }, apt), at(9, 10), 'a change off the whole hour counts from its time')
  assert.deepEqual([adviceFits(at(9), apt), adviceFits(at(10), apt), adviceFits(at(8), apt), adviceFits(at(9), null)], [true, true, false, false])
})

// Maher's record (Cairo): pain 06:10, the door 07:30, the first ECG 07:36, lysis 07:58, into the CCU 08:20
const REC: Reperfusion = { diagnosis: 'stemi_anterior', pain_at: at(3, 10), door_at: at(4, 30), ecg_at: at(4, 36), reperfusion: 'lysis', lytic: { text: 'Tenecteplase' },
  needle_at: at(4, 58), angiography: 'within_24h', angiography_by: '2026-10-10T04:58:00.000Z', killip: 'i' }
const T = targetsOf(org, 'ccu'); const INTO = { at: at(5, 20), name: 'CCU' }
test('the strip: each target met or missed; door to needle for lysis, door to balloon for a primary PCI', () => {
  assert.deepEqual(T, { ecg_minutes: 10, needle_minutes: 30, balloon_minutes: 90 }, 'the shape\'s defaults')
  assert.equal(headline(REC), 'Anterior STEMI · lysis (tenecteplase)')
  assert.deepEqual(strip(REC, INTO, T, at(9, 20)), [{ label: 'Pain began', at: at(3, 10) }, { label: 'At the door', at: at(4, 30) },
    { label: 'First ECG', at: at(4, 36), words: '6 min · target 10', met: true },
    { label: 'Lysis', at: at(4, 58), words: 'ECG to needle 22 min · door to needle 28 min · pain to needle 1 h 48', met: true },
    { label: 'Into CCU', at: at(5, 20) }, { label: 'Angiography', at: null, words: 'by 07:58 tomorrow · 2–24 h after lysis' }, { label: 'Killip', at: null, words: 'I' }])
  const pci = strip({ ...REC, reperfusion: 'primary_pci', lytic: undefined, ecg_at: at(4, 45), needle_at: at(5, 50), angiography: undefined }, { ...INTO, name: 'ICU' }, T, at(9, 20))
  assert.deepEqual(pci.find((x) => x.label === 'Primary PCI'), { label: 'Primary PCI', at: at(5, 50), words: 'ECG to balloon 65 min · door to balloon 80 min · pain to balloon 2 h 40', met: true })
  assert.ok(pci.every((x) => !x.words?.includes('needle')), 'never "needle" for a balloon'); assert.ok(pci.some((x) => x.label === 'Into ICU'), 'a mixed unit: Into ICU')
  assert.deepEqual(pci.find((x) => x.label === 'First ECG'), { label: 'First ECG', at: at(4, 45), words: '15 min · target 10', met: false }, 'ECG at 15 min: missed')
  assert.equal(strip({ ...REC, needle_at: at(5, 5) }, INTO, T, at(9, 20)).find((x) => x.label === 'Lysis')?.met, false, 'door to needle 35: missed')
  assert.deepEqual([duration(6), duration(108), duration(120)], ['6 min', '1 h 48', '2 h'])
})

test('the record from the card: times by the clinic\'s clock, angiography by the needle + 24 h; a change of the latest', () => {
  const now = at(9, 20); const t = (hm: string, yesterday = false) => ({ hm, yesterday })
  const draft = { diagnosis: 'stemi_anterior' as const, reperfusion: 'lysis' as const, lytic: 'Tenecteplase', angiography: 'within_24h' as const, killip: 'i' as const,
    times: { pain: t('06:10'), door: t('07:30'), ecg: t('07:36'), needle: t('07:58') } }
  assert.deepEqual(reperfusionProblems(draft, now), []); assert.deepEqual(reperfusionData(draft, now), REC)
  assert.deepEqual(reperfusionProblems({ ...draft, times: { ...draft.times, ecg: t('07:20') } }, now).map((p) => p.field), ['ecg'], 'the ECG before the door')
  assert.deepEqual(reperfusionProblems({ times: { door: t('7.30') }, reperfusion: 'lysis' }, now).map((p) => p.field), ['diagnosis', 'door', 'lytic', 'needle'])
  assert.equal(reperfusionData({ ...draft, times: { ...draft.times, pain: t('23:40', true) } }, now).pain_at, at(20, 40).replace('09T', '08T'), 'yesterday')
  const v1 = E('intensive.reperfusion', { visit_id: 'st1', occurred_at: at(5), data: REC as unknown as Record<string, unknown> })
  assert.deepEqual(reperfusionData(draftOf(REC, now), now), REC, 'an edit keeps what it does not change')
  const off = reperfusionData({ ...draftOf(REC, now), angiography: 'not_planned' }, now)
  assert.equal(off.angiography_by, undefined, 'within 24 h → not planned: no time')
  assert.equal(strip(off, INTO, T, now).find((x) => x.label === 'Angiography')?.words, 'not planned')
  assert.equal(reperfusionData({ ...draft, reperfusion: 'none' }, now).needle_at, undefined, 'no reperfusion: no needle time')
  assert.deepEqual(reperfusionProblems({ ...draft, times: { ...draft.times, pain: t('20:10'), door: t('21:30'), ecg: t('21:36'), needle: t('21:58') } }, now)
    .map((p) => p.text), Array(4).fill('Later than now: yesterday?'), 'yesterday evening typed as today')
  let k = 0; const { entry, seen } = reperfusionEntry({ ...REC, killip: 'ii' }, v1, where, () => `r${++k}`, now)
  assert.deepEqual([entry.type, entry.refers_to, entry.relation, entry.visit_id, seen], ['intensive.reperfusion', v1.id, 'changes', 'st1', { [v1.item]: 1 }])
  const first = reperfusionEntry(REC, null, where, () => 'r0', now); assert.deepEqual([first.entry.refers_to, first.seen], [undefined, {}])
})

test('the banner: Killip from the stay\'s record, never another stay\'s', () => {
  const NOW = new Date(at(9, 20)); const identity = { gender: 'male', birth_date: '1968-01-01' } as Identity
  const rec = { tables: { 'base.presence': { rows: [presence('st1', { kind: 'stay', state: 'admitted', department_id: 'ccu' })], entries: {}, patients: {}, withheld: 0 } }, hidden: [] }
  const goals = E('intensive.goals', { occurred_at: at(6), visit_id: 'st1', data: { feeding: 'eating' } })
  const v1 = E('intensive.reperfusion', { occurred_at: at(5), visit_id: 'st1', data: { ...REC } })
  const x = (shown: ServerEntry[]) => icuWords({ rec, ctx: { org, me: 'dr', departmentId: 'ccu' }, identity, own: { shown, hidden: [] } }, NOW)
  assert.deepEqual(x([goals, v1]), [{ word: 'Killip I', rank: 2 }])
  assert.deepEqual(x([goals, { ...v1, item_version: 2, data: { ...REC, killip: 'ii' } }]), [{ word: 'Killip II', rank: 2 }], 'its latest version')
  assert.deepEqual(x([goals, { ...v1, visit_id: 'other' }]), [], 'another stay\'s record says nothing here')
})
console.log(`intensive ccu: ${n} groups passed`)
