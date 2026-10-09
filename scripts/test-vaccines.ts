// The vaccines pack's pure half (spec/openCare.md §5.8, Q25, Q26; pictures #vax-chart, #vax-room): /vax read into doses, the dose's
// line, the schedule from the national and optional settings, due and overdue worked out (a later dose from the last one given, four
// weeks' grace, too late past its latest age), the chip, Summary, banner and row words, and the walk-in's chips. No browser, no database.
// npm run test:vaccines
import assert from 'node:assert/strict'
import { parseVax, doseLine, seriesOf, type DoseData } from '../src/packs/vaccines/line'
import { addDays, ageWords, byAge, dosesOf, scheduleOf, statusOf, summaryOf, whatFor, type Dose, type Row } from '../src/packs/vaccines/schedule'
import { bannerWords, chipWord, markWord, pregnantOf, saidOf, summaryLine } from '../src/packs/vaccines/words'
import type { Organization, ServerEntry } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

const NATIONAL: Omit<Row, 'national'>[] = [
  { key: 'hepb0', vaccine: 'hepb', name: 'Hepatitis B 0', dose: 0, age: 'Birth', earliest_days: 0 }, { key: 'opv0', vaccine: 'opv', name: 'OPV 0', dose: 0, age: 'Birth', earliest_days: 0 },
  { key: 'bcg', vaccine: 'bcg', name: 'BCG', dose: 1, age: 'Birth', earliest_days: 0 },
  { key: 'opv1', vaccine: 'opv', name: 'OPV 1', dose: 1, age: '2 mo', earliest_days: 42 }, { key: 'penta1', vaccine: 'penta', name: 'Penta 1', dose: 1, age: '2 mo', earliest_days: 42 },
  { key: 'opv4', vaccine: 'opv', name: 'OPV 4', dose: 4, age: '9 mo', earliest_days: 270, interval_days: 28 },
  { key: 'opv5', vaccine: 'opv', name: 'OPV 5', dose: 5, age: '12 mo', earliest_days: 365, interval_days: 28 }, { key: 'mmr1', vaccine: 'mmr', name: 'MMR 1', dose: 1, age: '12 mo', earliest_days: 365 },
  { key: 'mmr2', vaccine: 'mmr', name: 'MMR 2', dose: 2, age: '18 mo', earliest_days: 545, interval_days: 28 }]
const OPTIONAL = [{ vaccine: 'pcv', name: 'Pneumococcal', dose: 4, age: '12–15 mo', earliest_days: 365, interval_days: 56 },
  { vaccine: 'rota', name: 'Rotavirus', dose: 1, age: '2 mo', earliest_days: 42, latest_days: 105 },
  { vaccine: 'tt', name: 'Tetanus (pregnancy)', dose: 1, age: 'in pregnancy', pregnancy: true }]
const org = { settings: [{ key: 'vaccines.national', thing_id: null, data: { version: 'Dec 2024', source: 'MOHP', sample: true, rows: NATIONAL } },
  { key: 'vaccines.optional', thing_id: null, data: { rows: OPTIONAL } }], settingKeys: [], datatypes: {} } as unknown as Organization
const sched = scheduleOf(org)
const today = '2026-10-08'
const birth = addDays(today, -397)   // Farida, 13 months
const dose = (vaccine: string, d: number, daysAgo: number, more: Partial<Dose> = {}): Dose => ({ item: `${vaccine}${d}${daysAgo}`, vaccine, dose: d, status: 'completed', given_at: addDays(today, -daysAgo), source: 'here', ...more })
const farida: Dose[] = [dose('hepb', 0, 397, { source: 'card' }), dose('opv', 0, 397, { source: 'card' }), dose('bcg', 1, 397, { source: 'card' }), dose('opv', 1, 335, { source: 'card' }),
  dose('penta', 1, 335, { source: 'card' }), dose('opv', 4, 122), dose('opv', 5, 28, { status: 'not-done', reason: 'fever 39.2 °C' }), dose('mmr', 1, 28, { status: 'not-done', reason: 'fever 39.2 °C' })]

