// Ward nursing's fluid balance, part one (spec/openCare.md §5.6, W2): /in, /out and /fluids as typed (the base's observation with
// LOINC and mL; the fluid chart with its aim always signed), the ward's shifts and the fluid day (a measure counts in the shift it
// closes), urine's previous measure and the weight, and the day's table as #ward-fluids draws it (1250 ÷ 6 h ÷ 82 kg = 2.5). Pure: no
// browser, no database.   npm run test:fluids (then test-balance.ts)
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { parseChart, parseIn, parseOut } from '../src/packs/bedside/fluids'
import { dayStart, dayTable, hoursBetween, latestWeight, measureOf, placeOf, shiftLabels, shiftsOf, urineBefore, urineTimes, type Measure } from '../src/packs/bedside/balance'
import type { Parsed, Result } from '../src/core/screens/visit/parse'
import type { ValueRow } from '../src/core/db/types'
import { E, val } from './chart-fixtures'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
/** a Cairo time on 2026-10-09 (UTC+3), or on another day: C('14:00') = '2026-10-09T11:00:00Z' */
const C = (t: string, day = '2026-10-09') => new Date(`${day}T${t}:00+03:00`).toISOString()
const ok = (r: Result): Parsed => { assert.ok(r && 'ok' in r, JSON.stringify(r)); assert.equal(r.ok.length, 1); return r.ok[0] }
const err = (r: Result) => { assert.ok(r && 'error' in r, JSON.stringify(r)); return r.error }
const q = (p: Parsed) => (p.params as { value: { quantity: { value: string } } }).value.quantity.value
const code = (p: Parsed) => (p.params as { code: { codings: { code: string }[] } }).code.codings[0].code
const m = (at: string, dir: 'in' | 'out', how: string, ml: number): Measure => ({ at, dir, how, ml, urine: how === 'urine' })
const v = (code: string, value: number, at: string, visit = 'st1', ucum: string | null = 'mL', key = 'value'): ValueRow =>
  ({ ...val(key, code, value, at, E('observation', { visit_id: visit, occurred_at: at })), ucum })

