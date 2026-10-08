// Haematology (spec/openCare.md §5.7), as pure decisions: the INR clinic — time in range by Rosendaal, the clinic's table's row and its
// suggested week in half tablets (shown, never applied), the week spread over its days, the medicines that change the INR, her table in
// Arabic; /inr, /inrplan, /programme; the Transfusions section's reads (the units given, the Hb before, mL/kg, the chelation at mg/kg).
//   npm run test:haematology
import assert from 'node:assert/strict'
import { changed, interactionsOf, rowFor, spread, suggest, tabletsAr, tabletsEn, timeInRange, total, type Row } from '../src/packs/haematology/inr'
import { parseInr, parsePlan, parseProgramme, registerCommands } from '../src/packs/haematology/commands'
import { chelationOf, sessionsOf, shortGroup, unitsOf } from '../src/packs/haematology/blood'
import { parse, type Ctx } from '../src/core/screens/visit/parse'
import type { Medication, ServerEntry, ValueRow } from '../src/core/db/types'
registerCommands()

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const TABLE: Row[] = [{ from: 0, to: 1.49, change: 15, next_days: 7, says: 'up 10–20 %' }, { from: 1.5, to: 1.99, change: 7.5, next_days: 7, says: 'the week up 5–10 %' },
  { from: 2, to: 3, change: 0, next_days: 28, says: 'no change' }, { from: 3.01, to: 3.99, change: -7.5, next_days: 7, says: 'down 5–10 %' }]

