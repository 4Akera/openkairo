// Paediatrics (spec/openCare.md §5.7), as pure decisions: the growth table's rows as the section reads them (latest values, the words
// of a z-score and a centile, the chip and the Summary line, centile lines crossed), the banner words (the age and weight, a z-score
// beyond ±2, the hearing to repeat; none for an adult), Holliday–Segar and the board's line (a weight older than 3 days in amber), the
// dose per kg against the clinic's list (a syrup by its strength, a day's or a dose's range, no weight in 30 days), the milestones list
// for an age and a check's words, the newborn checks from base entries; and /dev registered for the departments that use the pack.
//   npm run test:paediatrics
import assert from 'node:assert/strict'
import { ageText, centileText, crossed, crossedText, latestOf, lineOf, maintenance, rowsOf, weightAge, zText, type GrowthRow } from '../src/packs/paediatrics/growth'
import { childWords, growthSummary, growthWord } from '../src/packs/paediatrics/words'
import { doseLine, doseMg, mgPerMl, ruleFor, type DoseRule } from '../src/packs/paediatrics/dose'
import { ageMonths, devLine, lateOf, listFor, newCheck, newbornOf, summaryOf, withSummary, type Milestone } from '../src/packs/paediatrics/develop'
import { lmsAt, zOf, type Lms } from '../src/packs/paediatrics/lms'
import { rxLine, vLine } from '../src/packs/paediatrics/lines'
import { cardLinesOf, cardLineDefs, registerCardLine } from '../src/core/screens/visit/lines'
import type { ServerEntry } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const DAY = 86_400_000
const now = new Date('2026-10-08T10:30:00')
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString()
// Malek's measurements, as the server writes them (z-scores from the WHO 2006 tables, boys)
const row = (days: number, age: number, w: number, l: number, h: number, z: Record<string, [number, number]>): Record<string, unknown> =>
  ({ item: `v${age}`, patient_id: 'malek', at: ago(days), age_days: age, sex: 'male', weight: w, length: l, head: h, lying: true,
    z: Object.fromEntries(Object.entries(z).map(([k, [zz, c]]) => [k, { z: zz, c }])), outside: [], version: 'WHO 2006 · demo sample', source_entries: [`e${age}`] })
const MALEK = { 'paediatrics.growth': { rows: [
  row(335, 0, 3.3, 50.0, 34.5, { wfa: [-0.14, 44.4] }), row(213, 122, 6.5, 62.6, 41.4, { wfa: [-0.7, 24.2] }), row(152, 183, 7.0, 66.0, 43.0, { wfa: [-1.1, 13.6] }),
  row(61, 274, 7.3, 70.0, 44.6, { wfa: [-1.8, 3.6] }), row(0, 335, 7.5, 72.4, 45.4, { wfa: [-2.07, 1.9], lfa: [-0.92, 17.9], hcfa: [-0.28, 39], wfl: [-2.22, 1.3] })],
  entries: {}, patients: {}, withheld: 0 } }