test('/in: the amount and the route, in either order; the words left in the note; any amount from 0 up', () => {
  const p = ok(parseIn('250 iv'))
  assert.deepEqual(p.params, { code: { text: 'Fluid in · IV', codings: [{ system: 'loinc', code: '9103-3', display: 'Fluid intake total Measured' }] },
    value: { quantity: { value: '250', unit: 'mL', ucum: 'mL' } }, method: 'iv' })
  assert.equal(p.kind, 'in'); assert.equal(p.function, 'observation'); assert.equal(p.line, 'Fluid in · IV 250 mL')
  const ns = ok(parseIn('250ml iv ns')); assert.equal((ns.params as { note?: string }).note, 'ns'); assert.equal(ns.line, 'Fluid in · IV 250 mL · ns')
  assert.deepEqual(ok(parseIn('iv 250')).params, p.params)
  assert.equal((ok(parseIn('150 po')).params as { method: string }).method, 'oral'); assert.equal((ok(parseIn('200 ng')).params as { method: string }).method, 'tube')
  assert.equal(parseIn(''), null)
  assert.equal(err(parseIn('iv')), 'How much? Type the mL: /in 250 iv')
  assert.equal(err(parseIn('250')), 'How was it taken? iv, oral or tube: /in 250 iv')
  assert.equal(q(ok(parseIn('0 iv'))), '0'); assert.equal(q(ok(parseIn('2.5 iv'))), '2.5'); assert.equal(q(ok(parseIn('6000 iv'))), '6000')
  assert.equal(err(parseIn('2.55 iv')), 'Type the mL with at most one decimal: /in 2.5 iv')
  // a second number is never a silent note, and litres are never read as mL ("ns 0.9 500" is not 0.9 mL)
  assert.equal(err(parseIn('ns 0.9 500 iv')), 'Two numbers: type the mL once, the rest as words: /in 500 iv NS 0.9%')
  for (const s of ['1 L iv', '1.5l ns iv', '1 litre iv']) assert.equal(err(parseIn(s)), 'Type the amount in mL: /in 1000 iv', s)
  assert.equal((ok(parseIn('500 iv NS 0.9%')).params as { note: string }).note, 'NS 0.9%')
})
test('/out: urine (no method), a drain, a tube, vomit, stool; 0 and a count land as typed', () => {
  for (const s of ['urine 300', '300 urine']) {
    const p = ok(parseOut(s)); assert.equal(code(p), '9187-6'); assert.equal((p.params as { code: { text: string } }).code.text, 'Urine')
    assert.ok(!('method' in p.params)); assert.equal(p.line, 'Urine 300 mL')
  }
  const d = ok(parseOut('drain 50')); assert.equal(code(d), '9257-7'); assert.equal((d.params as { code: { text: string } }).code.text, 'Fluid out · drain')
  assert.equal((d.params as { method: string }).method, 'drain')
  assert.deepEqual(['ng 200', 'vomit 100', 'stool 200'].map((s) => (ok(parseOut(s)).params as { method: string }).method), ['tube', 'vomit', 'stool'])
  assert.equal(q(ok(parseOut('urine 0'))), '0')
  const st = ok(parseOut('2 stools')); assert.equal(q(st), '2'); assert.equal((st.params as { method: string }).method, 'stool')
  assert.equal(err(parseOut('vomit')), 'How much? Type the mL: /out urine 300')
  assert.match(err(parseOut('300')), /^What came out\? /)
  assert.equal(err(parseOut('drain 2 150')), 'Two numbers: type the mL once, the rest as words: /out drain 150 left drain', 'the second drain, 150 mL')
  assert.equal(err(parseOut('urine 1 L')), 'Type the amount in mL: /out urine 1000')
})
test('/fluids: start (the aim kept), an aim always signed, none, stop', () => {
  for (const s of ['', 'start']) {
    const p = ok(parseChart(s)); assert.deepEqual(p.params, { status: 'active' }); assert.equal(p.kind, 'fluids'); assert.equal(p.function, 'bedside.fluid_chart')
    assert.equal(p.line, 'Start a fluid chart (the aim already set is kept)')
  }
  for (const s of ['target -1000', '-1000', 'target −1000', 'target - 1000']) {
    const p = ok(parseChart(s)); assert.deepEqual(p.params, { status: 'active', target: { value: '-1000', unit: 'mL', ucum: 'mL' } }, s)
    assert.equal(p.line, 'Fluid chart · balance aim −1 000 mL a day')
  }
  const plus = ok(parseChart('+500')); assert.equal((plus.params as { target: { value: string } }).target.value, '500'); assert.equal(plus.line, 'Fluid chart · balance aim +500 mL a day')
  const none = ok(parseChart('target none')); assert.deepEqual(none.params, { status: 'active', no_target: true }); assert.equal(none.line, 'Fluid chart · no balance aim')
  const stop = ok(parseChart('stop')); assert.deepEqual(stop.params, { status: 'stopped' }); assert.equal(stop.line, 'Stop the fluid chart')
  // a bare "off" stops the chart, never clears the doctor's aim; only "target off" or "target none" clears it
  for (const s of ['off', 'end']) assert.deepEqual(ok(parseChart(s)).params, { status: 'stopped' }, s)
  assert.deepEqual(ok(parseChart('target off')).params, { status: 'active', no_target: true })
  assert.match(err(parseChart('none')), /^Type the day’s balance aim/)
  for (const s of ['target x', '20000']) assert.match(err(parseChart(s)), /^Type the day’s balance aim in mL, signed/)
})
test('the shifts: sorted, no repeats, a bad value the default; their labels and the day\'s start', () => {
  for (const s of [undefined, '8:00', '']) { assert.deepEqual(shiftsOf(s), [480, 840, 1200]); assert.deepEqual(shiftLabels(shiftsOf(s)), ['08–14', '14–20', '20–08']) }
  assert.deepEqual(shiftsOf('20:00 08:00 08:00'), [480, 1200])
  assert.deepEqual(shiftLabels(shiftsOf('07:30 19:30')), ['07:30–19:30', '19:30–07:30'])
  assert.equal(dayStart(shiftsOf(undefined)), '08:00'); assert.equal(dayStart(shiftsOf('07:30 19:30')), '07:30')
})
test('a measure counts in the shift it closes; 08:00 closes the night before', () => {
  const s = shiftsOf(undefined)
  assert.deepEqual(placeOf(C('08:01'), s), { day: '2026-10-09', shift: 0 })
  assert.deepEqual(placeOf(C('14:00'), s), { day: '2026-10-09', shift: 0 })
  assert.deepEqual([C('14:01'), C('20:00'), C('20:01')].map((x) => placeOf(x, s).shift), [1, 1, 2])
  assert.deepEqual(placeOf(C('08:00'), s), { day: '2026-10-08', shift: 2 })
  assert.deepEqual(placeOf('2026-10-09T21:30:00Z', s), { day: '2026-10-09', shift: 2 }, '00:30 on the 10th')
})
test('the previous measured urine (any stay, the ICU\'s hourly too), the hours since, and the weight', () => {
  assert.deepEqual(urineTimes([v('loinc:9187-6', 300, C('08:00'), 'er'), v('loinc:9188-4', 40, C('09:00'), 'icu', 'mL/h'), v('loinc:9103-3', 500, C('10:00'))]), [C('08:00'), C('09:00')])
  const w = (value: number, ucum: string, at: string) => v('loinc:29463-7', value, at, 'st1', ucum, 'weight')
  assert.deepEqual(latestWeight([w(70, 'kg', C('08:00')), w(3200, 'g', C('09:00'))]), { kg: 3.2, at: C('09:00') })
  assert.deepEqual(latestWeight([w(70, 'kg', C('08:00')), w(150, 'lb', C('09:00'))]), { kg: 70, at: C('08:00') }, 'a weight in lb is skipped')
  assert.equal(urineBefore([C('08:00')], C('14:00')), C('08:00')); assert.equal(hoursBetween(C('08:00'), C('14:00')), 6)
  assert.equal(urineBefore([C('08:00'), C('14:00')], C('19:40')), C('14:00')); assert.ok(Math.abs(hoursBetween(C('14:00'), C('19:40')) - 17 / 3) < 1e-9)
  assert.equal(urineBefore([C('18:00', '2026-10-08')], C('19:40')), null, '25 h before')
  assert.equal(urineBefore([C('19:40')], C('19:40')), null, 'the same instant')
})
test('the picture (#ward-fluids): today by shift, in − out, urine mL/kg/h by the measure\'s own span, yesterday', () => {
  const s = shiftsOf(undefined); const now = Date.parse(C('19:40'))
  const ms = [m(C('08:00'), 'out', 'urine', 150), m(C('11:00'), 'in', 'iv', 500), m(C('12:00'), 'in', 'oral', 400), m(C('14:00'), 'out', 'urine', 1250),
    m(C('16:00'), 'in', 'iv', 250), m(C('17:00'), 'in', 'oral', 150), m(C('19:40'), 'out', 'urine', 900)]
  const urines = ms.filter((x) => x.urine).map((x) => x.at)
  const t = dayTable(ms, urines, s, 82, now)
  assert.deepEqual(t.labels, ['08–14', '14–20', '20–08']); assert.equal(t.current, 1); assert.equal(t.day, '2026-10-09')
  assert.deepEqual(t.rows.map((r) => [r.how, r.cells, r.total]), [['iv', [500, 250, null], 750], ['oral', [400, 150, null], 550], ['urine', [1250, 900, null], 2150]])
  assert.deepEqual(t.ins, [900, 400, 0]); assert.deepEqual(t.outs, [1250, 900, 0]); assert.deepEqual(t.balance, [-350, -500, null])
  assert.deepEqual(t.total, { in: 1300, out: 2150, balance: -850 })
  assert.equal(t.rate[0]!.toFixed(1), '2.5'); assert.equal(t.rate[1]!.toFixed(1), '1.9'); assert.equal(t.rate[2], null)
  assert.deepEqual(t.yesterday, { in: 0, out: 150, balance: -150 })
  assert.ok(dayTable(ms, urines, s, null, now).rate.every((r) => r === null), 'no weight: no rate')
  const drain = dayTable([...ms, m(C('10:00', '2026-10-08'), 'out', 'drain', 50)], urines, s, 82, now).rows.find((r) => r.how === 'drain')
  assert.deepEqual(drain && drain.cells, [null, null, null], 'a drain yesterday: its row shows, empty today')
  const today = ms.slice(1)
  assert.equal(dayTable(today, urines, s, 82, now).rate[0]!.toFixed(1), '2.5', 'the previous urine in an earlier stay (only in urines)')
  assert.equal(dayTable(today, [C('08:00'), C('14:00'), C('19:40')], s, 82, now).rate[0]!.toFixed(1), '2.5', 'or the ICU\'s hourly urine at 08:00')
  assert.equal(dayTable(today, [], s, 82, now).rate[0], null, 'no urine times: no rate')
  // a method the chart has no row for (another pack's, the API's) reads as Other: the rows add up to the day's in and out
  const enteral = measureOf('loinc:9103-3', 300, C('15:00'), 'enteral')!; assert.equal(enteral.how, 'other')
  const t2 = dayTable([...ms, enteral], urines, s, 82, now)
  assert.deepEqual(t2.rows.find((r) => r.dir === 'in' && r.how === 'other')?.cells, [null, 300, null])
  assert.equal(t2.rows.filter((r) => r.dir === 'in').reduce((a, r) => a + r.total, 0), t2.total.in)
  assert.equal(measureOf('9257-7', 50, C('15:00'), 'catheter')!.how, 'other')
})
console.log(`fluids: ${n} groups passed`)