test('/vax reads each dose: its series and number, lot, expiry, site, a card copy with its date, not given and why', () => {
  const r = parseVax('mmr 1, opv 5'); assert.ok(r && 'ok' in r)
  const [m, o] = r.ok.map((p) => p.params as unknown as DoseData)
  assert.deepEqual(m.vaccines, { vaccine: 'mmr', dose: 1, source: 'here' }); assert.equal(m.drug.text, 'MMR'); assert.deepEqual(m.drug.codings, [{ system: 'vaccines.cvx', code: '03', display: 'MMR' }])
  assert.equal(m.route, 'sc'); assert.equal(m.site, 'right arm'); assert.equal(o.route, 'oral'); assert.equal(o.site, undefined)
  assert.equal(r.ok[0].function, 'vaccines.dose')
  const x = parseVax('mmr 1 lot 4K21M07 exp 03/27 l arm'); assert.ok(x && 'ok' in x)
  const d = x.ok[0].params as unknown as DoseData
  assert.equal(d.lot, '4K21M07'); assert.equal(d.expiry, '03/2027'); assert.equal(d.site, 'left arm')
  assert.equal(x.ok[0].line, 'Vaccine · MMR dose 1 · lot 4K21M07 · exp 03/27 · left arm, under the skin')
  const c = parseVax('opv 1 card 2025-11-09'); assert.ok(c && 'ok' in c)
  assert.deepEqual((c.ok[0].params as unknown as DoseData).vaccines, { vaccine: 'opv', dose: 1, source: 'card', given_on: '2025-11-09' })
  const ng = parseVax('mmr 1 not fever 39.2'); assert.ok(ng && 'ok' in ng)
  const g = ng.ok[0].params as unknown as DoseData
  assert.equal(g.status, 'not-done'); assert.equal(g.reason, 'fever 39.2'); assert.equal(g.site, undefined); assert.equal(ng.ok[0].line, 'Not given · MMR dose 1 · fever 39.2')
  const bad = parseVax('zzz 1'); assert.ok(bad && 'error' in bad && /Not a vaccine/.test(bad.error))
  assert.equal(parseVax(''), null)
  assert.equal(seriesOf('pcv')?.name, 'Pneumococcal')
})
test('the schedule: the national rows (loaded, read-only) then the clinic’s optional ones', () => {
  assert.equal(sched.rows.length, NATIONAL.length + OPTIONAL.length); assert.equal(sched.version, 'Dec 2024'); assert.equal(sched.sample, true)
  assert.ok(sched.rows.slice(0, NATIONAL.length).every((r) => r.national)); assert.equal(sched.rows.at(-2)?.key, 'rota1')
  assert.deepEqual(scheduleOf(undefined).rows, [])
})
test('due and overdue: from the birth date and the doses; a later dose from the last given; four weeks’ grace; too late past its age', () => {
  const s = statusOf(sched.rows, farida, birth, today)
  const st = (k: string) => s.find((x) => x.row.key === k)!
  assert.equal(st('hepb0').state, 'given'); assert.equal(st('hepb0').given?.source, 'card')
  assert.equal(st('opv5').state, 'overdue'); assert.equal(st('opv5').weeksLate, 4); assert.equal(st('opv5').notGiven[0].reason, 'fever 39.2 °C')
  assert.equal(st('mmr1').state, 'overdue')
  assert.equal(st('mmr2').state, 'later'); assert.equal(st('mmr2').dueOn, addDays(birth, 545))
  assert.equal(st('rota1').state, 'too_late', 'rotavirus past its age for dose 1')
  assert.equal(st('pcv4').state, 'overdue')
  assert.ok(!s.some((x) => x.row.vaccine === 'tt'), 'tetanus in pregnancy only in pregnancy')
  assert.ok(statusOf(sched.rows, [], addDays(today, -6000), today, true).some((x) => x.row.vaccine === 'tt' && x.state === 'due'))
  // a later dose counts from the last one given: OPV 5 four weeks after OPV 4
  const late4 = statusOf(sched.rows, [dose('opv', 4, 5)], birth, today).find((x) => x.row.key === 'opv5')!
  assert.equal(late4.dueOn, addDays(today, 23)); assert.equal(late4.state, 'later')
  assert.deepEqual(statusOf(sched.rows, farida, null, today), [], 'no birth date, nothing worked out')
  assert.deepEqual(statusOf(sched.rows, [], addDays(today, -34 * 366), today).filter((x) => x.state !== 'given').map((x) => x.row.key), [], 'an adult: no child row is due')
  assert.deepEqual(byAge(s.filter((x) => x.row.national)).map((g) => g.age), ['Birth', '2 mo', '9 mo', '12 mo', '18 mo'])
  const sum = summaryOf(s); assert.deepEqual(sum.overdue.map((x) => x.row.key), ['opv4', 'opv5', 'mmr1'].filter((k) => k !== 'opv4' || st('opv4').state === 'overdue'))
})
test('the words: the chip, the Summary line, the banner and the row mark', () => {
  const entries = farida.map((d, i) => ({ id: `e${i}`, item: d.item, type: 'vaccines.dose', occurred_at: d.given_at, department_id: 'room', hidden: false,
    data: { status: d.status, reason: d.reason ?? undefined, vaccines: { vaccine: d.vaccine, dose: d.dose, source: d.source, ...(d.source === 'card' ? { given_on: d.given_at } : {}) } } })) as unknown as ServerEntry[]
  assert.equal(dosesOf(entries).length, farida.length)
  const said = saidOf(sched, farida, birth, today)!
  assert.ok(said.overdue >= 2); assert.match(said.dueNames, /OPV 5, MMR 1/)
  const chip = chipWord(org, entries, birth); assert.equal(chip?.tone, 'warn'); assert.match(chip?.word ?? '', /overdue$/)
  assert.match(summaryLine(org, entries, birth) ?? '', /overdue: .*MMR 1/)
  const b = bannerWords(org, entries, birth); assert.equal(b[0].tone, 'warn'); assert.match(b[0].word, /vaccines overdue/)
  assert.deepEqual(markWord(sched, farida, birth, today), { word: `overdue ${said.overdueWeeks} wk`, tone: 'warn' })
  const talia = addDays(today, -62)
  assert.deepEqual(markWord(sched, [dose('hepb', 0, 62), dose('opv', 0, 62), dose('bcg', 1, 60)], talia, today), { word: '2-month vaccines due' })
  assert.equal(chipWord(org, [], null), null, 'no birth date: no word')
  assert.equal(pregnantOf([{ type: 'pregnancy', hidden: false, recorded_at: 'x', data: { status: 'current', pregnant: true } } as unknown as ServerEntry]), true)
  assert.equal(ageWords(birth, today), '13 mo'); assert.equal(ageWords(addDays(today, -20), today), '2 wk'); assert.equal(ageWords(addDays(today, -800), today), '2 y')
})
test('the walk-in: what is due today as chips, the earlier doses the card may show', () => {
  const seif = addDays(today, -122)   // 4 months, never here
  const w = whatFor(sched, seif, [], today)
  assert.deepEqual(w.now.map((x) => x.row.key), ['opv1', 'penta1'], 'the latest age reached in this test schedule (no 4-month row): 2 months')
  assert.deepEqual(w.earlier.map((x) => x.row.key), ['hepb0', 'opv0', 'bcg'], 'the birth doses: from the card')
  assert.deepEqual(w.tooLate.map((x) => x.row.key), ['rota1'], 'rotavirus 1 past its age; its later dose not offered')
  const f = whatFor(sched, birth, farida, today)
  assert.deepEqual(f.now.map((x) => x.row.key), ['opv5', 'mmr1', 'pcv4'], 'Farida: the 12-month row, and the pneumococcal booster')
  assert.deepEqual(f.earlier, [])
})
test('a dose’s line, as the record says it', () => {
  assert.equal(doseLine({ status: 'completed', drug: { text: 'OPV', codings: [] }, route: 'oral', vaccines: { vaccine: 'opv', dose: 1, source: 'card', given_on: '2025-11-09' } }),
    'Vaccine · OPV dose 1 · by mouth · from the card · 2025-11-09')
})

console.log(`✓ vaccines: ${n} groups passed`)