test('growth rows: oldest first, the latest of each indicator, z-scores and centiles in words', () => {
  const rows = rowsOf(MALEK as never)
  assert.equal(rows.length, 5); assert.equal(rows[0].age_days, 0); assert.equal(rows[4].weight, 7.5)
  const l = latestOf(rows); assert.equal(l.wfa?.age_days, 335); assert.equal(l.wfl?.z.wfl?.z, -2.22)
  assert.equal(zText(-2.07), '−2.1'); assert.equal(zText(-2.07, 2), '−2.07'); assert.equal(zText(0.4), '0.4')
  assert.equal(centileText(1.9), '2nd'); assert.equal(centileText(17.9), '18th'); assert.equal(centileText(39), '39th'); assert.equal(centileText(1.3), '1st')
  assert.equal(centileText(0.2), 'below 1st'); assert.equal(centileText(99.8), 'above 99th'); assert.equal(centileText(11.2), '11th'); assert.equal(centileText(22), '22nd')
})
test('the chip, the Summary line, centile lines crossed', () => {
  const rows = rowsOf(MALEK as never)
  assert.deepEqual(growthWord(rows), { word: 'z −2.1', tone: 'warn' }, 'beyond −2: the z-score in amber')
  assert.equal(growthSummary(rows), '7.5 kg z −2.1 · 72.4 cm z −0.9 · head 45.4 cm z −0.3')
  const x = crossed(rows); assert.ok(x); assert.equal(x!.since.age_days, 122, 'the most recent measurement two lines above'); assert.equal(x!.lines, 2); assert.ok(x!.down)
  assert.equal(crossedText(x!), 'Crossed two centile lines down since 4 months (24th → 2nd).')
  const fine = rows.map((r): GrowthRow => ({ ...r, z: { wfa: { z: -0.2, c: 42 } } }))
  assert.equal(crossed(fine), null); assert.deepEqual(growthWord(fine), { word: '7.5 kg' })
})
test('ages in a word: days, months to two years, then years', () => {
  assert.equal(ageText(10), '10 d'); assert.equal(ageText(335), '11 mo'); assert.equal(ageText(730), '23 mo'); assert.equal(ageText(1157), '3 y')
})
test('banner words: the age and weight; a z-score beyond ±2; the hearing to repeat; nothing for an adult', () => {
  const rows = rowsOf(MALEK as never)
  const born = new Date(now.getTime() - 335 * DAY).toISOString().slice(0, 10)
  assert.deepEqual(childWords(rows, { birth_date: born }, [], now).map((w) => [w.word, w.rank, w.tone]), [['11 mo · 7.5 kg', 1, undefined], ['weight z −2.1', 2, 'warn']])
  const refer = [{ code: 'hearing', label: 'Hearing', entry: {} as ServerEntry, text: 'refer, both ears', refer: true }]
  assert.ok(childWords([], { birth_date: born }, refer, now).some((w) => w.word === 'hearing: refer, not repeated' && w.tone === 'warn'))
  assert.deepEqual(childWords([], { birth_date: '1980-01-01' }, refer, now), [], 'an adult: paediatrics says nothing')
  assert.deepEqual(childWords([], { birth_date: null }, [], now), [])
})
test('Holliday–Segar and the board\'s line: the picture\'s five children', () => {
  assert.deepEqual(maintenance(12.4), { day: 1120, hour: 47 }); assert.deepEqual(maintenance(20), { day: 1500, hour: 63 }); assert.deepEqual(maintenance(6.8), { day: 680, hour: 28 })
  assert.deepEqual(maintenance(24), { day: 1580, hour: 66 }); assert.deepEqual(maintenance(16), { day: 1300, hour: 54 })
  assert.deepEqual(weightAge(12.4, ago(1), now), { text: '12.4 kg (1 d)', old: false }); assert.deepEqual(weightAge(20, ago(0), now), { text: '20.0 kg today', old: false })
  assert.deepEqual(lineOf(16, ago(4), now), { words: [{ text: '16.0 kg, 4 d ago', tone: 'warn' }, 'maint. 54 mL/h'] }, 'older than 3 days: amber')
  assert.deepEqual(lineOf(6.8, ago(2), now), { words: ['6.8 kg (2 d)', 'maint. 28 mL/h'] })
})
const RULES: DoseRule[] = [{ drug: 'Amoxicillin', route: 'oral', per: 'day', from: 40, to: 90, times_from: 2, times_to: 3, most: 1000 },
  { drug: 'Amoxicillin + clavulanic acid', route: 'oral', per: 'day', from: 40, to: 90, times_from: 2, times_to: 3, most: 875 },
  { drug: 'Paracetamol', route: 'oral', per: 'dose', from: 10, to: 15, times_from: 4, times_to: 6, most: 1000 }]