test('time in range (Rosendaal): each day between two INRs on the line between them', () => {
  const now = new Date('2026-10-08T10:00:00Z'); const d = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  assert.equal(timeInRange([{ at: d(20), value: 2.5 }, { at: d(10), value: 2.5 }], { low: 2, high: 3 }, now), 100)
  assert.equal(timeInRange([{ at: d(20), value: 1 }, { at: d(10), value: 3 }], { low: 2, high: 3 }, now), 50, 'half the line in the band')
  assert.equal(timeInRange([{ at: d(5), value: 2 }], { low: 2, high: 3 }, now), null)
  const ensaf = [[182, 2.3], [154, 1.9], [126, 2.4], [98, 2.6], [63, 2.2], [21, 3.6]].map(([a, v]) => ({ at: d(a), value: v }))
  const t = timeInRange(ensaf, { low: 2, high: 3 }, now)!; assert.ok(t > 60 && t < 90, `about three quarters: ${t}`)
})
test('the clinic\'s table: the row for an INR, the week it suggests in half tablets, spread a half tablet at a time', () => {
  assert.equal(rowFor(1.7, TABLE)?.says, 'the week up 5–10 %'); assert.equal(rowFor(2.5, TABLE)?.change, 0); assert.equal(rowFor(9, TABLE), null)
  assert.equal(suggest(30, rowFor(1.7, TABLE)), 32.5, '30 + 7.5 % = 32.25 → 32.5'); assert.equal(suggest(30, rowFor(2.4, TABLE)), 30)
  const now = [5, 5, 2.5, 5, 5, 2.5, 5]; const next = spread(now, 32.5)
  assert.deepEqual(next, [5, 5, 5, 5, 5, 2.5, 5], 'up on the first day with the least: Monday'); assert.equal(total(next), 32.5)
  assert.equal(changed(now, next), 'Mon up to 5'); assert.deepEqual(spread(next, 30), [5, 5, 5, 5, 5, 2.5, 2.5], 'down on the last day with the most')
  assert.equal(tabletsEn(next), '5 mg tablets: one a day, half on Thursday'); assert.equal(tabletsAr(2.5), 'نصف قرص'); assert.equal(tabletsAr(5), 'قرص')
  assert.equal(rowFor(2.2, TABLE, { low: 2.5, high: 3.5 })?.change, 7.5, 'a 2.5–3.5 target moves the bands by its distance'); assert.equal(rowFor(2.7, TABLE, { low: 2.5, high: 3.5 })?.change, 0)
})
const med = (atc: string, name: string, dose = 1, frequency = 'OD'): Medication => ({ id: atc, drug_code: `atc:${atc}`, drug_name: name, dose_number: dose, dose_unit: 'mg', route: 'oral', frequency, prn: false, problem_id: null, status: 'active', started_on: '' })
test('the medicines that change the INR, by ATC: shown, never a stop', () => {
  const x = interactionsOf([med('J01FA10', 'Azithromycin'), med('C01AA05', 'Digoxin'), med('J04AB02', 'Rifampicin')])
  assert.deepEqual(x.map((i) => [i.med.drug_name, i.effect]), [['Azithromycin', 'raises INR'], ['Rifampicin', 'lowers INR']])
})
test('/inr: today\'s INR as the base\'s result (no order, LOINC 6301-6) and the week; /inrplan; /programme', () => {
  const r = parseInr('1.7', [5, 5, 2.5, 5, 5, 2.5, 5], { low: 2, high: 3 }, new Date('2026-10-08')); assert.ok(r && 'ok' in r)
  const [res, week] = r.ok; assert.equal(res.function, 'result'); const a = (res.params.analytes as { code: { code: string }; interpretation: string }[])[0]
  assert.equal(a.code.code, '6301-6'); assert.equal(a.interpretation, 'L'); assert.equal(week.function, 'haematology.week'); assert.equal(week.params.was, 30); assert.equal(week.params.next_inr, '2026-10-15')
  assert.ok('error' in (parseInr('abc', null, null) as object))
  const p = parsePlan('AF with rheumatic mitral stenosis ; 2-3 warfarin 5'); assert.ok(p && 'ok' in p); assert.deepEqual(p.ok[0].params.target, { low: 2, high: 3 })
  const g = parseProgramme('every 3 weeks hb 9.5-10.5 leuco kell ; thalassaemia major'); assert.ok(g && 'ok' in g)
  assert.deepEqual(g.ok[0].params, { every_weeks: 3, hb: { low: 9.5, high: 10.5 }, needs: ['leucodepleted', 'Rh and Kell matched'], condition: 'thalassaemia major', status: 'active' })
  const ctx = (packs: string[]): Ctx => ({ services: [], departments: [{ id: 'hc', name: 'Haematology clinic', packs: ['haematology'] }], problems: [], departmentId: 'x', packs, templates: [], usedIn: () => ['Haematology clinic'] })
  const away = parse('/inr 1.7', ctx([])); assert.ok(away && 'error' in away && /Haematology clinic/.test(away.error))
})
const e = (type: string, data: Record<string, unknown>, at: string, id = `${type}${at}`): ServerEntry => ({ id, type, data, occurred_at: at } as unknown as ServerEntry)
const v = (key: string, code: string | null, value: number, at: string): ValueRow => ({ id: key + at, item: key, key, patient_id: 'p', code, name: key, value, ucum: null, unit: null, interpretation: null, at, entry_id: key + at, visit_id: null, source_entries: [] })
test('the Transfusions section: the units (the base\'s given of a blood product), by day with the Hb before and mL/kg, the chelation at mg/kg', () => {
  const units = unitsOf([e('given', { drug: { text: 'Red cells · O Rh+' }, lot: '26-1', dose: { value: '290' }, note: 'no reaction' }, '2026-09-17T09:00:00Z', 'a'),
    e('given', { drug: { text: 'Red cells · O Rh+' }, lot: '26-2', dose: { value: '290' } }, '2026-09-17T11:00:00Z', 'b'),
    e('given', { drug: { text: 'Influenza vaccine' } }, '2026-09-20T09:00:00Z', 'c'), e('given', { drug: { text: 'Red cells' }, lot: '26-3', dose: { value: '60' }, note: 'stopped: hives' }, '2026-10-08T11:00:00Z', 'd')])
  assert.deepEqual(units.map((u) => u.unit), ['26-3', '26-2', '26-1'], 'blood only, the newest first'); assert.equal(units[0].stopped, true); assert.equal(units[2].stopped, false, '"no reaction" is not a stop')
  const s = sessionsOf(units, [v('hb', 'loinc:718-7', 9.3, '2026-09-17T07:00:00Z'), v('weight', 'loinc:29463-7', 48, '2026-09-17T08:00:00Z')])
  assert.deepEqual(s.map((x) => [x.day, x.units.length, x.hb, x.ml, x.perKg]), [['2026-10-08', 1, 9.3, 60, 1], ['2026-09-17', 2, 9.3, 580, 12]])
  assert.equal(chelationOf([med('V03AC03', 'Deferasirox', 1260)], [v('weight', null, 48, '2026-10-08')])?.perKg, 26)
  assert.equal(shortGroup('O Rh positive'), 'O Rh+')
})
console.log(`✓ haematology: ${n} groups of checks`)
