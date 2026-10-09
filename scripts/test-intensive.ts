// Critical care (spec/openCare.md §5.6), piece I1: the infusions' arithmetic (the dose always the pump rate's); the ICU day's hours; the
// chart's items; the grid (a written cell, then carried faint; 'off' when stopped; a MAP worked out from the BP; in and out and the
// balance; who signed; due); the hour card's set (only what changed; the prescription link only for the same drug), its problems and
// its notices; and the ICU's words on each bed's tile from the board's one read (the owner's C1). Pure: no browser, no database.
//   npm run test:intensive
import assert from 'node:assert/strict'
import { setClinicTimeZone, hm } from '../src/core/ui/time'
import { tileWords, type IcuBoard, type StayWords } from '../src/packs/intensive/board'
import { registerTileLine, tileLineDefs, tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import { E, next, presence, table } from './chart-fixtures'
import type { ListRowData, Organization, PresenceRow, ServerEntry } from '../src/core/db/types'
import { doseFor, fitProblem, rateFor, type Bag } from '../src/packs/intensive/rates'
import { dayStart, hourLabel, hourOf, hoursFrom } from '../src/packs/intensive/hours'
import { inForce, inHour, itemsOf } from '../src/packs/intensive/items'
import { chartOf, type ChartModel } from '../src/packs/intensive/chart'
import { emptyDraft, entriesOf, hourNow, noticesOf, problemsOf, rangeNotices, type HourDraft } from '../src/packs/intensive/hour'
import { unitOf } from '../src/packs/intensive/unit'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

// the ICU's setting as its starter setup writes it
const INFUSIONS = [
  { key: 'noradrenaline', name: 'Noradrenaline', short: 'noradrenaline', kind: 'vasopressor', dose_unit: 'ug/kg/min', amount: 4, amount_unit: 'mg', volume: 50 },
  { key: 'adrenaline', name: 'Adrenaline', short: 'adrenaline', kind: 'vasopressor', dose_unit: 'ug/kg/min', amount: 4, amount_unit: 'mg', volume: 50 },
  { key: 'dopamine', name: 'Dopamine', short: 'dopamine', kind: 'vasopressor', dose_unit: 'ug/kg/min', amount: 200, amount_unit: 'mg', volume: 50 },
  { key: 'dobutamine', name: 'Dobutamine', short: 'dobutamine', kind: 'inotrope', dose_unit: 'ug/kg/min', amount: 250, amount_unit: 'mg', volume: 50 },
  { key: 'propofol', name: 'Propofol 1%', short: 'propofol', kind: 'sedative', dose_unit: 'mg/h', amount: 500, amount_unit: 'mg', volume: 50 },
  { key: 'midazolam', name: 'Midazolam', short: 'midazolam', kind: 'sedative', dose_unit: 'mg/h', amount: 50, amount_unit: 'mg', volume: 50 },
  { key: 'fentanyl', name: 'Fentanyl', short: 'fentanyl', kind: 'opioid', dose_unit: 'ug/h', amount: 2500, amount_unit: 'ug', volume: 50 },
  { key: 'insulin', name: 'Soluble insulin', short: 'insulin', kind: 'insulin', dose_unit: 'units/h', amount: 50, amount_unit: 'units', volume: 50 },
  { key: 'magnesium', name: 'Magnesium sulfate', short: 'MgSO₄', kind: 'electrolyte', dose_unit: 'g/h', amount: 10, amount_unit: 'g', volume: 100 },
]
const org = { settings: [{ key: 'intensive.unit', thing_id: 'icu', owner_id: 'icu', data: { day_starts: 8, infusions: INFUSIONS }, recorded_at: '2026-10-01T00:00:00Z' }],
  settingKeys: [], datatypes: {} } as unknown as Organization

const bag = (amount: number, unit: Bag['unit'], volume: number): Bag => ({ amount, unit, volume })
test('rates: the dose is the pump rate\'s, and the rate the dose\'s to 0.1 mL/h', () => {
  const nor = bag(4, 'mg', 50)
  assert.equal(rateFor(0.1, nor, 'ug/kg/min', 78), 5.9); assert.equal(doseFor(5.9, nor, 'ug/kg/min', 78), 0.1)
  for (const [dose, rate] of [[0.25, 14.6], [0.3, 17.6], [0.15, 8.8], [0.2, 11.7]]) {
    assert.equal(rateFor(dose, nor, 'ug/kg/min', 78), rate, `${dose} → ${rate}`); assert.equal(doseFor(rate, nor, 'ug/kg/min', 78), dose, `${rate} → ${dose}`)
  }
  const pairs: [Bag, Parameters<typeof rateFor>[2], number, number][] = [[bag(500, 'mg', 50), 'mg/h', 120, 12], [bag(2500, 'ug', 50), 'ug/h', 75, 1.5],
    [bag(50, 'units', 50), 'units/h', 4, 4], [bag(10, 'g', 100), 'g/h', 1, 10], [bag(50, 'mg', 50), 'ug/min', 20, 1.2]]
  for (const [b, u, dose, rate] of pairs) { assert.equal(rateFor(dose, b, u, null), rate, `${u} ${dose}`); assert.equal(doseFor(rate, b, u, null), dose, `${u} at ${rate}`) }
  assert.equal(doseFor(4, bag(50, 'mg', 50), 'units/h', null), null)
  assert.equal(fitProblem(bag(50, 'mg', 50), 'units/h', null), 'This bag is in mg: a units/h dose needs a bag in units')
  assert.equal(doseFor(5.9, nor, 'ug/kg/min', null), null); assert.equal(fitProblem(nor, 'ug/kg/min', null), 'A dose per kg needs the weight')
})

test('hours: whole hours, the ICU day from 08:00 on the clinic\'s clock', () => {
  assert.equal(hourOf('2026-10-09T09:20:31Z'), '2026-10-09T09:00:00.000Z')
  assert.equal(dayStart('2026-10-09T04:59:00Z', 8), '2026-10-08T05:00:00.000Z', '07:59: yesterday\'s 08:00')
  assert.equal(dayStart('2026-10-09T05:00:00Z', 8), '2026-10-09T05:00:00.000Z', '08:00: today\'s')
  assert.deepEqual(hoursFrom('2026-10-09T05:10:00Z', '2026-10-09T07:00:00Z'), ['2026-10-09T05:00:00.000Z', '2026-10-09T06:00:00.000Z', '2026-10-09T07:00:00.000Z'])
  assert.equal(hourLabel('2026-10-09T05:00:00Z'), '08')
})

const at = (h: number, m = 0) => `2026-10-09T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
const W = { visit_id: 'st1', author_id: 'rn' }
// a quantity with its keys in the order the server's jsonb returns them
const q = (value: number, unit: string, ucum = unit) => ({ ucum, unit, value: String(value) })
test('items: a crossed-out item and a hidden one are left out; in force and in the hour across three versions', () => {
  const a = E('vitals', { occurred_at: at(5) }); const x = E('vitals', { occurred_at: at(5) }); const gone = next(x, 'crossed_out', {}, { occurred_at: at(5) }, 'replaces')
  const h = E('vitals', { occurred_at: at(5), hidden: true })
  const v1 = E('intensive.vent', { occurred_at: at(4, 30) }); const v2 = next(v1, 'intensive.vent', {}, { occurred_at: at(6) }); const v3 = next(v2, 'intensive.vent', {}, { occurred_at: at(8) })
  const items = itemsOf([a, x, gone, h, v1, v2, v3, v2])
  assert.deepEqual(items.map((i) => i.item).sort(), [a.item, v1.item].sort())
  const vent = items.find((i) => i.item === v1.item)!
  assert.equal(vent.versions.length, 3)
  assert.equal(inForce(vent, at(6))?.id, v1.id); assert.equal(inForce(vent, at(7))?.id, v2.id); assert.equal(inForce(vent, at(9))?.id, v3.id)
  assert.equal(inHour(vent, at(6))?.id, v2.id); assert.equal(inHour(vent, at(7)), null)
})

// Nabil's morning: ventilated since before 08:00, the noradrenaline up at 08:00 and stopped at 10:00, two hours charted
const airway = E('procedure', { ...W, occurred_at: at(4, 30), data: { concept: { text: 'Invasive ventilation', codings: [{ system: 'local.procedure', code: 'invasive_ventilation' }] },
  status: 'in-progress', performed: { value: at(4, 30), precision: 'minute' } } })
const vent1 = E('intensive.vent', { ...W, occurred_at: at(4, 30), data: { mode: 'vc', fio2: q(80, '%'), peep: q(10, 'cmH₂O', 'cm[H2O]'), vt: q(420, 'mL'), rate: q(18, '/min') } })
const vent2 = next(vent1, 'intensive.vent', { ...vent1.data, fio2: q(60, '%') }, { ...W, occurred_at: at(6) })
const NOR = { drug: { text: 'Noradrenaline' }, key: 'noradrenaline', dose_unit: 'ug/kg/min', amount: q(4, 'mg'), volume: q(50, 'mL'), weight: q(78, 'kg') }
const nor1 = E('intensive.infusion', { ...W, occurred_at: at(4, 40), data: { ...NOR, status: 'running', rate: q(11.7, 'mL/h'), dose: q(0.2, 'µg/kg/min', 'ug/kg/min') } })
const nor2 = next(nor1, 'intensive.infusion', { ...NOR, status: 'running', rate: q(14.6, 'mL/h'), dose: q(0.25, 'µg/kg/min', 'ug/kg/min') }, { ...W, occurred_at: at(5) })
const nor3 = next(nor2, 'intensive.infusion', { ...NOR, status: 'stopped' }, { ...W, occurred_at: at(7) })
const vit = (h: number, hr: number, sys: number, dia: number) => E('vitals', { ...W, occurred_at: at(h), data: { hr: q(hr, 'bpm', '/min'), bp: { sys: q(sys, 'mmHg', 'mm[Hg]'), dia: q(dia, 'mmHg', 'mm[Hg]') } } })
const obs = (h: number, code: string, v: number) => E('observation', { ...W, occurred_at: at(h), data: { code: { text: code, codings: [{ system: 'loinc', code }] }, value: { quantity: q(v, 'mL') } } })
const MORNING = [airway, vent1, vent2, nor1, nor2, nor3, vit(5, 112, 96, 42), vit(6, 108, 98, 44), obs(6, '8478-0', 66), obs(5, '9103-3', 145), obs(5, '9188-4', 20), obs(6, '9103-3', 140), obs(6, '9188-4', 20)]
const NOW = '2026-10-09T09:20:00Z'
const rowOf = (m: ChartModel, g: string, r: string) => m.groups.find((x) => x.key === g)?.rows.find((x) => x.key === r)
test('chartOf: written then carried faint, off when stopped, the MAP from the BP, in and out, the balance, who signed, due', () => {
  const m = chartOf({ entries: MORNING, from: dayStart(NOW, 8), now: NOW, dayStarts: 8, kg: 78, users: [{ id: 'rn', name: 'Mariam Saad' }] })
  assert.deepEqual(m.hours.map(hourLabel), ['08', '09', '10', '11', '12']); assert.equal(m.now, at(9))
  assert.deepEqual(rowOf(m, 'vent', 'fio2peep')?.cells.slice(0, 3), [{ text: '80 · 10', carried: true }, { text: '60 · 10' }, { text: '60 · 10', carried: true }])
  assert.deepEqual(rowOf(m, 'vent', 'mode')?.cells[0], { text: 'VC', carried: true })
  const nor = m.groups.find((g) => g.key === 'infusions')!.rows[0]
  assert.equal(nor.label, 'Noradrenaline'); assert.equal(nor.unit, 'µg/kg/min')
  assert.deepEqual(nor.cells, [{ text: '0.25', title: '14.6 mL/h' }, { text: '0.25', carried: true, title: '14.6 mL/h' }, { text: 'off' }, null, null])
  assert.deepEqual(rowOf(m, 'vitals', 'map')?.cells.slice(0, 3), [{ text: '60', carried: true, title: 'worked out from the BP', flag: 'low' }, { text: '66' }, null])
  assert.deepEqual(rowOf(m, 'fluids', 'intake')?.cells.slice(0, 2), [{ text: '145' }, { text: '140' }])
  assert.deepEqual(rowOf(m, 'fluids', 'urine')?.cells[0], { text: '20', title: '0.3 mL/kg/h', flag: 'low' })
  assert.deepEqual(rowOf(m, 'fluids', 'balance')?.cells.map((c) => c?.text ?? null), ['+125', '+120', '+120', '+120', '+120'], 'the 08:00 column closes the day before')
  assert.equal(rowOf(m, 'fluids', 'balance')?.unit, 'since 08:00')
  assert.deepEqual(rowOf(m, 'signed', 'by')?.cells.map((c) => c?.text ?? null), ['MS', 'MS', 'MS', null, null]); assert.equal(m.due, true)
  assert.equal(rowOf(m, 'vitals', 'gcs'), undefined, 'GCS only when there is one')
  const off = next(airway, 'procedure', { ...airway.data, status: 'completed', outcome: 'extubated' }, { ...W, occurred_at: at(7) })
  const later = chartOf({ entries: [...MORNING, off], from: dayStart(NOW, 8), now: NOW, dayStarts: 8, kg: 78, users: [] })
  assert.deepEqual(rowOf(later, 'vent', 'mode')?.cells.slice(2), [{ text: 'off' }, null, null], 'off in the hour it ended, then blank')
  const none = chartOf({ entries: MORNING.filter((e) => e.type !== 'procedure'), from: dayStart(NOW, 8), now: NOW, dayStarts: 8, kg: 78, users: [] })
  assert.equal(none.groups.some((g) => g.key === 'vent'), false, 'no ventilator rows while not ventilated')
})

const unit = unitOf(org, 'icu')
const where = { patientId: 'pt', departmentId: 'icu', stay: 'st1' }
let ids = 0; const id = () => `n${++ids}`
const rx = (text: string, codings: { system: string; code: string }[] = []) => E('medication', { data: { basis: 'prescribed', drug: { text, codings }, status: 'active' } })
const lists = (...es: ServerEntry[]) => table<ListRowData>(es.map((e) => ({ item: e.item, patient_id: 'pt', list: 'medications', status: 'active', code: null, entry_id: e.id,
  first_at: e.recorded_at, changed_at: e.recorded_at, visit_id: null, source_entries: [e.id] })), es)
const draft = (over: Partial<HourDraft> = {}): HourDraft => ({ ...emptyDraft(at(9)), ...over })
test('entriesOf: one set at the hour, only what changed, the dose the rate\'s, the link only for the same drug', () => {
  const now = hourNow([airway, vent1, vent2, nor1, nor2], undefined, NOW, unit, 78)
  assert.deepEqual(entriesOf(draft(), now, unit, where, id).entries, [])
  const a = entriesOf(draft({ hr: '96', sys: '118', dia: '56', acvpu: 'a', o2: 'air', intake: '140', urine: '55' }), now, unit, where, id).entries
  assert.deepEqual(a.map((e) => e.type), ['vitals', 'observation', 'observation'])
  assert.deepEqual(a[0].data, { hr: q(96, 'bpm', '/min'), bp: { sys: q(118, 'mmHg', 'mm[Hg]'), dia: q(56, 'mmHg', 'mm[Hg]') }, consciousness: 'a', oxygen: { on: 'air' } })
  assert.equal(a[0].occurred_at, at(9)); assert.equal(a[0].visit_id, 'st1')
  assert.deepEqual(a[2].data, { code: { text: 'Urine output 1 hour', codings: [{ system: 'loinc', code: '9188-4', display: 'Urine output 1 hour' }] }, value: { quantity: q(55, 'mL/h') } })
  const v = entriesOf(draft({ vent: { fio2: '45', peep: '8' } }), now, unit, where, id)
  assert.equal(v.entries[0].refers_to, vent2.id); assert.equal(v.entries[0].relation, 'changes'); assert.deepEqual(v.seen, { [vent1.item]: 2 })
  assert.deepEqual((v.entries[0].data as { fio2: unknown }).fio2, q(45, '%'))
  assert.deepEqual(entriesOf(draft({ vent: { fio2: '60' } }), now, unit, where, id).entries, [], 'the same setting: nothing written')
  const off = entriesOf(draft({ ventOff: true }), now, unit, where, id)
  assert.deepEqual(off.entries.map((e) => [e.type, (e.data as { status: string; outcome?: string }).status, (e.data as { outcome?: string }).outcome, e.refers_to]), [['procedure', 'completed', 'extubated', airway.id]])
  const bare = hourNow([], undefined, NOW, unit, 78)
  const on = entriesOf(draft({ ventOn: 'invasive', vent: { mode: 'vc', fio2: '60' } }), bare, unit, where, id).entries
  assert.deepEqual(on.map((e) => e.type), ['procedure', 'intensive.vent']); assert.deepEqual((on[1].data as { mode: string }).mode, 'vc')
  const dose = entriesOf(draft({ doses: { [nor1.item]: { dose: '0.1' } } }), now, unit, where, id)
  const d = dose.entries[0].data as Record<string, unknown>
  assert.deepEqual([d.rate, d.dose, d.amount, d.weight, d.status], [q(5.9, 'mL/h'), q(0.1, 'µg/kg/min', 'ug/kg/min'), q(4, 'mg'), q(78, 'kg'), 'running'])
  assert.equal(dose.entries[0].refers_to, nor2.id); assert.deepEqual(dose.seen, { [nor1.item]: 2 })
  assert.deepEqual(entriesOf(draft({ doses: { [nor1.item]: { dose: '0.25' } } }), now, unit, where, id).entries, [], 'the same dose: nothing written')
  // a version charted back at an earlier hour: a later change still refers to the item's latest version
  const back = next(nor2, 'intensive.infusion', { ...nor2.data, rate: q(11.7, 'mL/h'), dose: q(0.2, 'µg/kg/min', 'ug/kg/min') }, { ...W, occurred_at: at(4, 50) })
  const after = entriesOf(draft({ doses: { [nor1.item]: { dose: '0.1' } } }), hourNow([airway, vent1, nor1, nor2, back], undefined, NOW, unit, 78), unit, where, id)
  assert.equal(after.entries[0].refers_to, back.id); assert.deepEqual(after.seen, { [nor1.item]: 3 })
  const other = hourNow([airway, next(vent1, 'intensive.vent', { mode: 'other', mode_text: 'APRV' }, { ...W, occurred_at: at(5) })], undefined, NOW, unit, 78)
  assert.equal((entriesOf(draft({ vent: { mode_text: 'BIPAP' } }), other, unit, where, id).entries[0].data as { mode_text: string }).mode_text, 'BIPAP')
  const stop = entriesOf(draft({ doses: { [nor1.item]: { stop: true } } }), now, unit, where, id).entries[0].data as Record<string, unknown>
  assert.equal(stop.status, 'stopped'); assert.equal(stop.rate, undefined); assert.equal(stop.dose, undefined)
  // the link: an equal ATC code puts the prescription's drug; the same whole name links and keeps the row's drug; a first word never links
  const atcUnit = { ...unit, infusions: unit.infusions.map((r) => r.key === 'insulin' ? { ...r, atc: 'A10AB01' } : r) }
  const human = rx('Soluble insulin (human)', [{ system: 'atc', code: 'A10AB01' }])
  const byAtc = entriesOf(draft({ starts: [{ key: 'insulin', dose: '4' }] }), hourNow([], lists(human), NOW, atcUnit, 72), atcUnit, where, id).entries[0].data as Record<string, unknown>
  assert.deepEqual([byAtc.drug, byAtc.medication, byAtc.rate, byAtc.dose], [human.data!.drug, human.item, q(4, 'mL/h'), { value: '4', unit: 'units/h' }])
  const byName = entriesOf(draft({ starts: [{ key: 'insulin', dose: '4' }] }), hourNow([], lists(human), NOW, unit, 72), unit, where, id).entries[0].data as Record<string, unknown>
  assert.deepEqual([byName.drug, byName.medication], [{ text: 'Soluble insulin' }, human.item])
  const oxide = rx('Magnesium oxide'); const nowMg = hourNow([], lists(oxide), NOW, unit, 72)
  const mg = entriesOf(draft({ starts: [{ key: 'magnesium', dose: '1' }] }), nowMg, unit, where, id).entries[0].data as Record<string, unknown>
  assert.equal(mg.medication, undefined); assert.deepEqual(mg.drug, { text: 'Magnesium sulfate' })
  assert.deepEqual(noticesOf(draft({ starts: [{ key: 'magnesium', dose: '1' }] }), nowMg, unit, []), [{ text: 'No prescription for Magnesium sulfate on the record', tone: 'warn' }])
  const tapped = entriesOf(draft({ starts: [{ key: 'magnesium', dose: '1', medication: oxide.item }] }), nowMg, unit, where, id).entries[0].data as Record<string, unknown>
  assert.deepEqual([tapped.medication, tapped.drug], [oxide.item, { text: 'Magnesium sulfate' }])
  const glargine = { ...unit, infusions: [{ key: 'ins', name: 'Insulin', dose_unit: 'units/h' as const, amount: 50, amount_unit: 'units' as const, volume: 50 }] }
  const g = entriesOf(draft({ starts: [{ key: 'ins', rate: '2' }] }), hourNow([], lists(rx('Insulin glargine')), NOW, glargine, 72), glargine, where, id).entries[0].data as Record<string, unknown>
  assert.equal(g.medication, undefined, '"Insulin" is not insulin glargine')
})

test('problems stop the sign; a value outside its range is only a notice', () => {
  const now = hourNow([airway, vent2, nor1, nor2], undefined, NOW, unit, null)
  const p = (over: Partial<HourDraft>) => problemsOf(draft(over), now, unit).map((x) => x.text)
  assert.deepEqual(p({ sys: '118' }), ['BP needs both: 118/56']); assert.deepEqual(p({ sys: '50', dia: '60' }), ['The systolic is below the diastolic'])
  assert.deepEqual(p({ vent: { fio2: '0.6' } }), ['FiO₂ is a percentage: 40']); assert.deepEqual(p({ spo2: '101' }), ['SpO₂ 101 is not possible'])
  assert.deepEqual(p({ hr: 'x' }), ['A number']); assert.deepEqual(p({ doses: { [nor1.item]: { dose: '0.1', rate: '5' } } }), ['Type the dose or the rate, not both'])
  assert.deepEqual(p({ starts: [{ key: 'adrenaline', dose: '0.1' }] }), ['A dose per kg needs the weight: type it'])
  assert.deepEqual(p({ hr: '15', spo2: '45' }), [], 'HR 15 in an arrest is charted')
  assert.deepEqual(p({ vent: { fio2: '15' } }), ['FiO₂ 15 is not possible: 21 to 100']); assert.deepEqual(rangeNotices(draft({ vent: { fio2: '15' } })), [])
  assert.deepEqual(p({ doses: { [nor1.item]: { rate: '0' } } }), ['Above 0: to stop it, use Stop'])
  // a stop at the 07:00 chip (Cairo) after the change at 08:00: refused before the writer would put it last
  const early = { ...emptyDraft(at(4)), doses: { [nor1.item]: { stop: true } } }
  assert.deepEqual(problemsOf(early, hourNow([airway, vent2, nor1, nor2], undefined, at(5), unit, 78), unit).map((x) => x.text), ['Changed at 08:00 since: chart the change at that hour or later'])
  assert.deepEqual(rangeNotices(draft({ hr: '15', spo2: '45' })).map((x) => x.text), ['HR 15 is outside 20–250: check it', 'SpO₂ 45 is outside 50–100: check it'])
  assert.deepEqual(noticesOf(draft(), now, unit, ['MS']), [{ text: '12:00 has entries by MS: this adds to them' }])
})

test('the tile: the airway, one infusion, the MAP and a low urine, from the board\'s read', () => {
  const NOW = Date.parse('2026-10-09T12:20:00Z'); const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString()
  const row = (item: string): PresenceRow => presence(item, { kind: 'stay', state: 'admitted', department_id: 'icu', checked_in_at: ago(55) })
  const tc = { org, dept: { id: 'icu', packs: ['intensive'] } }
  const board = (item: string, w: StayWords): IcuBoard => ({ patient_ids: ['pt'], stays: { [item]: w } })
  const nabil: StayWords = { airway: { code: 'invasive_ventilation', status: 'in-progress', since: ago(55), at: ago(55) },
    infusions: [{ key: 'fentanyl', drug: 'Fentanyl', dose: '75', unit: 'ug/h', rate: '1.5' }, { key: 'noradrenaline', drug: 'Noradrenaline', dose: '0.15', unit: 'ug/kg/min', rate: '8.8' },
      { key: 'propofol', drug: 'Propofol', dose: '100', unit: 'mg/h', rate: '10' }], map: { value: 67, at: ago(1), measured: true } }
  assert.deepEqual(tileWords(row('st1'), tc, board('st1', nabil), NOW)?.words, [{ text: 'Ventilated d3', tone: 'info' }, { text: 'noradrenaline 0.15', tone: 'warn' }, 'MAP 67'])
  const samy: StayWords = { oxygen: { on: 'air' }, infusions: [{ key: 'insulin', drug: 'Soluble insulin (human)', dose: '4', unit: 'units/h', rate: '4' }],
    map: { value: 88, at: ago(1), measured: false }, urine: { ml: 137, hours: 5, kg: 72 } }
  assert.deepEqual(tileWords(row('st3'), tc, board('st3', samy), NOW)?.words, ['On air', 'insulin 4 units/h', { text: 'urine 0.4 mL/kg/h', tone: 'warn' }])
  const off: StayWords = { airway: { code: 'invasive_ventilation', status: 'completed', since: ago(50), at: ago(3) }, oxygen: { on: 'oxygen', flow: '2' } }
  assert.deepEqual(tileWords(row('st2'), tc, board('st2', off), NOW)?.words, [`Extubated ${hm(ago(3))}`], 'extubated 3 h ago: the hour, not the oxygen')
  assert.deepEqual(tileWords(row('st2'), tc, board('st2', { ...off, airway: { ...off.airway!, at: ago(25) } }), NOW)?.words, ['O₂ 2 L/min'], 'a day later: the oxygen')
  assert.deepEqual(tileWords(row('st2'), tc, board('st2', { oxygen: { on: 'oxygen' } }), NOW)?.words, ['On O₂'])
  for (const status of ['preparation', 'on-hold', 'not-done']) {
    assert.deepEqual(tileWords(row('st2'), tc, board('st2', { airway: { code: 'invasive_ventilation', status, since: ago(1), at: ago(1) }, oxygen: { on: 'air' } }), NOW)?.words,
      ['On air'], `an airway ${status}: not extubated, the oxygen word`)
  }
  assert.deepEqual(tileWords(row('st2'), tc, board('st2', { airway: { code: 'non_invasive_ventilation', status: 'in-progress', since: ago(2), at: ago(2) } }), NOW)?.words,
    [{ text: 'NIV d1', tone: 'info' }])
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { map: { value: 62, at: ago(1), measured: false } }), NOW)?.words, [{ text: 'MAP 62', tone: 'warn' }], 'MAP 62 with no pressor')
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { map: { value: 80, at: ago(1), measured: true } }), NOW), null, 'MAP 80 with no pressor: nothing')
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { urine: { ml: 30, hours: 1, kg: 72 } }), NOW), null, 'one hour of urine is not enough')
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { urine: { ml: 300, hours: 5, kg: 72 } }), NOW), null, 'enough urine: nothing')
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { urine: { ml: 167, hours: 5, kg: 72 } }), NOW)?.words, [{ text: 'urine 0.46 mL/kg/h', tone: 'warn' }],
    'just under 0.5: two decimals')
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { infusions: [{ key: 'vasopressin', drug: 'Vasopressin', dose: '2', unit: 'units/h' }] }), NOW)?.words,
    ['Vasopressin 2 units/h'], 'a drug the unit\'s list lacks: not a pressor, its own words')
  for (const d of [undefined, null, 'x', { stays: null }, board('other', nabil)]) assert.equal(tileWords(row('st1'), tc, d, NOW), null)
  assert.equal(tileWords({ ...row('st1'), kind: 'visit' }, tc, board('st1', nabil), NOW), null, 'only a stay')
  // through the core's line
  registerTileLine('intensive', (r, c, d) => tileWords(r, c, d, NOW))
  const ctx: TileCtx = { dept: { id: 'icu', packs: ['intensive'] }, place: null, identity: null, day: 3, can: () => true, org }
  assert.deepEqual(tileLineOf(tileLineDefs(), row('st1'), ctx, { intensive: board('st1', nabil) }),
    [{ pack: 'intensive', words: [{ text: 'Ventilated d3', tone: 'info' }, { text: 'noradrenaline 0.15', tone: 'warn' }, { text: 'MAP 67' }] }])
  assert.deepEqual(tileLineOf(tileLineDefs(), row('st1'), ctx), [], 'before the board answers: nothing')
})
console.log(`intensive: ${n} groups passed`)