test('the dose per kg: the picture\'s amoxicillin and paracetamol for 14.2 kg', () => {
  assert.equal(mgPerMl('Amoxicillin 250 mg/5 ml oral suspension'), 50); assert.equal(mgPerMl('250/5'), 50); assert.equal(mgPerMl('Paracetamol 120mg/5ml'), 24); assert.equal(mgPerMl('Amoxicillin'), null)
  assert.equal(ruleFor(RULES, 'Amoxicillin + clavulanic acid 457/5', 'oral')?.most, 875, 'the longest name first')
  assert.equal(ruleFor(RULES, 'Amoxicillin 250/5', null)?.drug, 'Amoxicillin'); assert.equal(ruleFor(RULES, 'Amoxicillin', 'iv'), null, 'another route')
  const w = { kg: 14.2, at: new Date(now.getTime() - 25 * 60_000).toISOString() }
  const amox = { action: 'start', drug: { name: 'Amoxicillin 250/5' }, dose_number: 7.5, dose_unit: 'ml', route: 'oral', frequency: 'TDS' }
  assert.deepEqual(doseMg(amox), { mg: 375, perMl: 50 })
  const a = doseLine(amox, w, RULES, now, 'female')!
  assert.match(a.lead, /^14\.2 kg today \d\d:\d\d · 375 mg × 3 = 1125 mg a day = 79 mg\/kg\/day$/)
  assert.deepEqual(a.tag, { word: 'in the clinic\'s range', tone: 'ok' }); assert.equal(a.short, '79 mg/kg/day')
  assert.equal(a.more, 'usual 40–90 mg/kg a day in 2–3 doses · most 1 g a dose · for 14.2 kg that is 3.8–8.5 ml three times a day')
  const para = { action: 'start', drug: { name: 'Paracetamol 120 mg/5 ml' }, dose_number: 5, dose_unit: 'ml', route: 'oral', frequency: 'q6h', prn: true }
  const p = doseLine(para, w, RULES, now, 'female')!
  assert.equal(p.tone, 'warn'); assert.equal(p.short, '8.5 mg/kg a dose · the clinic\'s usual 10–15 (5.9–8.9 ml)')
})
test('the dose per kg: no weight, an old weight, a drug not on the list; never a stop', () => {
  const amox = { action: 'start', drug: { name: 'Amoxicillin 250/5' }, dose_number: 7.5, dose_unit: 'ml', frequency: 'TDS' }
  assert.equal(doseLine(amox, null, RULES, now, 'female')!.lead, 'No weight on record: weigh her first')
  const old = doseLine(amox, { kg: 13.6, at: ago(90) }, RULES, now, 'male')!
  assert.match(old.lead, /^No weight in the last 30 days: the last 13\.6 kg on \d+ \w+ — weigh him$/); assert.equal(old.tone, 'warn')
  const other = doseLine({ action: 'start', drug: { name: 'Cetirizine' }, dose_number: 2.5, dose_unit: 'mg', frequency: 'OD' }, { kg: 14.2, at: ago(0) }, RULES, now)!
  assert.equal(other.more, 'not on the clinic\'s dose list'); assert.equal(other.tag, null)
  assert.equal(doseLine({ action: 'stop', drug: { name: 'Amoxicillin' } }, { kg: 14, at: ago(0) }, RULES, now), null, 'a stop: nothing to say')
})
const LIST: Milestone[] = [{ months: 6, area: 'movement', text: 'Rolls from tummy to back', short: 'rolls' },
  { months: 9, area: 'movement', text: 'Sits without support', short: 'sits' }, { months: 9, area: 'talking', text: 'Babbles “mamama”, “bababa”', short: 'babbles' },
  { months: 9, area: 'social', text: 'Looks when the name is called', short: 'looks to the name' }, { months: 12, area: 'movement', text: 'Pulls up to stand', short: 'cruises' }]
test('/dev: the list for the age, each milestone yes until not yet, the notice past the list\'s age', () => {
  assert.equal(listFor(LIST, 10)?.months, 9); assert.equal(listFor(LIST, 3)?.months, 6, 'under the first list: the first'); assert.equal(listFor([], 10), null)
  const c = newCheck(LIST, 10, 'CDC 2022')!
  assert.equal(c.paediatrics.list, '9-month'); assert.equal(c.paediatrics.items.length, 3); assert.ok(c.paediatrics.items.every((i) => i.yes))
  const no = withSummary({ ...c, paediatrics: { ...c.paediatrics, items: c.paediatrics.items.map((i) => i.area === 'movement' ? i : { ...i, yes: false }), plan: ['hearing test (ABR)'] } })
  assert.equal(no.value.text, '1 yes · not yet: babbles, looks to the name · plan: hearing test (ABR)')
  assert.equal(devLine(no), 'Development · the 9-month list at 10 mo · 1 yes · not yet: babbles, looks to the name · plan: hearing test (ABR)')
  assert.equal(lateOf(no).length, 2, 'at 10 months, past the 9-month list'); assert.equal(lateOf({ ...no, paediatrics: { ...no.paediatrics, age_months: 9 } }).length, 0, 'at the list\'s own age: no notice')
  assert.equal(summaryOf(c.paediatrics.items), '3 yes · all yes')
  assert.equal(ageMonths('2025-12-02', now), 10); assert.equal(ageMonths('2025-12-09', now), 9, 'the 9th not yet reached'); assert.equal(ageMonths(null, now), null)
})
const entry = (type: string, data: Record<string, unknown>, at: string, id = Math.random().toString(36)): ServerEntry =>
  ({ id, type, type_version: 1, item: id, item_version: 1, patient_id: 'k', department_id: 'pc', visit_id: null, occurred_at: at, precision: 'minute', recorded_at: at, set_id: 's',
     replaces: null, refers_to: null, relation: null, source: 'app', hidden: false, line: '', data })
const nb = (code: string) => ({ codings: [{ system: 'paediatrics.newborn', code }] })
test('the newborn checks: base entries by the pack\'s codes, the latest of each, the hearing to repeat', () => {
  const facts = [entry('observation', { code: nb('hips'), value: { text: 'Ortolani and Barlow negative' }, note: 'day 1 and 6 wk' }, ago(300)),
    entry('procedure', { concept: nb('hearing'), status: 'completed', outcome: 'refer, both ears', note: 'OAE on day 2 · repeat not done' }, ago(308)),
    entry('observation', { code: nb('jaundice'), value: { quantity: { value: '11.6', unit: 'mg/dL' } }, note: 'day 3 bilirubin · no phototherapy' }, ago(307)),
    entry('observation', { code: { text: 'Peak flow', codings: [{ system: 'loinc', code: '19935-6' }] }, value: { text: '300' } }, ago(2)),
    entry('observation', { code: nb('birth'), value: { text: '39 wk · 3.1 kg' } }, ago(310), 'b1')]
  const rows = newbornOf(facts)
  assert.deepEqual(rows.map((r) => r.code), ['birth', 'hearing', 'hips', 'jaundice'], 'in the checks\' order; the peak flow is not one')
  assert.equal(rows.find((r) => r.code === 'hearing')!.refer, true); assert.equal(rows.find((r) => r.code === 'jaundice')!.text, '11.6 mg/dL · day 3 bilirubin · no phototherapy')
  const crossedOut = [...facts, entry('crossed_out', { reason: 'typo' }, ago(1))]; crossedOut[crossedOut.length - 1].refers_to = 'b1'
  assert.ok(!newbornOf(crossedOut).some((r) => r.code === 'birth'), 'crossed out: gone')
  const passed = [...facts, entry('procedure', { concept: nb('hearing'), status: 'completed', outcome: 'pass, both ears' }, ago(200))]
  assert.equal(newbornOf(passed).find((r) => r.code === 'hearing')!.refer, false, 'repeated and passed: the latest')
})
test('the LMS sums the /v line shows are the server\'s: Malek at 11 months, weight 7.5, length 72.4', () => {
  const t = new Map<string, Lms>([['wfa.m.11', [0.073, 9.4122, 0.10906]], ['wfa.m.12', [0.0644, 9.6479, 0.10925]], ['lfa.m.11', [1, 74.5388, 0.03125]], ['lfa.m.12', [1, 75.7488, 0.03137]],
    ['wfl.m.72.0', [-0.3521, 8.8697, 0.08254]], ['wfl.m.72.5', [-0.3521, 8.9788, 0.08262]]])
  const mo = 335 / 30.4375   // 335 days, as the server reads the age
  assert.equal(zOf(7.5, lmsAt(t, 'wfa', 'm', mo)!), -2.07); assert.equal(zOf(72.4, lmsAt(t, 'lfa', 'm', mo)!), -0.92); assert.equal(zOf(7.5, lmsAt(t, 'wfl', 'm', 72.4)!), -2.22)
  assert.ok(Math.abs(lmsAt(t, 'wfa', 'm', 11.5)![1] - (9.4122 + 9.6479) / 2) < 1e-9, 'between two rows, in proportion')
  assert.equal(lmsAt(t, 'wfa', 'm', 30), null, 'beyond the loaded table: nothing guessed')
  assert.ok(zOf(30, [0.073, 9.4122, 0.10906]) > 3 && zOf(30, [0.073, 9.4122, 0.10906]) < 20, 'past +3: the restricted way')
})
test('the lines under /rx and /v (C1): the picture\'s amoxicillin for Jana, the z-scores for Malek; nothing for an adult', () => {
  const born = (days: number) => new Date(now.getTime() - days * DAY).toISOString().slice(0, 10)
  const org = { settings: [{ key: 'paediatrics.doses', thing_id: 'o', owner_id: null, recorded_at: '2026-10-01', data: { doses: RULES } }], settingKeys: [], datatypes: {} }
  const jana = { patient: { born_on: born(1157), sex: 'female' }, values: [{ key: 'weight', value: 14.2, at: new Date(now.getTime() - 25 * 60_000).toISOString() }] }
  const ctx = (record: unknown) => ({ record, departmentId: 'pc', packs: ['paediatrics'], org, now }) as never
  const rx = rxLine({ action: 'start', drug: { name: 'Amoxicillin 250/5' }, dose_number: 7.5, dose_unit: 'ml', route: 'oral', frequency: 'TDS' }, ctx(jana))!
  assert.match(String((rx.rows[0] as string[])[0]), /= 79 mg\/kg\/day$/); assert.deepEqual(rx.short, [{ text: '79 mg/kg/day', tone: 'ok' }])
  assert.deepEqual((rx.rows[1] as unknown[])[0], { text: 'in the clinic\'s range', tone: 'ok' })
  assert.equal(rxLine({ action: 'start', drug: { name: 'Amoxicillin' }, dose_number: 500, dose_unit: 'mg', frequency: 'TDS' }, ctx({ patient: { born_on: '1970-01-01', sex: 'male' }, values: [] })), null, 'an adult: no line')
  const t = new Map<string, Lms>([['wfa.m.11', [0.073, 9.4122, 0.10906]], ['wfa.m.12', [0.0644, 9.6479, 0.10925]], ['lfa.m.11', [1, 74.5388, 0.03125]], ['lfa.m.12', [1, 75.7488, 0.03137]],
    ['wfl.m.72.0', [-0.3521, 8.8697, 0.08254]], ['wfl.m.72.5', [-0.3521, 8.9788, 0.08262]]])
  const malek = { patient: { born_on: born(335), sex: 'male' }, values: [] }
  const v = vLine({ weight: 7.5, length: 72.4, head: 45.4 }, ctx(malek), t)!
  assert.deepEqual(v.rows[0], [{ text: 'weight z −2.07 (1.9)', tone: 'warn' }, 'length z −0.92 (17.9)', { text: 'for length z −2.22 (1.3)', tone: 'warn' }].map((w) => typeof w === 'string' ? w.replace(/\((\d+\.\d)\)/, (_, c) => `(${centileText(Number(c))})`) : { ...w, text: w.text.replace(/\((\d+\.\d)\)/, (_, c) => `(${centileText(Number(c))})`) }))
  assert.match(String(v.rows[1]), /^WHO 2006, boys, 11 months · from the loaded tables, as the record keeps them · beyond the loaded tables: head$/)
  assert.equal(v.short, 'weight z −2.07'); assert.equal(vLine({ weight: 7.5 }, ctx(malek), null), null, 'the tables not read yet: nothing yet')
  // through the core's registry, in a department that uses the pack, and nowhere else
  registerCardLine('paediatrics', 'medication', 'Paediatrics', rxLine)
  const params = { action: 'start', drug: { name: 'Amoxicillin 250/5' }, dose_number: 7.5, dose_unit: 'ml', route: 'oral', frequency: 'TDS' }
  assert.equal(cardLinesOf(cardLineDefs(), 'medication', params, ctx(jana)).length, 1)
  assert.equal(cardLinesOf(cardLineDefs(), 'medication', params, { ...(ctx(jana) as object), packs: [] } as never).length, 0)
})
console.log(`paediatrics: ${n} groups passed`)
